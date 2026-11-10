import test from 'node:test'
import assert from 'node:assert/strict'
import { activeCaption, playbackWindow } from '../src/media-time.ts'
import { parseTrack } from '../src/track.ts'

const cues = parseTrack({name:'preview.vtt',source:
  'WEBVTT\n\n00:01.000 --> 00:03.000\n<v Kim>One\n\n00:02.000 --> 00:04.000\n<i>Two</i>'}).cues

test('preview keeps overlapping cues and uses half-open timing boundaries', () => {
  assert.equal(activeCaption(cues, 0.999), '')
  assert.equal(activeCaption(cues, 1), 'One')
  assert.equal(activeCaption(cues, 2), 'One\nTwo')
  assert.equal(activeCaption(cues, 3), 'Two')
  assert.equal(activeCaption(cues, 4), '')
})

test('plays cue with bounded preroll and postroll within the attached media', () => {
  assert.deepEqual(playbackWindow(cues, 6), [0.65, 4.5])
  assert.deepEqual(playbackWindow(cues, 3.3), [0.65, 3.3])
  assert.equal(playbackWindow(cues, 1), undefined)
  assert.equal(playbackWindow([], 6), undefined)
  assert.equal(playbackWindow(cues, NaN), undefined)
  assert.deepEqual(playbackWindow(cues, Infinity), [0.65, 4.5])
})
