import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceReview, createReview, csvReport, decide, decodeReview, encodeReview } from '../src/review.ts'
import { formatTime, parseTrack } from '../src/track.ts'

const track = (name: string, cues: [number, number, string][]) => parseTrack({
  name, source: 'WEBVTT\n\n' + cues.map(([start, end, text]) =>
    formatTime(start) + ' --> ' + formatTime(end) + '\n' + text).join('\n\n'),
})

function fixture() {
  const before = track('public-meeting.r1.vtt', [
    [1000, 3000, '[Applause]'],
    [4000, 6000, 'Jo: The vote is open.'],
    [7000, 10000, 'Listen now. Take your time.'],
  ])
  const after = track('public-meeting.r2.vtt', [
    [4000, 6000, 'The vote is open.'],
    [7000, 8000, 'Listen now.'],
    [8000, 10000, 'Take your time.'],
  ])
  const review = createReview(before, after)
  return decide(decide(decide(review, '1:0', 'changes', 'Restore the applause cue.'),
    '2:1', 'changes', 'Keep the speaker label.'), '3:2', 'changes', 'Check both split boundaries.')
}

test('carries missing and unchanged requests and proposes restored sound as unreviewed evidence', () => {
  const next = track('public-meeting.r3.vtt', [
    [1100, 3000, '[Applause]'],
    [4000, 6000, 'The vote is open.'],
    [7000, 10000, 'Listen now. Take your time.'],
  ])
  const review = advanceReview(fixture(), next)
  assert.equal(review.round, 2)
  assert.equal(review.reference.name, 'public-meeting.r2.vtt')
  assert.deepEqual(review.decisions, {})
  const items = review.comparison.rows.filter(row => row.followUp)
  assert.deepEqual(items.map(row => [row.followUp?.signal, row.after.map(cue => cue.number)]),
    [['returned', [1]], ['unchanged', [2]], ['changed', [3]]])
  assert.deepEqual(items[2].before.map(cue => cue.number), [2, 3])
  assert.equal(items[0].followUp?.request.note, 'Restore the applause cue.')
})

test('only a human decision resolves a request and timing-only evidence stays tentative', () => {
  const next = track('public-meeting.r3.vtt', [
    [1100, 3000, '[Applause]'],
    [4000, 6000, 'Chair: The vote is open.'],
    [7000, 10000, 'Listen now. Take your time.'],
  ])
  let review = advanceReview(fixture(), next)
  assert.equal(review.comparison.rows[1].followUp?.signal, 'check')
  review = decide(review, review.comparison.rows[0].id, 'accepted', 'Heard and verified.')
  review = decide(review, review.comparison.rows[1].id, 'changes', 'The speaker is Jo.')
  const again = advanceReview(review, { ...next, name: 'public-meeting.r4.vtt' })
  assert.equal(again.round, 3)
  const items = again.comparison.rows.filter(row => row.followUp)
  assert.deepEqual(items.map(row => row.id), ['followup:1/2:1', 'followup:1/3:2'])
  assert.equal(items[0].followUp?.signal, 'check')
  assert.equal(items[0].followUp?.request.note, 'Keep the speaker label.')
  assert.equal(items[0].followUp?.request.latestNote, 'The speaker is Jo.')
})

test('keeps unlinked requests and never guesses among repeated reappearances', () => {
  const next = track('public-meeting.r3.vtt', [
    [1100, 2000, '[Applause]'], [2300, 3500, '[Applause]'],
    [4500, 5500, '[Pause]'], [12000, 14000, 'On to the next item.'],
  ])
  const review = advanceReview(fixture(), next)
  const items = review.comparison.rows.filter(row => row.followUp)
  assert.equal(items[0].followUp?.signal, 'check')
  assert.equal(items[0].after.length, 0)
  assert.equal(items[2].followUp?.signal, 'missing')
  assert.equal(items[2].time, 7000)
})

test('an existing nearby repetition is never mistaken for a returned cue', () => {
  const reference = track('before.vtt', [[1000,2000,'[Door slams]'],[3000,4000,'[Door slams]']])
  const revision = track('after.vtt', [[3000,4000,'[Door slams]']])
  const review = decide(createReview(reference, revision), '1:0', 'changes', 'Restore the first door sound.')
  const unchanged = advanceReview(review, revision)
  assert.equal(unchanged.comparison.rows[0].followUp?.signal, 'missing')
  assert.deepEqual(unchanged.comparison.rows[0].after, [])
  const restored = advanceReview(unchanged, reference)
  assert.equal(restored.comparison.rows[0].followUp?.signal, 'returned')
  assert.deepEqual(restored.comparison.rows[0].after.map(cue => cue.start), [1000])
})

test('a tentative anchor yields to newly returned exact wording', () => {
  const reference = track('before.vtt', [[1000,2000,'Original wording.']])
  const alarm = track('alarm.vtt', [[1000,2000,'[Alarm rings]']])
  const review = decide(createReview(reference, alarm), '1:1', 'changes', 'Check the alarm caption.')
  const speech = track('speech.vtt', [[1000,2000,'We will begin now.']])
  const tentative = advanceReview(review, speech)
  assert.equal(tentative.comparison.rows[0].followUp?.signal, 'check')
  const returned = track('returned.vtt', [[1000,2000,'We will begin now.'],[2500,3500,'[Alarm rings]']])
  const result = advanceReview(tentative, returned)
  assert.equal(result.comparison.rows[0].followUp?.signal, 'check')
  assert.deepEqual(result.comparison.rows[0].after.map(cue => cue.text), ['[Alarm rings]'])
})

test('keeps all linked cues when a request is repeatedly split', () => {
  const words = Array.from({ length: 32 }, (_, index) => 'word' + (index + 1))
  const split = (size: number) => track('split.vtt', words.flatMap((_, index) => index % size === 0
    ? [[1000 + index * 1000, 1000 + (index + size) * 1000, words.slice(index, index + size).join(' ')] as [number, number, string]]
    : []))
  const reference = track('original.vtt', [[1000,33000,'Original wording.']])
  let review = decide(createReview(reference, split(32)), '1:1', 'changes', 'Check all words after splitting.')
  for (const size of [16, 8, 4, 2, 1, 1]) review = advanceReview(review, split(size))
  const row = review.comparison.rows[0]
  assert.equal(row.before.length, 32)
  assert.equal(row.after.length, 32)
  assert.equal(row.followUp?.signal, 'unchanged')
  assert.deepEqual(decodeReview(encodeReview(review)), review)
})

test('oversized repeated CSV evidence fails with a recoverable error', () => {
  const source = 'WEBVTT\n\nNOTE ' + 'A'.repeat(210_000) + '\n\n00:01.000 --> 00:03.000\nHi.'
  const reference = parseTrack({name:'reference.vtt', source})
  const revision = parseTrack({name:'revision.vtt', source})
  const requests = Array.from({length:80}, (_, index) => ({
    id: (index + 1) + '/track', kind: 'track' as const, sourceName: revision.name,
    time: 0, excerpt: '', exact: false, note: '', latestNote: '', anchors: [], tentative: false,
  }))
  const review = createReview(reference, revision, false, 81, requests)
  assert.throws(() => csvReport(review), /CSV.*32 MiB.*JSON/)
  assert.deepEqual(decodeReview(encodeReview(review)), review)
})

test('carries track-level presentation requests and compares new metadata', () => {
  const before = track('before.vtt', [[1000, 3000, 'Hi.']])
  const changed = parseTrack({ ...before, name: 'after.vtt', source: before.source.replace('WEBVTT\n\n', 'WEBVTT\n\nSTYLE\n::cue { color: red }\n\n') })
  const review = decide(createReview(before, changed), 'track', 'changes', 'Restore the default caption color.')
  const next = advanceReview(review, before)
  assert.equal(next.comparison.rows[0].followUp?.request.kind, 'track')
  assert.equal(next.comparison.rows[0].followUp?.signal, 'changed')
  assert.match(next.comparison.rows[0].followUp?.request.excerpt ?? '', /color: red/)
  assert.equal(next.comparison.rows[0].after.length, 0)
})

test('v2 backups preserve request evidence and verification decisions', () => {
  const next = track('returned.vtt', [[1000,3000,'[Applause]'],[4000,6000,'The vote is open.']])
  const review = decide(advanceReview(fixture(), next), 'followup:1/1:0', 'accepted', 'Auditioned.')
  assert.deepEqual(decodeReview(encodeReview(review)), review)
  assert.match(csvReport(review), /"Follow-up".*"Verified resolved","Auditioned."/)
  assert.match(csvReport(review), /"Restore the applause cue."/)
})

test('rejects malformed or duplicate v2 links without applying decisions', () => {
  const next = track('returned.vtt', [[1000,3000,'[Applause]']])
  const backup = JSON.parse(encodeReview(advanceReview(fixture(), next)))
  const [request] = backup.requests
  for (const requests of [
    [{ ...request, anchors: [9999] }], [{ ...request, anchors: [1, 1] }],
    [{ ...request, id: '2/1:0' }], [request, request], [{ ...request, note: 1 }],
    [request, { ...request, id: '1/01:0' }],
  ]) assert.throws(() => decodeReview(JSON.stringify({ ...backup, requests })), /follow-up/)
})
