import { compareTracks, type Comparison, type Row } from './compare.ts'
import { formatTime, parseTrack, type Cue, type Track, type TrackInput } from './track.ts'

export const MAX_NOTE = 500
export const MAX_BACKUP_BYTES = 48 * 1024 * 1024
export const labels = { pending: 'Unreviewed', accepted: 'Accepted', changes: 'Needs changes' } as const
export type Status = keyof typeof labels
export type Decision = { status: Status; note: string }
export type Review = {
  reference: Track
  revision: Track
  comparison: Comparison
  decisions: Record<string, Decision>
  example: boolean
}

export function actionable(row: Row): boolean {
  return row.changes.length > 0 || row.issues.length > 0
}

export function createReview(reference: Track, revision: Track, example = false): Review {
  return { reference, revision, comparison: compareTracks(reference, revision), decisions: {}, example }
}

export function decide(review: Review, id: string, status: Status, note: string): Review {
  if (!review.comparison.rows.some(row => row.id === id && actionable(row))) throw new Error('This row cannot be reviewed.')
  if (!Object.hasOwn(labels, status) || note.length > MAX_NOTE) throw new Error('Enter a valid decision and a note up to 500 characters.')
  const decisions = { ...review.decisions }
  if (status === 'pending' && !note.trim()) delete decisions[id]
  else decisions[id] = { status, note }
  return { ...review, decisions }
}

function trackInput({ name, source }: TrackInput): TrackInput {
  return { name, source }
}

export function encodeReview(review: Review): string {
  return JSON.stringify({
    version: 1, reference: trackInput(review.reference), revision: trackInput(review.revision),
    decisions: review.decisions, example: review.example,
  })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function input(value: unknown): TrackInput {
  if (!record(value) || typeof value.name !== 'string' || typeof value.source !== 'string') {
    throw new Error('The backup is missing a caption track.')
  }
  return { name: value.name, source: value.source }
}

export function decodeReview(raw: string): Review {
  if (raw.length > MAX_BACKUP_BYTES) throw new Error('The review backup is too large.')
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('This review backup is not valid JSON.')
  }
  if (!record(data) || data.version !== 1 || typeof data.example !== 'boolean' || !record(data.decisions)) {
    throw new Error('This is not a supported Cueproof review backup.')
  }
  const review = createReview(parseTrack(input(data.reference)), parseTrack(input(data.revision)), data.example)
  const allowed = new Set(review.comparison.rows.filter(actionable).map(row => row.id))
  for (const [id, entry] of Object.entries(data.decisions)) {
    if (!allowed.has(id) || !record(entry) || typeof entry.status !== 'string' || !Object.hasOwn(labels, entry.status)
      || typeof entry.note !== 'string' || entry.note.length > MAX_NOTE) {
      throw new Error('The backup contains an invalid review decision.')
    }
    review.decisions[id] = { status: entry.status as Status, note: entry.note }
  }
  return review
}

function csvCell(value: string): string {
  const neutralized = /^(?:[\s\uFEFF]*[=+\-@＝＋－＠]|[\t\r\n])/.test(value) ? "'" + value : value
  return '"' + neutralized.replaceAll('"', '""') + '"'
}

export function rangeEnd(cues: Cue[]): number {
  return Math.max(...cues.map(cue => cue.end))
}

export function csvReport(review: Review): string {
  const header = [
    'Reference file', 'Revision file', 'Row', 'Changes', 'Reference in', 'Reference out', 'Revision in',
    'Revision out', 'Start delta (ms)', 'End delta (ms)', 'Reference text', 'Revision text',
    'Advisories', 'Decision', 'Note',
  ]
  const range = (cues: Cue[]) => cues.length ? [formatTime(cues[0].start), formatTime(rangeEnd(cues))] : ['', '']
  const text = (cues: Cue[]) => cues.map(cue => cue.text).join('\n\n')
  const rows = review.comparison.rows.filter(actionable).map(row => {
    const decision = review.decisions[row.id]
    const metadata = (track: Track) => [track.format.toUpperCase(), ...track.metadata].join('\n\n')
    return [
      csvCell(review.reference.name), csvCell(review.revision.name), csvCell(row.id),
      csvCell(row.changes.join(', ') || 'Advisory'), ...range(row.before).map(csvCell), ...range(row.after).map(csvCell),
      String(row.delta?.[0] ?? ''), String(row.delta?.[1] ?? ''),
      csvCell(row.id === 'track' ? metadata(review.reference) : text(row.before)),
      csvCell(row.id === 'track' ? metadata(review.revision) : text(row.after)),
      csvCell(row.issues.map(({cue, issue}) => 'Cue ' + cue + ' · ' + issue.message).join('\n')),
      csvCell(labels[decision?.status ?? 'pending']), csvCell(decision?.note ?? ''),
    ].join(',')
  })
  return '\uFEFF' + [header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n'
}
