import './style.css'
import { Desk } from './desk.ts'
import { get } from './dom.ts'
import { exampleReview } from './example.ts'
import { Handoff } from './handoff.ts'
import { NextRound } from './next-round.ts'
import { captionPicker } from './picker.ts'
import { MediaPreview } from './player.ts'
import { createReview, decodeReview, encodeReview, type Review } from './review.ts'
import { ReviewStore } from './storage.ts'
import { readTrack } from './track.ts'

let store: ReviewStore | undefined
let token: string | null = null
let previousRound: string | null = null
let writing = false
let replacing = false
const notice = get('notice')
const dialog = get<HTMLDialogElement>('import-dialog')
const newReview = get<HTMLButtonElement>('new-review')
const example = get<HTMLButtonElement>('example')
const closeImport = get<HTMLButtonElement>('close-import')
const clearButton = get<HTMLButtonElement>('clear-review')

function lockImport(active: boolean): void {
  replacing = active
  closeImport.disabled = clearButton.disabled = active
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something interrupted this action. Please try again.'
}

function announce(text: string): void {
  notice.textContent = text
  notice.hidden = !text
}

async function persist(review: Review | null, previous?: string | null): Promise<void> {
  if (writing) throw new Error('A save is already in progress. Try again in a moment.')
  writing = true
  try {
    if (store) {
      const saved = await store.write(review ? encodeReview(review) : null, token, previous)
      token = saved.token
      previousRound = saved.previous ?? null
    } else if (!review || previous !== undefined) {
      previousRound = previous ?? null
    }
  } finally {
    writing = false
  }
}

const media = new MediaPreview(get('player-slot'))
const desk = new Desk(persist, row => media.select(row))
new Handoff(() => desk.review, () => previousRound, async review => {
  if (desk.hasEdits()) throw new Error('Close this dialog and save or discard your cue edits before opening another review.')
  await persist(review, null)
  openReview(review)
})
new NextRound(() => desk.review, () => !!previousRound, () => {
  if (!desk.hasEdits()) return true
  announce('Save or discard your cue edits before starting the next round.')
  get('decision-status').focus()
  return false
}, async (review, next) => {
  await persist(next, encodeReview(review))
  openReview(next, false, true)
})

function openReview(review: Review, focus = true, keepMedia = false): void {
  get('landing').hidden = true
  get('desk').hidden = false
  newReview.hidden = false
  media.open(review, keepMedia)
  desk.show(review)
  if (store) announce('')
  if (dialog.open) dialog.close()
  if (focus) get('main').focus()
}

function mountImport(target: string): void {
  const template = get<HTMLTemplateElement>('import-template')
  const form = template.content.querySelector('form')!.cloneNode(true) as HTMLFormElement
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type=file]'))
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!
  const errorLine = form.querySelector<HTMLElement>('.form-error')!

  inputs.forEach(captionPicker)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const [reference, revision] = inputs.map(input => input.files?.[0])
    if (!reference || !revision || submit.disabled || replacing) return
    lockImport(true)
    errorLine.hidden = true
    submit.disabled = true
    submit.textContent = 'Comparing…'
    example.disabled = true
    inputs.forEach(input => input.disabled = true)
    try {
      const [before, after] = await Promise.all([readTrack(reference), readTrack(revision)])
      const review = createReview(before, after)
      await persist(review, null)
      openReview(review)
    } catch (error) {
      errorLine.textContent = message(error)
      errorLine.hidden = false
    } finally {
      submit.disabled = example.disabled = false
      lockImport(false)
      submit.textContent = 'Compare tracks →'
      inputs.forEach(input => input.disabled = false)
    }
  })
  get(target).replaceChildren(form)
}

newReview.addEventListener('click', () => {
  if (desk.hasEdits()) {
    announce('Save or discard your cue edits before starting another review.')
    get('decision-status').focus()
    return
  }
  mountImport('dialog-import')
  get('replace-note').textContent = previousRound
    ? 'Opening another pair replaces the active review and previous-round backup in this browser.'
    : 'Opening another pair replaces the active review in this browser.'
  dialog.querySelector('details')!.open = false
  get('clear-error').hidden = true
  dialog.showModal()
})
closeImport.addEventListener('click', () => { if (!replacing) dialog.close() })
dialog.addEventListener('cancel', event => { if (replacing) event.preventDefault() })
clearButton.addEventListener('click', async () => {
  if (replacing) return
  lockImport(true)
  const compare = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!
  compare.disabled = true
  try {
    await persist(null)
    desk.reset()
    media.reset()
    dialog.close()
    get('desk').hidden = newReview.hidden = true
    get('landing').hidden = false
    mountImport('landing-import')
    if (store) announce('')
    get('main').focus()
  } catch (error) {
    const errorLine = get('clear-error')
    errorLine.textContent = message(error)
    errorLine.hidden = false
  } finally {
    compare.disabled = false
    lockImport(false)
  }
})
example.addEventListener('click', async () => {
  example.disabled = true
  try {
    const review = exampleReview()
    await persist(review, null)
    openReview(review)
  } catch (error) {
    announce(message(error))
  } finally {
    example.disabled = false
  }
})

window.addEventListener('beforeunload', event => {
  if (desk.hasEdits() || writing) event.preventDefault()
})

async function start(): Promise<void> {
  try {
    store = await ReviewStore.open()
    const snapshot = await store.load()
    token = snapshot?.token ?? null
    previousRound = typeof snapshot?.previous === 'string' ? snapshot.previous : null
    if (snapshot?.content) {
      openReview(decodeReview(snapshot.content), false)
      return
    }
  } catch (error) {
    if (!store) announce('Browser storage is unavailable. This review lasts for the current tab. Use a review backup to keep your work.')
    else announce('Could not open the saved review. ' + message(error))
  }
  get('landing').hidden = false
}
mountImport('landing-import')
void start()
