export class EditHistory<T> {
  private past: T[] = []
  private future: T[] = []
  private present: T | null = null
  private readonly sameContent: (previous: T, next: T) => boolean
  private readonly limit: number

  constructor(sameContent: (previous: T, next: T) => boolean, limit = 100) {
    this.sameContent = sameContent
    this.limit = limit
  }

  reset() {
    this.past = []
    this.future = []
    this.present = null
  }

  transform(transform: (snapshot: T) => T) {
    this.past = this.past.map(transform)
    this.future = this.future.map(transform)
    if (this.present !== null) this.present = transform(this.present)
  }

  record(next: T) {
    if (this.present !== null && !this.sameContent(this.present, next)) {
      this.past.push(this.present)
      if (this.past.length > this.limit) this.past.shift()
      this.future = []
    }
    this.present = next
  }

  undo(): T | null {
    const previous = this.past.pop()
    if (previous === undefined || this.present === null) return null
    this.future.push(this.present)
    this.present = previous
    return previous
  }

  redo(): T | null {
    const next = this.future.pop()
    if (next === undefined || this.present === null) return null
    this.past.push(this.present)
    this.present = next
    return next
  }
}
