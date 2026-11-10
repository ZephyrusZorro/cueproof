import { diffWordsWithSpace } from 'diff'
import { rangeEnd, type Cue, type Track } from './track.ts'
import { findIssues, visibleText, type Issue } from './findings.ts'

export type Change = 'Text' | 'Timing' | 'Presentation' | 'Added' | 'Removed' | 'Split' | 'Merged' | 'Track details'
export type Row = {
  id: string
  before: Cue[]
  after: Cue[]
  changes: Change[]
  delta?: [number, number]
  time: number
  match: 'text' | 'timing' | 'group' | 'none'
  issues: { cue: number; issue: Issue }[]
}
export type Comparison = { rows: Row[]; offset: number }

function normalize(text: string): string {
  return visibleText(text).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function uniqueTexts(texts: string[]): Map<string, number> {
  const map = new Map<string, number>()
  texts.forEach((text, index) => {
    if (text.length >= 8) map.set(text, map.has(text) ? -1 : index)
  })
  return map
}

function estimateOffset(before: Cue[], after: Cue[], left: string[], right: string[]): number {
  const a = uniqueTexts(left)
  const b = uniqueTexts(right)
  const offsets: number[] = []
  for (const [text, i] of a) {
    const j = b.get(text) ?? -1
    if (i < 0 || j < 0) continue
    const start = after[j].start - before[i].start
    const end = after[j].end - before[i].end
    if (Math.abs(start - end) <= 250) offsets.push(start)
  }
  if (offsets.length < 3) return 0
  offsets.sort((x, y) => x - y)
  const median = offsets[Math.floor(offsets.length / 2)]
  const agreement = offsets.filter(value => Math.abs(value - median) <= 250).length
  return agreement >= 3 && agreement >= offsets.length * 0.65 && Math.abs(median) >= 500 ? median : 0
}

function proximity(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
    / (Math.max(aEnd, bEnd) - Math.min(aStart, bStart))
}

function makeRow(before: Cue[], after: Cue[], left: string[], right: string[], issues: Map<number, Issue[]>): Row {
  const a = before[0]
  const b = after[0]
  const row: Row = {
    id: (a?.number ?? 0) + ':' + (b?.number ?? 0),
    before, after, changes: [], time: b?.start ?? a.start, match: 'none',
    issues: after.flatMap(cue => (issues.get(cue.number) ?? []).map(issue => ({ cue: cue.number, issue }))),
  }
  if (!a || !b) {
    row.changes.push(a ? 'Removed' : 'Added')
    return row
  }
  const sameWords = left[a.number - 1] === right[b.number - 1]
  if (before.length > 1 || after.length > 1) {
    row.changes.push(before.length > 1 ? 'Merged' : 'Split')
    row.match = 'group'
  } else {
    if (a.text !== b.text) row.changes.push('Text')
    row.match = sameWords && left[a.number - 1] ? 'text' : 'timing'
  }
  const delta: [number, number] = [b.start - a.start, rangeEnd(after) - rangeEnd(before)]
  row.delta = delta
  if (delta.some(Boolean)) row.changes.push('Timing')
  // SRT sequence numbers are positional. VTT identifiers may be referenced by CSS.
  return row
}

export function compareTracks(reference: Track, revision: Track): Comparison {
  const before = reference.cues
  const after = revision.cues
  const left = before.map(cue => normalize(cue.text))
  const right = after.map(cue => normalize(cue.text))
  const leftPair = left.map((text, i) => i && text && left[i - 1] ? left[i - 1] + ' ' + text : '')
  const rightPair = right.map((text, i) => i && text && right[i - 1] ? right[i - 1] + ' ' + text : '')
  const offset = estimateOffset(before, after, left, right)
  const issues = findIssues(revision)
  const width = after.length + 1
  const trace = new Uint8Array((before.length + 1) * width)
  let older = new Float64Array(width)
  let previous = new Float64Array(width)
  let current = new Float64Array(width)

  // Maximize evidence over monotone pairings. The bounded trace retains only move codes.
  for (let i = 1; i <= before.length; i++) {
    const a = before[i - 1]
    const start = a.start + offset
    const end = a.end + offset
    const text = left[i - 1]
    for (let j = 1; j < width; j++) {
      const b = after[j - 1]
      const overlap = proximity(start, end, b.start, b.end)
      const near = Math.abs(start - b.start)
      let best = previous[j]
      let move = 1
      if (current[j - 1] >= best) {
        best = current[j - 1]
        move = 2
      }
      const sameOriginal = offset && a.start === b.start && a.end === b.end && a.text === b.text
      const weight = sameOriginal ? 11.1 : text && text === right[j - 1] && near <= 4000
        ? 8 + 3 * overlap - near / 4000
        : overlap >= 0.45 ? 2 + 4 * overlap : 0
      if (weight && previous[j - 1] + weight > best) {
        best = previous[j - 1] + weight
        move = 3
      }
      if (j >= 2 && text && text === rightPair[j - 1]) {
        const first = after[j - 2]
        if (b.start - first.end <= 1200 && proximity(start, end, first.start, Math.max(first.end, b.end)) >= 0.55
          && previous[j - 2] + 13 > best) {
          best = previous[j - 2] + 13
          move = 4
        }
      }
      if (i >= 2 && leftPair[i - 1] && leftPair[i - 1] === right[j - 1]) {
        const first = before[i - 2]
        if (a.start - first.end <= 1200 && proximity(first.start + offset, Math.max(first.end, a.end) + offset, b.start, b.end) >= 0.55
          && older[j - 1] + 13 > best) {
          best = older[j - 1] + 13
          move = 5
        }
      }
      current[j] = best
      trace[i * width + j] = move
    }
    const reuse = older
    older = previous
    previous = current
    current = reuse
  }

  const rows: Row[] = []
  let i = before.length
  let j = after.length
  while (i || j) {
    const move = !i ? 2 : !j ? 1 : trace[i * width + j]
    const aCount = move === 2 ? 0 : move === 5 ? 2 : 1
    const bCount = move === 1 ? 0 : move === 4 ? 2 : 1
    const row = makeRow(before.slice(i - aCount, i), after.slice(j - bCount, j), left, right, issues)
    if (row.before.length && row.after.length) {
      const settings = (cues: Cue[], format: Track['format']) =>
        cues.map(cue => [format === 'vtt' ? cue.id : '', cue.settings])
      const oldSettings = settings(row.before, reference.format)
      const newSettings = settings(row.after, revision.format)
      if ([...oldSettings, ...newSettings].some(pair => pair.some(Boolean))
        && JSON.stringify(oldSettings) !== JSON.stringify(newSettings)) {
        row.changes.push('Presentation')
      }
    }
    rows.push(row)
    i -= aCount
    j -= bCount
  }
  rows.reverse()
  if (reference.format !== revision.format || JSON.stringify(reference.metadata) !== JSON.stringify(revision.metadata)) {
    rows.unshift({ id: 'track', before: [], after: [], time: 0, changes: ['Track details'], match: 'none', issues: [] })
  }
  return { rows, offset }
}

export function inlineDiff(before: string, after: string) {
  const parts = before.length + after.length <= 2000
    ? diffWordsWithSpace(before, after, { maxEditLength: 150 })
    : undefined
  return parts ?? [{ value: before, removed: true, added: false }, { value: after, removed: false, added: true }]
}
