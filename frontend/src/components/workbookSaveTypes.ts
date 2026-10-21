export interface WorkbookSaveState {
  dirty: boolean
  canSave: boolean
  saving: boolean
}

export interface WorkbookSaveHandle {
  saveIfChanged: () => Promise<boolean>
  discardDraft?: () => Promise<boolean>
}
