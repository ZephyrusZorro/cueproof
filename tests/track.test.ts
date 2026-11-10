import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTrack, readTrack, MAX_FILE_BYTES, formatTime } from '../src/track.ts'

test('reads BOM, CRLF, source lines, multiline text and exact milliseconds', async () => {
  const file = new File(['\uFEFF3\r\n01:04:20,004 --> 01:04:22,321\r\n<v Al>Hi\r\nthere.\r\n'], 'cut.srt')
  const track = await readTrack(file)
  assert.equal(track.format, 'srt')
  assert.deepEqual(track.cues[0], {
    id: '3', number: 1, line: 2, start: 3860004, end: 3862321, text: '<v Al>Hi\nthere.', settings: '',
  })
  assert.equal(formatTime(track.cues[0].start), '01:04:20.004')
})

test('preserves VTT track metadata, cue identifier, and positioning', () => {
  const track = parseTrack({ name: 'cut.vtt', source: 'WEBVTT - Example\n\nSTYLE\n::cue { color: lime }\n\nNOTE test\nignored\n\nspoken\n00:01.000 --> 00:04.100 line:80% align:start\nHello\n\n00:02.000 --> 00:05.000\n[Music]' })
  assert.deepEqual(track.metadata, ['WEBVTT - Example', 'STYLE\n::cue { color: lime }', 'NOTE test\nignored'])
  assert.equal(track.cues[0].id, 'spoken')
  assert.equal(track.cues[0].line, 10)
  assert.equal(track.cues[0].settings, 'line:80% align:start')
  assert.equal(track.cues.length, 2)
})

test('rejects structural faults instead of silently dropping cues', () => {
  for (const [source, error] of [
    ['WEBVTT\n00:00.000 --> 00:01.000\nHi', /line 2.*blank line/],
    ['WEBVTT\n\n00:65.000 --> 01:05.100\nHi', /line 3.*timestamp/],
    ['WEBVTT\n\n00:01.000 --> 00:00.100\nHi', /line 3.*after/],
    ['WEBVTT\n\n00:02.000 --> 00:04.000\nHi\n\n00:01.000 --> 00:03.000\nHi', /line 6.*order/],
    ['WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n00:02.000 --> 00:03.000\nHi', /line 3.*separator/],
    ['WEBVTT\n\nNOTE hi', /no caption cues/],
  ] as const) {
    assert.throws(() => parseTrack({ name: 'bad.vtt', source }), error)
  }
})

test('rejects oversized files, unsupported extensions and invalid UTF-8', async () => {
  await assert.rejects(readTrack(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.srt')), /2 MiB/)
  await assert.rejects(readTrack(new File([new Uint8Array([255])], 'broken.srt')), /UTF-8/)
  assert.throws(() => parseTrack({ name: 'cut.ass', source: '' }), /SRT or WebVTT/)
})

test('handles repeated SRT numbers and hour counts above 99 without renumbering source', () => {
  const source = '1\n100:00:00,000 --> 100:00:01,000\nFirst\n\n1\n100:00:01,500 --> 100:00:02,100\nSecond'
  const track = parseTrack({ name: 'legacy.SRT', source })
  assert.equal(track.cues[1].id, '1')
  assert.equal(track.source, source)
  assert.equal(formatTime(track.cues[1].start), '100:00:01.500')
})
