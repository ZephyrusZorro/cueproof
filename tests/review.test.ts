import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { parseTrack } from '../src/track.ts'
import { createReview, decide, encodeReview, decodeReview, csvReport } from '../src/review.ts'
import { ReviewStore, ConflictError } from '../src/storage.ts'

function fixture() {
  const file = (name: string, text: string) => parseTrack({ name, source: '1\n00:00:01,000 --> 00:00:03,000\n' + text })
  return createReview(file('reference.srt','Original wording'),file('revision.srt','Revised wording'))
}

test('decisions and untouched source round-trip through a portable review', () => {
  const review = decide(fixture(), '1:1', 'changes', 'Listen again at 00:01.')
  const restored = decodeReview(encodeReview(review))
  assert.deepEqual(restored, review)
  assert.deepEqual(restored.decisions['1:1'], { status: 'changes', note: 'Listen again at 00:01.' })
  assert.deepEqual(decide(restored, '1:1', 'pending', '').decisions, {})
})

test('rejects unknown schema, row identities and invalid decision data', () => {
  const input = JSON.parse(encodeReview(fixture()))
  for (const corrupt of [
    { ...input, version: 2 }, { ...input, decisions: { '2:2': {status:'accepted',note:''} } },
    { ...input, decisions: { '1:1': {status:'accepted',note:'a'.repeat(501)} } },
    { ...input, decisions: { '1:1': {status:'other',note:''} } },
    { ...input, reference: { name:'not-vtt.vtt',source:'text' } },
  ]) assert.throws(() => decodeReview(JSON.stringify(corrupt)))
  assert.throws(() => decodeReview('{'), /valid JSON/)
})

test('exports quoted timecoded evidence and neutralizes spreadsheet formulas', () => {
  const review = decide(fixture(), '1:1', 'changes', ' \t=1+1, "review"\nNext')
  const csv = csvReport(review)
  assert.match(csv, /"00:00:01\.000","00:00:03\.000"/)
  assert.match(csv, /"Needs changes","' \t=1\+1, ""review""\nNext"/)
  assert.match(csv, /"Original wording"/)
})

test('exports cue IDs, settings and individual timecodes for changed presentation', () => {
  const vtt = (id: string, line: string) => parseTrack({
    name: id + '.vtt', source: 'WEBVTT\n\n' + id + '\n00:01.000 --> 00:04.000 line:' + line + '\nSame words.',
  })
  const csv = csvReport(createReview(vtt('old-id','60%'), vtt('new-id','80%')))
  assert.match(csv, /Cue 1 · 00:00:01\.000 → 00:00:04\.000 · ID old-id · line:60%/)
  assert.match(csv, /Cue 1 · 00:00:01\.000 → 00:00:04\.000 · ID new-id · line:80%/)
})

test('persists across connections and refuses a stale concurrent overwrite', async () => {
  const idb = new IDBFactory()
  const first = await ReviewStore.open(idb)
  const second = await ReviewStore.open(idb)
  assert.equal(await first.load(), undefined)
  const raw = encodeReview(fixture())
  const snapshot = await first.write(raw, null)
  assert.deepEqual(await second.load(), snapshot)
  const [a,b] = await Promise.allSettled([first.write(raw, snapshot.token), second.write(null, snapshot.token)])
  const states = [a,b]
  assert.equal(states.filter(item => item.status === 'fulfilled').length, 1)
  const rejected = states.find(item => item.status === 'rejected')
  assert.ok(rejected?.reason instanceof ConflictError)
  const current = await second.load()
  await second.write(null, current!.token)
  assert.equal((await first.load())?.content, null)
  first.close()
  second.close()
})
