import type { DepartmentScheduleImportSheet } from './departmentScheduleImport'

export interface CellEditLocation {
  sheet: number
  row: number
  column: number
}

export interface CellTextEdit {
  cell: CellEditLocation
  before: string
  after: string
  beforeCaret: number
  afterCaret: number
  related?: CellTextEdit[]
  structure?: { before: DepartmentScheduleImportSheet; after: DepartmentScheduleImportSheet }
}

export interface CellHistoryCheckpoint {
  past: CellTextEdit[]
  future: CellTextEdit[]
}

export function sameEditCell(first: CellEditLocation, second: CellEditLocation): boolean {
  return first.sheet === second.sheet && first.row === second.row && first.column === second.column
}

export const CELL_UNDO_COOLDOWN_MS = 750

/** Groups typing until an idle pause or an explicit edit/history action. */
export class CellTextHistory {
  private past: CellTextEdit[] = []
  private future: CellTextEdit[] = []
  private pending: { cells: { cell: CellEditLocation; before: string }[]; after: string; lastInputAt: number } | null = null

  reset() { this.past = []; this.future = []; this.pending = null }

  checkpoint(): CellHistoryCheckpoint {
    this.flushPending()
    return { past: [...this.past], future: [...this.future] }
  }

  restore(checkpoint: CellHistoryCheckpoint) {
    this.pending = null
    this.past = [...checkpoint.past]
    this.future = [...checkpoint.future]
  }

  record(cell: CellEditLocation, before: string, after: string) {
    this.recordMany([{ cell, before }], after)
  }

  recordStructure(cell: CellEditLocation, before: DepartmentScheduleImportSheet, after: DepartmentScheduleImportSheet) {
    this.flushPending()
    if (before === after) return
    this.future = []
    this.past.push({ cell, before: '', after: '', beforeCaret: 0, afterCaret: 0, structure: { before, after } })
  }

  recordMany(cells: readonly { cell: CellEditLocation; before: string }[], after: string) {
    this.recordChanges(cells.map(item => ({ ...item, after })))
  }

  recordChanges(changes: readonly { cell: CellEditLocation; before: string; after: string }[]) {
    this.flushPending()
    const primary = changes[0]
    if (!primary || changes.every(item => item.before === item.after)) return
    this.future = []
    this.past.push({
      cell: primary.cell, before: primary.before, after: primary.after,
      beforeCaret: primary.before.length, afterCaret: primary.after.length,
      related: changes.slice(1).map(item => ({
        cell: item.cell,
        before: item.before,
        after: item.after,
        beforeCaret: item.before.length,
        afterCaret: item.after.length,
      })).filter(item => item.before !== item.after)
    })
  }

  recordTyping(cells: readonly { cell: CellEditLocation; before: string }[], after: string, now = Date.now()) {
    if (!cells.length || cells.every(item => item.before === after)) return
    const pending = this.pending
    const sameRange = pending && pending.cells.length === cells.length
      && pending.cells.every((item, index) => sameEditCell(item.cell, cells[index].cell))
    if (pending && (!sameRange || now - pending.lastInputAt >= CELL_UNDO_COOLDOWN_MS)) this.flushPending()
    if (this.pending) {
      this.pending.after = after
      this.pending.lastInputAt = now
    } else {
      this.pending = { cells: cells.map(item => ({ ...item, cell: { ...item.cell } })), after, lastInputAt: now }
    }
  }

  flushPending() {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    this.recordMany(pending.cells, pending.after)
  }

  undo(minimumPast = 0, cell?: CellEditLocation): CellTextEdit | null {
    this.flushPending()
    const edit = this.past.at(-1)
    if (!edit || this.past.length <= minimumPast || cell && !sameEditCell(cell, edit.cell)) return null
    this.past.pop()
    this.future.push(edit)
    return edit
  }

  redo(cell?: CellEditLocation): CellTextEdit | null {
    this.flushPending()
    const edit = this.future.at(-1)
    if (!edit || cell && !sameEditCell(cell, edit.cell)) return null
    this.future.pop()
    this.past.push(edit)
    return edit
  }
}
