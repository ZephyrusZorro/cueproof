export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_CUES = 2500
export const MAX_CUE_TEXT = 8000

export type TrackInput = { name: string; source: string }
export type Cue = {
  id: string
  number: number
  line: number
  start: number
  end: number
  text: string
  settings: string
}
export type Track = TrackInput & { format: 'srt' | 'vtt'; cues: Cue[]; metadata: string[] }

function time(value: string, format: Track['format']): number | undefined {
  const parts = format === 'srt'
    ? /^(\d{2,6}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(value)
    : /^(?:(\d{2,6}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value)
  if (parts) {
    return (((Number(parts[1] ?? 0) * 60 + Number(parts[2])) * 60) + Number(parts[3])) * 1000 + Number(parts[4])
  }
}

export function formatTime(ms: number): string {
  const fields = [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
  return fields.map(n => String(n).padStart(2, '0')).join(':') + '.' + String(ms % 1000).padStart(3, '0')
}

export async function readTrack(file: File): Promise<Track> {
  if (file.size > MAX_FILE_BYTES) throw new Error(file.name + ' exceeds the 2 MiB caption limit.')
  const bytes = await file.arrayBuffer()
  let source: string
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new Error(file.name + ' is not valid UTF-8. Save a UTF-8 copy in your caption editor.')
  }
  return parseTrack({ name: file.name, source })
}

export function parseTrack({ name, source }: TrackInput): Track {
  const extension = /\.(srt|vtt|webvtt)$/i.exec(name)?.[1].toLowerCase()
  if (!extension) throw new Error(name + ' must be an SRT or WebVTT file.')
  if (name.length > 512) throw new Error('The caption filename is too long.')
  if (source.length > MAX_FILE_BYTES || new TextEncoder().encode(source).length > MAX_FILE_BYTES) {
    throw new Error(name + ' exceeds the 2 MiB caption limit.')
  }
  if (source.includes('\0')) throw new Error(name + ' contains a null byte. Save a UTF-8 text copy.')
  const format = extension === 'srt' ? 'srt' : 'vtt'
  const cues: Cue[] = []
  const metadata: string[] = []
  const ids = new Set<string>()
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  const fail = (line: number, reason: string): never => {
    throw new Error(name + ', line ' + line + ' · ' + reason)
  }
  let at = 0
  if (format === 'vtt') {
    if (!/^WEBVTT(?:[ \t][^\n]*)?$/.test(lines[0]) || lines[0].includes('-->')) fail(1, 'Expected a WEBVTT header.')
    while (at < lines.length && lines[at].trim()) {
      if (lines[at].includes('-->')) fail(at + 1, 'Add a blank line after the WEBVTT header.')
      at++
    }
    metadata.push(lines.slice(0, at).join('\n'))
  }

  while (at < lines.length) {
    if (!lines[at].trim()) {
      at++
      continue
    }
    const first = at
    while (at < lines.length && lines[at].trim()) at++
    const block = lines.slice(first, at)
    const label = block[0]
    if (format === 'vtt' && (/^NOTE(?:[ \t]|$)/.test(label) || /^(STYLE|REGION)[ \t]*$/.test(label))) {
      if (block.some(line => line.includes('-->'))) fail(first + 1, 'Expected a blank separator after track metadata.')
      if (cues.length && !/^NOTE(?:[ \t]|$)/.test(label)) fail(first + 1, 'Put STYLE and REGION blocks before the first cue.')
      metadata.push(block.join('\n'))
      continue
    }

    const timeIndex = label.includes('-->') ? 0 : 1
    const line = first + timeIndex + 1
    const id = timeIndex ? label.trim() : ''
    if (format === 'srt' && id && !/^\d+$/.test(id)) fail(first + 1, 'Expected a cue number or time range.')
    if (format === 'vtt' && id && ids.has(id)) fail(first + 1, 'This cue identifier is already in use.')
    if (id) ids.add(id)
    const timing = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/.exec(block[timeIndex]?.trim() ?? '')
      ?? fail(line, 'Expected a cue time range with spaces around -->.')
    const start = time(timing[1], format) ?? fail(line, 'Invalid start timestamp.')
    const end = time(timing[2], format) ?? fail(line, 'Invalid end timestamp.')
    if (end <= start) fail(line, 'The end timestamp must come after the start.')
    if (start < (cues.at(-1)?.start ?? 0)) fail(line, 'Put cues in start-time order before comparing.')
    const text = block.slice(timeIndex + 1).join('\n')
    if (text.includes('-->')) fail(line, 'Check for a missing blank separator between cues.')
    if (text.length > MAX_CUE_TEXT) fail(line, 'This cue exceeds 8,000 characters.')
    if (cues.length === MAX_CUES) fail(line, 'This track exceeds 2,500 cues.')
    cues.push({ id, number: cues.length + 1, line, start, end, text, settings: timing[3] ?? '' })
  }
  if (!cues.length) throw new Error(name + ' has no caption cues.')
  return { name, source, format, cues, metadata }
}
