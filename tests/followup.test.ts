import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceReview, createReview, decide } from '../src/review.ts'
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
