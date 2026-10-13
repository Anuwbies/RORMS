import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { loadFirestoreDepartmentWorkbook, saveFirestoreDepartmentWorkbook, MissingFirestoreDepartmentWorkbookError, type SavedFirestoreDepartmentWorkbook } from '../services/firestoreDepartmentWorkbooks'
import { semesterKey } from '../utils/departmentWorkbookPaths'
import { DepartmentScheduleTemplatesModal } from './DepartmentScheduleTemplatesModal'
import type { ExcelSheetImport } from '../utils/excelSheetImport'
import { useDepartmentFacultySuggestions } from '../hooks/useDepartmentFacultySuggestions'
import { useLiveDepartmentWorkbook } from '../hooks/useLiveDepartmentWorkbook'

const ExcelPreviewModal = lazy(() => import('./ExcelPreviewModal').then(module => ({ default: module.ExcelPreviewModal })))

interface DepartmentExcelScheduleModalProps {
  departmentCode: string
  departmentId: string
  academicYear: string
  academicYearId: string
  membershipId: string
  semester: { name: string; phase: string }
  readOnly: boolean
  showPlotTool?: boolean
  allowSheetCreationAndRemoval?: boolean
  allowImportExport?: boolean
  emptyWorkbookBehavior?: 'sheet' | 'message'
  onClose: () => void
}

export function DepartmentExcelScheduleModal({ departmentCode, departmentId, academicYear, academicYearId, membershipId, semester, readOnly, showPlotTool = false, allowSheetCreationAndRemoval = true, allowImportExport = true, emptyWorkbookBehavior = 'message', onClose }: DepartmentExcelScheduleModalProps) {
  const facultySuggestions = useDepartmentFacultySuggestions(departmentCode)
  const mountedRef = useRef(true)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Checking the latest workbook in Firestore…')
  const [savingMessage, setSavingMessage] = useState('')
  const [savedMessage, setSavedMessage] = useState('Saved')
  const [liveSaveBusy, setLiveSaveBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [initialEditorState, setInitialEditorState] = useState<string>()
  const savedRef = useRef<SavedFirestoreDepartmentWorkbook | null>(null)
  const replaceMissingSheetsRef = useRef(false)
  const [templateImportOpen, setTemplateImportOpen] = useState(false)
  const [templateEditorState, setTemplateEditorState] = useState<string>()
  const [sheetImport, setSheetImport] = useState<ExcelSheetImport>()
  const term = useMemo(() => ({ departmentId, departmentCode, academicYearId, academicYear, semester: semesterKey(semester.name), membershipId }), [departmentId, departmentCode, academicYearId, academicYear, semester.name, membershipId])
  const termLabel = `${departmentCode} · ${academicYear} · ${semester.name}`
  const live = useLiveDepartmentWorkbook(term, isLoading || loadFailed || isImporting || templateImportOpen || liveSaveBusy,
    () => loadFirestoreDepartmentWorkbook(term), () => savedRef.current?.revision ?? 0, saved => {
      savedRef.current = saved
      replaceMissingSheetsRef.current = false
      setSavedMessage('Saved changes received')
      setError('')
    })

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadingMessage('Checking the latest workbook in Firestore…')
    setLoadFailed(false)
    setError('')
    setInitialEditorState(undefined)
    setSavedMessage('Saved')
    savedRef.current = null
    replaceMissingSheetsRef.current = false
    setTemplateImportOpen(false)
    setTemplateEditorState(undefined)
    setSheetImport(undefined)
    void loadFirestoreDepartmentWorkbook(term, message => {
      if (!cancelled) setLoadingMessage(message)
    }).then(saved => {
      if (cancelled) return
      if (saved) {
        savedRef.current = saved
        setInitialEditorState(saved.editorState)
      }
    }).catch(caught => {
      if (cancelled) return
      if (caught instanceof MissingFirestoreDepartmentWorkbookError) {
        savedRef.current = caught.previous
        replaceMissingSheetsRef.current = true
        setError(readOnly ? 'Some saved sheets or chunks were deleted. Ask an authorized department editor to import a replacement workbook.' : caught.message)
        return
      }
      setLoadFailed(true)
      setError(caught instanceof Error ? caught.message : 'The saved workbook could not be loaded. Try again.')
    }).finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [term, loadAttempt])

  const save = async (editorState: string, importedSource?: File | null) => {
    if (readOnly || isLoading || loadFailed || isImporting || templateImportOpen) throw new Error('This semester is not available for saving yet.')
    if (replaceMissingSheetsRef.current && !importedSource) throw new Error('Import an .xlsx workbook before replacing the deleted sheets.')
    const fileName = importedSource?.name || savedRef.current?.fileName || 'Schedule.xlsx'
    setSavingMessage('Preparing save…')
    setLiveSaveBusy(true)
    try {
      const scheduleRows = await (await import('../services/departmentScheduleRows')).prepareDepartmentScheduleRows(editorState, departmentCode, term.semester)
      savedRef.current = await saveFirestoreDepartmentWorkbook(term, fileName, editorState, savedRef.current, {
        scheduleRows,
        imported: Boolean(importedSource),
        onProgress: progress => {
          if (!mountedRef.current) return
          setSavingMessage(progress.stage === 'preparing' ? 'Preparing save…' : progress.stage === 'committing' ? 'Finishing save…' : progress.stage === 'cleaning' ? 'Saved · removing unused sheets…' : `Saving… ${Math.floor(progress.completed / progress.total * 95)}%`)
        },
        onMetrics: metrics => {
          if (mountedRef.current) setSavedMessage(`Saved · ${scheduleRows.length} classes · ${(metrics.totalMs / 1000).toFixed(2)}s`)
          console.info('Firestore workbook save', metrics)
        },
      })
      replaceMissingSheetsRef.current = false
      setError(savedRef.current.cleanupWarning ?? '')
    } finally {
      if (mountedRef.current) setSavingMessage('')
      if (mountedRef.current) setLiveSaveBusy(false)
    }
  }

  return <>
    <Suspense fallback={<div role="dialog" aria-modal="true" aria-labelledby="opening-schedule-title" className="fixed inset-0 z-[200] flex h-full w-full min-w-0 flex-col overflow-hidden border border-gray-200 bg-white text-slate-900 shadow-2xl" onKeyDown={event => { if (event.key === 'Escape') onClose() }}>
      <div className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white">
        <div className="min-w-0">
          <h2 id="opening-schedule-title" className="text-xl font-bold tracking-tight text-white">Manage Schedule</h2>
          <p className="mt-0.5 truncate text-xs font-medium text-white/80">{termLabel}</p>
        </div>
        <button type="button" autoFocus onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-gray-50">Close</button>
      </div>
      <div role="status" aria-live="polite" className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <div className="space-y-1 text-center">
          <p className="text-[18px] leading-[26px] font-semibold text-slate-800">Opening workbook…</p>
          <p className="text-[14px] leading-[20px] text-slate-500">{isLoading ? loadingMessage : 'Loading the workbook editor…'}</p>
        </div>
      </div>
    </div>}>
      <ExcelPreviewModal
        persistenceMode="firestore"
        initialEditorState={initialEditorState}
        liveWorkbook={live.update}
        liveError={live.error}
        onRetryLive={live.error ? live.retry : undefined}
        emptyWorkbookBehavior={emptyWorkbookBehavior}
        loading={isLoading}
        loadingMessage={loadingMessage}
        loadError={error}
        onRetryLoad={loadFailed ? () => setLoadAttempt(attempt => attempt + 1) : undefined}
        onImport={!readOnly && allowImportExport && allowSheetCreationAndRemoval ? editorState => { setError(''); setTemplateEditorState(editorState); setTemplateImportOpen(true) } : undefined}
        importLabel="Import schedule templates"
        importing={isImporting || templateImportOpen}
        sheetImport={sheetImport}
        onImportComplete={importError => { setIsImporting(false); setSheetImport(undefined); if (importError) setError(importError) }}
        onSave={readOnly ? undefined : save}
        savingMessage={savingMessage}
        savedMessage={savedMessage}
        title="Manage Schedule"
        subtitle={termLabel}
        readOnly={readOnly}
        allowHeaderMoves={!readOnly}
        showFilters={false}
        showPlotTool={showPlotTool}
        allowSheetCreationAndRemoval={allowSheetCreationAndRemoval}
        allowImportExport={allowImportExport}
        facultySuggestions={facultySuggestions}
        facultyDepartmentCode={departmentCode}
        onClose={onClose}
      />
    </Suspense>
    {templateImportOpen && !readOnly && allowImportExport && allowSheetCreationAndRemoval && <DepartmentScheduleTemplatesModal
      departmentCode={departmentCode}
      semester={term.semester}
      existingEditorState={templateEditorState}
      onClose={() => { setTemplateImportOpen(false); setTemplateEditorState(undefined) }}
      onImport={incoming => {
        setIsImporting(true)
        setSheetImport(incoming)
        setTemplateImportOpen(false)
        setTemplateEditorState(undefined)
      }}
    />}
  </>
}
