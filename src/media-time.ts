import { visibleText } from './findings.ts'
import { rangeEnd, type Cue } from './track.ts'

export function activeCaption(cues: Cue[], seconds: number): string {
  const ms = seconds * 1000
  const active: string[] = []
  for (const cue of cues) {
    if (cue.start > ms) break
    if (cue.end > ms) active.push(visibleText(cue.text))
  }
  return active.join('\n')
}

export function playbackWindow(cues: Cue[], duration: number): [number, number] | undefined {
  if (!cues.length || Number.isNaN(duration) || cues[0].start >= duration * 1000) return
  return [Math.max(0, (cues[0].start - 350) / 1000), Math.min(duration, (rangeEnd(cues) + 500) / 1000)]
}

export function playbackAround(time: number, duration: number): [number, number] | undefined {
  const seconds = time / 1000
  if (Number.isNaN(duration) || seconds >= duration) return
  return [Math.max(0, seconds - 0.75), Math.min(duration, seconds + 2)]
}
