import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import type { DepartmentCoursesContext } from '../utils/departmentCoursesWorkbookState'
import { DepartmentCoursesWorkbook } from './DepartmentCoursesWorkbook'
import { DepartmentScheduleWorkbook } from './DepartmentScheduleWorkbook'
import { Button } from './Button'
import type { WorkbookSaveHandle, WorkbookSaveState } from './workbookSaveTypes'

interface WorkbookodalProps {
  onClose: () => void
  departmentName: string
  term: DepartmentWorkbookTerm
  department: DepartmentCoursesContext
  scheduleReadOnly: boolean
  coursesReadOnly: boolean
}

type WorkbookTab = 'schedule' | 'courses'

export function Workbookodal({ onClose, departmentName, term, department, scheduleReadOnly, coursesReadOnly }: WorkbookodalProps) {
  const headerTitle = `School Year ${term.academicYear.replace(/\s*[-–—]\s*/, ' - ')} · ${term.semester === 'sem1' ? '1st' : '2nd'} Semester`
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scheduleRef = useRef<WorkbookSaveHandle>(null)
  const coursesRef = useRef<WorkbookSaveHandle>(null)
  const [activeTab, setActiveTab] = useState<WorkbookTab>('schedule')
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null)
  const [footerHost, setFooterHost] = useState<HTMLDivElement | null>(null)
  const [scheduleMenuHost, setScheduleMenuHost] = useState<HTMLSpanElement | null>(null)
  const [coursesMenuHost, setCoursesMenuHost] = useState<HTMLSpanElement | null>(null)
  const [scheduleSaveState, setScheduleSaveState] = useState<WorkbookSaveState>({ dirty: false, canSave: false, saving: false })
  const [coursesSaveState, setCoursesSaveState] = useState<WorkbookSaveState>({ dirty: false, canSave: false, saving: false })
  const [savingAll, setSavingAll] = useState(false)
  const [saveCompleted, setSaveCompleted] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const updateScheduleSaveState = useCallback((next: WorkbookSaveState) => {
    setScheduleSaveState(previous => previous.dirty === next.dirty && previous.canSave === next.canSave && previous.saving === next.saving ? previous : next)
  }, [])
  const updateCoursesSaveState = useCallback((next: WorkbookSaveState) => {
    setCoursesSaveState(previous => previous.dirty === next.dirty && previous.canSave === next.canSave && previous.saving === next.saving ? previous : next)
  }, [])

  const hasChanges = scheduleSaveState.dirty || coursesSaveState.dirty
  const canSaveAll = hasChanges && !savingAll && (!scheduleSaveState.dirty || scheduleSaveState.canSave)
    && (!coursesSaveState.dirty || coursesSaveState.canSave)

  const saveChangedWorkbooks = async () => {
    if (!canSaveAll) return
    setSavingAll(true)
    setSaveError('')
    try {
      if (coursesSaveState.dirty && !await coursesRef.current?.saveIfChanged()) {
        setSaveError('Courses could not be saved. Review the Courses tab and try again.')
        return
      }
      if (scheduleSaveState.dirty && !await scheduleRef.current?.saveIfChanged()) {
        setSaveError('Schedule could not be saved. Review the Schedule tab and try again.')
        return
      }
      setSaveCompleted(true)
    } catch {
      setSaveError('The workbook could not be saved. Please try again.')
    } finally {
      setSavingAll(false)
    }
  }

  const requestClose = () => {
    if (savingAll || scheduleSaveState.saving || coursesSaveState.saving) return
    if (hasChanges) setConfirmClose(true)
    else onClose()
  }

  const discardAndClose = async () => {
    if (discarding) return
    setDiscarding(true)
    try {
      if (await scheduleRef.current?.discardDraft?.() === false) {
        setSaveError('The local schedule draft could not be discarded. Please try again.')
        setConfirmClose(false)
        return
      }
      onClose()
    } finally {
      setDiscarding(false)
    }
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const tabs = (
    <nav role="tablist" aria-label="Workbook sections" className="flex h-10 shrink-0 items-stretch overflow-visible border border-[#c4c7c5] bg-[#f8fafd]">
      <div className={`flex min-w-32 border-r border-[#d3d8de] sm:min-w-40 ${activeTab === 'schedule' ? 'bg-[#dce2e8] text-[#0b57d0]' : 'text-[#3c4043] hover:bg-[#e8ebf0]'}`}>
        <button
          id="workbook-schedule-tab"
          type="button"
          role="tab"
          aria-controls="workbook-schedule-panel"
          aria-selected={activeTab === 'schedule'}
          onClick={() => setActiveTab('schedule')}
          className="min-w-0 flex-1 px-3 text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-[#0b57d0] sm:px-5"
        >
          Schedule
        </button>
        <span ref={setScheduleMenuHost} className="relative flex shrink-0" />
      </div>
      <div className={`flex min-w-32 sm:min-w-40 ${activeTab === 'courses' ? 'bg-[#dce2e8] text-[#0b57d0]' : 'text-[#3c4043] hover:bg-[#e8ebf0]'}`}>
        <button
          id="workbook-courses-tab"
          type="button"
          role="tab"
          aria-controls="workbook-courses-panel"
          aria-selected={activeTab === 'courses'}
          onClick={() => setActiveTab('courses')}
          className="min-w-0 flex-1 px-3 text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-[#0b57d0] sm:px-5"
        >
          Courses
        </button>
        <span ref={setCoursesMenuHost} className="relative flex shrink-0" />
      </div>
    </nav>
  )

  return (
    <dialog
      ref={dialogRef}
      aria-label="Manage Workbook"
      onCancel={event => event.preventDefault()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden rounded-none border-0 bg-white p-0 text-slate-900 backdrop:bg-black/50"
    >
      <div inert={confirmClose} className="flex h-full min-h-0 flex-col">
        <div ref={setHeaderHost} className="shrink-0" />
        <div className="relative min-h-0 flex-1">
          <div id="workbook-schedule-panel" role="tabpanel" aria-labelledby="workbook-schedule-tab" aria-hidden={activeTab !== 'schedule'} inert={activeTab !== 'schedule'} className={`absolute inset-0 min-h-0 ${activeTab === 'schedule' ? '' : 'invisible'}`}>
            <DepartmentScheduleWorkbook
              ref={scheduleRef}
              embedded
              onSaveStateChange={updateScheduleSaveState}
              active={activeTab === 'schedule'}
              headerHost={headerHost}
              footerHost={footerHost}
              menuHost={scheduleMenuHost}
              onActivate={() => setActiveTab('schedule')}
              departmentName={departmentName}
              headerTitle={headerTitle}
              headerSubtitle={departmentName}
              term={term}
              readOnly={scheduleReadOnly}
              onClose={onClose}
            />
          </div>
          <div id="workbook-courses-panel" role="tabpanel" aria-labelledby="workbook-courses-tab" aria-hidden={activeTab !== 'courses'} inert={activeTab !== 'courses'} className={`absolute inset-0 min-h-0 ${activeTab === 'courses' ? '' : 'invisible'}`}>
            <DepartmentCoursesWorkbook
              ref={coursesRef}
              embedded
              onSaveStateChange={updateCoursesSaveState}
              active={activeTab === 'courses'}
              headerHost={headerHost}
              footerHost={footerHost}
              menuHost={coursesMenuHost}
              onActivate={() => setActiveTab('courses')}
              department={department}
              headerTitle={headerTitle}
              headerSubtitle={departmentName}
              readOnly={coursesReadOnly}
              onClose={onClose}
            />
          </div>
        </div>
        <footer className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
          {tabs}
          <p role="status" aria-live="polite" className={`text-sm ${hasChanges && !savingAll ? 'text-amber-700' : 'text-slate-500'}`}>
            {savingAll ? 'Saving workbook…' : hasChanges ? 'Unsaved changes' : saveCompleted ? 'Workbook saved.' : 'No changes'}
          </p>
          <div ref={setFooterHost} className="min-w-0 flex-1" />
          {saveError && <p role="alert" className="text-sm text-rose-700">{saveError}</p>}
          <Button type="button" variant="outline" disabled={savingAll || scheduleSaveState.saving || coursesSaveState.saving} onClick={requestClose} className="h-10! rounded-lg!">Close</Button>
          <Button type="button" variant="brand" disabled={!canSaveAll} onClick={() => { void saveChangedWorkbooks() }} className="h-10! rounded-lg!">{savingAll || scheduleSaveState.saving || coursesSaveState.saving ? 'Saving…' : 'Save'}</Button>
        </footer>
      </div>
      {confirmClose && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setConfirmClose(false)
        }
      }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="workbook-close-title" aria-describedby="workbook-close-description" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
          <h3 id="workbook-close-title" className="text-lg font-semibold">Discard unsaved changes?</h3>
          <p id="workbook-close-description" className="mt-2 text-sm text-slate-600">Changes in either workbook tab will be lost if you close it now.</p>
          <div className="mt-6 flex gap-3">
            <Button type="button" variant="outline" className="min-w-0 flex-1" autoFocus disabled={discarding} onClick={() => setConfirmClose(false)}>Keep editing</Button>
            <Button type="button" variant="brand" className="min-w-0 flex-1" disabled={discarding} onClick={() => { void discardAndClose() }}>{discarding ? 'Discarding…' : 'Discard'}</Button>
          </div>
        </div>
      </div>}
    </dialog>
  )
}
