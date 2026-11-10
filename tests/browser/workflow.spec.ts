import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { baseline, files, example, wav } from './fixtures'

test('imports real tracks, plays selected audio, saves, exports and restores', async ({ page }) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  await page.goto('/')
  const start = page.locator('#landing')
  await files(start)
  await start.getByRole('button', { name: 'Compare tracks' }).click()
  await expect(page.locator('#count-total')).toHaveText('3')
  await page.getByRole('button', { name: /The hall opens at nine/ }).click()
  await expect(page.locator('#detail')).toContainText('In +240 ms · Out +240 ms')
  await expect(page.locator('#detail ins')).toHaveText('nine')
  await page.getByLabel('Attach local audio or video').setInputFiles({
    name: 'hall.wav', mimeType: 'audio/wav', buffer: wav(),
  })
  await expect(page.getByRole('button', { name: 'Play cue' })).toBeEnabled()
  await page.getByRole('button', { name: 'Play cue' }).click()
  await expect(page.locator('.media-caption')).toHaveText('The hall opens at nine.')
  await page.getByLabel('Caption preview').selectOption('reference')
  await page.getByRole('button', { name: 'Play cue' }).click()
  await expect(page.locator('.media-caption')).toHaveText('The hall opens at eight.')
  await page.getByRole('button', { name: /img src=evil/ }).click()
  await expect(page.locator('#detail')).toContainText('<img src=evil onerror=alert(1)>')
  await expect(page.locator('#detail img')).toHaveCount(0)
  await page.getByRole('button', { name: /The hall opens at nine/ }).click()
  await page.getByLabel('Decision', { exact: true }).selectOption('changes')
  await page.getByLabel(/Note Optional/).fill('Check that the posted opening time is nine.')
  await page.getByRole('button', { name: /img src=evil/ }).click()
  await expect(page.locator('#decision-message')).toContainText('Save or discard')
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.locator('#count-changes')).toHaveText('1')
  await page.getByRole('button', { name: 'New review' }).click()
  const upload = page.getByRole('dialog', { name: 'New review' })
  await files(upload, 'WEBVTT\n\nmalformed')
  await upload.getByRole('button', { name: 'Compare tracks' }).click()
  await expect(upload.getByRole('alert')).toContainText('Expected a cue time range')
  await upload.getByRole('button', { name: 'Close new review' }).click()
  await page.reload()
  await expect(page.locator('#count-changes')).toHaveText('1')
  await page.getByRole('button', { name: 'Review handoff' }).click()
  const csvPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  const csv = await csvPromise
  expect(csv.suggestedFilename()).toBe('hall-revision.handoff.csv')
  expect(await readFile((await csv.path())!, 'utf8')).toContain('Check that the posted opening time is nine.')
  const backupPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const backup = await backupPromise
  const backupFile = (await backup.path())!
  expect(JSON.parse(await readFile(backupFile, 'utf8')).reference.source).toBe(baseline)
  await page.getByRole('button', { name: 'Close handoff' }).click()
  await page.getByRole('button', { name: 'New review' }).click()
  await upload.getByText('Clear this workspace').click()
  await upload.getByRole('button', { name: 'Clear active review' }).click()
  await expect(start).toBeVisible()
  await page.getByRole('button', { name: 'Restore a saved review' }).click()
  await page.getByLabel('Cueproof JSON backup').setInputFiles({
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{}'),
  })
  await page.getByRole('button', { name: 'Open backup' }).click()
  await expect(page.getByRole('alert')).toContainText('not a supported Cueproof review backup')
  await page.getByLabel('Cueproof JSON backup').setInputFiles(backupFile)
  await page.getByRole('button', { name: 'Open backup' }).click()
  await expect(page.locator('#count-changes')).toHaveText('1')
  expect(errors).toEqual([])
  expect(requests.filter(url => !url.startsWith('http://127.0.0.1:4186/') && !url.startsWith('blob:'))).toEqual([])
  expect(requests.some(url => url.endsWith('/evil'))).toBe(false)
})

test('a stale tab cannot overwrite a newer decision', async ({ page, context }) => {
  await example(page)
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.locator('#desk')).toBeVisible()
  await page.getByLabel('Decision', { exact: true }).selectOption('accepted')
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.locator('#count-accepted')).toHaveText('1')
  await second.getByLabel('Decision', { exact: true }).selectOption('changes')
  await second.getByRole('button', { name: 'Save decision' }).click()
  await expect(second.locator('#decision-message')).toContainText('Another tab changed this review')
  await second.getByRole('button', { name: 'Discard edits' }).click()
  await second.reload()
  await expect(second.locator('#count-accepted')).toHaveText('1')
})

test('keeps replacement modal open during a pending import', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'hall-revision.vtt') await new Promise(resolve => setTimeout(resolve, 700))
      return read.call(this)
    }
  })
  await example(page)
  await page.getByRole('button', { name: 'New review' }).click()
  const modal = page.getByRole('dialog', { name: 'New review' })
  await files(modal, 'WEBVTT\n\nmalformed')
  await modal.getByRole('button', { name: 'Compare tracks' }).click()
  await expect(modal.getByRole('button', { name: 'Close new review' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('alert')).toContainText('Expected a cue time range')
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(page.locator('#desk-kicker')).toContainText('Sample project')
})

test('recovers from unsupported media and plays a local video with the selected track', async ({ page }) => {
  await page.goto('/')
  const start = page.locator('#landing')
  await start.locator('input[name=reference]').setInputFiles({
    name: 'before.srt', mimeType: 'text/plain',
    buffer: Buffer.from('1\n00:00:00,300 --> 00:00:01,450\nBefore'),
  })
  await start.locator('input[name=revision]').setInputFiles({
    name: 'after.srt', mimeType: 'text/plain',
    buffer: Buffer.from('1\n00:00:00,300 --> 00:00:01,450\nAfter'),
  })
  await start.getByRole('button', { name: 'Compare tracks' }).click()
  const picker = page.getByLabel('Attach local audio or video')
  await picker.setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid media') })
  await expect(page.locator('.media-error')).toContainText('could not be played')
  const frames = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 54
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(20)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
    const chunks: Blob[] = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    recorder.start()
    const paint = setInterval(() => {
      context.fillStyle = Math.round(performance.now() / 100) % 2 ? '#20332b' : '#a9c36b'
      context.fillRect(0, 0, 96, 54)
    }, 55)
    await new Promise(resolve => setTimeout(resolve, 1800))
    recorder.stop()
    await stopped
    clearInterval(paint)
    stream.getTracks().forEach(track => track.stop())
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
  })
  await picker.setInputFiles({ name: 'sample.webm', mimeType: 'video/webm', buffer: Buffer.from(frames) })
  await expect(page.locator('.media-error')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Play cue' })).toBeEnabled()
  await page.getByRole('button', { name: 'Play cue' }).click()
  await expect(page.locator('.media-caption')).toHaveText('After')
  expect(await page.locator('video').evaluate(video => video.videoWidth)).toBe(96)
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.locator('video')).toHaveCount(0)
})

test('mobile width, keyboard focus, filtering and automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 })
  await page.goto('/')
  await expect(page.locator('#landing')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByText('Skip to workspace')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  const runAxe = () => new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  expect((await runAxe()).violations.map(v => [v.id, v.nodes.map(n => n.target)])).toEqual([])
  await page.getByRole('button', { name: 'Open sample' }).click()
  await expect(page.locator('#desk')).toBeVisible()
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  expect((await runAxe()).violations.map(v => [v.id, v.nodes.map(n => n.target)])).toEqual([])
  await page.getByLabel('Search cues').fill('door clicks')
  await expect(page.locator('#queue-range')).toHaveText('1–1 of 1')
  await page.getByRole('button', { name: /Door clicks/ }).click()
  await expect(page.locator('#detail')).toContainText('No reference cue')
  await page.getByRole('button', { name: 'Next unreviewed' }).click()
  await expect(page.getByRole('heading', { name: 'Cue inspector' })).toBeFocused()
  await expect(page.getByLabel('Search cues')).toHaveValue('')
})
