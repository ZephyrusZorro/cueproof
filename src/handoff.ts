import { el, get } from './dom.ts'
import { csvReport, decodeReview, encodeReview, MAX_BACKUP_BYTES, type Review } from './review.ts'

type Current = () => Review | undefined
type Open = (review: Review) => Promise<void>

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = el('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export class Handoff {
  private dialog = get<HTMLDialogElement>('handoff-dialog')
  private csv = get<HTMLButtonElement>('download-csv')
  private backup = get<HTMLButtonElement>('download-backup')
  private input = get<HTMLInputElement>('restore-backup')
  private error = get('handoff-error')
  private submit = get<HTMLButtonElement>('open-backup')
  private working = false

  constructor(private current: Current, open: Open) {
    get('open-handoff').addEventListener('click', () => this.show())
    get('restore-link').addEventListener('click', () => this.show())
    get('close-handoff').addEventListener('click', () => { if (!this.working) this.dialog.close() })
    this.dialog.addEventListener('cancel', event => { if (this.working) event.preventDefault() })
    this.csv.addEventListener('click', () => this.export('csv'))
    this.backup.addEventListener('click', () => this.export('json'))
    get('restore-form').addEventListener('submit', async event => {
      event.preventDefault()
      const file = this.input.files?.[0]
      if (!file || this.working) return
      this.working = this.submit.disabled = this.input.disabled = true
      this.error.hidden = true
      try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error('The backup exceeds the 48 MiB limit.')
        let text: string
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
        } catch {
          throw new Error('This backup must be valid UTF-8 JSON.')
        }
        await open(decodeReview(text))
        this.dialog.close()
        get('main').focus()
      } catch (error) {
        this.error.textContent = error instanceof Error ? error.message : 'Could not open the backup.'
        this.error.hidden = false
      } finally {
        this.working = this.submit.disabled = this.input.disabled = false
      }
    })
  }

  private show(): void {
    const review = this.current()
    get('export-section').hidden = !review
    get('restore-explainer').textContent = review
      ? 'Opening a backup replaces the active review. Download a backup of this review first if you need it.'
      : 'Open a Cueproof JSON backup to restore both tracks and their saved decisions.'
    this.input.value = ''
    this.error.hidden = true
    this.dialog.showModal()
  }

  private export(kind: 'csv' | 'json'): void {
    const review = this.current()
    if (!review) return
    const stem = review.revision.name.replace(/\.(srt|vtt|webvtt)$/i, '').slice(0, 100)
    if (kind === 'csv') download(stem + '.handoff.csv', csvReport(review), 'text/csv;charset=utf-8')
    else download(stem + '.cueproof.json', encodeReview(review), 'application/json')
  }
}
