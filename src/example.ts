import { parseTrack } from './track.ts'
import { createReview } from './review.ts'

const reference = `WEBVTT

00:01.000 --> 00:03.600
Welcome to the sound studio.

00:04.000 --> 00:06.800
The studio opens at eight.

00:07.000 --> 00:10.600
Check the green light. Put your bag by the door.

00:11.200 --> 00:13.400
Set the headphones to a comfortable level.

00:14.000 --> 00:16.500
[Air conditioner humming]

00:17.000 --> 00:20.000
Speak into the front of the microphone.

00:21.000 --> 00:23.000
Leave a little silence at the end.

00:24.000 --> 00:26.000
Thanks for coming in.`

const revision = `WEBVTT

00:01.000 --> 00:03.600
Welcome to the sound studio.

00:04.240 --> 00:07.040
The studio opens at nine.

00:07.040 --> 00:08.800
Check the green light.

00:08.800 --> 00:10.600
Put your bag by the door.

00:10.680 --> 00:11.100
[Door clicks]

00:11.200 --> 00:13.400
Set the headphones to a comfortable level.

00:17.000 --> 00:20.000
Speak into the front of the microphone.

00:21.000 --> 00:23.000
Leave a little silence at the end.

00:24.000 --> 00:26.000
Thanks for coming in.`

export function exampleReview() {
  return createReview(
    parseTrack({ name: 'studio-orientation.reference.vtt', source: reference }),
    parseTrack({ name: 'studio-orientation.revised.vtt', source: revision }),
    true,
  )
}

export function sampleReturnFile(): File {
  const source = revision.replace(
    '00:17.000 --> 00:20.000',
    '00:14.000 --> 00:16.500\n[Air conditioner humming]\n\n00:17.000 --> 00:20.000',
  )
  return new File([source], 'studio-orientation.returned.vtt', { type: 'text/vtt' })
}
