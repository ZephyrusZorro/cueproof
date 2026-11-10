import { el } from './dom.ts'
import { activeCaption, playbackAround, playbackWindow } from './media-time.ts'
import type { ReviewRow } from './followups.ts'
import type { Review } from './review.ts'

export class MediaPreview {
  private review?: Review
  private row?: ReviewRow
  private player?: HTMLMediaElement
  private url?: string
  private stopAt?: number
  private name = el('span', 'media-name', 'Optional local media')
  private media = el('div', 'media-stage')
  private caption = el('p', 'media-caption')
  private error = el('p', 'media-error')
  private controls = el('div', 'media-controls')
  private file = el('input')
  private track = el('select')
  private play = el('button', 'button small quiet', 'Play cue')
  private remove = el('button', 'button small quiet', 'Remove')

  constructor(slot: HTMLElement) {
    const wrapper = el('div', 'media-preview')
    const header = el('div', 'media-head')
    const fileLabel = el('label', 'button small quiet media-file', 'Attach media')
    this.file.type = 'file'
    this.file.accept = 'audio/*,video/*,.mkv,.wav,.webm,.mp4'
    this.file.setAttribute('aria-label', 'Attach local audio or video')
    fileLabel.append(this.file)
    const buttons = el('div', 'media-buttons')
    buttons.append(fileLabel, this.remove)
    header.append(this.name, buttons)

    const label = el('label', '', 'Caption preview ')
    for (const [value, title] of [['revision', 'Revision'], ['reference', 'Reference'], ['off', 'Off']]) {
      const option = el('option', '', title)
      option.value = value
      this.track.append(option)
    }
    label.append(this.track)
    this.track.addEventListener('change', () => {
      this.stopAt = undefined
      this.player?.pause()
      this.update()
    })
    this.play.type = this.remove.type = 'button'
    this.play.addEventListener('click', () => void this.playCue())
    this.remove.addEventListener('click', () => {
      this.clear()
      this.file.focus()
    })
    this.file.addEventListener('change', () => {
      const file = this.file.files?.[0]
      if (file) this.attach(file)
      this.file.value = ''
    })
    this.error.setAttribute('role', 'status')
    this.controls.append(label, this.play)
    this.media.append(this.caption)
    wrapper.append(header, this.media, this.controls, this.error)
    slot.append(wrapper)
    this.clear()
  }

  open(review: Review, keepMedia = false): void {
    if (keepMedia) {
      this.stopAt = undefined
      this.player?.pause()
    } else this.clear()
    this.track.value = 'revision'
    this.review = review
    this.row = undefined
    this.update()
  }

  reset(): void {
    this.clear()
    this.review = this.row = undefined
  }

  select(row: ReviewRow | undefined): void {
    if (this.row !== row && this.stopAt !== undefined) {
      this.stopAt = undefined
      this.player?.pause()
    }
    this.row = row
    if (row?.before.length && !row.after.length && this.track.value === 'revision') this.track.value = 'reference'
    if (row?.after.length && !row.before.length && this.track.value === 'reference') this.track.value = 'revision'
    this.update()
  }

  clear(): void {
    this.stopAt = undefined
    const player = this.player
    this.player = undefined
    if (player) {
      player.pause()
      player.removeAttribute('src')
      player.load()
      player.remove()
    }
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = undefined
    this.name.textContent = 'Optional local media'
    this.error.hidden = true
    this.media.hidden = this.controls.hidden = this.remove.hidden = true
  }

  private attach(file: File): void {
    this.clear()
    const audio = file.type.startsWith('audio/') || /\.(wav|m4a|mp3|aac|ogg|flac)$/i.test(file.name)
    const player = el(audio ? 'audio' : 'video')
    player.controls = true
    player.preload = 'metadata'
    player.setAttribute('aria-label', 'Local media preview')
    if (player instanceof HTMLVideoElement) player.playsInline = true
    this.player = player
    this.url = URL.createObjectURL(file)
    this.name.textContent = file.name
    this.media.prepend(player)
    this.media.hidden = this.controls.hidden = this.remove.hidden = false
    this.media.classList.toggle('audio-stage', audio)
    this.update()
    for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) {
      player.addEventListener(event, () => {
        if (this.player !== player) return
        if (this.stopAt !== undefined && player.currentTime >= this.stopAt) {
          this.stopAt = undefined
          player.pause()
        }
        this.update()
      })
    }
    player.addEventListener('pause', () => {
      if (this.player === player) this.stopAt = undefined
    })
    player.addEventListener('error', () => {
      if (this.player === player) this.report('This file could not be played. Try a browser-supported MP4, WebM, or audio file.')
    })
    player.src = this.url
  }

  private report(text: string): void {
    this.error.textContent = text
    this.error.hidden = !text
  }

  private cueWindow(): [number, number] | undefined {
    const cues = this.selectedCues()
    if (!cues || !this.player) return
    const request = this.row?.followUp?.request
    if (!cues.length && request?.kind === 'cue') return playbackAround(request.time, this.player.duration)
    return playbackWindow(cues, this.player.duration)
  }

  private selectedCues() {
    if (!this.row) return
    if (this.track.value === 'reference') return this.row.before
    if (this.track.value === 'revision') return this.row.after
    return this.row.after.length ? this.row.after : this.row.before
  }

  private update(): void {
    const player = this.player
    const track = this.track.value === 'reference' ? this.review?.reference : this.review?.revision
    const text = player && track && this.track.value !== 'off' ? activeCaption(track.cues, player.currentTime) : ''
    if (this.caption.textContent !== text) this.caption.textContent = text
    this.caption.hidden = !text
    this.caption.dir = 'auto'
    this.play.disabled = !this.cueWindow()
    const around = this.row?.followUp?.request.kind === 'cue' && !this.selectedCues()?.length
    const label = around ? 'Play around request' : 'Play cue'
    if (this.play.textContent !== label) this.play.textContent = label
    this.play.title = this.play.disabled ? 'This item has no playable range in the attached file.'
      : around ? 'Play around the original request time' : 'Play the selected cue with a little context'
  }

  private async playCue(): Promise<void> {
    const player = this.player
    const window = this.cueWindow()
    if (!player || !window) return
    this.report('')
    this.stopAt = window[1]
    try {
      player.currentTime = window[0]
      await player.play()
    } catch {
      if (this.player === player) {
        this.stopAt = undefined
        this.report('Could not play the cue. Check the media file or use the native playback controls.')
      }
    }
  }
}
