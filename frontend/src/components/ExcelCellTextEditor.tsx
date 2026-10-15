import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditHistory } from '../utils/editHistory'
import { normalizeFontRuns, replaceFontRuns, sliceFontRuns, type ExcelFontRun } from '../utils/excelFontRuns'
import { facultyFragment, filterFacultyNames, type ExcelFacultyDirectory } from '../utils/excelFacultySuggestions'
import { ExcelFacultySuggestions } from './ExcelFacultySuggestions'
import { filterDepartmentCourses, subjectFragment, type DepartmentCourseSuggestion } from '../utils/departmentCourseSuggestions'
import { ExcelSubjectSuggestions } from './ExcelSubjectSuggestions'
import { filterRoomNames, type ExcelRoomDirectory } from '../utils/excelRoomSuggestions'

interface TextSelection { start: number; end: number }

export interface ExcelCellTextDraft {
  runs: ExcelFontRun[]
  typingFont: string
}

interface EditorSnapshot extends ExcelCellTextDraft { selection: TextSelection }

export interface ExcelCellTextEditorHandle {
  applyFont: (font: string) => void
  commit: () => void
}

interface ExcelCellTextEditorProps extends ExcelCellTextDraft {
  onSave: (draft: ExcelCellTextDraft) => void
  onCancel: () => void
  onFontContextChange: (font: string) => void
  onDirtyChange?: (dirty: boolean) => void
  facultySuggestions?: ExcelFacultyDirectory
  subjectSuggestions?: readonly DepartmentCourseSuggestion[]
  subjectIncludesSection?: boolean
  roomSuggestions?: ExcelRoomDirectory
}

function readSelection(root: HTMLElement): TextSelection | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const prefix = range.cloneRange()
  prefix.selectNodeContents(root)
  prefix.setEnd(range.startContainer, range.startOffset)
  const start = prefix.toString().length
  return { start, end: start + range.toString().length }
}

function restoreSelection(root: HTMLElement, selection: TextSelection) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  const point = (offset: number): [Node, number] => {
    for (const node of nodes) {
      if (offset <= node.length) return [node, offset]
      offset -= node.length
    }
    const last = nodes[nodes.length - 1]
    return last ? [last, last.length] : [root, 0]
  }
  const range = document.createRange()
  range.setStart(...point(selection.start))
  range.setEnd(...point(selection.end))
  const browserSelection = window.getSelection()
  browserSelection?.removeAllRanges()
  browserSelection?.addRange(range)
}

export const ExcelCellTextEditor = forwardRef<ExcelCellTextEditorHandle, ExcelCellTextEditorProps>(function ExcelCellTextEditor(
  { runs, typingFont, onSave, onCancel, onFontContextChange, onDirtyChange, facultySuggestions, subjectSuggestions, subjectIncludesSection, roomSuggestions }, ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<EditorSnapshot>({ runs, typingFont, selection: { start: runs.map(run => run.text).join('').length, end: runs.map(run => run.text).join('').length } })
  const initialDraftRef = useRef({ runs: normalizeFontRuns(runs), typingFont })
  const dirtyRef = useRef<boolean | null>(null)
  const dirtyCallbackRef = useRef(onDirtyChange)
  dirtyCallbackRef.current = onDirtyChange
  const historyRef = useRef(new EditHistory<EditorSnapshot>((a, b) => a.runs === b.runs && a.typingFont === b.typingFont))
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const fontContextRef = useRef(onFontContextChange)
  fontContextRef.current = onFontContextChange
  const pendingFontSelectionRef = useRef<TextSelection | null>(draftRef.current.selection)
  const finishedRef = useRef(false)
  const compositionRef = useRef<EditorSnapshot | null>(null)
  const directoryRef = useRef(facultySuggestions)
  directoryRef.current = facultySuggestions
  const subjectsRef = useRef(subjectSuggestions)
  subjectsRef.current = subjectSuggestions
  const roomsRef = useRef(roomSuggestions)
  roomsRef.current = roomSuggestions
  const sectionRef = useRef(subjectIncludesSection)
  sectionRef.current = subjectIncludesSection
  const subjectPart = (text: string, caret: number) => sectionRef.current
    ? { start: 0, end: text.length, query: text.slice(0, caret).trim() } : subjectFragment(text, caret)
  const suggestionsId = useId()
  const [suggestionsOpen, setSuggestionsOpen] = useState(Boolean(facultySuggestions || subjectSuggestions || roomSuggestions))
  const [fragment, setFragment] = useState(() => roomSuggestions
    ? { start: 0, end: runs.map(run => run.text).join('').length, query: runs.map(run => run.text).join('').trim() } : subjectSuggestions
    ? subjectPart(runs.map(run => run.text).join(''), draftRef.current.selection.start)
    : facultyFragment(runs.map(run => run.text).join(''), draftRef.current.selection.start))
  const [activeIndex, setActiveIndex] = useState(subjectSuggestions ? -1 : 0)
  const facultyMatches = useMemo(() => facultySuggestions ? filterFacultyNames(facultySuggestions.names, fragment.query) : [], [facultySuggestions, fragment.query])
  const subjectMatches = useMemo(() => subjectSuggestions ? filterDepartmentCourses(subjectSuggestions, fragment.query) : [], [subjectSuggestions, fragment.query])
  const roomMatches = useMemo(() => roomSuggestions ? filterRoomNames(roomSuggestions.rooms, fragment.query) : [], [roomSuggestions, fragment.query])
  const matchCount = roomSuggestions ? roomMatches.length : subjectSuggestions ? subjectMatches.length : facultyMatches.length
  const suggestionsVisible = Boolean((facultySuggestions || subjectSuggestions || roomSuggestions) && suggestionsOpen)
  useEffect(() => setActiveIndex(subjectSuggestions ? -1 : 0), [fragment.query, facultyMatches, subjectMatches, subjectSuggestions, roomMatches])

  const syncSuggestions = (draft: EditorSnapshot, open = false) => {
    if (!directoryRef.current && !subjectsRef.current && !roomsRef.current) return
    const text = draft.runs.map(run => run.text).join('')
    const next = roomsRef.current ? { start: 0, end: text.length, query: text.trim() }
      : subjectsRef.current ? subjectPart(text, draft.selection.start) : facultyFragment(text, draft.selection.start, draft.selection.end)
    setFragment(current => current.start === next.start && current.end === next.end && current.query === next.query ? current : next)
    if (open) setSuggestionsOpen(true)
  }

  const save = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    saveRef.current(draftRef.current)
  }

  const reportDirty = (draft: ExcelCellTextDraft) => {
    const initial = initialDraftRef.current
    const currentRuns = normalizeFontRuns(draft.runs)
    const dirty = draft.typingFont !== initial.typingFont || currentRuns.length !== initial.runs.length
      || currentRuns.some((run, index) => run.text !== initial.runs[index].text || run.fontFamily !== initial.runs[index].fontFamily)
    if (dirtyRef.current === dirty) return
    dirtyRef.current = dirty
    dirtyCallbackRef.current?.(dirty)
  }

  const renderDraft = (draft: EditorSnapshot) => {
    const root = rootRef.current
    if (!root) return
    reportDirty(draft)
    pendingFontSelectionRef.current = draft.selection
    root.replaceChildren(...draft.runs.map(run => {
      const span = document.createElement('span')
      span.style.fontFamily = run.fontFamily
      span.textContent = run.text
      return span
    }))
    root.focus({ preventScroll: true })
    restoreSelection(root, draft.selection)
    fontContextRef.current(draft.typingFont)
  }

  const updateDraft = (draft: EditorSnapshot) => {
    draftRef.current = draft
    historyRef.current.record(draft)
    renderDraft(draft)
    syncSuggestions(draft, true)
  }

  const rememberSelection = () => {
    const root = rootRef.current
    const selection = root && readSelection(root)
    if (!root || !selection) return
    const draft = draftRef.current
    const pending = pendingFontSelectionRef.current
    let font = draft.typingFont
    // Keep a newly chosen typing font until the user moves the caret.
    if (!pending || pending.start !== selection.start || pending.end !== selection.end) {
      pendingFontSelectionRef.current = null
      let offset = selection.start === selection.end ? Math.max(0, selection.start - 1) : selection.start
      for (const run of draft.runs) {
        if (offset < run.text.length) {
          font = run.fontFamily
          break
        }
        offset -= run.text.length
      }
      // At a boundary, the browser's caret node identifies which font run it belongs to.
      if (selection.start === selection.end) {
        const focus = window.getSelection()?.focusNode
        let element = focus instanceof Element ? focus : focus?.parentElement
        while (element && element !== root) {
          if (element instanceof HTMLElement && element.style.fontFamily) {
            font = element.style.fontFamily
            break
          }
          element = element.parentElement
        }
      }
    }
    draftRef.current = { ...draft, selection, typingFont: font }
    fontContextRef.current(font)
    syncSuggestions(draftRef.current)
  }

  const insertText = (text: string) => {
    rememberSelection()
    const draft = draftRef.current
    const { start, end } = draft.selection
    const caret = start + text.length
    updateDraft({ ...draft, runs: replaceFontRuns(draft.runs, start, end, [{ text, fontFamily: draft.typingFont }]), selection: { start: caret, end: caret } })
  }

  const restoreHistory = (redo: boolean) => {
    const draft = redo ? historyRef.current.redo() : historyRef.current.undo()
    if (draft) {
      draftRef.current = draft
      renderDraft(draft)
      syncSuggestions(draft, true)
    }
  }

  useImperativeHandle(ref, () => ({
    commit: save,
    applyFont(font) {
      rememberSelection()
      const draft = draftRef.current
      const { start, end } = draft.selection
      const formatted = sliceFontRuns(draft.runs, start, end).map(run => ({ ...run, fontFamily: font }))
      updateDraft({ ...draft, typingFont: font, runs: start === end ? draft.runs : replaceFontRuns(draft.runs, start, end, formatted) })
      // The font menu restores its button focus synchronously after choosing.
      requestAnimationFrame(() => {
        const root = rootRef.current
        if (root) {
          root.focus({ preventScroll: true })
          restoreSelection(root, draftRef.current.selection)
        }
      })
    },
  }))

  useLayoutEffect(() => {
    historyRef.current.record(draftRef.current)
    renderDraft(draftRef.current)
    const remember = () => rememberSelection()
    const saveOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || rootRef.current?.contains(target) || target.closest('[data-excel-font-control], [data-excel-faculty-suggestions], [data-excel-subject-suggestions]')) return
      save()
    }
    const beforeInput = (input: InputEvent) => {
      if (!input.cancelable || input.isComposing || compositionRef.current) return
      if (input.inputType === 'insertText' || input.inputType === 'insertReplacementText') {
        input.preventDefault()
        insertText(input.data ?? '')
      } else if (input.inputType === 'insertParagraph' || input.inputType === 'insertLineBreak') {
        input.preventDefault()
        insertText('\n')
      } else if (input.inputType === 'historyUndo' || input.inputType === 'historyRedo') {
        input.preventDefault()
        restoreHistory(input.inputType === 'historyRedo')
      }
    }
    const root = rootRef.current
    root?.addEventListener('beforeinput', beforeInput)
    document.addEventListener('selectionchange', remember)
    document.addEventListener('pointerdown', saveOutside, true)
    document.addEventListener('focusin', saveOutside)
    return () => {
      root?.removeEventListener('beforeinput', beforeInput)
      document.removeEventListener('selectionchange', remember)
      document.removeEventListener('pointerdown', saveOutside, true)
      document.removeEventListener('focusin', saveOutside)
    }
  }, [])

  const readInput = () => {
    const root = rootRef.current
    if (!root) return
    const next: ExcelFontRun[] = []
    const visit = (node: Node) => {
      if (node instanceof Text) {
        next.push({ text: node.data, fontFamily: node.parentElement?.style.fontFamily || draftRef.current.typingFont })
      } else {
        if (node instanceof HTMLBRElement && root.textContent) next.push({ text: '\n', fontFamily: draftRef.current.typingFont })
        node.childNodes.forEach(visit)
      }
    }
    root.childNodes.forEach(visit)
    const selection = readSelection(root) ?? draftRef.current.selection
    const draft = { ...draftRef.current, runs: normalizeFontRuns(next), selection }
    draftRef.current = draft
    reportDirty(draft)
    if (!compositionRef.current) historyRef.current.record(draft)
    if (!compositionRef.current) syncSuggestions(draft, true)
  }

  const chooseFaculty = (name: string) => {
    const draft = draftRef.current
    const part = facultyFragment(draft.runs.map(run => run.text).join(''), draft.selection.start, draft.selection.end)
    const caret = part.start + name.length
    updateDraft({ ...draft, runs: replaceFontRuns(draft.runs, part.start, part.end, [{ text: name, fontFamily: draft.typingFont }]), selection: { start: caret, end: caret } })
    setSuggestionsOpen(false)
  }

  const chooseSubject = (code: string) => {
    const draft = draftRef.current
    const part = subjectPart(draft.runs.map(run => run.text).join(''), draft.selection.start)
    const caret = part.start + code.length
    updateDraft({ ...draft, runs: replaceFontRuns(draft.runs, part.start, part.end, [{ text: code, fontFamily: draft.typingFont }]), selection: { start: caret, end: caret } })
    setSuggestionsOpen(false)
  }

  const chooseRoom = (name: string) => {
    const draft = draftRef.current
    const text = draft.runs.map(run => run.text).join('')
    updateDraft({ ...draft, runs: replaceFontRuns(draft.runs, 0, text.length, [{ text: name, fontFamily: draft.typingFont }]),
      selection: { start: name.length, end: name.length } })
    setSuggestionsOpen(false)
  }

  const chooseActiveSuggestion = () => {
    if (roomSuggestions) {
      const name = roomMatches[Math.min(activeIndex, roomMatches.length - 1)]
      if (name) chooseRoom(name)
    } else if (subjectSuggestions) {
      const course = subjectMatches[Math.min(activeIndex, subjectMatches.length - 1)]
      if (course) chooseSubject(course.code)
    } else {
      const name = facultyMatches[Math.min(activeIndex, facultyMatches.length - 1)]
      if (name) chooseFaculty(name)
    }
  }

  return <><div
    ref={rootRef}
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-label="Edit cell text"
    aria-multiline="true"
    aria-autocomplete={facultySuggestions || subjectSuggestions || roomSuggestions ? 'list' : undefined}
    aria-expanded={facultySuggestions || subjectSuggestions || roomSuggestions ? suggestionsVisible : undefined}
    aria-controls={suggestionsVisible ? suggestionsId : undefined}
    aria-activedescendant={suggestionsVisible && matchCount && activeIndex >= 0 ? `${suggestionsId}-${Math.min(activeIndex, matchCount - 1)}` : undefined}
    style={{ fontFamily: typingFont, whiteSpace: 'pre-wrap' }}
    onPointerDown={() => { pendingFontSelectionRef.current = null }}
    onPointerUp={rememberSelection}
    onMouseDown={event => event.stopPropagation()}
    onInput={readInput}
    onPaste={event => {
      event.preventDefault()
      insertText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
    }}
    onDrop={event => {
      event.preventDefault()
      insertText(event.dataTransfer.getData('text/plain').replace(/\r\n?/g, '\n'))
    }}
    onCompositionStart={() => {
      setSuggestionsOpen(false)
      rememberSelection()
      compositionRef.current = draftRef.current
    }}
    onCompositionEnd={() => {
      readInput()
      const before = compositionRef.current
      compositionRef.current = null
      if (!before) return
      const text = draftRef.current.runs.map(run => run.text).join('')
      const original = before.runs.map(run => run.text).join('')
      const insertedLength = text.length - original.length + before.selection.end - before.selection.start
      const inserted = text.slice(before.selection.start, before.selection.start + Math.max(0, insertedLength))
      updateDraft({ ...draftRef.current, runs: replaceFontRuns(before.runs, before.selection.start, before.selection.end, [{ text: inserted, fontFamily: before.typingFont }]) })
    }}
    onBlur={event => {
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[data-excel-font-control], [data-excel-faculty-suggestions], [data-excel-subject-suggestions]')) return
      save()
    }}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.nativeEvent.isComposing) return
      if (suggestionsVisible && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && matchCount) {
        event.preventDefault()
        setActiveIndex(current => current < 0 ? event.key === 'ArrowDown' ? 0 : matchCount - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + matchCount) % matchCount)
        return
      }
      if (suggestionsVisible && (event.key === 'Enter' && !event.shiftKey || event.key === 'Tab') && matchCount && activeIndex >= 0) {
        event.preventDefault()
        chooseActiveSuggestion()
        if (event.key === 'Tab') save()
        return
      }
      if (suggestionsVisible && event.key === 'Escape') {
        event.preventDefault()
        setSuggestionsOpen(false)
        return
      }
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
        event.preventDefault()
        restoreHistory(key === 'y' || event.shiftKey)
      } else if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(key)) {
        event.preventDefault()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        finishedRef.current = true
        onCancel()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (event.shiftKey) insertText('\n')
        else save()
      }
    }}
    className="absolute inset-0 z-10 h-full w-full overflow-auto bg-white p-0.5 text-inherit outline-2 outline-[#62853e] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  />{suggestionsVisible && facultySuggestions && <ExcelFacultySuggestions id={suggestionsId} anchor={rootRef} names={facultyMatches} loading={facultySuggestions.loading} error={facultySuggestions.error} activeIndex={Math.min(activeIndex, Math.max(0, facultyMatches.length - 1))} onSelect={chooseFaculty} />}
    {suggestionsVisible && subjectSuggestions && <ExcelSubjectSuggestions id={suggestionsId} anchor={rootRef} courses={subjectMatches} activeIndex={Math.min(activeIndex, subjectMatches.length - 1)} onSelect={chooseSubject} label={subjectIncludesSection ? 'Faculty schedules' : undefined} />}
    {suggestionsVisible && roomSuggestions && <ExcelFacultySuggestions id={suggestionsId} anchor={rootRef} names={roomMatches} loading={roomSuggestions.loading} error={roomSuggestions.error} activeIndex={Math.min(activeIndex, Math.max(0, roomMatches.length - 1))} onSelect={chooseRoom} label="Rooms" noun="rooms" minWidth={140} />}</>
})
