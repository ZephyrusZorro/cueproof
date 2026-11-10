type Snapshot = { token: string; content: string | null }

export class ConflictError extends Error {
  constructor() {
    super('Another tab changed this review. Export your current work if needed, then reload to see the latest review.')
  }
}

export class ReviewStore {
  private db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
    db.onversionchange = () => db.close()
  }

  static open(factory: IDBFactory = indexedDB): Promise<ReviewStore> {
    return new Promise((resolve, reject) => {
      const request = factory.open('cueproof', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('review')
      request.onsuccess = () => resolve(new ReviewStore(request.result))
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Close other Cueproof tabs to enable local saving.'))
    })
  }

  load(): Promise<Snapshot | undefined> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('review', 'readonly')
      const request = transaction.objectStore('review').get('active')
      transaction.oncomplete = () => resolve(request.result as Snapshot | undefined)
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not read the saved review.'))
    })
  }

  write(content: string | null, expected: string | null): Promise<Snapshot> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction('review', 'readwrite')
      const store = transaction.objectStore('review')
      const read = store.get('active')
      const next = { token: crypto.randomUUID(), content }
      let conflict = false
      read.onsuccess = () => {
        const current = read.result as Snapshot | undefined
        if ((current?.token ?? null) !== expected) {
          conflict = true
          transaction.abort()
        } else {
          store.put(next, 'active')
        }
      }
      transaction.oncomplete = () => resolve(next)
      transaction.onabort = () => reject(conflict ? new ConflictError() : transaction.error ?? new Error('Could not save this review.'))
    })
  }

  close(): void {
    this.db.close()
  }
}
