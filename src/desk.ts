import { inlineDiff, type Row } from './compare.ts'
import { get, el } from './dom.ts'
import { actionable, decide, labels, rangeEnd, type Review, type Status } from './review.ts'
import { formatTime, type Cue, type Track } from './track.ts'

const PAGE_SIZE = 24

export function signedMs(value: number): string {
  return (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value) + ' ms'
}

function rowLabels(row: Row): string[] {
  return row.changes.length ? row.changes : row.issues.length ? ['Advisory'] : ['Unchanged']
}

function cueText(cues: Cue[]): string {
  return cues.map(cue => cue.text).join('\n\n')
}

function cueRange(cues: Cue[]): string {
  return formatTime(cues[0].start) + ' → ' + formatTime(rangeEnd(cues))
}

function tag(text: string, style = '') {
  return el('span', 'tag ' + style, text)
}

type Save = (review: Review) => Promise<void>
type OnSelection = (row: Row | undefined) => void

export class Desk {
  review?: Review
  selected?: Row
  private page = 0
  private saving = false
  private search = get<HTMLInputElement>('search')
  private filter = get<HTMLSelectElement>('filter')
  private form = get<HTMLFormElement>('decision-form')
  private status = get<HTMLSelectElement>('decision-status')
  private note = get<HTMLTextAreaElement>('decision-note')
  private saveButton = get<HTMLButtonElement>('save-decision')
  private discard = get<HTMLButtonElement>('discard-decision')
  private message = get('decision-message')
  private nextCue = get<HTMLButtonElement>('next-cue')

  constructor(private save: Save, private onSelection: OnSelection = () => {}) {
    const refresh = () => { this.page = 0; this.renderQueue() }
    this.search.addEventListener('input', refresh)
    this.filter.addEventListener('change', refresh)
    get('prev-page').addEventListener('click', () => { this.page--; this.renderQueue() })
    get('next-page').addEventListener('click', () => { this.page++; this.renderQueue() })
    this.nextCue.addEventListener('click', () => this.advance())
    this.form.addEventListener('submit', event => { event.preventDefault(); void this.submit() })
    this.form.addEventListener('input', () => this.refreshDecision())
    this.discard.addEventListener('click', () => {
      this.loadDecision()
      this.message.textContent = 'Edits discarded.'
      this.status.focus()
    })
  }

  show(review: Review): void {
    this.review = review
    this.page = 0
    this.search.value = ''
    this.filter.value = 'queue'
    this.selected = review.comparison.rows.find(actionable) ?? review.comparison.rows[0]
    get('reference-name').textContent = review.reference.name
    get('revision-name').textContent = review.revision.name
    get('desk-kicker').textContent = review.example ? 'Sample project · synthetic tracks' : 'Active review'
    const offset = get('offset-note')
    offset.hidden = !review.comparison.offset
    offset.textContent = review.comparison.offset
      ? 'The matching cues suggest a track shift of ' + signedMs(review.comparison.offset) + '. Individual rows show actual time changes.'
      : ''
    this.renderSummary()
    this.renderQueue()
    this.renderDetail()
  }

  reset(): void {
    this.review = this.selected = undefined
    this.form.hidden = true
    get('queue').replaceChildren()
    get('detail').replaceChildren()
  }

  hasEdits(): boolean {
    if (!this.review || !this.selected || this.form.hidden) return false
    const decision = this.review.decisions[this.selected.id]
    return this.status.value !== (decision?.status ?? 'pending') || this.note.value !== (decision?.note ?? '')
  }

  private renderSummary(): void {
    if (!this.review) return
    const stats = { pending: 0, accepted: 0, changes: 0 }
    const rows = this.review.comparison.rows.filter(actionable)
    rows.forEach(row => stats[this.review!.decisions[row.id]?.status ?? 'pending']++)
    get('count-total').textContent = String(rows.length)
    for (const status of ['pending', 'accepted', 'changes'] as const) {
      get('count-' + status).textContent = String(stats[status])
    }
    const progress = get<HTMLProgressElement>('progress')
    progress.max = Math.max(1, rows.length)
    progress.value = rows.length - stats.pending
    get('progress-label').textContent = rows.length
      ? progress.value + ' of ' + rows.length + ' reviewed'
      : 'No review items'
    this.nextCue.hidden = !stats.pending
  }

  private getVisible(): Row[] {
    const review = this.review
    if (!review) return []
    const query = this.search.value.trim().toLowerCase()
    const filter = this.filter.value
    return review.comparison.rows.filter(row => {
      if (filter !== 'all') {
        if (!actionable(row)) return false
        if (filter === 'advisories' && !row.issues.length) return false
        if (filter !== 'queue' && filter !== 'advisories' && (review.decisions[row.id]?.status ?? 'pending') !== filter) return false
      }
      if (!query) return true
      return [formatTime(row.time), cueText(row.before), cueText(row.after), ...rowLabels(row), review.decisions[row.id]?.note ?? '']
        .some(value => value.toLowerCase().includes(query))
    })
  }

  private renderQueue(): void {
    const rows = this.getVisible()
    const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)
    this.page = Math.min(Math.max(this.page, 0), last)
    const start = this.page * PAGE_SIZE
    const queue = get('queue')
    queue.replaceChildren()
    for (const row of rows.slice(start, start + PAGE_SIZE)) {
      const li = el('li')
      const button = el('button', 'queue-row')
      button.type = 'button'
      button.dataset.row = row.id
      button.setAttribute('aria-current', row.id === this.selected?.id ? 'true' : 'false')
      const time = el('span', 'queue-time', row.id === 'track' ? 'TRACK' : formatTime(row.time))
      const preview = el('span', 'queue-preview')
      const text = el('span', 'queue-text', cueText(row.after.length ? row.after : row.before) || (row.id === 'track' ? 'File format and track metadata' : 'Empty cue'))
      text.dir = 'auto'
      const tags = el('span', 'queue-tags')
      rowLabels(row).forEach(label => tags.append(tag(label, 'type-' + label.toLowerCase().replace(' ', '-'))))
      if (row.issues.length && row.changes.length) tags.append(tag(row.issues.length + ' advisory' + (row.issues.length === 1 ? '' : ' items'), 'type-advisory'))
      const status = this.review?.decisions[row.id]?.status
      if (status && status !== 'pending') tags.append(tag(labels[status], status))
      preview.append(text, tags)
      button.append(time, preview, el('span', 'queue-arrow', '›'))
      button.lastElementChild?.setAttribute('aria-hidden', 'true')
      button.addEventListener('click', () => this.select(row, true))
      li.append(button)
      queue.append(li)
    }
    if (!rows.length) {
      queue.append(el('li', 'queue-empty', this.filter.value === 'queue' && !this.search.value
        ? 'No changes or advisory items. Choose All cues to inspect the tracks.'
        : 'No rows match this filter or search.'))
    }
    get('queue-range').textContent = rows.length
      ? (start + 1) + '–' + Math.min(start + PAGE_SIZE, rows.length) + ' of ' + rows.length
      : '0 rows'
    get<HTMLButtonElement>('prev-page').disabled = !this.page
    get<HTMLButtonElement>('next-page').disabled = this.page >= last
  }

  private select(row: Row, clicked = false): void {
    if (row.id === this.selected?.id) {
      if (clicked && matchMedia('(max-width: 850px)').matches) get('inspector-title').focus()
      return
    }
    if (this.saving) return
    if (this.hasEdits()) {
      this.message.textContent = 'Save or discard your edits before opening another cue.'
      this.saveButton.focus()
      return
    }
    this.selected = row
    get('queue').querySelectorAll<HTMLButtonElement>('[data-row]').forEach(button =>
      button.setAttribute('aria-current', button.dataset.row === row.id ? 'true' : 'false'))
    this.renderDetail()
    if (!clicked || matchMedia('(max-width: 850px)').matches) get('inspector-title').focus()
  }

  private advance(): void {
    const review = this.review
    if (!review) return
    const rows = review.comparison.rows
    const start = this.selected ? rows.indexOf(this.selected) + 1 : 0
    const ordered = [...rows.slice(start), ...rows.slice(0, start)]
    const next = ordered.find(row => actionable(row) && (review.decisions[row.id]?.status ?? 'pending') === 'pending')
    if (!next) return
    this.select(next)
    if (this.selected !== next) return
    let index = this.getVisible().indexOf(next)
    if (index < 0) {
      this.filter.value = 'queue'
      this.search.value = ''
      index = this.getVisible().indexOf(next)
    }
    this.page = Math.floor(index / PAGE_SIZE)
    this.renderQueue()
  }

  private renderDetail(): void {
    const row = this.selected
    const review = this.review
    const detail = get('detail')
    detail.replaceChildren()
    this.form.hidden = !row || !actionable(row)
    this.onSelection(row)
    if (!row || !review) return
    const headline = el('div', 'detail-head')
    const changes = el('div', 'detail-tags')
    rowLabels(row).forEach(label => changes.append(tag(label, 'type-' + label.toLowerCase().replace(' ', '-'))))
    headline.append(changes)
    if (row.delta?.some(Boolean)) {
      headline.append(el('span', 'delta', 'In ' + signedMs(row.delta[0]) + ' · Out ' + signedMs(row.delta[1])))
    }
    detail.append(headline)
    const columns = el('div', 'cue-pair')
    const parts = row.changes.includes('Text') ? inlineDiff(row.before[0].text, row.after[0].text) : undefined
    const sides = [
      { label: 'Reference', cues: row.before, track: review.reference, revised: false },
      { label: 'Revision', cues: row.after, track: review.revision, revised: true },
    ]
    for (const { label, cues, track, revised } of sides) {
      const card = el('section', 'cue-card ' + (revised ? 'revision' : 'reference'))
      card.append(el('h3', 'eyebrow', label))
      if (row.id === 'track') {
        card.append(el('p', 'cue-locator', track.format.toUpperCase()))
        const data = el('div', 'cue-content metadata', track.metadata.join('\n\n') || 'No track metadata')
        data.dir = 'auto'
        card.append(data)
      } else if (!cues.length) {
        card.append(el('p', 'cue-content absent', revised ? 'Removed in this revision' : 'No reference cue'))
      } else {
        card.append(el('p', 'cue-locator', cueRange(cues)))
        for (const cue of cues) {
          const body = el('div', 'cue-content')
          body.dir = 'auto'
          if (parts) {
            for (const part of parts) {
              if ((revised && part.removed) || (!revised && part.added)) continue
              body.append(part.added ? el('ins', '', part.value) : part.removed ? el('del', '', part.value) : document.createTextNode(part.value))
            }
          } else body.textContent = cue.text || '(empty cue)'
          card.append(body)
          const identifier = track.format === 'vtt' && cue.id ? ' · ID ' + cue.id : ''
          card.append(el('p', 'cue-source', 'Cue ' + cue.number + ' · Line ' + cue.line + identifier))
          if (cue.settings) card.append(el('p', 'cue-source', 'Settings · ' + cue.settings))
        }
      }
      columns.append(card)
    }
    detail.append(columns)
    if (row.match === 'timing' || row.match === 'group') {
      detail.append(el('p', 'evidence', row.match === 'timing'
        ? 'Paired by overlapping time. Check the correspondence before accepting.'
        : 'Grouped by matching words and overlapping time. Check the new cue boundaries.'))
    }
    if (row.issues.length) {
      const warnings = el('div', 'advisories')
      warnings.append(el('h3', 'eyebrow', 'Readability and timing advisories'))
      const list = el('ul')
      row.issues.forEach(({cue, issue}) => list.append(el('li', '', 'Cue ' + cue + ' · ' + issue.message)))
      warnings.append(list)
      detail.append(warnings)
    }
    this.loadDecision()
  }

  private loadDecision(): void {
    const decision = this.selected ? this.review?.decisions[this.selected.id] : undefined
    this.status.value = decision?.status ?? 'pending'
    this.note.value = decision?.note ?? ''
    this.refreshDecision()
    this.message.textContent = decision ? 'Saved' : ''
  }

  private refreshDecision(): void {
    const dirty = this.hasEdits()
    this.saveButton.disabled = !dirty || this.saving
    this.discard.hidden = !dirty || this.saving
    if (!this.saving) this.message.textContent = dirty ? 'Unsaved edits' : ''
  }

  private async submit(): Promise<void> {
    if (!this.review || !this.selected || this.saving || !this.hasEdits()) return
    this.saving = true
    this.refreshDecision()
    this.status.disabled = this.note.disabled = true
    try {
      const updated = decide(this.review, this.selected.id, this.status.value as Status, this.note.value)
      await this.save(updated)
      this.review = updated
      this.renderSummary()
      this.renderQueue()
      this.message.textContent = 'Decision saved.'
    } catch (error) {
      this.message.textContent = error instanceof Error ? error.message : 'Could not save the decision.'
    } finally {
      this.saving = false
      this.status.disabled = this.note.disabled = false
      this.saveButton.disabled = !this.hasEdits()
      this.discard.hidden = !this.hasEdits()
    }
  }
}
