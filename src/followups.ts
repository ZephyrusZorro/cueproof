import type { Comparison, Row } from './compare.ts'
import type { Cue, Track } from './track.ts'

export const MAX_REQUESTS = 1500
export const MAX_ROUND = 9999
export const MAX_EXCERPT = 240
export const MAX_LINKS = 15_000
export const RETURN_WINDOW_MS = 4000

export const signals = {
  changed: 'Linked cues changed',
  unchanged: 'Linked cues unchanged',
  returned: 'Matching wording returned',
  missing: 'No linked cue found',
  check: 'Check the cue match',
} as const

export type FollowUpRequest = {
  id: string
  kind: 'cue' | 'track'
  sourceName: string
  time: number
  excerpt: string
  exact: boolean
  note: string
  latestNote: string
  anchors: number[]
  tentative: boolean
}

export type Signal = keyof typeof signals
export type FollowUp = { request: FollowUpRequest; signal: Signal }
export type ReviewRow = Row & { followUp?: FollowUp }
export type ReviewComparison = Omit<Comparison, 'rows'> & { rows: ReviewRow[] }

export function originRound(request: FollowUpRequest): string {
  return request.id.split('/')[0]
}

export function isTrackDetails(row: ReviewRow): boolean {
  return row.id === 'track' || row.followUp?.request.kind === 'track'
}

export function captureRequest(row: Row, round: number, reference: Track, revision: Track, note: string): FollowUpRequest {
  const missing = !row.after.length && row.before.length > 0
  const evidence = missing ? row.before : row.after
  const kind = row.id === 'track' ? 'track' : 'cue'
  const text = kind === 'track'
    ? [revision.format.toUpperCase(), ...revision.metadata].join('\n\n')
    : evidence.map(cue => cue.text).join('\n\n')
  return {
    id: round + '/' + row.id,
    kind,
    sourceName: missing ? reference.name : revision.name,
    time: evidence[0]?.start ?? row.time,
    excerpt: text.slice(0, MAX_EXCERPT),
    exact: evidence.length === 1 && text.length <= MAX_EXCERPT && !!text.trim(),
    note, latestNote: '',
    anchors: row.after.map(cue => cue.number),
    tentative: false,
  }
}

function linkedEvidence(request: FollowUpRequest, reference: Track, matches: Map<number, Row>, newWording: Map<string, Cue[]>) {
  const before = request.anchors.map(number => reference.cues[number - 1])
  const rows = new Set(request.anchors.map(number => matches.get(number)).filter(row => row !== undefined))
  const afterByNumber = new Map<number, Cue>()
  for (const row of rows) for (const cue of row.after) afterByNumber.set(cue.number, cue)
  let after = [...afterByNumber.values()].sort((a, b) => a.number - b.number)
  let signal: Signal = 'missing'
  if (after.length) {
    signal = [...rows].some(row => !row.after.length || row.match === 'timing') || request.tentative
      ? 'check'
      : [...rows].some(row => row.changes.length) ? 'changed' : 'unchanged'
  }
  if ((!after.length || signal === 'check') && request.exact && !after.some(cue => cue.text === request.excerpt)) {
    const candidates = (newWording.get(request.excerpt) ?? []).filter(cue =>
      Math.abs(cue.start - request.time) <= RETURN_WINDOW_MS)
    if (candidates.length === 1) {
      after = candidates
      signal = before.length ? 'check' : 'returned'
    } else if (candidates.length > 1) signal = 'check'
  }
  return { before, after, signal }
}

export function buildFollowUps(
  requests: FollowUpRequest[], reference: Track, comparison: Comparison,
): ReviewRow[] {
  const matches = new Map<number, Row>()
  const newWording = new Map<string, Cue[]>()
  for (const row of comparison.rows) {
    for (const cue of row.before) matches.set(cue.number, row)
    for (const cue of row.after) {
      if (row.before.some(before => before.text === cue.text)) continue
      const entries = newWording.get(cue.text) ?? []
      entries.push(cue)
      newWording.set(cue.text, entries)
    }
  }
  const metadataChanged = comparison.rows.some(row => row.id === 'track')
  return requests.map(request => {
    const evidence = request.kind === 'track'
      ? { before: [], after: [], signal: metadataChanged ? 'changed' as const : 'unchanged' as const }
      : linkedEvidence(request, reference, matches, newWording)
    return {
      id: 'followup:' + request.id,
      before: evidence.before, after: evidence.after, changes: [], match: 'none', issues: [],
      time: evidence.after[0]?.start ?? evidence.before[0]?.start ?? request.time,
      followUp: { request, signal: evidence.signal },
    }
  })
}
