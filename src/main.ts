import './style.css'
import { Desk } from './desk.ts'
import { get } from './dom.ts'
import { exampleReview } from './example.ts'
import { createReview, decodeReview, encodeReview, type Review } from './review.ts'
import { ReviewStore } from './storage.ts'
import { readTrack } from './track.ts'

let store: ReviewStore | undefined
let token: string | null = null
let writing = false
const notice = get('notice')
const dialog = get<HTMLDialogElement>('import-dialog')
const newReview = get<HTMLButtonElement>('new-review')
const example = get<HTMLButtonElement>('example')

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something interrupted this action. Please try again.'
}

function announce(text: string): void {
  notice.textContent = text
  notice.hidden = !text
}

async function persist(review: Review): Promise<void> {
  if (writing) throw new Error('A save is already in progress. Try again in a moment.')
  writing = true
  try {
    if (store) token = (await store.write(encodeReview(review), token)).token
  } finally {
    writing = false
  }
}

const desk = new Desk(persist)

function openReview(review: Review, focus = true): void {
  get('landing').hidden = true
  get('desk').hidden = false
  newReview.hidden = false
  desk.show(review)
  if (dialog.open) dialog.close()
  if (focus) get('main').focus()
}

function mountImport(target: string): void {
  const template = get<HTMLTemplateElement>('import-template')
  const form = template.content.querySelector('form')!.cloneNode(true) as HTMLFormElement
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type=file]'))
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!
  const errorLine = form.querySelector<HTMLElement>('.form-error')!

  for (const input of inputs) {
    const label = input.closest('label')!
    const name = label.querySelector('.file-name')!
    const update = () => {
      const file = input.files?.[0]
      name.textContent = file?.name ?? 'Choose or drop a file'
      label.classList.toggle('has-file', !!file)
    }
    input.addEventListener('change', update)
    input.addEventListener('dragover', event => {
      event.preventDefault()
      if (!submit.disabled) label.classList.add('dragging')
    })
    input.addEventListener('dragleave', () => label.classList.remove('dragging'))
    input.addEventListener('drop', event => {
      event.preventDefault()
      label.classList.remove('dragging')
      if (submit.disabled || !event.dataTransfer?.files.length) return
      const transfer = new DataTransfer()
      transfer.items.add(event.dataTransfer.files[0])
      input.files = transfer.files
      update()
    })
  }
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const [reference, revision] = inputs.map(input => input.files?.[0])
    if (!reference || !revision || submit.disabled) return
    errorLine.hidden = true
    submit.disabled = true
    submit.textContent = 'Comparing…'
    example.disabled = true
    inputs.forEach(input => input.disabled = true)
    try {
      const [before, after] = await Promise.all([readTrack(reference), readTrack(revision)])
      const review = createReview(before, after)
      await persist(review)
      openReview(review)
    } catch (error) {
      errorLine.textContent = message(error)
      errorLine.hidden = false
    } finally {
      submit.disabled = example.disabled = false
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
  dialog.showModal()
})
get('close-import').addEventListener('click', () => dialog.close())
example.addEventListener('click', async () => {
  example.disabled = true
  try {
    const review = exampleReview()
    await persist(review)
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
