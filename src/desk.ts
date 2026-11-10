import { inlineDiff } from './compare.ts'
import { get, el } from './dom.ts'
import { isTrackDetails, MAX_EXCERPT, originRound, signals, type ReviewRow } from './followups.ts'
import { actionable, decide, decisionLabel, type Review, type Status } from './review.ts'
import { formatTime, rangeEnd, type Cue } from './track.ts'

const PAGE_SIZE = 24

export function signedMs(value: number): string {
  return (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value) + ' ms'
}

function rowLabels(row: ReviewRow): string[] {
  if (row.followUp) return ['Follow-up']
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
type OnSelection = (row: ReviewRow | undefined) => void

export class Desk {
  review?: Review
  selected?: ReviewRow
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
    const refresh = () => this.showPage(0)
    this.search.addEventListener('input', refresh)
    this.filter.addEventListener('change', refresh)
    get('show-followups').addEventListener('click', () => {
      this.filter.value = 'follow-ups'
      this.search.value = ''
      refresh()
      this.filter.focus()
    })
    get('prev-page').addEventListener('click', () => this.showPage(this.page - 1))
    get('next-page').addEventListener('click', () => this.showPage(this.page + 1))
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
    const rows = review.comparison.rows
    this.selected = rows.find(row => actionable(row) && (review.decisions[row.id]?.status ?? 'pending') === 'pending')
      ?? rows.find(actionable) ?? rows[0]
    get('reference-name').textContent = review.reference.name
    get('revision-name').textContent = review.revision.name
    const context = !review.example ? 'Active review' : review.round === 1 ? 'Sample project · synthetic tracks' : 'Started from sample'
    get('desk-kicker').textContent = 'Round ' + review.round + ' · ' + context
    const offset = get('offset-note')
    offset.hidden = !review.comparison.offset
    offset.textContent = review.comparison.offset
      ? 'Matching cues suggest a shift of ' + signedMs(review.comparison.offset) + ' across part or all of the track. Rows show actual time changes.'
      : ''
    this.renderSummary()
    const index = this.selected ? this.getVisible().indexOf(this.selected) : 0
    this.showPage(Math.floor(Math.max(index, 0) / PAGE_SIZE))
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
    const followUps = rows.filter(row => row.followUp)
    const open = followUps.filter(row => this.review!.decisions[row.id]?.status !== 'accepted').length
    get('followup-summary').hidden = get('filter-followups').hidden = !followUps.length
    get('followup-count').textContent = open + ' of ' + followUps.length
      + (followUps.length === 1 ? ' follow-up open' : ' follow-ups open')
  }

  private getVisible(): ReviewRow[] {
    const review = this.review
    if (!review) return []
    const query = this.search.value.trim().toLowerCase()
    const filter = this.filter.value
    return review.comparison.rows.filter(row => {
      if (filter !== 'all') {
        if (!actionable(row)) return false
        if (filter === 'advisories') {
          if (!row.issues.length) return false
        } else if (filter === 'follow-ups') {
          if (!row.followUp) return false
        } else if (filter !== 'queue' && (review.decisions[row.id]?.status ?? 'pending') !== filter) return false
      }
      if (!query) return true
      const times = [...row.before, ...row.after].flatMap(cue => [formatTime(cue.start), formatTime(cue.end)])
      const request = row.followUp?.request
      if (request?.kind === 'cue') times.push(formatTime(request.time))
      return [...times, cueText(row.before), cueText(row.after), ...rowLabels(row), review.decisions[row.id]?.note ?? '',
        request?.note ?? '', request?.latestNote ?? '', request?.excerpt ?? '']
        .some(value => value.toLowerCase().includes(query))
    })
  }

  private showPage(page: number): void {
    this.page = page
    this.renderQueue()
    get('queue').scrollTop = 0
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
      const time = el('span', 'queue-time', isTrackDetails(row) ? 'TRACK' : formatTime(row.time))
      const preview = el('span', 'queue-preview')
      const request = row.followUp?.request
      const subject = request?.latestNote || request?.note || cueText(row.after.length ? row.after : row.before)
        || request?.excerpt || (isTrackDetails(row) ? 'File format and track metadata' : 'Empty cue')
      const text = el('span', 'queue-text', subject)
      text.dir = 'auto'
      const tags = el('span', 'queue-tags')
      rowLabels(row).forEach(label => tags.append(tag(label, 'type-' + label.toLowerCase().replace(' ', '-'))))
      if (row.issues.length && row.changes.length) tags.append(tag(row.issues.length + ' advisory' + (row.issues.length === 1 ? '' : ' items'), 'type-advisory'))
      const status = this.review?.decisions[row.id]?.status
      if (row.followUp) tags.append(tag(signals[row.followUp.signal], row.followUp.signal === 'check' || row.followUp.signal === 'missing' ? 'type-advisory' : ''))
      if (status && status !== 'pending') tags.append(tag(decisionLabel(row, status), status))
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

  private select(row: ReviewRow, clicked = false): void {
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
    if (row.followUp) detail.append(this.followUpEvidence(row.followUp))
    const columns = el('div', 'cue-pair')
    const parts = row.before.length === 1 && row.after.length === 1 && row.before[0].text !== row.after[0].text
      ? inlineDiff(row.before[0].text, row.after[0].text) : undefined
    const sides = [
      { label: 'Reference', cues: row.before, track: review.reference, revised: false },
      { label: 'Revision', cues: row.after, track: review.revision, revised: true },
    ]
    for (const { label, cues, track, revised } of sides) {
      const card = el('section', 'cue-card ' + (revised ? 'revision' : 'reference'))
      card.append(el('h3', 'eyebrow', label))
      if (isTrackDetails(row)) {
        card.append(el('p', 'cue-locator', track.format.toUpperCase()))
        const data = el('div', 'cue-content metadata', track.metadata.join('\n\n') || 'No track metadata')
        data.dir = 'auto'
        card.append(data)
      } else if (!cues.length) {
        const missing = revised
          ? row.followUp ? 'No cue linked in this revision' : 'Removed in this revision'
          : 'No reference cue'
        card.append(el('p', 'cue-content absent', missing))
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
          const segment = cues.length > 1 ? ' · ' + cueRange([cue]) : ''
          card.append(el('p', 'cue-source', 'Cue ' + cue.number + ' · Line ' + cue.line + identifier + segment))
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

  private followUpEvidence({ request, signal }: NonNullable<ReviewRow['followUp']>): HTMLElement {
    const panel = el('section', 'request-evidence')
    const location = request.kind === 'cue' ? ' · ' + formatTime(request.time) : ''
    panel.append(
      el('p', 'eyebrow', 'Request from round ' + originRound(request)),
      el('p', 'request-source', request.sourceName + location),
      el('h3', 'request-signal', signals[signal]),
    )
    const note = el('p', 'request-note', request.note || 'This item was marked Needs changes.')
    note.dir = 'auto'
    panel.append(note)
    if (request.latestNote && request.latestNote !== request.note) {
      const latest = el('p', 'request-note', 'Last follow-up · ' + request.latestNote)
      latest.dir = 'auto'
      panel.append(latest)
    }
    if (request.excerpt) {
      const excerpt = el('blockquote', 'request-excerpt', request.excerpt + (request.exact || request.excerpt.length < MAX_EXCERPT ? '' : '…'))
      excerpt.dir = 'auto'
      panel.append(excerpt)
    }
    panel.append(el('p', 'evidence', 'Check the evidence before marking this request resolved.'))
    return panel
  }

  private loadDecision(): void {
    const decision = this.selected ? this.review?.decisions[this.selected.id] : undefined
    if (this.selected) {
      for (const option of this.status.options) option.textContent = decisionLabel(this.selected, option.value as Status)
      this.note.placeholder = this.selected.followUp ? 'What did you verify or what still needs work?' : 'What should the editor check?'
    }
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
      this.loadDecision()
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
