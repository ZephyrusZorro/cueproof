import { get } from './dom.ts'
import { sampleReturnFile } from './example.ts'
import { captionPicker } from './picker.ts'
import { actionable, advanceReview, outstandingCount, type Review } from './review.ts'
import { readTrack } from './track.ts'

export class NextRound {
  private dialog = get<HTMLDialogElement>('next-dialog')
  private form = get<HTMLFormElement>('next-form')
  private close = get<HTMLButtonElement>('close-next')
  private input = get<HTMLInputElement>('next-file')
  private submit = get<HTMLButtonElement>('start-next')
  private sample = get<HTMLButtonElement>('sample-return')
  private error = get('next-error')
  private refreshPicker = captionPicker(this.input)

  constructor(
    private current: () => Review | undefined,
    private previousExists: () => boolean,
    private canAdvance: () => boolean,
    private complete: (review: Review, next: Review) => Promise<void>,
  ) {
    get('next-round').addEventListener('click', () => this.show())
    this.sample.addEventListener('click', () => {
      const files = new DataTransfer()
      files.items.add(sampleReturnFile())
      this.input.files = files.files
      this.error.hidden = true
      this.refreshPicker()
      this.submit.focus()
    })
    this.close.addEventListener('click', () => this.dialog.close())
    this.dialog.addEventListener('cancel', event => { if (this.submit.disabled) event.preventDefault() })
    this.form.addEventListener('submit', event => {
      event.preventDefault()
      void this.advance()
    })
  }

  private show(): void {
    const review = this.current()
    if (!review || !this.canAdvance()) return
    const count = outstandingCount(review)
    const pending = review.comparison.rows.filter(row =>
      !row.followUp && actionable(row) && (review.decisions[row.id]?.status ?? 'pending') === 'pending').length
    get('next-round-label').textContent = 'Round ' + review.round + ' → ' + (review.round + 1)
    get('next-request-count').textContent = count === 1 ? '1 request will carry forward' : count + ' requests will carry forward'
    const pendingNote = get('next-pending-note')
    pendingNote.hidden = !pending
    pendingNote.textContent = (pending === 1 ? '1 unreviewed item stays' : pending + ' unreviewed items stay')
      + ' in this round’s backup. Mark any item that needs to carry forward as Needs changes.'
    get('next-archive-note').textContent = this.previousExists()
      ? 'This round replaces the previous-round backup in this browser. Download older rounds from Review handoff to keep them.'
      : 'The current round will remain available to download from Review handoff.'
    this.form.reset()
    this.sample.hidden = !review.example || review.round !== 1
    this.refreshPicker()
    this.error.hidden = true
    this.dialog.showModal()
  }

  private async advance(): Promise<void> {
    const review = this.current()
    const file = this.input.files?.[0]
    if (!review || !file || this.submit.disabled || !this.canAdvance()) return
    this.close.disabled = this.input.disabled = this.submit.disabled = this.sample.disabled = true
    this.submit.textContent = 'Comparing…'
    this.error.hidden = true
    try {
      const next = advanceReview(review, await readTrack(file))
      await this.complete(review, next)
      this.dialog.close()
      get('main').focus()
    } catch (error) {
      this.error.textContent = error instanceof Error ? error.message : 'Could not start the next round.'
      this.error.hidden = false
    } finally {
      this.close.disabled = this.input.disabled = this.submit.disabled = this.sample.disabled = false
      this.submit.textContent = 'Start next round'
    }
  }
}
