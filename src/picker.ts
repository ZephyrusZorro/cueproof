export function captionPicker(input: HTMLInputElement): () => void {
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
    if (!input.disabled) label.classList.add('dragging')
  })
  input.addEventListener('dragleave', () => label.classList.remove('dragging'))
  input.addEventListener('drop', event => {
    event.preventDefault()
    label.classList.remove('dragging')
    if (input.disabled || !event.dataTransfer?.files.length) return
    const transfer = new DataTransfer()
    transfer.items.add(event.dataTransfer.files[0])
    input.files = transfer.files
    update()
  })
  return update
}
