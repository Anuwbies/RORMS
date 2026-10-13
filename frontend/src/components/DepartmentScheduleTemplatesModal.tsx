import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { Button } from './Button'
import { appendImportedSheets, type ExcelSheetImport } from '../utils/excelSheetImport'
import { parseExcelPreviewStyles, readSheetPreviewFormatting } from '../utils/excelPreviewStyles'
import { deserializeWorkbookState } from '../utils/excelWorkbookState'
import { DEPARTMENT_TEMPLATE_KEY, emptyTemplateSnapshot, findDepartmentTemplateSheets, readDepartmentTemplatePreview, templateClock, templateSubjectLabel, type TemplateRole } from '../utils/departmentScheduleTemplates'

interface DepartmentScheduleTemplatesModalProps {
  departmentCode: string
  semester: 'sem1' | 'sem2'
  existingEditorState?: string
  onImport: (incoming: ExcelSheetImport) => void
  onClose: () => void
}
interface Source { incoming: ExcelSheetImport; selected: string }

export function DepartmentScheduleTemplatesModal({ departmentCode, semester, existingEditorState, onImport, onClose }: DepartmentScheduleTemplatesModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const generationRef = useRef({ faculty: 0, courses: 0, rooms: 0 })
  const [faculty, setFaculty] = useState<Source>()
  const [courses, setCourses] = useState<Source>()
  const [rooms, setRooms] = useState<Source>()
  const [busy, setBusy] = useState<TemplateRole | null>(null)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    const keys = (event: KeyboardEvent) => {
      if (!['Tab', 'Escape'].includes(event.key)) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]') ?? [])]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keys, true)
    return () => {
      generationRef.current.faculty++; generationRef.current.courses++; generationRef.current.rooms++
      document.removeEventListener('keydown', keys, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  const readFile = async (role: TemplateRole, file: File | undefined) => {
    if (!file) return
    const generation = ++generationRef.current[role]
    setError(''); setAcknowledged(false)
    if (role === 'faculty') setFaculty(undefined)
    else if (role === 'courses') setCourses(undefined)
    else setRooms(undefined)
    if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > 20 * 1024 * 1024) {
      setError('Choose a nonempty .xlsx file no larger than 20 MB.'); return
    }
    setBusy(role)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array', cellStyles: true })
      if (!workbook.SheetNames.length) throw new Error('The workbook does not contain any sheets.')
      const styles = parseExcelPreviewStyles(data)
      const incoming: ExcelSheetImport = { file, workbook, styles, formatting: new Map(workbook.SheetNames.map(name => [name, readSheetPreviewFormatting(styles, name)])), sheetNames: [], id: crypto.randomUUID() }
      const preferred = workbook.SheetNames.find(name => role === 'courses' ? name.toUpperCase() === departmentCode.toUpperCase()
        : role === 'faculty' ? /faculty/i.test(name) : /rooms?|labs?/i.test(name))
      const source = { incoming, selected: preferred ?? workbook.SheetNames[0] }
      if (generationRef.current[role] !== generation) return
      if (role === 'faculty') setFaculty(source)
      else if (role === 'courses') setCourses(source)
      else setRooms(source)
    } catch (caught) {
      if (generationRef.current[role] === generation) setError(caught instanceof Error ? caught.message : 'The template could not be opened.')
    } finally { if (generationRef.current[role] === generation) setBusy(null) }
  }

  const prepared = useMemo(() => {
    if (!faculty || !courses) {
      if (!rooms || faculty || courses || !existingEditorState) return undefined
      try {
        const current = deserializeWorkbookState(existingEditorState, {})
        if (!findDepartmentTemplateSheets(current)) throw new Error('Import Faculty Schedules and PHINMA Department Courses before adding Rooms & Labs.')
        const selected = rooms.selected
        const workbook = { ...rooms.incoming.workbook, Sheets: { ...rooms.incoming.workbook.Sheets,
          [selected]: { ...rooms.incoming.workbook.Sheets[selected], [DEPARTMENT_TEMPLATE_KEY]: { version: 1, role: 'rooms' } } } }
        const incoming: ExcelSheetImport = { ...rooms.incoming, workbook, sheetNames: [selected], replaceDepartmentRooms: true }
        const { snapshot } = appendImportedSheets(current, incoming)
        const sheets = findDepartmentTemplateSheets(snapshot)
        if (!sheets?.roomsSheet) throw new Error('The Rooms & Labs sheet could not be recognized.')
        const preview = readDepartmentTemplatePreview(snapshot, sheets.facultySheet, sheets.coursesSheet, semester, sheets.roomsSheet)
        return { preview, incoming, error: '' }
      } catch (caught) { return { error: caught instanceof Error ? caught.message : 'The room template could not be matched.' } }
    }
    try {
      let snapshot = emptyTemplateSnapshot()
      const names: string[] = []
      for (const [role, source] of [['faculty', faculty], ['courses', courses], ...(rooms ? [['rooms', rooms] as const] : [])] as const) {
        const result = appendImportedSheets(snapshot, { ...source.incoming, sheetNames: [source.selected] })
        snapshot = result.snapshot
        const name = result.addedNames[0]
        snapshot.workbook.Sheets[name] = { ...snapshot.workbook.Sheets[name], [DEPARTMENT_TEMPLATE_KEY]: { version: 1, role } }
        names.push(name)
      }
      snapshot.selectedSheet = names[0]
      const preview = readDepartmentTemplatePreview(snapshot, names[0], names[1], semester, names[2])
      const incoming: ExcelSheetImport = {
        file: faculty.incoming.file, workbook: snapshot.workbook, styles: snapshot.previewStyles!, formatting: snapshot.formattingOverrides,
        sheetNames: names, id: crypto.randomUUID(), replaceDepartmentTemplates: true,
      }
      return { preview, incoming, error: '' }
    } catch (caught) { return { error: caught instanceof Error ? caught.message : 'The templates could not be matched.' } }
  }, [faculty, courses, rooms, semester, existingEditorState])
  const errors = prepared?.preview?.issues.filter(i => i.severity === 'error') ?? []
  const warnings = prepared?.preview?.issues.filter(i => i.severity === 'warning') ?? []
  const canImport = prepared?.incoming && !busy && !error && !prepared.error && !errors.length && (!warnings.length || acknowledged)

  return createPortal(<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
        <div><h2 id={titleId} className="text-xl font-bold">Import department schedule templates</h2><p className="mt-1 text-sm text-white/80">{departmentCode} · Use the supplied faculty timetable, course table, and optional room table layouts.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/40 px-3 py-2 text-sm hover:bg-white/10">Close</button>
      </div>
      <div className="min-h-0 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {(['faculty', 'courses'] as const).map(role => {
            const source = role === 'faculty' ? faculty : courses
            return <div key={role} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">{role === 'faculty' ? '1. Faculty Schedules' : '2. PHINMA Department Courses'}</h3>
              <p className="text-sm text-slate-600">{role === 'faculty' ? 'Faculty names, weekday columns, merged time blocks, and subject-section entries such as ITE 314-2.' : 'Session, Semester, Code, Course, Type, and Credits. Year level comes from labels such as Y3S1.'}</p>
              <input type="file" aria-label={role === 'faculty' ? 'Faculty Schedules template' : 'Department Courses template'} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readFile(role, file) }} className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#f3f7ee] file:px-3 file:py-2 file:font-medium file:text-[#41572a] disabled:opacity-50" />
              {source && <><p className="break-all text-xs text-slate-500">{source.incoming.file.name}</p><label className="block text-sm text-slate-700">Worksheet<select value={source.selected} disabled={Boolean(busy)} onChange={event => { const selected = event.target.value; setAcknowledged(false); if (role === 'faculty') setFaculty({ ...source, selected }); else setCourses({ ...source, selected }) }} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2">{source.incoming.workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label></>}
            </div>
          })}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">3. Rooms &amp; Labs <span className="font-normal text-slate-500">(optional)</span></h3>
          <p className="text-sm text-slate-600">Room-code columns and day/time rows assign rooms to matching faculty meetings. Each time slot can use a different room. If the first two templates are already in this workbook, you can upload this sheet alone.</p>
          <input type="file" aria-label="Rooms and Labs template" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readFile('rooms', file) }} className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#f3f7ee] file:px-3 file:py-2 file:font-medium file:text-[#41572a] disabled:opacity-50" />
          {rooms && <><p className="break-all text-xs text-slate-500">{rooms.incoming.file.name}</p><label className="block text-sm text-slate-700">Worksheet<select value={rooms.selected} disabled={Boolean(busy)} onChange={event => { setRooms({ ...rooms, selected: event.target.value }); setAcknowledged(false) }} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2">{rooms.incoming.workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label><button type="button" onClick={() => { generationRef.current.rooms++; setRooms(undefined); setAcknowledged(false) }} className="text-sm font-medium text-[#41572a] hover:underline">Remove optional sheet</button></>}
        </div>
        <p className="text-sm text-slate-600">The imported sheets keep their original layout, formatting, and merged cells. Importing the first two templates replaces previous template sheets; adding Rooms &amp; Labs alone replaces only the previous room sheet. Schedule records are updated when you Save. Meetings without a matched room remain TBA.</p>
        {busy && <p role="status" className="text-sm text-slate-600">Reading {busy === 'faculty' ? 'faculty' : busy === 'courses' ? 'course' : 'room'} template…</p>}
        {(error || prepared?.error) && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error || prepared?.error}</p>}
        {prepared?.preview && <>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-[#41572a]" role="status"><span>{prepared.preview.courses.length} curriculum subjects</span><span>{prepared.preview.facultyCount} assigned faculty</span><span>{prepared.preview.classes.length} classes</span><span>{prepared.preview.classes.reduce((count, item) => count + item.meetings.length, 0)} meetings</span>{rooms && <span>{prepared.preview.classes.reduce((count, item) => count + item.meetings.filter(meeting => meeting.room).length, 0)} room assignments</span>}</div>
          <p className="text-sm text-slate-600">Lecture and Laboratory subjects are Flexible / Open Lab. Credits are retained as credits; contact hours and program names are not inferred.</p>
          <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-slate-700"><tr>{['Faculty', 'Subject', 'Year / Section', 'Type', 'Meetings'].map(title => <th key={title} className="whitespace-nowrap px-3 py-2 font-semibold">{title}</th>)}</tr></thead>
              <tbody>{prepared.preview.classes.map(item => <tr key={item.sourceKey} className="border-t border-slate-100 align-top"><td className="px-3 py-2">{item.faculty}</td><td className="px-3 py-2"><p className="whitespace-nowrap font-medium">{item.course.code}</p><p className="text-xs text-slate-500">{item.course.title}</p></td><td className="whitespace-nowrap px-3 py-2">Year {item.course.yearLevel} / {item.section || 'Unspecified'}</td><td className="whitespace-nowrap px-3 py-2">{templateSubjectLabel(item.course.type)}</td><td className="px-3 py-2">{item.meetings.map((meeting, i) => <p key={i} className="whitespace-nowrap">{meeting.day} {templateClock(meeting.start)}–{templateClock(meeting.end)} · {meeting.modality} · {meeting.room ?? 'TBA'}</p>)}</td></tr>)}</tbody>
            </table>
          </div>
          {Boolean(errors.length || warnings.length) && <div className={`space-y-2 rounded-xl p-4 text-sm ${errors.length ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
            <p className="font-semibold">{errors.length} errors · {warnings.length} items to review</p>
            <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">{[...errors, ...warnings].slice(0, 100).map((issue, i) => <li key={i}>{issue.location}: {issue.message}</li>)}</ul>
            {errors.length + warnings.length > 100 && <p>Showing the first 100 items.</p>}
            {!errors.length && <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-1 accent-[#62853e]" /><span>I reviewed these items. Keep the supplied assignments as draft schedules.</span></label>}
          </div>}
        </>}
      </div>
      <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="brand" disabled={!canImport} onClick={() => { if (canImport && prepared?.incoming) onImport(prepared.incoming) }}>Import templates</Button></div>
    </div>
  </div>, document.body)
}
