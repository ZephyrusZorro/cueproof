import { performance } from 'node:perf_hooks'
import { compareTracks } from '../src/compare.ts'
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
for (let round = 0; round < 8; round++) {
  const started = performance.now()
  const reference = parseTrack({ name: 'benchmark-reference.vtt', source: inputs[0] })
  const revision = parseTrack({ name: 'benchmark-revised.vtt', source: inputs[1] })
  const result = compareTracks(reference, revision)
  if (result.rows.length !== count || result.rows.some(row => row.delta?.[0] !== 200)) {
    throw new Error('Unexpected comparison result in synthetic benchmark.')
  }
  if (round) timings.push(performance.now() - started)
}
timings.sort((a, b) => a - b)
console.log(JSON.stringify({ cuesPerTrack: count, warmup: 1, measured: timings.length,
  medianMs: Number(timings[3].toFixed(1)), maxMs: Number(timings.at(-1)!.toFixed(1)),
  node: process.version, platform: process.platform,
}, null, 2))
