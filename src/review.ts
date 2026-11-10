import { compareTracks } from './compare.ts'
import { buildFollowUps, captureRequest, MAX_ANCHORS, MAX_REQUESTS, MAX_ROUND, type FollowUpRequest, type ReviewComparison, type ReviewRow } from './followups.ts'
import { formatTime, parseTrack, rangeEnd, type Cue, type Track, type TrackInput } from './track.ts'

export const MAX_NOTE = 500
export const MAX_BACKUP_BYTES = 48 * 1024 * 1024
export const labels = { pending: 'Unreviewed', accepted: 'Accepted', changes: 'Needs changes' } as const
export type Status = keyof typeof labels
export type Decision = { status: Status; note: string }
export type Review = {
  reference: Track
  revision: Track
  comparison: ReviewComparison
  decisions: Record<string, Decision>
  example: boolean
  round: number
}

export function actionable(row: ReviewRow): boolean {
  return !!row.followUp || row.changes.length > 0 || row.issues.length > 0
}

export function createReview(
  reference: Track, revision: Track, example = false, round = 1, requests: FollowUpRequest[] = [],
): Review {
  const comparison = compareTracks(reference, revision)
  if (requests.length) comparison.rows.unshift(...buildFollowUps(requests, reference, revision, comparison))
  return { reference, revision, comparison, decisions: {}, example, round }
}

function openRequest(review: Review, row: ReviewRow): boolean {
  const decision = review.decisions[row.id]
  return row.followUp ? decision?.status !== 'accepted' : decision?.status === 'changes'
}

export function outstandingCount(review: Review): number {
  return review.comparison.rows.filter(row => openRequest(review, row)).length
}

export function advanceReview(review: Review, revision: Track): Review {
  if (review.round >= MAX_ROUND) throw new Error('Start a new review to continue after round 9,999.')
  const open = review.comparison.rows.filter(row => openRequest(review, row))
  if (open.length > MAX_REQUESTS) {
    throw new Error('Resolve or export open requests before continuing. A round can carry up to 1,500 requests.')
  }
  const requests = open.map(row => {
    const note = review.decisions[row.id]?.note ?? ''
    if (!row.followUp) return captureRequest(row, review.round, review.reference, review.revision, note)
    return {
      ...row.followUp.request,
      latestNote: note.trim() ? note : row.followUp.request.latestNote,
      anchors: row.after.slice(0, MAX_ANCHORS).map(cue => cue.number),
      tentative: row.after.length > MAX_ANCHORS || (row.after.length > 0 && row.followUp.signal === 'check'),
    }
  })
  return createReview(review.revision, revision, review.example, review.round + 1, requests)
}

export function decide(review: Review, id: string, status: Status, note: string): Review {
  if (!review.comparison.rows.some(row => row.id === id && actionable(row))) throw new Error('This row cannot be reviewed.')
  if (!Object.hasOwn(labels, status) || note.length > MAX_NOTE) throw new Error('Enter a valid decision and a note up to 500 characters.')
  const decisions = { ...review.decisions }
  if (status === 'pending' && !note.trim()) delete decisions[id]
  else decisions[id] = { status, note: note.replace(/\r\n?/g, '\n') }
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
    review.decisions[id] = { status: entry.status as Status, note: entry.note.replace(/\r\n?/g, '\n') }
  }
  return review
}

function csvCell(value: string): string {
  const neutralized = /^(?:[\s\uFEFF]*[=+\-@＝＋－＠]|[\t\r\n])/.test(value) ? "'" + value : value
  return '"' + neutralized.replaceAll('"', '""') + '"'
}

export function csvReport(review: Review): string {
  const header = [
    'Reference file', 'Revision file', 'Row', 'Changes', 'Reference in', 'Reference out', 'Revision in',
    'Revision out', 'Start delta (ms)', 'End delta (ms)', 'Reference text', 'Revision text',
    'Reference cue details', 'Revision cue details', 'Advisories', 'Decision', 'Note',
  ]
  const range = (cues: Cue[]) => cues.length ? [formatTime(cues[0].start), formatTime(rangeEnd(cues))] : ['', '']
  const text = (cues: Cue[]) => cues.map(cue => cue.text).join('\n\n')
  const evidence = (cues: Cue[], track: Track) => cues.map(cue => [
    'Cue ' + cue.number, formatTime(cue.start) + ' → ' + formatTime(cue.end),
    track.format === 'vtt' && cue.id ? 'ID ' + cue.id : '', cue.settings,
  ].filter(Boolean).join(' · ')).join('\n')
  const rows = review.comparison.rows.filter(actionable).map(row => {
    const decision = review.decisions[row.id]
    const metadata = (track: Track) => [track.format.toUpperCase(), ...track.metadata].join('\n\n')
    return [
      csvCell(review.reference.name), csvCell(review.revision.name), csvCell(row.id),
      csvCell(row.changes.join(', ') || 'Advisory'), ...range(row.before).map(csvCell), ...range(row.after).map(csvCell),
      String(row.delta?.[0] ?? ''), String(row.delta?.[1] ?? ''),
      csvCell(row.id === 'track' ? metadata(review.reference) : text(row.before)),
      csvCell(row.id === 'track' ? metadata(review.revision) : text(row.after)),
      csvCell(evidence(row.before, review.reference)), csvCell(evidence(row.after, review.revision)),
      csvCell(row.issues.map(({cue, issue}) => 'Cue ' + cue + ' · ' + issue.message).join('\n')),
      csvCell(labels[decision?.status ?? 'pending']), csvCell(decision?.note ?? ''),
    ].join(',')
  })
  return '\uFEFF' + [header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n'
}
