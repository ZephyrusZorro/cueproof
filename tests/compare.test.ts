import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTrack } from '../src/track.ts'
import { compareTracks, inlineDiff } from '../src/compare.ts'
import { findIssues } from '../src/findings.ts'

const track = (cues: [number, number, string][]) => parseTrack({
  name: 'track.vtt',
  source: 'WEBVTT\n\n' + cues.map(([a,b,text]) =>
    `00:${(a/1000).toFixed(3).padStart(6,'0')} --> 00:${(b/1000).toFixed(3).padStart(6,'0')}\n${text}`).join('\n\n'),
})

test('aligns an insert without cascading by cue number and detects exact time deltas', () => {
  const reference = track([[1000, 3000, 'We open today.'], [4000, 5500, 'Bring a mug.'], [6000, 8000, 'See you soon.']])
  const revision = track([[1000, 3000, 'We open today.'], [3200, 3800, '[Door opens]'], [4167, 5731, 'Bring your mug.'], [6000, 8000, 'See you soon.']])
  const { rows } = compareTracks(reference, revision)
  assert.deepEqual(rows.map(row => row.changes), [[], ['Added'], ['Text', 'Timing'], []])
  assert.deepEqual(rows[2].delta, [167, 231])
  assert.equal(rows[2].before[0].number, 2)
  assert.equal(rows[2].after[0].number, 3)
})

test('groups credible splits and merges and leaves unrelated content separate', () => {
  const reference = track([[1000, 3500, 'Take a seat. Leave your bag here.'], [5000, 6100, 'We can start'], [6100, 8000, 'in a minute.'], [20000, 22000, 'Later.']])
  const revision = track([[950, 1900, 'Take a seat.'], [1900, 3550, 'Leave your bag here.'], [5000, 8000, 'We can start in a minute.'], [28000, 30000, 'Unrelated.']])
  const { rows } = compareTracks(reference, revision)
  assert.deepEqual(rows.map(row => row.changes), [['Split', 'Timing'], ['Merged'], ['Removed'], ['Added']])
  assert.deepEqual(rows[0].delta, [-50, 50])
})

test('detects a track-wide offset without masking the real shifts', () => {
  const reference = track([[1000, 1800, 'Welcome to the studio.'], [2300, 3900, 'First, check the meter.'], [4000, 4900, 'Then listen back.'], [5000, 7000, 'Okay.']])
  const revision = track([[16000, 16800, 'Welcome to the studio.'], [17300, 18900, 'First, check the meter.'], [19000, 19900, 'Then listen back.'], [20000, 22000, 'Okay.']])
  const result = compareTracks(reference, revision)
  assert.equal(result.offset, 15000)
  assert.deepEqual(result.rows.map(row => row.delta), Array(4).fill([15000,15000]))
})

test('does not match a distant isolated repeat and identifies metadata and cue settings', () => {
  const reference = parseTrack({name:'before.vtt',source:'WEBVTT\n\nNOTE Old\n\n00:01.000 --> 00:02.000 line:60%\nHi\n\n00:03.000 --> 00:04.000\nOkay.'})
  const revision = parseTrack({name:'after.vtt',source:'WEBVTT\n\nNOTE New\n\n00:01.000 --> 00:02.000 line:80%\nHi\n\n00:40.000 --> 00:41.000\nOkay.'})
  assert.deepEqual(compareTracks(reference, revision).rows.map(row => row.changes), [['Track details'], ['Presentation'], ['Removed'], ['Added']])
})

test('warns about overlaps and readability without marking them structural faults', () => {
  const revision = track([[1000, 4100, 'First cue'], [2000, 2500, '<i>Much too much text for this brief interval</i>'], [2600, 3600, '[Wind]']])
  const issues = findIssues(revision)
  assert.deepEqual(issues.get(2)?.map(issue => issue.code), ['short','speed','overlap'])
  assert.equal(issues.get(3)?.[0].code, 'overlap')
})

test('inline diff reconstructs both originals including whitespace and falls back for very long input', () => {
  const old = 'One cup.\nTwo spoons.'
  const next = 'One mug.\nTwo spoons.'
  const result = inlineDiff(old, next)
  assert.equal(result.filter(part => !part.added).map(part => part.value).join(''), old)
  assert.equal(result.filter(part => !part.removed).map(part => part.value).join(''), next)
  assert.equal(inlineDiff('a'.repeat(1500), 'b'.repeat(1500)).length, 2)
})
