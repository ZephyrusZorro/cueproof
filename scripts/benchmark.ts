import { performance } from 'node:perf_hooks'
import { compareTracks } from '../src/compare.ts'
import { advanceReview, createReview, decide, encodeReview } from '../src/review.ts'
import { formatTime, parseTrack } from '../src/track.ts'

const count = 2500
function source(revised: boolean): string {
  const blocks: string[] = []
  for (let index = 0; index < count; index++) {
    const start = index * 2250 + (revised ? 200 : 0)
    const text = revised && index % 23 === 0 ? 'Revised wording for passage ' : 'Original wording for passage '
    blocks.push(formatTime(start) + ' --> ' + formatTime(start + 1800) + '\n' + text + index + '.')
  }
  return 'WEBVTT\n\n' + blocks.join('\n\n')
}
const inputs = [source(false), source(true)]
const timings: number[] = []
const followupTimings: number[] = []
const reference = parseTrack({ name: 'benchmark-reference.vtt', source: inputs[0] })
const revision = parseTrack({ name: 'benchmark-revised.vtt', source: inputs[1] })
const requests = 250
let previous = createReview(reference, revision)
for (const row of previous.comparison.rows.slice(0, requests)) {
  previous = decide(previous, row.id, 'changes', 'Verify timing against the source media.')
}
for (let round = 0; round < 8; round++) {
  const started = performance.now()
  const reference = parseTrack({ name: 'benchmark-reference.vtt', source: inputs[0] })
  const revision = parseTrack({ name: 'benchmark-revised.vtt', source: inputs[1] })
  const result = compareTracks(reference, revision)
  if (result.rows.length !== count || result.rows.some(row => row.delta?.[0] !== 200)) {
    throw new Error('Unexpected comparison result in synthetic benchmark.')
  }
  if (round) timings.push(performance.now() - started)

  const followupStart = performance.now()
  const returned = parseTrack({ name: 'benchmark-returned.vtt', source: inputs[1] })
  const next = advanceReview(previous, returned)
  const backup = encodeReview(next)
  const followups = next.comparison.rows.filter(row => row.followUp)
  if (!backup.length || followups.length !== requests || followups.some(row => row.followUp?.signal !== 'unchanged')) {
    throw new Error('Unexpected follow-up result in synthetic benchmark.')
  }
  if (round) followupTimings.push(performance.now() - followupStart)
}
timings.sort((a, b) => a - b)
followupTimings.sort((a, b) => a - b)
console.log(JSON.stringify({ cuesPerTrack: count, warmup: 1, measured: timings.length,
  medianMs: Number(timings[3].toFixed(1)), maxMs: Number(timings.at(-1)!.toFixed(1)),
  carriedRequests: requests, nextRoundMedianMs: Number(followupTimings[3].toFixed(1)),
  nextRoundMaxMs: Number(followupTimings.at(-1)!.toFixed(1)),
  node: process.version, platform: process.platform,
}, null, 2))
