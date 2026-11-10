import { expect, type Locator, type Page } from '@playwright/test'

export const baseline = '1\n00:00:01,000 --> 00:00:04,000\nThe hall opens at eight.\n\n2\n00:00:05,000 --> 00:00:08,000\nQuiet hours start now.'
export const revised = 'WEBVTT\n\n00:01.240 --> 00:04.240\nThe hall opens at nine.\n\n00:04.300 --> 00:04.950\n<img src=evil onerror=alert(1)>\n\n00:05.000 --> 00:08.000\nQuiet hours start now.'

export async function files(form: Locator, source = revised) {
  await form.locator('input[name=reference]').setInputFiles({
    name: 'hall-original.srt', mimeType: 'text/plain', buffer: Buffer.from(baseline),
  })
  await form.locator('input[name=revision]').setInputFiles({
    name: 'hall-revision.vtt', mimeType: 'text/vtt', buffer: Buffer.from(source),
  })
}

export async function example(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open sample' }).click()
  await expect(page.getByRole('heading', { name: 'Revision review.' })).toBeVisible()
}

export function wav(): Buffer {
  const rate = 8000
  const size = 9 * rate * 2
  const data = Buffer.alloc(44 + size)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + size, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24)
  data.writeUInt32LE(rate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(size, 40)
  return data
}
