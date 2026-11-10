import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { example, wav } from './fixtures'

const returned = `WEBVTT

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

00:14.000 --> 00:16.500
[Air conditioner humming]

00:17.000 --> 00:20.000
Speak into the front of the microphone.

00:21.000 --> 00:23.000
Leave a little silence at the end.

00:24.000 --> 00:26.000
Thanks for coming in.`

test('checks a returned revision, verifies a restored sound, and keeps the prior handoff', async ({ page }) => {
  await example(page)
  await page.getByLabel('Attach local audio or video').setInputFiles({ name: 'clip.wav', mimeType: 'audio/wav', buffer: wav() })
  await expect(page.getByRole('button', { name: 'Play cue' })).toBeEnabled()
  await page.getByLabel('Decision', { exact: true }).selectOption('changes')
  await page.getByLabel(/Note Optional/).fill('Confirm the opening time with the studio.')
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.locator('#count-changes')).toHaveText('1')
  await page.getByRole('button', { name: /Air conditioner humming/ }).click()
  await page.getByLabel('Decision', { exact: true }).selectOption('changes')
  await page.getByLabel(/Note Optional/).fill('Restore the meaningful background sound.')
  await page.getByRole('button', { name: 'Check next revision' }).click()
  await expect(page.locator('#notice')).toContainText('Save or discard')
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.locator('#count-changes')).toHaveText('2')
  await page.getByRole('button', { name: 'Check next revision' }).click()
  const dialog = page.getByRole('dialog', { name: 'Check next revision' })
  await expect(dialog).toContainText('2 requests will carry forward')
  const upload = dialog.locator('input[type=file]')
  await upload.setInputFiles({ name: 'broken.vtt', mimeType: 'text/vtt', buffer: Buffer.from('broken') })
  await dialog.getByRole('button', { name: 'Start next round' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Expected a WEBVTT header')
  await upload.setInputFiles({ name: 'returned.vtt', mimeType: 'text/vtt', buffer: Buffer.from(returned) })
  await dialog.getByRole('button', { name: 'Start next round' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('#desk-kicker')).toContainText('Round 2')
  await expect(page.locator('audio')).toBeVisible()
  await expect(page.locator('#followup-count')).toContainText('2 of 2 follow-ups open')
  await page.getByRole('button', { name: 'Show follow-ups' }).click()
  await expect(page.locator('#queue-range')).toHaveText('1–2 of 2')
  await page.getByRole('button', { name: /Restore the meaningful background sound/ }).click()
  await expect(page.locator('#detail')).toContainText('Matching wording returned')
  await expect(page.locator('#detail')).toContainText('[Air conditioner humming]')
  await expect(page.getByLabel('Decision', { exact: true })).toHaveValue('pending')
  await page.getByLabel('Decision', { exact: true }).selectOption({ label: 'Verified resolved' })
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.locator('#followup-count')).toContainText('1 of 2 follow-ups open')
  await page.reload()
  await expect(page.locator('#followup-count')).toContainText('1 of 2 follow-ups open')
  await page.getByRole('button', { name: 'Review handoff' }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download previous round backup' }).click()
  const archive = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'))
  expect(archive.round).toBe(1)
  expect(Object.values(archive.decisions)).toHaveLength(2)
  await page.getByRole('button', { name: 'Close handoff' }).click()
  await page.getByRole('button', { name: 'Check next revision' }).click()
  await upload.setInputFiles({ name: 'returned-again.vtt', mimeType: 'text/vtt', buffer: Buffer.from(returned) })
  await dialog.getByRole('button', { name: 'Start next round' }).click()
  await expect(page.locator('#desk-kicker')).toContainText('Round 3')
  await expect(page.locator('#followup-count')).toContainText('1 of 1 follow-up open')
  await expect(page.locator('#detail')).toContainText('Confirm the opening time with the studio.')
  await expect(page.locator('#detail')).toContainText('Linked cues unchanged')
})

test('next-round dialog stays accessible and locks dismissal during file reads', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 })
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.vtt') await new Promise(resolve => setTimeout(resolve, 650))
      return read.call(this)
    }
  })
  await example(page)
  await page.getByRole('button', { name: 'Check next revision' }).click()
  const dialog = page.getByRole('dialog', { name: 'Check next revision' })
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  expect(axe.violations.map(v => [v.id, v.nodes.map(n => n.target)])).toEqual([])
  await dialog.locator('input[type=file]').setInputFiles({ name: 'slow.vtt', mimeType: 'text/vtt', buffer: Buffer.from('bad') })
  await dialog.getByRole('button', { name: 'Start next round' }).click()
  await expect(dialog.getByRole('button', { name: 'Close next revision' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Expected a WEBVTT header')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Check next revision' })).toBeFocused()
})

test('built-in sample can demonstrate the follow-up loop without external files', async ({ page }) => {
  await example(page)
  await page.getByRole('button', { name: /Air conditioner humming/ }).click()
  await page.getByLabel('Decision', { exact: true }).selectOption('changes')
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.locator('#count-changes')).toHaveText('1')
  await page.getByRole('button', { name: 'Check next revision' }).click()
  const dialog = page.getByRole('dialog', { name: 'Check next revision' })
  await dialog.getByRole('button', { name: 'Use sample return' }).click()
  await expect(dialog.locator('.file-name')).toHaveText('studio-orientation.returned.vtt')
  await dialog.getByRole('button', { name: 'Start next round' }).click()
  await expect(page.locator('#detail')).toContainText('Matching wording returned')
  await expect(page.getByLabel('Decision', { exact: true })).toHaveValue('pending')
})

test('advances a v1 backup and plays around the original time of an unlinked request', async ({ page }) => {
  await page.goto('/')
  const original = 'WEBVTT\n\n00:01.000 --> 00:02.000\n[Alarm rings]\n\n00:05.000 --> 00:07.000\nOpening remarks.'
  const revision = 'WEBVTT\n\n00:05.000 --> 00:07.000\nIntroductions.'
  const legacy = {
    version: 1, example: false,
    reference: { name: 'before.vtt', source: original },
    revision: { name: 'revision.vtt', source: revision },
    decisions: { '1:0': { status: 'changes', note: 'Restore the alarm.' } },
  }
  await page.getByRole('button', { name: 'Restore a saved review' }).click()
  await page.getByLabel('Cueproof JSON backup').setInputFiles({
    name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
  })
  await page.getByRole('button', { name: 'Open backup' }).click()
  await expect(page.locator('#desk-kicker')).toContainText('Round 1')
  await expect(page.locator('#count-changes')).toHaveText('1')
  await page.getByLabel('Attach local audio or video').setInputFiles({ name: 'clip.wav', mimeType: 'audio/wav', buffer: wav() })
  await page.getByRole('button', { name: 'Check next revision' }).click()
  const dialog = page.getByRole('dialog', { name: 'Check next revision' })
  await expect(dialog).toContainText('1 unreviewed item stays in this round’s backup')
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'returned.vtt', mimeType: 'text/vtt', buffer: Buffer.from(revision),
  })
  await dialog.getByRole('button', { name: 'Start next round' }).click()
  await expect(page.locator('#detail')).toContainText('No linked cue found')
  await page.getByRole('button', { name: 'Play around request' }).click()
  await expect.poll(() => page.locator('audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(0.25)
  await expect(page.getByLabel('Decision', { exact: true })).toHaveValue('pending')
})
