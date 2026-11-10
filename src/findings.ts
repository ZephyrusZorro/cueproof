import { formatTime, type Track } from './track.ts'

export type Issue = { code: string; message: string }

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '', rlm: '' }
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function visibleText(text: string): string {
  return text.replace(/<\/?(?:[biucv]|lang|ruby|rt|font)(?=[\s.>])[^<>]*>|<\d[\d:.]*>/gi, '')
    .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, key: string) => entities[key])
}

function length(text: string): number {
  let count = 0
  for (const _ of graphemes.segment(text)) count++
  return count
}

export function findIssues(track: Track): Map<number, Issue[]> {
  const findings = new Map<number, Issue[]>()
  let longest = track.cues[0]
  for (const cue of track.cues) {
    const issues: Issue[] = []
    const seconds = (cue.end - cue.start) / 1000
    const text = visibleText(cue.text)
    const lines = text.split('\n')
    const speed = length(text.replace(/\s+/g, ' ').trim()) / seconds
    if (!text.trim()) issues.push({ code: 'empty', message: 'This cue has no visible text.' })
    if (seconds < 0.8) issues.push({ code: 'short', message: 'On screen for ' + seconds.toFixed(2) + ' s (guide 0.8 s minimum).' })
    if (seconds > 7) issues.push({ code: 'long', message: 'On screen for ' + seconds.toFixed(2) + ' s (guide 7 s maximum).' })
    if (speed > 20) issues.push({ code: 'speed', message: speed.toFixed(1) + ' characters/s (guide 20 maximum).' })
    if (lines.length > 2) issues.push({ code: 'lines', message: lines.length + ' lines (guide 2 maximum).' })
    const widest = Math.max(...lines.map(line => length(line.trim())))
    if (widest > 42) issues.push({ code: 'width', message: 'Longest line has ' + widest + ' characters (guide 42 maximum).' })
    if (longest !== cue && longest.end > cue.start) {
      issues.push({ code: 'overlap', message: 'Overlaps cue ' + longest.number + ' through ' + formatTime(longest.end) + '.' })
    }
    if (cue.end > longest.end) longest = cue
    if (issues.length) findings.set(cue.number, issues)
  }
  return findings
}
