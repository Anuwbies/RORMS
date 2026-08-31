import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { CalendarIcon, PlusIcon, TrashIcon, CheckIcon, CheckCircleIcon, AlertCircleIcon, ExclamationIcon, DuplicateIcon, QuestionIcon, SpinnerIcon, SearchIcon, CloseIcon, UndoIcon } from './Icons'
import { Button } from './Button'
import { DashedButton } from './DashedButton'
import { SearchInput } from './SearchInput'
import { db } from '../firebase'
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { combineSessionChanges } from './RevisedSchedulesModal'

export interface DepartmentMember {
  id: string
  name: string
  email: string
  role: string
  status: string
  department?: string
  joinedDate?: string
  avatar?: string
  joinedAt?: Date | null
  membershipId?: string
}

interface DepartmentEditScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  departmentInfo: { name: string; code: string; logo: string } | null
  members: DepartmentMember[]
  selectedAcademicYear: any
  selectedSemesterPhase: { name: string; phase: string } | null
  editablePhases?: string[]
  hideTitleColumn?: boolean
  hideStatusColumn?: boolean
  hideAddRemoveButtons?: boolean
  hidePlotAllReadyButton?: boolean
  showStatusOnNumberColumn?: boolean
  onlyAllowDraftEditing?: boolean
  onlyAllowTimeDaysRoomStatusEditing?: boolean
}

const InnerDropdown = ({ value, onChange, options, disabled = false, placeholder = "Select" }: { value: string, onChange: (val: string) => void, options: { value: string, label: string }[], disabled?: boolean, placeholder?: string }) => {
  return (
    <details className="relative w-full group">
      <summary
        tabIndex={disabled ? -1 : undefined}
        onMouseDown={(e) => {
          if (disabled) e.preventDefault();
        }}
        onClick={(e) => {
          if (disabled) e.preventDefault();
          else {
            const summary = e.currentTarget;
            const rect = summary.getBoundingClientRect();
            const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement;
            if (dropdown) {
              if (window.innerHeight - rect.bottom < 200) {
                dropdown.style.top = 'auto';
                dropdown.style.bottom = '100%';
                dropdown.style.marginTop = '0';
                dropdown.style.marginBottom = '4px';
              } else {
                dropdown.style.top = '100%';
                dropdown.style.bottom = 'auto';
                dropdown.style.marginTop = '4px';
                dropdown.style.marginBottom = '0';
              }
            }
          }
        }}
        className={`w-full p-2 border border-gray-300 rounded text-sm focus:outline-none bg-white list-none [&::-webkit-details-marker]:hidden flex items-center justify-between ${disabled ? 'bg-gray-100 cursor-default text-gray-500' : 'focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] cursor-pointer'}`}>
        <span className="truncate">{options.find(o => o.value === value)?.label || placeholder}</span>
      </summary>
      {!disabled && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
          <div className="absolute top-full mt-1 left-0 z-[70] bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-1 flex flex-col gap-1 rounded w-full max-h-[12.5rem] overflow-y-auto">
            <button
              type="button"
              onClick={(e) => {
                onChange('');
                e.stopPropagation();
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate text-gray-500 italic shrink-0"
            >
              {placeholder}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  onChange(opt.value);
                  e.stopPropagation();
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className={`text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate shrink-0 ${value === opt.value ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-medium' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </details>
  );
};

const getDurationMins = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
};

const calculateEndTime = (start: string, durationMins: number) => {
  if (!start || !durationMins || isNaN(durationMins)) return '';
  const [h, m] = start.split(':').map(Number);
  const totalMins = h * 60 + m + durationMins;
  const endH = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const endM = (totalMins % 60).toString().padStart(2, '0');
  return `${endH}:${endM}`;
};

const START_TIME_OPTIONS = [
  { value: '07:30', label: '07:30 AM' },
  { value: '09:00', label: '09:00 AM' },
  { value: '10:30', label: '10:30 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:30', label: '01:30 PM' },
  { value: '15:00', label: '03:00 PM' },
  { value: '16:30', label: '04:30 PM' },
];

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 7)

export const createDefaultSchedule = () => ({
  id: generateId(),
  type: 'normal',
  subjectCode: '',
  subjectTitle: '',
  classSection: '',
  format: '',
  format2: '',
  instructorId: '',
  instructorId2: '',
  startTime: '',
  startTime2: '',
  endTime: '',
  endTime2: '',
  days: [] as string[],
  buildingId: '',
  buildingId2: '',
  roomId: '',
  roomId2: '',
  parentId: undefined as string | undefined,
  orderIndex: 0,
  status: 'Draft'
})

const resolveBuildingCode = (
  building?: { id?: string; name?: string; code?: string } | null,
  roomsList?: { buildingId?: string; code?: string }[]
): string => {
  if (!building) return '';
  if (building.code && building.code.trim() && building.code.toLowerCase() !== building.name?.toLowerCase()) {
    return building.code.trim();
  }
  if (building.id && roomsList && roomsList.length > 0) {
    const bRoom = roomsList.find(r => r.buildingId === building.id && r.code);
    if (bRoom && bRoom.code) {
      const match = bRoom.code.match(/^([A-Za-z]+)/);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }
  }
  if (building.name) {
    const cleaned = building.name.replace(/\s+building$/i, '').trim();
    if (cleaned.toLowerCase() === 'basic education') return 'BE';
    return cleaned || building.name;
  }
  return building.code || '';
};

function DepartmentEditScheduleModal({
  isOpen,
  onClose,
  departmentInfo,
  members,
  selectedAcademicYear,
  selectedSemesterPhase,
  editablePhases = ['Drafting', 'Revision'],
  hideTitleColumn = false,
  hideStatusColumn = false,
  hideAddRemoveButtons = false,
  hidePlotAllReadyButton = false,
  showStatusOnNumberColumn = false,
  onlyAllowDraftEditing = false,
  onlyAllowTimeDaysRoomStatusEditing = false,
}: DepartmentEditScheduleModalProps) {
  const isEditable = selectedSemesterPhase?.phase ? editablePhases.includes(selectedSemesterPhase.phase) : false;

  const [rooms, setRooms] = useState<{ id: string, code: string, name: string, buildingId: string }[]>([])
  const [buildings, setBuildings] = useState<{ id: string, name: string, code?: string }[]>([])
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false)
  const [isPlotConfirmModalOpen, setIsPlotConfirmModalOpen] = useState(false)
  const [isSaveConfirmModalOpen, setIsSaveConfirmModalOpen] = useState(false)
  const [isCancelConfirmModalOpen, setIsCancelConfirmModalOpen] = useState(false)
  const [isConflictSummaryModalOpen, setIsConflictSummaryModalOpen] = useState(false)
  const [conflictModalTab, setConflictModalTab] = useState<'all' | 'overlap' | 'section' | 'missing'>('all')
  const [conflictSearchQuery, setConflictSearchQuery] = useState('')
  const [allCampusSchedules, setAllCampusSchedules] = useState<any[]>([])
  const [originalSchedulesSnapshot, setOriginalSchedulesSnapshot] = useState<string>('')
  const [pendingTypeChange, setPendingTypeChange] = useState<{ index: number, newType: string } | null>(null)
  const [customTooltip, setCustomTooltip] = useState<{
    visible: boolean
    targetX: number
    targetY: number
    targetBottomY: number
    lines: string[]
    type?: 'danger' | 'warning' | 'purple' | 'info' | 'dark' | 'success'
    position?: 'top' | 'right'
  } | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number; arrowLeft: number; isBelow: boolean; isRight: boolean }>({
    left: 0,
    top: 0,
    arrowLeft: 50,
    isBelow: false,
    isRight: false
  })

  const [schedules, setSchedules] = useState([createDefaultSchedule()])
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false)
  const [isSubmittingSchedules, setIsSubmittingSchedules] = useState(false)
  const [deletedScheduleIds, setDeletedScheduleIds] = useState<string[]>([])
  const [isRemoveMode, setIsRemoveMode] = useState(false)
  const [isPlotMode, setIsPlotMode] = useState(false)
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([])
  const parallelChildrenCache = useRef<Map<string, any[]>>(new Map())
  const originalSchedulesMap = useRef<Map<string, any>>(new Map())
  const [revertedCellKeys, setRevertedCellKeys] = useState<Set<string>>(new Set())
  const undoHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingUndoIndex, setPendingUndoIndex] = useState<number | null>(null)

  // Drag-and-drop reordering state (pointer-based, smooth CSS transform animation)
  const [dragState, setDragState] = useState<{
    parentId: string
    groupIndices: number[]
    groupHeight: number
    startMouseY: number
    deltaY: number
    rowTops: number[]
    rowHeights: number[]
  } | null>(null)
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null)
  const schedulesRef = useRef(schedules)
  schedulesRef.current = schedules
  const dragStateRef = useRef(dragState)
  dragStateRef.current = dragState

  // Status rank order: 0: Draft, 1: Return, 2: Revise/Revising/Revised, 3: Plot/Plotted
  const STATUS_ORDER: Record<string, number> = {
    'Draft': 0,
    'Drafted': 0,
    'Return': 1,
    'Returned': 1,
    'Removed': 1,
    'Revising': 2,
    'Revise': 2,
    'Revised': 2,
    'Plot': 3,
    'Plotted': 3,
  }

  const getStatusRank = (status?: string): number => {
    if (!status) return 0
    return STATUS_ORDER[status] ?? 0
  }

  // Get the "group" indices for a row (parent + children for parallel, or just the single row)
  const getGroupIndices = (list: typeof schedules, idx: number): number[] => {
    const s = list[idx]
    if (!s) return [idx]
    const parentIdx = s.parentId
      ? list.findIndex(sc => sc.id === s.parentId)
      : idx
    const parent = list[parentIdx]
    if (!parent) return [idx]
    const indices = [parentIdx]
    for (let i = parentIdx + 1; i < list.length; i++) {
      if (list[i].parentId === parent.id) indices.push(i)
      else break
    }
    return indices
  }

  // Stable sort schedules by status: Draft (0) -> Revise (1) -> Plot (2) -> Return (3)
  const sortSchedulesByStatus = (list: typeof schedules): typeof schedules => {
    if (!list || list.length === 0) return list

    const groups: (typeof schedules)[] = []
    const visited = new Set<number>()

    for (let i = 0; i < list.length; i++) {
      if (visited.has(i)) continue
      const gIndices = getGroupIndices(list, i)
      gIndices.forEach(idx => visited.add(idx))
      groups.push(gIndices.map(idx => list[idx]))
    }

    // Stable sort by group status rank
    groups.sort((a, b) => {
      const rankA = getStatusRank(a[0]?.status)
      const rankB = getStatusRank(b[0]?.status)
      return rankA - rankB
    })

    const result: typeof schedules = []
    for (const g of groups) {
      for (const item of g) {
        result.push(item)
      }
    }
    return result
  }

  const isDragging = dragState !== null

  // Pointer-based drag with smooth CSS transforms
  useEffect(() => {
    if (!isDragging) return

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    const handlePointerMove = (e: PointerEvent) => {
      setDragState(prev => {
        if (!prev) return null
        
        let rawDeltaY = e.clientY - prev.startMouseY
        
        // Calculate bounds restricted to table bounds
        const groupStartIdx = prev.groupIndices[0]
        const groupOriginalTop = prev.rowTops[groupStartIdx]
        const groupOriginalBottom = groupOriginalTop + prev.groupHeight
        
        const minTop = prev.rowTops[0] ?? 0
        const maxBottom = (prev.rowTops[prev.rowTops.length - 1] ?? 0) + (prev.rowHeights[prev.rowHeights.length - 1] ?? 0)
        
        // Clamp deltaY so the dragged row stays within table limits
        const maxDeltaYUp = minTop - groupOriginalTop
        const maxDeltaYDown = maxBottom - groupOriginalBottom
        
        const clampedDeltaY = Math.max(maxDeltaYUp, Math.min(maxDeltaYDown, rawDeltaY))
        
        return { ...prev, deltaY: clampedDeltaY }
      })
    }

    const handlePointerUp = () => {
      const ds = dragStateRef.current
      if (ds) {
        const { groupIndices, deltaY, groupHeight, rowTops, rowHeights } = ds
        const current = schedulesRef.current
        const dragOriginalTop = rowTops[groupIndices[0]]
        const dragTop = dragOriginalTop + deltaY
        const dragBottom = dragTop + groupHeight

        // Build list of all groups with their final visual centers
        const visited = new Set(groupIndices)
        const groupsWithVisualCenters: { indices: number[], visualCenter: number }[] = []
        for (let i = 0; i < current.length; ) {
          if (visited.has(i)) { i++; continue }
          const group = getGroupIndices(current, i)
          const gHeight = group.reduce((s, idx) => s + (rowHeights[idx] || 0), 0)
          const gCenter = rowTops[group[0]] + gHeight / 2
          
          let visualCenter = gCenter
          if (deltaY > 0 && i > groupIndices[groupIndices.length - 1] && gCenter < dragBottom) {
             visualCenter = gCenter - groupHeight
          } else if (deltaY < 0 && i < groupIndices[0] && gCenter > dragTop) {
             visualCenter = gCenter + groupHeight
          }
          
          groupsWithVisualCenters.push({ indices: group, visualCenter })
          i = group[group.length - 1] + 1
        }
        
        // Add dragged group
        const draggedVisualCenter = dragTop + groupHeight / 2
        groupsWithVisualCenters.push({ indices: groupIndices, visualCenter: draggedVisualCenter })
        
        // Sort by visual center
        groupsWithVisualCenters.sort((a, b) => a.visualCenter - b.visualCenter)
        
        // Reconstruct schedule with updated orderIndex
        const newSchedules: typeof current = []
        for (const g of groupsWithVisualCenters) {
           g.indices.forEach(idx => newSchedules.push(current[idx]))
        }

        const withUpdatedOrder = newSchedules.map((s, idx) => ({ ...s, orderIndex: idx }))
        setSchedules(withUpdatedOrder)
      }
      setDragState(null)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  // Calculate inline drag style for each row
  const getRowDragStyle = (index: number): React.CSSProperties => {
    if (!dragState) return {}
    const { groupIndices, deltaY, groupHeight, rowTops, rowHeights } = dragState
    const dragGroupStart = groupIndices[0]
    const dragGroupEnd = groupIndices[groupIndices.length - 1]

    if (groupIndices.includes(index)) {
      const isFirst = index === dragGroupStart;
      const isLast = index === dragGroupEnd;
      
      let shadow = 'none';
      if (isFirst && isLast) {
        shadow = '0 4px 24px rgba(0,0,0,0.13)';
      } else if (isFirst) {
        shadow = '0 -8px 20px -4px rgba(0,0,0,0.15)';
      } else if (isLast) {
        shadow = '0 12px 20px -4px rgba(0,0,0,0.15)';
      }

      // Dragged row - follows cursor immediately, no transition
      return {
        transform: `translateY(${deltaY}px)`,
        position: 'relative',
        zIndex: 20,
        boxShadow: shadow,
        backgroundColor: '#ffffff',
      }
    }

    // For non-dragged rows, check if they need to shift
    const dragOriginalTop = rowTops[dragGroupStart]
    const dragTop = dragOriginalTop + deltaY
    const dragBottom = dragTop + groupHeight

    // Get this row's group center
    const thisGroup = getGroupIndices(schedules, index)
    const thisGroupHeight = thisGroup.reduce((s, i) => s + (rowHeights[i] || 0), 0)
    const thisGroupCenter = rowTops[thisGroup[0]] + thisGroupHeight / 2

    let shift = 0
    if (deltaY > 0 && index > dragGroupEnd && thisGroupCenter < dragBottom) {
      shift = -groupHeight
    } else if (deltaY < 0 && index < dragGroupStart && thisGroupCenter > dragTop) {
      shift = groupHeight
    }

    return {
      transform: shift !== 0 ? `translateY(${shift}px)` : undefined,
      transition: 'transform 200ms ease',
    }
  }

  useLayoutEffect(() => {
    if (customTooltip?.visible && tooltipRef.current) {
      const el = tooltipRef.current
      const rect = el.getBoundingClientRect()
      const tooltipWidth = rect.width
      const tooltipHeight = rect.height
      const halfWidth = tooltipWidth / 2

      // Find the active modal container if any, otherwise fallback to viewport
      const modalEl = document.querySelector('.w-\\[95vw\\]') as HTMLElement | null
      const modalRect = modalEl ? modalEl.getBoundingClientRect() : null

      const rightBound = modalRect ? modalRect.right - 16 : window.innerWidth - 24
      const leftBound = modalRect ? modalRect.left + 16 : 24
      const topBound = modalRect ? modalRect.top + 16 : 16

      if (customTooltip.position === 'right') {
        // Position to the right of the target element
        const tooltipLeft = customTooltip.targetX
        const tooltipTop = customTooltip.targetY - tooltipHeight / 2

        setTooltipPos({
          left: tooltipLeft,
          top: tooltipTop,
          arrowLeft: 0,
          isBelow: false,
          isRight: true
        })
      } else {
        // Default: position above/below the target element
        let tooltipLeft = customTooltip.targetX - halfWidth

        // Only shift if it actually overflows the right or left edge of the modal/screen
        if (tooltipLeft + tooltipWidth > rightBound) {
          tooltipLeft = rightBound - tooltipWidth
        }
        if (tooltipLeft < leftBound) {
          tooltipLeft = leftBound
        }

        // Calculate arrow position (50% when centered, dynamically adjusted when shifted near edges)
        const arrowPixelFromLeft = customTooltip.targetX - tooltipLeft
        const arrowLeft = Math.max(6, Math.min(94, (arrowPixelFromLeft / tooltipWidth) * 100))

        const isBelow = customTooltip.targetY - rect.height < topBound
        const top = isBelow ? customTooltip.targetBottomY : customTooltip.targetY
        const centerX = tooltipLeft + halfWidth

        setTooltipPos({
          left: centerX,
          top,
          arrowLeft,
          isBelow,
          isRight: false
        })
      }
    }
  }, [customTooltip])

  const showCustomTooltip = (e: React.MouseEvent, textOrLines: string | string[] | undefined, type: 'danger' | 'warning' | 'purple' | 'info' | 'dark' | 'success' = 'dark', position: 'top' | 'right' = 'top') => {
    if (!textOrLines) return
    const rawLines = Array.isArray(textOrLines) ? textOrLines.filter(Boolean) : textOrLines.split('\n').filter(Boolean)
    const lines = Array.from(new Set(rawLines.map(s => s.trim()))).filter(Boolean)
    if (lines.length === 0) return

    const current = e.currentTarget as HTMLElement
    const rect = current.getBoundingClientRect()

    if (position === 'right') {
      setCustomTooltip({
        visible: true,
        targetX: rect.right + 8,
        targetY: rect.top + rect.height / 2,
        targetBottomY: rect.bottom,
        lines,
        type,
        position: 'right'
      })
    } else {
      const targetCenterX = rect.left + rect.width / 2
      setCustomTooltip({
        visible: true,
        targetX: targetCenterX,
        targetY: rect.top - 8,
        targetBottomY: rect.bottom + 8,
        lines,
        type,
        position: 'top'
      })
    }
  }

  const hideCustomTooltip = () => setCustomTooltip(null)

  // Fetch existing schedules when modal opens
  useEffect(() => {
    if (isOpen && departmentInfo?.code && selectedAcademicYear && selectedSemesterPhase) {
      setIsLoadingSchedules(true)
      const fetchSchedules = async () => {
        try {
          const q = query(
            collection(db, 'schedule'),
            where('department', '==', departmentInfo.code),
            where('academicYear', '==', selectedAcademicYear.academicYear),
            where('semester', '==', selectedSemesterPhase.name)
          )
          const snapshot = await getDocs(q)
          if (!snapshot.empty) {
            const normalizeStatus = (st?: string) => {
              if (!st) return 'Draft'
              if (st === 'Plot' || st === 'Plotted') return 'Plot'
              if (st === 'Revise' || st === 'Revised') return 'Revise'
              if (st === 'Return' || st === 'Returned' || st === 'Removed') return 'Return'
              if (st === 'Draft' || st === 'Drafted') return 'Draft'
              return st
            }

            const rawFetched = snapshot.docs.map(doc => {
              const data = doc.data()
              return {
                ...createDefaultSchedule(),
                ...data,
                status: normalizeStatus(data.status),
                session: data.session || 'Combine',
                isSplitSession: data.isSplitSession || false,
                days: data.days || [],
                classSection: data.classSection || '',
                type: data.type || 'normal',
                subjectCode: data.subjectCode || '',
                subjectTitle: data.subjectTitle || '',
                format: data.format || '',
                startTime: data.startTime || '',
                endTime: data.endTime || '',
                buildingId: data.buildingId || '',
                roomId: data.roomId || '',
                instructorId: data.instructorId || '',
                id: data.id || (!data.parentId && data.groupId ? data.groupId : doc.id),
                docId: doc.id,
                orderIndex: data.orderIndex !== undefined ? data.orderIndex : 0
              }
            })

            const parentMap = new Map();
            const children: any[] = [];

            const allDocs = new Map(rawFetched.map(item => [item.id, item]));

            rawFetched.forEach(item => {
              const parentDoc = item.parentId ? allDocs.get(item.parentId) : null;
              if (parentDoc && parentDoc.orderIndex === item.orderIndex) {
                children.push(item);
              } else {
                parentMap.set(item.id, item);
              }
            });

            children.forEach(child => {
              const parent = parentMap.get(child.parentId);
              if (parent) {
                parent.instructorId2 = parent.instructorId2 || (child.instructorId === parent.instructorId ? '' : child.instructorId);
                parent.format2 = parent.format2 || (child.format === parent.format ? '' : child.format);
                parent.startTime2 = parent.startTime2 || (child.startTime === parent.startTime ? '' : child.startTime);
                parent.endTime2 = parent.endTime2 || (child.endTime === parent.endTime ? '' : child.endTime);

                if (child.days && child.days.length > 0) {
                  const combinedDays = [...(parent.days || []), ...child.days];
                  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  parent.days = combinedDays.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
                }

                parent.buildingId2 = parent.buildingId2 || (child.buildingId === parent.buildingId ? '' : child.buildingId);
                parent.roomId2 = parent.roomId2 || (child.roomId === parent.roomId ? '' : child.roomId);
                parent.childDocId = child.docId;
              }
            });

            const fetched = Array.from(parentMap.values());
            fetched.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
            const sortedFetched = sortSchedulesByStatus(fetched).map((s, idx) => ({ ...s, orderIndex: idx }));

            parallelChildrenCache.current.clear();
            const childrenByParent = new Map<string, any[]>();
            sortedFetched.forEach(item => {
              if (item.parentId) {
                if (!childrenByParent.has(item.parentId)) childrenByParent.set(item.parentId, []);
                childrenByParent.get(item.parentId)!.push(item);
              }
            });
            childrenByParent.forEach((chList, pId) => {
              parallelChildrenCache.current.set(pId, chList);
            });

            setSchedules(sortedFetched);
            setOriginalSchedulesSnapshot(JSON.stringify(sortedFetched));
            originalSchedulesMap.current.clear();
            sortedFetched.forEach(item => {
              originalSchedulesMap.current.set(item.id, JSON.parse(JSON.stringify(item)));
            });
          } else {
            parallelChildrenCache.current.clear()
            originalSchedulesMap.current.clear()
            setSchedules([])
            setOriginalSchedulesSnapshot(JSON.stringify([]))
          }
        } catch (err) {
          console.error('Error fetching schedules:', err)
          setSchedules([])
        } finally {
          setIsLoadingSchedules(false)
        }
      }
      fetchSchedules()
    } else {
      setIsLoadingSchedules(false)
      parallelChildrenCache.current.clear()
      originalSchedulesMap.current.clear()
      if (undoHighlightTimeoutRef.current) clearTimeout(undoHighlightTimeoutRef.current)
      setRevertedCellKeys(new Set())
      setSchedules([])
      setDeletedScheduleIds([])
      setIsRemoveMode(false)
      setSelectedScheduleIds([])
      setOriginalSchedulesSnapshot('')
    }
  }, [isOpen, departmentInfo, selectedAcademicYear?.academicYear, selectedSemesterPhase?.name])

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const fetchedRooms = snapshot.docs.map(doc => ({
        id: doc.id,
        code: doc.data().code,
        name: doc.data().name,
        buildingId: doc.data().buildingId || ''
      }))
      setRooms(fetchedRooms)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'buildings'), (snapshot) => {
      const fetchedBuildings = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        code: doc.data().code || doc.data().name || ''
      }))
      setBuildings(fetchedBuildings)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!isOpen || !selectedAcademicYear?.academicYear || !selectedSemesterPhase?.name) {
      setAllCampusSchedules([])
      return
    }
    const q = query(
      collection(db, 'schedule'),
      where('academicYear', '==', selectedAcademicYear.academicYear),
      where('semester', '==', selectedSemesterPhase.name)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }))
      setAllCampusSchedules(docs)
    })
    return () => unsubscribe()
  }, [isOpen, selectedAcademicYear?.academicYear, selectedSemesterPhase?.name])

  const timeRangesOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
    if (!startA || !endA || !startB || !endB) return false
    return startA < endB && startB < endA
  }

  const scheduleConflicts = useMemo(() => {
    interface ConflictInfo {
      hasRoomConflict1: boolean
      hasRoomConflict2: boolean
      hasInstructorConflict1: boolean
      hasInstructorConflict2: boolean
      hasSectionConflict: boolean
      roomConflictDetails1: string[]
      roomConflictDetails2: string[]
      instructorConflictDetails1: string[]
      instructorConflictDetails2: string[]
      sectionConflictDetails: string[]
    }

    const conflictsMap: Record<number, ConflictInfo> = {}
    const allConflictItems: {
      rowIndex: number
      subject: string
      section: string
      type: 'room' | 'instructor' | 'section' | 'missing'
      sessionNum: 1 | 2
      conflictTarget: string
      message: string
    }[] = []

    schedules.forEach((_, idx) => {
      conflictsMap[idx] = {
        hasRoomConflict1: false,
        hasRoomConflict2: false,
        hasInstructorConflict1: false,
        hasInstructorConflict2: false,
        hasSectionConflict: false,
        roomConflictDetails1: [],
        roomConflictDetails2: [],
        instructorConflictDetails1: [],
        instructorConflictDetails2: [],
        sectionConflictDetails: []
      }
    })

    // 1. Build list of active in-table sessions
    interface TableSession {
      rowId: string
      rowIndex: number
      sessionNum: 1 | 2
      parentId?: string
      docId?: string
      subjectCode: string
      subjectTitle: string
      classSection: string
      instructorId: string
      startTime: string
      endTime: string
      days: string[]
      buildingId: string
      roomId: string
      department: string
      type: string
    }

    const inTableSessions: TableSession[] = []

    schedules.forEach((schedule, index) => {
      const hasSecondDay = schedule.days && schedule.days.length === 2
      const hasExplicitSecondSession = !!(schedule as any).startTime2 ||
        !!(schedule as any).endTime2 ||
        !!(schedule as any).format2 ||
        !!(schedule as any).instructorId2 ||
        !!(schedule as any).buildingId2 ||
        !!(schedule as any).roomId2
      const isSplit = hasSecondDay || hasExplicitSecondSession

      // Session 1
      const days1 = hasSecondDay
        ? (schedule.days[0] ? [schedule.days[0]] : [])
        : (schedule.days || [])
      inTableSessions.push({
        rowId: schedule.id,
        rowIndex: index,
        sessionNum: 1,
        parentId: schedule.parentId,
        docId: (schedule as any).docId,
        subjectCode: schedule.subjectCode || '',
        subjectTitle: schedule.subjectTitle || '',
        classSection: schedule.classSection || '',
        instructorId: schedule.instructorId || '',
        startTime: schedule.startTime || '',
        endTime: schedule.endTime || '',
        days: days1,
        buildingId: schedule.buildingId || '',
        roomId: schedule.roomId || '',
        department: departmentInfo?.code || '',
        type: schedule.type || 'normal'
      })

      // Session 2
      if (isSplit) {
        const days2 = hasSecondDay
          ? (schedule.days[1] ? [schedule.days[1]] : [])
          : (schedule.days || [])
        inTableSessions.push({
          rowId: schedule.id,
          rowIndex: index,
          sessionNum: 2,
          parentId: schedule.parentId,
          docId: (schedule as any).childDocId,
          subjectCode: schedule.subjectCode || '',
          subjectTitle: schedule.subjectTitle || '',
          classSection: schedule.classSection || '',
          instructorId: (schedule as any).instructorId2 || schedule.instructorId || '',
          startTime: (schedule as any).startTime2 || schedule.startTime || '',
          endTime: (schedule as any).endTime2 || schedule.endTime || '',
          days: days2,
          buildingId: (schedule as any).buildingId2 || schedule.buildingId || '',
          roomId: (schedule as any).roomId2 || schedule.roomId || '',
          department: departmentInfo?.code || '',
          type: schedule.type || 'normal'
        })
      }
    })

    // 2. Filter external campus schedules to exclude documents currently being edited or deleted in the table
    const editingDocIds = new Set([
      ...schedules.flatMap(s => [(s as any).docId, (s as any).childDocId, s.id]),
      ...deletedScheduleIds
    ].filter(Boolean))

    interface ExternalSession {
      docId: string
      department: string
      subjectCode: string
      subjectTitle: string
      classSection: string
      instructorId: string
      startTime: string
      endTime: string
      days: string[]
      buildingId: string
      roomId: string
      parentId?: string
      groupId?: string
    }

    const externalSessions: ExternalSession[] = isSubmittingSchedules
      ? []
      : allCampusSchedules
          .filter(d => !editingDocIds.has(d.docId) && !editingDocIds.has(d.id))
          .map(d => ({
            docId: d.docId || d.id,
            department: d.department || '',
            subjectCode: d.subjectCode || '',
            subjectTitle: d.subjectTitle || '',
            classSection: d.classSection || '',
            instructorId: d.instructorId || '',
            startTime: d.startTime || '',
            endTime: d.endTime || '',
            days: Array.isArray(d.days) ? d.days : [],
            buildingId: d.buildingId || '',
            roomId: d.roomId || '',
            parentId: d.parentId || undefined,
            groupId: d.groupId || undefined
          }))

    // 3. Helper to format names & validate active instructors
    const getRoomName = (rId: string) => rooms.find(r => r.id === rId)?.name || rooms.find(r => r.id === rId)?.code || 'Room'
    const getInstructorName = (iId: string) => members.find(m => (m as any).membershipId === iId || m.id === iId)?.name || 'Instructor'

    const validInstructorsMap = new Map<string, DepartmentMember>()
    members.forEach(m => {
      if (m.status === 'Active' && (m.role === 'Instructor' || m.role === 'Program Head')) {
        if (m.membershipId) validInstructorsMap.set(m.membershipId, m)
        if (m.id) validInstructorsMap.set(m.id, m)
      }
    })

    // 4. Validate instructor eligibility (Must be Active and have Instructor/Program Head role in this department)
    schedules.forEach((schedule, rowIndex) => {
      if (schedule.parentId) return // Parallel children inherit instructor from parent

      const checkInstructor = (instId: string, sessionNum: 1 | 2) => {
        if (!instId) return
        const isValid = validInstructorsMap.has(instId)
        if (!isValid) {
          const memberRecord = members.find(m => (m as any).membershipId === instId || m.id === instId)
          const instName = memberRecord?.name || 'Assigned instructor'
          let reason = 'is no longer in this department'
          if (memberRecord) {
            if (memberRecord.status !== 'Active') {
              reason = 'is currently Inactive'
            } else if (memberRecord.role !== 'Instructor' && memberRecord.role !== 'Program Head') {
              reason = `has role '${memberRecord.role}' (must be Instructor or Program Head)`
            }
          }
          const isSplitInstructor = !!(schedule as any).instructorId2 && (schedule as any).instructorId2 !== schedule.instructorId
          const prefix = isSplitInstructor ? `[${sessionNum === 1 ? '1st Session' : '2nd Session'}] ` : ''
          const msg = `${prefix}Instructor ${instName} ${reason}`

          const targetIndices = [rowIndex]
          if (schedule.type === 'parallel' && !schedule.parentId) {
            schedules.forEach((s, idx) => {
              if (s.parentId === schedule.id) targetIndices.push(idx)
            })
          }

          targetIndices.forEach(rIdx => {
            if (sessionNum === 1) {
              conflictsMap[rIdx].hasInstructorConflict1 = true
              if (!conflictsMap[rIdx].instructorConflictDetails1.includes(msg)) {
                conflictsMap[rIdx].instructorConflictDetails1.push(msg)
              }
            } else {
              conflictsMap[rIdx].hasInstructorConflict2 = true
              if (!conflictsMap[rIdx].instructorConflictDetails2.includes(msg)) {
                conflictsMap[rIdx].instructorConflictDetails2.push(msg)
              }
            }
          })

          allConflictItems.push({
            rowIndex,
            subject: schedule.subjectCode || '',
            section: schedule.classSection || '',
            type: 'instructor',
            sessionNum,
            conflictTarget: instName,
            message: msg
          })
        }
      }

      if (schedule.instructorId) {
        checkInstructor(schedule.instructorId, 1)
      }
      if ((schedule as any).instructorId2 && (schedule as any).instructorId2 !== schedule.instructorId) {
        checkInstructor((schedule as any).instructorId2, 2)
      }
    })

    // 5. Compare inTableSessions against each other
    for (let i = 0; i < inTableSessions.length; i++) {
      const sessA = inTableSessions[i]
      if (sessA.days.length === 0 || !sessA.startTime || !sessA.endTime) continue

      // Against other in-table sessions
      for (let j = i + 1; j < inTableSessions.length; j++) {
        const sessB = inTableSessions[j]
        if (sessA.rowIndex === sessB.rowIndex) continue
        if (sessB.days.length === 0 || !sessB.startTime || !sessB.endTime) continue

        // Check common days
        const commonDays = sessA.days.filter(d => sessB.days.includes(d))
        if (commonDays.length === 0) continue

        // Check time overlap
        if (!timeRangesOverlap(sessA.startTime, sessA.endTime, sessB.startTime, sessB.endTime)) continue

        // A. Room Conflict
        if (sessA.roomId && sessB.roomId && sessA.roomId === sessB.roomId) {
          const roomCode = getRoomName(sessA.roomId)
          const daysStr = commonDays.join(', ')
          const timeA = `${sessA.startTime}â€“${sessA.endTime}`
          const timeB = `${sessB.startTime}â€“${sessB.endTime}`
          const secStrA = sessA.classSection ? ` (Sec ${sessA.classSection})` : ''
          const secStrB = sessB.classSection ? ` (Sec ${sessB.classSection})` : ''
          const msgA = `Room ${roomCode} is also booked by Row #${sessB.rowIndex + 1}${secStrB} on ${daysStr} (${timeB})`
          const msgB = `Room ${roomCode} is also booked by Row #${sessA.rowIndex + 1}${secStrA} on ${daysStr} (${timeA})`

          if (sessA.sessionNum === 1) {
            conflictsMap[sessA.rowIndex].hasRoomConflict1 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails1.includes(msgA)) conflictsMap[sessA.rowIndex].roomConflictDetails1.push(msgA)
          } else {
            conflictsMap[sessA.rowIndex].hasRoomConflict2 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails2.includes(msgA)) conflictsMap[sessA.rowIndex].roomConflictDetails2.push(msgA)
          }

          if (sessB.sessionNum === 1) {
            conflictsMap[sessB.rowIndex].hasRoomConflict1 = true
            if (!conflictsMap[sessB.rowIndex].roomConflictDetails1.includes(msgB)) conflictsMap[sessB.rowIndex].roomConflictDetails1.push(msgB)
          } else {
            conflictsMap[sessB.rowIndex].hasRoomConflict2 = true
            if (!conflictsMap[sessB.rowIndex].roomConflictDetails2.includes(msgB)) conflictsMap[sessB.rowIndex].roomConflictDetails2.push(msgB)
          }

          allConflictItems.push({
            rowIndex: sessA.rowIndex,
            subject: sessA.subjectCode,
            section: sessA.classSection,
            type: 'room',
            sessionNum: sessA.sessionNum,
            conflictTarget: `Room ${roomCode}`,
            message: `Clashes with Row #${sessB.rowIndex + 1}${secStrB ? ` (${sessB.subjectCode || 'Class'}${secStrB})` : ''} on ${daysStr} (${timeB})`
          })
        }

        // B. Instructor Conflict
        if (sessA.instructorId && sessB.instructorId && sessA.instructorId === sessB.instructorId) {
          // Parallel Exception: If both belong to the same parallel group, skip instructor conflict
          const isSameParallelGroup = sessA.rowId === sessB.parentId || sessB.rowId === sessA.parentId || (sessA.parentId && sessA.parentId === sessB.parentId)
          if (!isSameParallelGroup) {
            // If either session is a parallel child, skip checking instructor conflict because its parent row already handles instructor checks for the group
            const isChildA = !!sessA.parentId
            const isChildB = !!sessB.parentId

            if (!isChildA && !isChildB) {
              const instName = getInstructorName(sessA.instructorId)
              const daysStr = commonDays.join(', ')
              const timeA = `${sessA.startTime}â€“${sessA.endTime}`
              const timeB = `${sessB.startTime}â€“${sessB.endTime}`
              const secStrA = sessA.classSection ? ` (Sec ${sessA.classSection})` : ''
              const secStrB = sessB.classSection ? ` (Sec ${sessB.classSection})` : ''

              const isParallelA = sessA.type === 'parallel'
              const isParallelB = sessB.type === 'parallel'

              const labelA = isParallelA ? `Parallel Class on Row #${sessA.rowIndex + 1}` : `Row #${sessA.rowIndex + 1}`
              const labelB = isParallelB ? `Parallel Class on Row #${sessB.rowIndex + 1}` : `Row #${sessB.rowIndex + 1}`

              const msgA = `${instName} is double-booked with ${labelB} on ${daysStr} (${timeB})`
              const msgB = `${instName} is double-booked with ${labelA} on ${daysStr} (${timeA})`

              const applyInstructorConflict = (sess: TableSession, msg: string) => {
                const targetIndices = [sess.rowIndex]
                if (sess.type === 'parallel' && !sess.parentId) {
                  inTableSessions.forEach(s => {
                    if (s.parentId === sess.rowId) targetIndices.push(s.rowIndex)
                  })
                }
                targetIndices.forEach(rIdx => {
                  if (sess.sessionNum === 1) {
                    conflictsMap[rIdx].hasInstructorConflict1 = true
                    if (!conflictsMap[rIdx].instructorConflictDetails1.includes(msg)) {
                      conflictsMap[rIdx].instructorConflictDetails1.push(msg)
                    }
                  } else {
                    conflictsMap[rIdx].hasInstructorConflict2 = true
                    if (!conflictsMap[rIdx].instructorConflictDetails2.includes(msg)) {
                      conflictsMap[rIdx].instructorConflictDetails2.push(msg)
                    }
                  }
                })
              }

              applyInstructorConflict(sessA, msgA)
              applyInstructorConflict(sessB, msgB)

              allConflictItems.push({
                rowIndex: sessA.rowIndex,
                subject: sessA.subjectCode || 'Class',
                section: sessA.classSection,
                type: 'instructor',
                sessionNum: sessA.sessionNum,
                conflictTarget: instName,
                message: `Double-booked with ${labelB} (${sessB.subjectCode || 'Class'}${secStrB}) on ${daysStr} (${timeB})`
              })
            }
          }
        }
      }

      // Against external campus sessions
      for (const extSess of externalSessions) {
        if (extSess.days.length === 0 || !extSess.startTime || !extSess.endTime) continue

        const commonDays = sessA.days.filter(d => extSess.days.includes(d))
        if (commonDays.length === 0) continue

        if (!timeRangesOverlap(sessA.startTime, sessA.endTime, extSess.startTime, extSess.endTime)) continue

        // A. Room Conflict with external
        if (sessA.roomId && extSess.roomId && sessA.roomId === extSess.roomId) {
          const roomCode = getRoomName(sessA.roomId)
          const daysStr = commonDays.join(', ')
          const timeStr = `${extSess.startTime}â€“${extSess.endTime}`
          const deptStr = extSess.department || 'Other Dept'
          const msg = `Room ${roomCode} is already booked by ${deptStr} on ${daysStr} (${timeStr})`

          if (sessA.sessionNum === 1) {
            conflictsMap[sessA.rowIndex].hasRoomConflict1 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails1.includes(msg)) conflictsMap[sessA.rowIndex].roomConflictDetails1.push(msg)
          } else {
            conflictsMap[sessA.rowIndex].hasRoomConflict2 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails2.includes(msg)) conflictsMap[sessA.rowIndex].roomConflictDetails2.push(msg)
          }

          allConflictItems.push({
            rowIndex: sessA.rowIndex,
            subject: sessA.subjectCode,
            section: sessA.classSection,
            type: 'room',
            sessionNum: sessA.sessionNum,
            conflictTarget: `Room ${roomCode}`,
            message: `Already booked by ${deptStr} on ${daysStr} (${timeStr})`
          })
        }

        // B. Instructor Conflict with external (skip parallel children since parent row handles it)
        if (!sessA.parentId && sessA.instructorId && extSess.instructorId && sessA.instructorId === extSess.instructorId) {
          const instName = getInstructorName(sessA.instructorId)
          const daysStr = commonDays.join(', ')
          const timeStr = `${extSess.startTime}â€“${extSess.endTime}`
          const deptStr = extSess.department || 'Other Dept'
          const msg = `${instName} is already assigned in ${deptStr} on ${daysStr} (${timeStr})`

          const targetIndices = [sessA.rowIndex]
          if (sessA.type === 'parallel' && !sessA.parentId) {
            inTableSessions.forEach(s => {
              if (s.parentId === sessA.rowId) targetIndices.push(s.rowIndex)
            })
          }
          targetIndices.forEach(rIdx => {
            if (sessA.sessionNum === 1) {
              conflictsMap[rIdx].hasInstructorConflict1 = true
              if (!conflictsMap[rIdx].instructorConflictDetails1.includes(msg)) {
                conflictsMap[rIdx].instructorConflictDetails1.push(msg)
              }
            } else {
              conflictsMap[rIdx].hasInstructorConflict2 = true
              if (!conflictsMap[rIdx].instructorConflictDetails2.includes(msg)) {
                conflictsMap[rIdx].instructorConflictDetails2.push(msg)
              }
            }
          })

          const alreadyAdded = allConflictItems.some(
            item => item.rowIndex === sessA.rowIndex && item.type === 'instructor' && item.message === msg
          )
          if (!alreadyAdded) {
            allConflictItems.push({
              rowIndex: sessA.rowIndex,
              subject: sessA.subjectCode || 'Class',
              section: sessA.classSection,
              type: 'instructor',
              sessionNum: sessA.sessionNum,
              conflictTarget: instName,
              message: `Already assigned in ${deptStr} on ${daysStr} (${timeStr})`
            })
          }
        }
      }
    }

    // 6. Check for duplicate Subject Code / Subject Title assigned to the same Section
    for (let i = 0; i < schedules.length; i++) {
      const rowA = schedules[i]
      const secA = (rowA.classSection || '').trim().toUpperCase()
      const codeA = (rowA.subjectCode || '').trim().toUpperCase()
      const titleA = (rowA.subjectTitle || '').trim().toLowerCase()
      if (!secA || (!codeA && !titleA)) continue

      // Against other rows in the table
      for (let j = i + 1; j < schedules.length; j++) {
        const rowB = schedules[j]
        const secB = (rowB.classSection || '').trim().toUpperCase()
        const codeB = (rowB.subjectCode || '').trim().toUpperCase()
        const titleB = (rowB.subjectTitle || '').trim().toLowerCase()
        if (!secB || (!codeB && !titleB)) continue

        if (secA === secB) {
          const matchCode = codeA && codeB && codeA === codeB
          const matchTitle = titleA && titleB && titleA === titleB

          if (matchCode || matchTitle) {
            const subjectDisplay = matchCode ? codeA : (rowA.subjectTitle || 'this subject')
            const msgA = `Section "${secA}" already has ${subjectDisplay} on Row #${j + 1}`
            const msgB = `Section "${secB}" already has ${subjectDisplay} on Row #${i + 1}`

            conflictsMap[i].hasSectionConflict = true
            if (!conflictsMap[i].sectionConflictDetails.includes(msgA)) {
              conflictsMap[i].sectionConflictDetails.push(msgA)
            }

            conflictsMap[j].hasSectionConflict = true
            if (!conflictsMap[j].sectionConflictDetails.includes(msgB)) {
              conflictsMap[j].sectionConflictDetails.push(msgB)
            }

            allConflictItems.push({
              rowIndex: i,
              subject: rowA.subjectCode || rowA.subjectTitle || 'Class',
              section: secA,
              type: 'section',
              sessionNum: 1,
              conflictTarget: `Section ${secA}`,
              message: `Duplicate subject "${subjectDisplay}" assigned on both Row #${i + 1} and Row #${j + 1}`
            })
          }
        }
      }

      // Against external saved schedules in this department (for same academicYear & semester)
      for (const extSess of externalSessions) {
        if (!departmentInfo?.code || extSess.department !== departmentInfo.code) continue
        const extSec = (extSess.classSection || '').trim().toUpperCase()
        const extCode = (extSess.subjectCode || '').trim().toUpperCase()
        const extTitle = (extSess.subjectTitle || '').trim().toLowerCase()
        if (!extSec || (!extCode && !extTitle)) continue

        if (secA === extSec) {
          const matchCode = codeA && extCode && codeA === extCode
          const matchTitle = titleA && extTitle && titleA === extTitle

          if (matchCode || matchTitle) {
            const subjectDisplay = matchCode ? codeA : (rowA.subjectTitle || 'this subject')
            const msg = `Section "${secA}" already has ${subjectDisplay} in department records`

            conflictsMap[i].hasSectionConflict = true
            if (!conflictsMap[i].sectionConflictDetails.includes(msg)) {
              conflictsMap[i].sectionConflictDetails.push(msg)
            }

            allConflictItems.push({
              rowIndex: i,
              subject: rowA.subjectCode || rowA.subjectTitle || 'Class',
              section: secA,
              type: 'section',
              sessionNum: 1,
              conflictTarget: `Section ${secA}`,
              message: `Duplicate subject "${subjectDisplay}" already exists in department records`
            })
          }
        }
      }
    }

    // 7. Check for Missing / Incomplete required fields on all schedule rows
    schedules.forEach((schedule, idx) => {
      const isChild = !!schedule.parentId
      const parentSchedule = isChild ? schedules.find(s => s.id === schedule.parentId) : null
      const parentHasRoom2 = parentSchedule ? !!(parentSchedule as any).roomId2 : false
      const isParallelSameTime = !!(schedule as any).startTime2 && schedule.startTime === (schedule as any).startTime2 && !!(schedule as any).instructorId2
      const isSecondSessionUnlocked = !!(schedule as any).format2 || schedule.type === 'open lab'

      const missingInstructor2 = isSecondSessionUnlocked && !!schedule.instructorId && !(schedule as any).instructorId2;
      const missingBuilding2 = isSecondSessionUnlocked && !!schedule.buildingId && !(schedule as any).buildingId2;
      const missingRoom1 = !!schedule.buildingId && !schedule.roomId;
      const missingRoom2 = isSecondSessionUnlocked && ((!!schedule.roomId && !(schedule as any).roomId2) || (!!(schedule as any).buildingId2 && !(schedule as any).roomId2) || (isParallelSameTime && schedule.days.length === 1 && !!schedule.buildingId && !(schedule as any).roomId2) || (isChild && parentHasRoom2 && !(schedule as any).roomId2));
      const missingFormat2 = schedule.type !== 'open lab' && !!schedule.format && !(schedule as any).format2;
      const missingDay2 = isSecondSessionUnlocked && ((schedule.days.length > 0 && schedule.days.length < 2) || (!!(schedule as any).startTime2 && schedule.startTime === (schedule as any).startTime2 && schedule.days.length < 2 && !isParallelSameTime));
      const missingTime2 = isSecondSessionUnlocked && !!schedule.startTime && !(schedule as any).startTime2;

      const rowMissingIssues: string[] = []

      if (isChild) {
        if (!schedule.classSection) rowMissingIssues.push('Missing Section')
        if (!schedule.roomId) rowMissingIssues.push('Missing Room')
        if (missingRoom2) rowMissingIssues.push('Missing 2nd Session Room')
      } else {
        if (!schedule.type) rowMissingIssues.push('Missing Schedule Type')
        if (schedule.type !== 'open lab' && !schedule.format) rowMissingIssues.push('Missing Format')
        if (missingFormat2) rowMissingIssues.push('Missing 2nd Session Format')
        if (!schedule.subjectCode) rowMissingIssues.push('Missing Subject Code')
        if (!hideTitleColumn && !schedule.subjectTitle) rowMissingIssues.push('Missing Subject Title')
        if (!schedule.classSection) rowMissingIssues.push('Missing Section')
        if (!schedule.instructorId) rowMissingIssues.push('Missing Instructor')
        if (missingInstructor2) rowMissingIssues.push('Missing 2nd Session Instructor')
        if (!schedule.startTime || !schedule.endTime) rowMissingIssues.push('Missing Time')
        if (missingTime2) rowMissingIssues.push('Missing 2nd Session Time')
        if (!schedule.days || schedule.days.length === 0) rowMissingIssues.push('Missing Day')
        if (missingDay2) rowMissingIssues.push('Missing 2nd Session Day')
        if (!schedule.buildingId) rowMissingIssues.push('Missing Building')
        if (missingBuilding2) rowMissingIssues.push('Missing 2nd Session Building')
        if (missingRoom1 || !schedule.roomId) rowMissingIssues.push('Missing Room')
        if (missingRoom2) rowMissingIssues.push('Missing 2nd Session Room')
      }

      rowMissingIssues.forEach(issueMsg => {
        allConflictItems.push({
          rowIndex: idx,
          subject: schedule.subjectCode || schedule.subjectTitle || 'Class',
          section: schedule.classSection || '',
          type: 'missing',
          sessionNum: 1,
          conflictTarget: schedule.subjectCode || schedule.subjectTitle || `Row #${idx + 1}`,
          message: issueMsg
        })
      })
    })

    const overlapConflicts = allConflictItems.filter(c => c.type === 'room' || c.type === 'instructor')
    const sectionConflicts = allConflictItems.filter(c => c.type === 'section')
    const missingConflicts = allConflictItems.filter(c => c.type === 'missing')

    const overlapCount = overlapConflicts.length
    const sectionCount = sectionConflicts.length
    const missingCount = missingConflicts.length
    const hardConflictsCount = overlapCount + sectionCount
    const totalConflicts = allConflictItems.length

    return {
      conflictsMap,
      allConflictItems,
      overlapConflicts,
      sectionConflicts,
      missingConflicts,
      overlapCount,
      sectionCount,
      missingCount,
      hardConflictsCount,
      totalConflicts
    }
  }, [schedules, allCampusSchedules, rooms, members, departmentInfo?.code, deletedScheduleIds])

  const handleScheduleChange = (index: number, field: string, value: any) => {
    if (typeof value === 'string' && (field === 'subjectCode' || field === 'classSection')) {
      value = value.toUpperCase();
    }
    if (field === 'subjectTitle' && typeof value === 'string') {
      const smallWords = /^(a|an|and|as|at|but|by|en|for|if|in|nor|of|on|or|per|the|to|v.?|vs.?|via)$/i;
      value = value.split(' ').map((word, idx) => {
        if (idx !== 0 && smallWords.test(word)) {
          return word.toLowerCase();
        }
        if (word.length > 0) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      }).join(' ');
    }
    if (field === 'type') {
      const currentType = schedules[index].type
      if ((value === 'parallel' && currentType !== 'parallel') ||
        (value !== 'parallel' && currentType === 'parallel')) {
        setPendingTypeChange({ index, newType: value })
        return
      }
    }

    setSchedules(prev => {
      let updated = [...prev]
      const current = updated[index]
      updated[index] = { ...current, [field]: value }


      if (field === 'type') {
        if (value === 'open lab') {
          updated[index].format = 'Flexible'
        } else if (current.type === 'open lab' && value !== 'open lab') {
          updated[index].format = ''
        }
      }

      if (field === 'instructorId2' && value && updated[index].startTime) {
        updated[index].endTime = calculateEndTime(updated[index].startTime, 90);
      }

      if (field === 'startTime' || field === 'endTime') {
        const newDur = getDurationMins(updated[index].startTime, updated[index].endTime);
        if (newDur === 180 && updated[index].days && updated[index].days.length > 1) {
          updated[index].days = [updated[index].days[0]];
        }
      }

      if (['startTime', 'startTime2', 'instructorId', 'instructorId2'].includes(field)) {
        const sched = updated[index];
        const isSameTime = !!(sched as any).startTime2 && sched.startTime === (sched as any).startTime2;
        const isSameInstructor = !(sched as any).instructorId2 || (sched as any).instructorId2 === sched.instructorId;
        if (isSameTime && isSameInstructor && sched.days && sched.days.length > 1 && sched.days[0] === sched.days[1]) {
          updated[index].days = [sched.days[0]];
        }
      }

      if (field === 'status') {
        if (!current.parentId && current.type === 'parallel') {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], status: value };
            }
          }
        }
      }

      // Value change status transitions
      if (field !== 'status') {
        if (onlyAllowDraftEditing) {
          const isReturn = current.status === 'Return' || current.status === 'Returned' || current.status === 'Removed';
          const isPlotInRevision = selectedSemesterPhase?.phase === 'Revision' && (current.status === 'Plot' || current.status === 'Plotted');
          
          if (isReturn || isPlotInRevision) {
            updated[index] = { ...updated[index], status: 'Draft' };
            if (!current.parentId && current.type === 'parallel') {
              for (let i = 0; i < updated.length; i++) {
                if (updated[i].parentId === current.id) {
                  updated[i] = { ...updated[i], status: 'Draft' };
                }
              }
            } else if (current.parentId) {
              const parentIdx = updated.findIndex(s => s.id === current.parentId);
              if (parentIdx !== -1) {
                updated[parentIdx] = { ...updated[parentIdx], status: 'Draft' };
              }
            }
          }
        } else {
          if (updated[index].status !== 'Revising') {
            updated[index] = { ...updated[index], status: 'Revising' };
            if (!current.parentId && current.type === 'parallel') {
              for (let i = 0; i < updated.length; i++) {
                if (updated[i].parentId === current.id) {
                  updated[i] = { ...updated[i], status: 'Revising' };
                }
              }
            } else if (current.parentId) {
              const parentIdx = updated.findIndex(s => s.id === current.parentId);
              if (parentIdx !== -1) {
                updated[parentIdx] = { ...updated[parentIdx], status: 'Revising' };
              }
            }
          }
        }
      }

      if (!current.parentId && current.type === 'parallel') {
        const fieldsToCopy = [
          'instructorId', 'instructorId2',
          'subjectCode', 'subjectTitle',
          'format', 'format2',
          'startTime', 'startTime2',
          'endTime', 'endTime2',
          'days',
          'buildingId', 'buildingId2'
        ]
        if (fieldsToCopy.includes(field)) {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], [field]: (updated[index] as any)[field] !== undefined ? (updated[index] as any)[field] : value }
              if ((field === 'startTime' || field === 'endTime') && updated[index].days && updated[index].days.length !== (current.days ? current.days.length : 0)) {
                updated[i] = { ...updated[i], days: updated[index].days }
              }
              if (field === 'buildingId') {
                updated[i] = { ...updated[i], roomId: '' }
              } else if (field === 'buildingId2') {
                updated[i] = { ...updated[i], roomId2: '' }
              }
            }
          }
        } else if (field === 'roomId') {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], roomId: '' }
            }
          }
        } else if (field === 'roomId2') {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], roomId2: '' }
            }
          }
        }
      }

      return updated
    })
  }

  const handleDayChange = (index: number, dayIndex: number, val: string) => {
    setSchedules(prev => {
      const updated = [...prev]
      const current = updated[index]
      let newDays = [...current.days]
      const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

      if (dayIndex === 0) {
        if (!val) {
          newDays = []
        } else {
          newDays[0] = val
        }
      } else if (dayIndex === 1) {
        if (!val) {
          newDays = [newDays[0]].filter(Boolean)
        } else {
          if (newDays.length === 0) {
            newDays = [val]
          } else {
            newDays[1] = val
          }
        }
      }

      newDays = newDays.filter(Boolean).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))

      updated[index] = { ...current, days: newDays }

      if (!current.parentId && current.type === 'parallel') {
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].parentId === current.id) {
            updated[i] = { ...updated[i], days: newDays }
          }
        }
      }

      // Value change status transitions
      if (onlyAllowDraftEditing) {
        if (current.status === 'Return' || current.status === 'Returned' || current.status === 'Removed') {
          updated[index] = { ...updated[index], status: 'Draft' };
          if (!current.parentId && current.type === 'parallel') {
            for (let i = 0; i < updated.length; i++) {
              if (updated[i].parentId === current.id) {
                updated[i] = { ...updated[i], status: 'Draft' };
              }
            }
          } else if (current.parentId) {
            const parentIdx = updated.findIndex(s => s.id === current.parentId);
            if (parentIdx !== -1) {
              updated[parentIdx] = { ...updated[parentIdx], status: 'Draft' };
            }
          }
        }
      } else {
        if (updated[index].status !== 'Revising') {
          updated[index] = { ...updated[index], status: 'Revising' };
          if (!current.parentId && current.type === 'parallel') {
            for (let i = 0; i < updated.length; i++) {
              if (updated[i].parentId === current.id) {
                updated[i] = { ...updated[i], status: 'Revising' };
              }
            }
          } else if (current.parentId) {
            const parentIdx = updated.findIndex(s => s.id === current.parentId);
            if (parentIdx !== -1) {
              updated[parentIdx] = { ...updated[parentIdx], status: 'Revising' };
            }
          }
        }
      }

      return updated
    })
  }

  const confirmTypeChange = () => {
    if (!pendingTypeChange) return;
    const { index, newType } = pendingTypeChange;

    setSchedules(prev => {
      const updated = [...prev];
      const current = updated[index];
      const parentId = current.id || generateId();
      if (!current.id) updated[index].id = parentId;

      const targetStatus = onlyAllowDraftEditing
        ? (current.status === 'Return' || current.status === 'Returned' || current.status === 'Removed' ? 'Draft' : (current.status || 'Draft'))
        : 'Revising';

      if (newType === 'parallel') {
        updated[index] = { ...current, type: 'parallel', status: targetStatus };
        if (current.type === 'open lab') {
          updated[index].format = '';
        }

        const cachedChildren = parallelChildrenCache.current.get(current.id) || parallelChildrenCache.current.get(parentId);
        let childrenToInsert: any[];

        if (cachedChildren && cachedChildren.length > 0) {
          childrenToInsert = cachedChildren.map((cachedChild) => ({
            ...cachedChild,
            parentId: current.id,
            type: 'parallel',
            instructorId: current.instructorId,
            instructorId2: (current as any).instructorId2 || '',
            subjectCode: current.subjectCode,
            subjectTitle: current.subjectTitle,
            format: updated[index].format,
            format2: (updated[index] as any).format2 || '',
            startTime: current.startTime,
            startTime2: (current as any).startTime2 || '',
            endTime: current.endTime,
            endTime2: (current as any).endTime2 || '',
            days: current.days,
            buildingId: current.buildingId,
            buildingId2: (current as any).buildingId2 || '',
            classSection: cachedChild.classSection || '',
            status: targetStatus
          }));

          // Un-stage restored children docIds from deletedScheduleIds
          const restoredDocIds = new Set(
            childrenToInsert.flatMap(s => [(s as any).docId, (s as any).childDocId]).filter(Boolean)
          );
          if (restoredDocIds.size > 0) {
            setDeletedScheduleIds(dPrev => dPrev.filter(id => !restoredDocIds.has(id)));
          }
        } else {
          childrenToInsert = Array.from({ length: 3 }).map(() => ({
            ...createDefaultSchedule(),
            parentId: current.id,
            type: 'parallel',
            classSection: '',
            instructorId: current.instructorId,
            instructorId2: (current as any).instructorId2 || '',
            subjectCode: current.subjectCode,
            subjectTitle: current.subjectTitle,
            format: updated[index].format,
            format2: (updated[index] as any).format2 || '',
            startTime: current.startTime,
            startTime2: (current as any).startTime2 || '',
            endTime: current.endTime,
            endTime2: (current as any).endTime2 || '',
            days: current.days,
            buildingId: current.buildingId,
            buildingId2: (current as any).buildingId2 || '',
            status: targetStatus
          }));
        }

        updated.splice(index + 1, 0, ...childrenToInsert);
      } else {
        updated[index] = { ...current, type: newType, status: targetStatus };
        if (newType === 'open lab') {
          updated[index].format = 'Flexible';
        } else if (current.type === 'open lab') {
          updated[index].format = '';
        }

        const childrenBeingRemoved = updated.filter(s => s.parentId === current.id);
        if (childrenBeingRemoved.length > 0) {
          parallelChildrenCache.current.set(current.id, childrenBeingRemoved);
          const removedDocIds = childrenBeingRemoved.flatMap(s => [(s as any).docId, (s as any).childDocId]).filter(Boolean);
          if (removedDocIds.length > 0) {
            setDeletedScheduleIds(dPrev => Array.from(new Set([...dPrev, ...removedDocIds])));
          }
        }

        const finalUpdated = updated.filter(s => s.parentId !== current.id);
        return finalUpdated.map((s, idx) => ({ ...s, orderIndex: idx }));
      }
      return updated.map((s, idx) => ({ ...s, orderIndex: idx }));
    });
    setPendingTypeChange(null);
  };

  const executeBulkRemove = () => {
    if (selectedScheduleIds.length === 0) {
      setIsRemoveMode(false);
      return;
    }
    setSchedules(prev => {
      const removedSchedules = prev.filter(s => selectedScheduleIds.includes(s.id) || (s.parentId && selectedScheduleIds.includes(s.parentId)));
      const removedDocIds = removedSchedules.flatMap(s => [(s as any).docId, (s as any).childDocId]).filter(Boolean);
      if (removedDocIds.length > 0) {
        setDeletedScheduleIds(current => [...current, ...removedDocIds]);
      }
      const remaining = prev.filter(s => !selectedScheduleIds.includes(s.id) && (!s.parentId || !selectedScheduleIds.includes(s.parentId)));
      return remaining.map((s, idx) => ({ ...s, orderIndex: idx }));
    });
    setSelectedScheduleIds([]);
    setIsRemoveMode(false);
  }

  const handleUndoSchedule = (index: number) => {
    const target = schedules[index];
    if (!target) return;

    const parentId = target.parentId || target.id;
    const originalParent = originalSchedulesMap.current.get(parentId);

    const changedKeys = new Set<string>();

    const checkScheduleDiff = (currentSched: any, origSched: any) => {
      if (!currentSched || !origSched) return;
      const sId = currentSched.id;
      if (currentSched.type !== origSched.type) changedKeys.add(`${sId}_type`);
      if (currentSched.format !== origSched.format || (currentSched as any).format2 !== (origSched as any).format2) changedKeys.add(`${sId}_format`);
      if (currentSched.subjectCode !== origSched.subjectCode) changedKeys.add(`${sId}_subjectCode`);
      if (currentSched.subjectTitle !== origSched.subjectTitle) changedKeys.add(`${sId}_subjectTitle`);
      if (currentSched.classSection !== origSched.classSection) changedKeys.add(`${sId}_classSection`);
      if (currentSched.instructorId !== origSched.instructorId || (currentSched as any).instructorId2 !== (origSched as any).instructorId2) changedKeys.add(`${sId}_instructorId`);
      if (
        currentSched.startTime !== origSched.startTime ||
        currentSched.endTime !== origSched.endTime ||
        (currentSched as any).startTime2 !== (origSched as any).startTime2 ||
        (currentSched as any).endTime2 !== (origSched as any).endTime2
      ) changedKeys.add(`${sId}_time`);
      if (JSON.stringify(currentSched.days || []) !== JSON.stringify(origSched.days || [])) changedKeys.add(`${sId}_days`);
      if (currentSched.buildingId !== origSched.buildingId || (currentSched as any).buildingId2 !== (origSched as any).buildingId2) changedKeys.add(`${sId}_buildingId`);
      if (currentSched.roomId !== origSched.roomId || (currentSched as any).roomId2 !== (origSched as any).roomId2) changedKeys.add(`${sId}_roomId`);
    };

    if (target.type === 'parallel' || target.parentId) {
      if (originalParent) {
        const parentSchedule = schedules.find(s => s.id === parentId);
        if (parentSchedule) checkScheduleDiff(parentSchedule, originalParent);

        schedules.forEach(s => {
          if (s.parentId === parentId) {
            const origChild = originalSchedulesMap.current.get(s.id);
            if (origChild) checkScheduleDiff(s, origChild);
          }
        });
      }
    } else {
      const original = originalSchedulesMap.current.get(target.id);
      if (original) {
        checkScheduleDiff(target, original);
      } else {
        const defaultSched = createDefaultSchedule();
        checkScheduleDiff(target, { ...defaultSched, id: target.id, orderIndex: target.orderIndex, status: 'Draft' });
      }
    }

    if (changedKeys.size > 0) {
      setRevertedCellKeys(changedKeys);
      if (undoHighlightTimeoutRef.current) {
        clearTimeout(undoHighlightTimeoutRef.current);
      }
      undoHighlightTimeoutRef.current = setTimeout(() => {
        setRevertedCellKeys(new Set());
      }, 1000);
    }

    setSchedules(prev => {
      const updated = [...prev];
      const targetSched = updated[index];
      if (!targetSched) return prev;

      const isUndoingPlotOrReturn = targetSched.status === 'Plot' || targetSched.status === 'Plotted' || targetSched.status === 'Return' || targetSched.status === 'Returned';

      if (targetSched.type === 'parallel' || targetSched.parentId) {
        if (originalParent) {
          const parentIdx = updated.findIndex(s => s.id === parentId);
          if (parentIdx !== -1) {
            const restoredStatus = isUndoingPlotOrReturn ? 'Draft' : (originalParent.status || 'Draft');
            updated[parentIdx] = {
              ...JSON.parse(JSON.stringify(originalParent)),
              status: restoredStatus
            };
          }
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === parentId) {
              const origChild = originalSchedulesMap.current.get(updated[i].id);
              const restoredChildStatus = isUndoingPlotOrReturn ? 'Draft' : (origChild?.status || originalParent.status || 'Draft');
              if (origChild) {
                updated[i] = {
                  ...JSON.parse(JSON.stringify(origChild)),
                  status: restoredChildStatus
                };
              } else {
                updated[i] = {
                  ...updated[i],
                  status: restoredChildStatus
                };
              }
            }
          }
        } else {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].id === parentId || updated[i].parentId === parentId) {
              updated[i] = { ...updated[i], status: 'Draft' };
            }
          }
        }
      } else {
        const original = originalSchedulesMap.current.get(targetSched.id);
        if (original) {
          const restoredStatus = isUndoingPlotOrReturn ? 'Draft' : (original.status || 'Draft');
          updated[index] = {
            ...JSON.parse(JSON.stringify(original)),
            status: restoredStatus
          };
        } else {
          updated[index] = {
            ...createDefaultSchedule(),
            id: targetSched.id,
            orderIndex: targetSched.orderIndex,
            status: 'Draft'
          };
        }
      }

      return updated.map((s, idx) => ({ ...s, orderIndex: idx }));
    });
  };

  const handlePlotSelected = () => {
    setSchedules(prev => {
      const updated = prev.map((s, idx) => {
        if (selectedScheduleIds.includes(s.id) || (s.parentId && selectedScheduleIds.includes(s.parentId))) {
          const conflict = scheduleConflicts.conflictsMap[idx];
          const hasHardConflict = conflict?.hasRoomConflict1 || conflict?.hasRoomConflict2 || conflict?.hasInstructorConflict1 || conflict?.hasInstructorConflict2;
          if (s.status !== 'Return' && !hasHardConflict && s.subjectCode && s.classSection) {
            return { ...s, status: 'Plot' };
          }
        }
        return s;
      });
      return updated.map((s, idx) => ({ ...s, orderIndex: idx }));
    });
    setSelectedScheduleIds([]);
    setIsPlotMode(false);
  };

  const handleDropdownPosition = (e: React.MouseEvent<HTMLElement>) => {
    hideCustomTooltip();
    const summary = e.currentTarget;
    const rect = summary.getBoundingClientRect();
    const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement;
    if (dropdown) {
      if (window.innerHeight - rect.bottom < 350) {
        dropdown.style.top = 'auto';
        dropdown.style.bottom = '100%';
        dropdown.style.marginTop = '0';
        dropdown.style.marginBottom = '4px';
      } else {
        dropdown.style.top = '100%';
        dropdown.style.bottom = 'auto';
        dropdown.style.marginTop = '4px';
        dropdown.style.marginBottom = '0';
      }
    }
  }

  const handleSaveSchedules = async () => {
    const isStrictPhase = selectedSemesterPhase?.phase !== 'Drafting';
    if (scheduleConflicts.hardConflictsCount > 0 || (isStrictPhase && scheduleConflicts.missingCount > 0)) {
      setConflictModalTab(scheduleConflicts.hardConflictsCount > 0 ? 'all' : 'missing')
      setIsConflictSummaryModalOpen(true)
      return
    }
    const validSchedules = schedules.filter(s => s.type || s.subjectCode || (s as any).docId)
    if (validSchedules.length === 0 && deletedScheduleIds.length === 0) {
      onClose()
      return
    }

    setIsSubmittingSchedules(true)

    const getMemberName = (id: string) => {
      if (!id) return 'None';
      const m = members.find(member => (member as any).membershipId === id || member.id === id || (member as any).uid === id || (member as any).userId === id);
      if (!m) return id;
      return m.name || (m as any).fullName || (m as any).displayName || id;
    };
    const getRoomName = (id: string) => {
      if (!id) return 'None';
      const r = rooms.find(room => room.id === id);
      if (!r) return id;
      return r.name || id;
    };
    const getBuildingName = (id: string) => {
      if (!id) return 'None';
      const b = buildings.find(building => building.id === id);
      if (!b) return id;
      return b.code || b.name || id;
    };

    const generateRevisionChanges = (current: any, original: any): string[] => {
      const prevList: string[] = Array.isArray(original?.revisionChanges) ? [...original.revisionChanges] : [];
      if (!original) return prevList;

      const s1 = " 1st session";
      const s2 = " 2nd session";

      const fields: {
        label: string;
        initialFrom: string;
        currentTo: string;
        isChanged: boolean;
      }[] = [
        {
          label: "Subject code",
          initialFrom: original.subjectCode || 'None',
          currentTo: current.subjectCode || 'None',
          isChanged: (current.subjectCode || '') !== (original.subjectCode || '')
        },
        {
          label: "Subject title",
          initialFrom: original.subjectTitle || 'None',
          currentTo: current.subjectTitle || 'None',
          isChanged: (current.subjectTitle || '') !== (original.subjectTitle || '')
        },
        {
          label: "Section",
          initialFrom: original.classSection || 'None',
          currentTo: current.classSection || 'None',
          isChanged: (current.classSection || '') !== (original.classSection || '')
        },
        // 1st Session
        {
          label: `Days${s1}`,
          initialFrom: original.days?.[0] || 'None',
          currentTo: current.days?.[0] || 'None',
          isChanged: (current.days?.[0] || '') !== (original.days?.[0] || '')
        },
        {
          label: `Time${s1}`,
          initialFrom: original.startTime ? `${original.startTime} - ${original.endTime || ''}` : 'None',
          currentTo: current.startTime ? `${current.startTime} - ${current.endTime || ''}` : 'None',
          isChanged: (current.startTime || '') !== (original.startTime || '') || (current.endTime || '') !== (original.endTime || '')
        },
        {
          label: `Building${s1}`,
          initialFrom: getBuildingName(original.buildingId),
          currentTo: getBuildingName(current.buildingId),
          isChanged: (current.buildingId || '') !== (original.buildingId || '')
        },
        {
          label: `Room${s1}`,
          initialFrom: getRoomName(original.roomId),
          currentTo: getRoomName(current.roomId),
          isChanged: (current.roomId || '') !== (original.roomId || '')
        },
        {
          label: `Instructor${s1}`,
          initialFrom: getMemberName(original.instructorId),
          currentTo: getMemberName(current.instructorId),
          isChanged: (current.instructorId || '') !== (original.instructorId || '')
        },
        {
          label: `Format${s1}`,
          initialFrom: original.format || 'None',
          currentTo: current.format || 'None',
          isChanged: (current.format || '') !== (original.format || '')
        },
        // 2nd Session
        {
          label: `Days${s2}`,
          initialFrom: original.days?.[1] || 'None',
          currentTo: current.days?.[1] || 'None',
          isChanged: (current.days?.[1] || '') !== (original.days?.[1] || '')
        },
        {
          label: `Time${s2}`,
          initialFrom: original.startTime2 ? `${original.startTime2} - ${original.endTime2 || ''}` : 'None',
          currentTo: current.startTime2 ? `${current.startTime2} - ${current.endTime2 || ''}` : 'None',
          isChanged: (current.startTime2 || '') !== (original.startTime2 || '') || (current.endTime2 || '') !== (original.endTime2 || '')
        },
        {
          label: `Building${s2}`,
          initialFrom: getBuildingName(original.buildingId2),
          currentTo: getBuildingName(current.buildingId2),
          isChanged: (current.buildingId2 || '') !== (original.buildingId2 || '')
        },
        {
          label: `Room${s2}`,
          initialFrom: getRoomName(original.roomId2),
          currentTo: getRoomName(current.roomId2),
          isChanged: (current.roomId2 || '') !== (original.roomId2 || '')
        },
        {
          label: `Instructor${s2}`,
          initialFrom: getMemberName(original.instructorId2),
          currentTo: getMemberName(current.instructorId2),
          isChanged: (current.instructorId2 || '') !== (original.instructorId2 || '')
        },
        {
          label: `Format${s2}`,
          initialFrom: original.format2 || 'None',
          currentTo: current.format2 || 'None',
          isChanged: (current.format2 || '') !== (original.format2 || '')
        }
      ];

      const resultList = [...prevList];

      fields.forEach(f => {
        const prefix = `${f.label} revised from `;
        const existingIdx = resultList.findIndex(item => item.startsWith(prefix));

        if (existingIdx !== -1) {
          const existingStr = resultList[existingIdx];
          const withoutPrefix = existingStr.substring(prefix.length);
          const lastToIdx = withoutPrefix.lastIndexOf(' to ');
          const originalFrom = lastToIdx !== -1 ? withoutPrefix.substring(0, lastToIdx) : withoutPrefix;

          if (originalFrom === f.currentTo) {
            resultList.splice(existingIdx, 1);
          } else {
            resultList[existingIdx] = `${f.label} revised from ${originalFrom} to ${f.currentTo}`;
          }
        } else if (f.isChanged && f.initialFrom !== f.currentTo) {
          resultList.push(`${f.label} revised from ${f.initialFrom} to ${f.currentTo}`);
        }
      });

      return combineSessionChanges(resultList);
    };

    try {
      const savePromises = validSchedules.flatMap((schedule, index) => {
        if (!(schedule as any).docId && !schedule.subjectCode && !schedule.type) return [];

        const isParallel = schedule.type === 'parallel';
        const groupId = isParallel ? (schedule.parentId || schedule.id) : null;

        const hasSecondDay = schedule.days.length === 2;
        const hasExplicitSecondSessionFields = !!(schedule as any).startTime2 ||
          !!(schedule as any).endTime2 ||
          !!(schedule as any).format2 ||
          !!(schedule as any).instructorId2 ||
          !!(schedule as any).buildingId2 ||
          !!(schedule as any).roomId2;
        const isSplit = hasSecondDay || hasExplicitSecondSessionFields;

        const parentScheduleDoc = schedule.parentId ? validSchedules.find(s => s.id === schedule.parentId) : null;

        const originalSchedule = originalSchedulesMap.current.get(schedule.id);
        const finalRevisionChanges = schedule.status === 'Revising'
          ? generateRevisionChanges(schedule, originalSchedule)
          : ((schedule as any).revisionChanges || originalSchedule?.revisionChanges || []);

        const data1 = {
          department: departmentInfo?.code || null,
          session: null,
          isSplitSession: isSplit,
          classSection: schedule.classSection || null,
          type: schedule.type || null,
          subjectCode: schedule.subjectCode || parentScheduleDoc?.subjectCode || null,
          subjectTitle: schedule.subjectTitle || parentScheduleDoc?.subjectTitle || null,
          format: schedule.format || null,
          startTime: schedule.startTime || null,
          endTime: schedule.endTime || null,
          days: schedule.days.length > 0 ? (hasSecondDay ? [schedule.days[0]] : schedule.days) : null,
          buildingId: schedule.buildingId || null,
          roomId: schedule.roomId || null,
          instructorId: schedule.instructorId || null,
          format2: (schedule as any).format2 || null,
          startTime2: (schedule as any).startTime2 || null,
          endTime2: (schedule as any).endTime2 || null,
          buildingId2: (schedule as any).buildingId2 || null,
          roomId2: (schedule as any).roomId2 || null,
          instructorId2: (schedule as any).instructorId2 || null,
          groupId: groupId,
          parentId: schedule.parentId || null,
          orderIndex: index,
          academicYear: selectedAcademicYear?.academicYear || '2026 - 2027',
          semester: selectedSemesterPhase?.name || '1st Semester',
          status: (schedule.status === 'Revising' || schedule.status === 'Revised' || schedule.status === 'Revise') ? 'Revise' : (schedule.status || 'Draft'),
          revisionChanges: finalRevisionChanges,
          updatedAt: serverTimestamp()
        };

        const promises = [];
        const parentDocId = (schedule as any).docId;

        if (parentDocId) {
          promises.push(updateDoc(doc(db, 'schedule', parentDocId), { ...data1, id: schedule.id }));
        } else {
          promises.push(addDoc(collection(db, 'schedule'), { ...data1, id: schedule.id, createdAt: serverTimestamp() }));
        }

        if (isSplit) {
          const data2 = {
            department: departmentInfo?.code || null,
            session: null,
            isSplitSession: true,
            classSection: schedule.classSection || null,
            type: schedule.type || null,
            subjectCode: schedule.subjectCode || null,
            subjectTitle: schedule.subjectTitle || null,
            format: (schedule as any).format2 || schedule.format || null,
            startTime: (schedule as any).startTime2 || schedule.startTime || null,
            endTime: (schedule as any).endTime2 || schedule.endTime || null,
            days: hasSecondDay ? [schedule.days[1]] : null,
            buildingId: (schedule as any).buildingId2 || null,
            roomId: (schedule as any).roomId2 || null,
            instructorId: (schedule as any).instructorId2 || null,
            groupId: groupId,
            parentId: schedule.id,
            orderIndex: index,
            academicYear: selectedAcademicYear?.academicYear || '2026 - 2027',
            semester: selectedSemesterPhase?.name || '1st Semester',
            status: (schedule.status === 'Revising' || schedule.status === 'Revised' || schedule.status === 'Revise') ? 'Revise' : (schedule.status || 'Draft'),
            revisionChanges: finalRevisionChanges,
            updatedAt: serverTimestamp()
          };

          const childDocId = (schedule as any).childDocId;
          if (childDocId) {
            promises.push(updateDoc(doc(db, 'schedule', childDocId), { ...data2, id: generateId() }));
          } else {
            promises.push(addDoc(collection(db, 'schedule'), { ...data2, id: generateId(), createdAt: serverTimestamp() }));
          }
        } else {
          const childDocId = (schedule as any).childDocId;
          if (childDocId) {
            promises.push(deleteDoc(doc(db, 'schedule', childDocId)));
          }
        }

        return promises;
      })

      const deletePromises = deletedScheduleIds.map(id => deleteDoc(doc(db, 'schedule', id)))

      await Promise.all([...savePromises, ...deletePromises])

      onClose()
      setSchedules([createDefaultSchedule()])
      setDeletedScheduleIds([])
    } catch (error) {
      console.error("Error saving schedules:", error)
    } finally {
      setIsSubmittingSchedules(false)
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes undo-cell-fade {
          0% {
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
        .animate-undo-highlight::after {
          content: "";
          position: absolute;
          inset: 0;
          background-color: #e3edda;
          mix-blend-mode: multiply;
          animation: undo-cell-fade 1000ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
          pointer-events: none;
          z-index: 10;
        }
      `}</style>
      {/* Main Schedule Modal */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div
          className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white rounded-t-2xl shrink-0 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-white">
                {selectedAcademicYear?.academicYear} - {selectedSemesterPhase?.name} Schedules
              </h3>
              <p className="mt-0.5 text-xs text-white/80 font-medium">
                {isEditable ? 'Add multiple schedules and assign them to instructors in your department.' : `Schedules can only be edited during ${editablePhases.length > 1 ? `${editablePhases.slice(0, -1).join(', ')}, and ${editablePhases[editablePhases.length - 1]}` : (editablePhases[0] || 'Drafting and Revision')} phases. Current phase: ${selectedSemesterPhase?.phase}.`}
              </p>
            </div>
            {!isEditable && (
              <div className="shrink-0 flex items-center">
                <span className="inline-flex items-center rounded-full bg-white/20 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white border border-white/30 backdrop-blur-sm">
                  Read Only ({selectedSemesterPhase?.phase})
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">
            <div className={`pointer-events-none absolute inset-0 z-[100] transition-shadow duration-300 ${isRemoveMode ? 'shadow-[inset_0_0_40px_rgba(244,63,94,0.3),inset_0_0_15px_rgba(244,63,94,0.2)]' : isPlotMode ? 'shadow-[inset_0_0_40px_rgba(16,185,129,0.2),inset_0_0_15px_rgba(16,185,129,0.15)]' : ''}`} />
            <div className="py-0 flex-1 overflow-auto flex flex-col [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
              <table className={`w-full text-left text-sm whitespace-nowrap min-w-max border-separate border-spacing-0 ${(isLoadingSchedules || schedules.length === 0) ? 'h-full flex-1' : ''}`}>
              <thead className="bg-gray-50 sticky top-0 z-20 text-gray-700 font-bold text-base shadow-sm">
                <tr>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-12 min-w-[3rem]">#</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[5.625rem]">Type</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[7.5rem]">Format</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[5.625rem]">Code</th>
                  {!hideTitleColumn && (
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[15rem]">Title</th>
                  )}
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[6.25rem]">Section</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[16.25rem] max-w-[16.25rem]">Instructor</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[15rem]">Time</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[8.5rem]">Days</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[8rem]">Building</th>
                  <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[11.25rem]">Room</th>
                  {!hideStatusColumn && (
                    <th className="p-2 border-b-2 text-center border-gray-300 bg-gray-50 min-w-[7.5rem]">Status</th>
                  )}
                </tr>
              </thead>
              <tbody ref={tbodyRef} className={`divide-y divide-gray-100 bg-white ${(isLoadingSchedules || schedules.length === 0) ? 'h-full' : ''}`}>
                {isLoadingSchedules ? (
                  <tr className="h-full">
                    <td colSpan={(hideTitleColumn ? 0 : 1) + (hideStatusColumn ? 0 : 1) + 10} className="p-0 border-none bg-white h-full align-middle">
                      <div className="sticky left-0 w-full h-full min-h-[30rem] flex flex-col items-center justify-center p-8 text-center">
                        <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                          <SpinnerIcon className="h-9 w-9 text-[var(--brand-color)] animate-spin" />
                          <p className="text-sm font-bold text-slate-700">Loading Schedules...</p>
                          <p className="text-xs text-slate-400">Retrieving department timetable records.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : schedules.length === 0 ? (
                  <tr className="h-full">
                    <td colSpan={(hideTitleColumn ? 0 : 1) + (hideStatusColumn ? 0 : 1) + 10} className="p-0 border-none bg-white h-full align-middle">
                      <div className="sticky left-0 w-full h-full min-h-[30rem] flex flex-col items-center justify-center p-8 text-center">
                        <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                          {isEditable ? (
                            <>
                              <div className="h-14 w-14 rounded-2xl bg-[var(--brand-color)]/10 flex items-center justify-center text-[var(--brand-color)] mb-3.5 shadow-sm border border-[var(--brand-color)]/20">
                                <CalendarIcon className="h-7 w-7" />
                              </div>
                              <h4 className="text-base font-extrabold text-slate-800 tracking-tight">
                                No Schedules Created Yet
                              </h4>
                              <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed text-center">
                                {hideAddRemoveButtons 
                                  ? `No schedules have been created for ${selectedAcademicYear?.academicYear || 'the academic year'} yet.`
                                  : `Start drafting the timetable for ${selectedAcademicYear?.academicYear || 'the academic year'} by adding your first subject row.`}
                              </p>
                              {!hideAddRemoveButtons && (
                                <button
                                  type="button"
                                  onClick={() => setSchedules([createDefaultSchedule()])}
                                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand-color)] hover:bg-[var(--brand-color-hover)] text-white text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer"
                                >
                                  <PlusIcon className="h-4 w-4" />
                                  <span>Add First Schedule Row</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3.5 border border-slate-200 shadow-sm">
                                <CalendarIcon className="h-7 w-7 text-slate-400" />
                              </div>
                              <h4 className="text-base font-extrabold text-slate-700 tracking-tight">
                                No Schedules Published
                              </h4>
                              <p className="text-xs text-slate-500 mt-1 mb-3.5 leading-relaxed text-center">
                                There are no schedule records available for this department in {selectedAcademicYear?.academicYear} - {selectedSemesterPhase?.name}.
                              </p>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                Read Only ({selectedSemesterPhase?.phase || 'Current Phase'})
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  schedules.map((schedule, index) => {
                    const conflict = scheduleConflicts.conflictsMap[index];
                    const isChild = !!schedule.parentId;
                    const isParallelChild = isChild;

                    const hasRoomConflict = !!(conflict?.hasRoomConflict1 || conflict?.hasRoomConflict2);
                    const rawHasInstructorConflict = !!(conflict?.hasInstructorConflict1 || conflict?.hasInstructorConflict2);
                    const hasInstructorConflict = isChild ? (rawHasInstructorConflict && hasRoomConflict) : rawHasInstructorConflict;
                    const hasSectionConflict = !!conflict?.hasSectionConflict;

                    const parentSchedule = isChild ? schedules.find(s => s.id === schedule.parentId) : null;
                    const parentHasRoom2 = parentSchedule ? !!(parentSchedule as any).roomId2 : false;

                    const isParallelSameTime = !!(schedule as any).startTime2 && schedule.startTime === (schedule as any).startTime2 && !!(schedule as any).instructorId2;
                    const missingRoom1 = !!schedule.buildingId && !schedule.roomId;
                    const isSecondSessionUnlocked = !!(schedule as any).format2 || schedule.type === 'open lab';
                    const missingInstructor2 = isSecondSessionUnlocked && !!schedule.instructorId && !(schedule as any).instructorId2;
                    const missingBuilding2 = isSecondSessionUnlocked && !!schedule.buildingId && !(schedule as any).buildingId2;
                    const missingRoom2 = isSecondSessionUnlocked && ((!!schedule.roomId && !(schedule as any).roomId2) || (!!(schedule as any).buildingId2 && !(schedule as any).roomId2) || (isParallelSameTime && schedule.days.length === 1 && !!schedule.buildingId && !(schedule as any).roomId2) || (isChild && parentHasRoom2 && !(schedule as any).roomId2));
                    const missingFormat2 = !!schedule.format && !(schedule as any).format2;
                    const missingDay2 = isSecondSessionUnlocked && ((schedule.days.length > 0 && schedule.days.length < 2) || (!!(schedule as any).startTime2 && schedule.startTime === (schedule as any).startTime2 && schedule.days.length < 2 && !isParallelSameTime));
                    const hasSecondSession = !!(schedule as any).instructorId2 || !!(schedule as any).roomId2 || !!(schedule as any).buildingId2 || !!(schedule as any).format2 || !!(schedule as any).startTime2;
                    const missingTime2 = isSecondSessionUnlocked && !!schedule.startTime && !(schedule as any).startTime2;

                    let childAvailableRooms = rooms;
                    if (schedule.buildingId) {
                      childAvailableRooms = rooms.filter(r => r.buildingId === schedule.buildingId);
                    }

                    if (isParallelChild) {
                      const groupRows = schedules.filter(s => s.id === schedule.parentId || s.parentId === schedule.parentId);
                      const selectedRoomCodes = groupRows
                        .filter(s => s.id !== schedule.id && s.roomId)
                        .map(s => {
                          const r = rooms.find(room => room.id === s.roomId);
                          return r ? r.code : null;
                        })
                        .filter(Boolean) as string[];

                      if (selectedRoomCodes.length > 0) {
                        const selectedNums = selectedRoomCodes.map(code => {
                          const match = code.match(/\d+/);
                          return match ? parseInt(match[0], 10) : null;
                        }).filter(n => n !== null) as number[];

                        childAvailableRooms = childAvailableRooms.filter(room => {
                          if (selectedRoomCodes.includes(room.code)) return false;

                          const roomNumMatch = room.code.match(/\d+/);
                          if (!roomNumMatch) return false;
                          const roomNum = parseInt(roomNumMatch[0], 10);

                          const allNums = [...selectedNums, roomNum];
                          const min = Math.min(...allNums);
                          const max = Math.max(...allNums);

                          return max - min === allNums.length - 1;
                        });
                      } else {
                        childAvailableRooms = [];
                      }
                    }

                    const availableRooms = childAvailableRooms.sort((a, b) => (a.name || a.code || '').localeCompare(b.name || b.code || '', undefined, { numeric: true, sensitivity: 'base' }));

                    let childAvailableRooms2 = rooms;
                    const bId2 = (schedule as any).buildingId2 || schedule.buildingId;
                    if (bId2) {
                      childAvailableRooms2 = rooms.filter(r => r.buildingId === bId2);
                    } else {
                      childAvailableRooms2 = [];
                    }

                    if (isParallelChild) {
                      const groupRows = schedules.filter(s => s.id === schedule.parentId || s.parentId === schedule.parentId);
                      const selectedRoomCodes2 = groupRows
                        .filter(s => s.id !== schedule.id && (s as any).roomId2)
                        .map(s => {
                          const r = rooms.find(room => room.id === (s as any).roomId2);
                          return r ? (r.code || r.name) : null;
                        })
                        .filter(Boolean) as string[];

                      if (selectedRoomCodes2.length > 0) {
                        const selectedNums2 = selectedRoomCodes2.map(code => {
                          const match = code.match(/\d+/);
                          return match ? parseInt(match[0], 10) : null;
                        }).filter(n => n !== null) as number[];

                        childAvailableRooms2 = childAvailableRooms2.filter(room => {
                          if (selectedRoomCodes2.includes(room.code) || selectedRoomCodes2.includes(room.name)) return false;

                          const roomNumMatch = (room.code || room.name).match(/\d+/);
                          if (!roomNumMatch) return false;
                          const roomNum = parseInt(roomNumMatch[0], 10);

                          const allNums = [...selectedNums2, roomNum];
                          const min = Math.min(...allNums);
                          const max = Math.max(...allNums);

                          return max - min === allNums.length - 1;
                        });
                      } else {
                        childAvailableRooms2 = [];
                      }
                    }

                    const availableRooms2 = childAvailableRooms2.sort((a, b) => (a.name || a.code || '').localeCompare(b.name || b.code || '', undefined, { numeric: true, sensitivity: 'base' }));

                    const isSelected = selectedScheduleIds.includes(schedule.id) || (!!schedule.parentId && selectedScheduleIds.includes(schedule.parentId));
                    const rowStatus = schedule.status || parentSchedule?.status || 'Draft';
                    const isPlotStatus = rowStatus === 'Plot' || rowStatus === 'Plotted';
                    const isRevising = rowStatus === 'Revising';
                    const isRevised = rowStatus === 'Revise' || rowStatus === 'Revised';
                    const isReviseStatus = isRevising || isRevised;
                    const isReturnStatus = rowStatus === 'Return' || rowStatus === 'Returned' || rowStatus === 'Removed';
                    const isDraft = !rowStatus || rowStatus === 'Draft' || rowStatus === 'Drafted';

                    const statusLabel = isPlotStatus ? 'Plotted'
                      : (isRevising ? 'Revising'
                      : (isRevised ? 'Revised'
                      : (isReturnStatus ? 'Returned' : 'Draft')));

                    const statusTooltipType: 'success' | 'warning' | 'danger' | 'dark' = isPlotStatus ? 'success' : (isReviseStatus ? 'warning' : (isReturnStatus ? 'danger' : 'dark'));

                    const isPlottable = isDraft;
                    const origSchedule = originalSchedulesMap.current.get(schedule.id) || (schedule.parentId ? originalSchedulesMap.current.get(schedule.parentId) : null);
                    const origStatus = origSchedule?.status || 'Draft';
                    const isOrigDraft = !origStatus || origStatus === 'Draft' || origStatus === 'Drafted';

                    const isRowEditable = isEditable && (!onlyAllowDraftEditing || isDraft || isReturnStatus || (selectedSemesterPhase?.phase === 'Revision' && isPlotStatus));
                    const isRemovable = !onlyAllowDraftEditing || isDraft || isReturnStatus || (selectedSemesterPhase?.phase === 'Revision' && isPlotStatus);

                    const isCellReverted = (fieldName: string) => revertedCellKeys.has(`${schedule.id}_${fieldName}`);

                    const numberCellBgClass = isSelected
                      ? (isPlotMode ? 'bg-emerald-100 text-emerald-900 font-bold' : 'bg-red-100 text-red-900 font-bold')
                      : showStatusOnNumberColumn
                        ? (
                            isPlotStatus ? 'bg-emerald-100 text-emerald-800 font-bold group-hover/row:bg-emerald-200/80' :
                            isReviseStatus ? 'bg-amber-100 text-amber-800 font-bold group-hover/row:bg-amber-200/80' :
                            isReturnStatus ? 'bg-rose-100 text-rose-800 font-bold group-hover/row:bg-rose-200/80' :
                            'bg-slate-100 text-slate-700 font-bold group-hover/row:bg-slate-200/80'
                          )
                        : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100 text-gray-500 font-semibold' : 'group-hover/row:!bg-slate-100 text-gray-500 font-semibold');

                    return (
                      <tr
                        key={schedule.id + '-' + index}
                        data-row-index={index}
                        style={getRowDragStyle(index)}
                        className={`${isDragging ? 'pointer-events-none' : 'group/row'} transition-colors duration-150 ${isSelected ? (isPlotMode ? (isDragging ? 'bg-emerald-100' : 'bg-emerald-100 hover:bg-emerald-200') : (isDragging ? 'bg-red-100' : 'bg-red-100 hover:bg-red-200')) : (isPlotMode && !isPlottable ? 'bg-gray-50/50 opacity-60' : isRemoveMode && !isRemovable ? 'bg-gray-50/50 opacity-60' : (isDragging ? '' : 'hover:bg-slate-100'))} ${((isRemoveMode && isRemovable) || (isPlotMode && isPlottable)) ? 'cursor-pointer [&>td>*]:pointer-events-none' : ''} ${((isPlotMode && !isPlottable) || (isRemoveMode && !isRemovable)) ? 'cursor-not-allowed [&>td>*]:pointer-events-none' : ''} ${!isRowEditable ? '[&>td>*]:pointer-events-none opacity-95' : ''}`}
                        onClickCapture={(e) => {
                          hideCustomTooltip();
                          if (isRemoveMode || isPlotMode) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isPlotMode && !isPlottable) return;
                            if (isRemoveMode && !isRemovable) return;
                            const targetId = schedule.parentId || schedule.id;
                            setSelectedScheduleIds(prev =>
                              prev.includes(targetId) ? prev.filter(id => id !== targetId) : [...prev, targetId]
                            );
                          }
                        }}
                      >
                        <td
                          onPointerDown={(e) => {
                            if (!isEditable || isRemoveMode || isPlotMode || !tbodyRef.current) return
                            e.preventDefault()
                            const groupIndices = getGroupIndices(schedules, index)
                            const parentIdx = groupIndices[0]
                            // Capture all row positions at drag start
                            const rows = Array.from(tbodyRef.current.querySelectorAll<HTMLElement>('tr[data-row-index]'))
                            const rowTops: number[] = []
                            const rowHeights: number[] = []
                            rows.forEach(row => {
                              const rect = row.getBoundingClientRect()
                              rowTops.push(rect.top)
                              rowHeights.push(rect.height)
                            })
                            const groupHeight = groupIndices.reduce((sum, i) => sum + (rowHeights[i] || 0), 0)
                            setDragState({
                              parentId: schedules[parentIdx].id,
                              groupIndices,
                              groupHeight,
                              startMouseY: e.clientY,
                              deltaY: 0,
                              rowTops,
                              rowHeights,
                            })
                          }}
                          onMouseEnter={(e) => {
                            if (showStatusOnNumberColumn) {
                              showCustomTooltip(e, `Status: ${statusLabel}`, statusTooltipType, 'right');
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                          className={`p-2 border-b border-r border-gray-300 text-center text-xs select-none align-middle transition-colors ${numberCellBgClass} ${isEditable && !isRemoveMode && !isPlotMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        >
                          {index + 1}
                        </td>
                        <td
                          className={`p-0 relative align-middle ${isCellReverted('type') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${(!isChild && !schedule.type) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]'}`}
                          onMouseEnter={(e) => {
                            if (!isChild && !schedule.type) {
                              showCustomTooltip(e, 'Missing Schedule Type', 'warning');
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {isChild || onlyAllowTimeDaysRoomStatusEditing ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium text-left cursor-default">
                              {isChild ? '----' : (schedule.type ? schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1) : '----')}
                            </div>
                          ) : (
                            <details className="w-full relative h-full group">
                              <summary onClick={handleDropdownPosition} className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent ${schedule.type ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                <span className="truncate">
                                  {schedule.type ? schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1) : (
                                    <span className="text-amber-500 font-bold inline-block">?</span>
                                  )}
                                </span>
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-1 flex flex-col gap-1 rounded w-full`}>
                                {['normal', 'open lab', 'parallel'].map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={(e) => {
                                      handleScheduleChange(index, 'type', opt)
                                      e.currentTarget.closest('details')?.removeAttribute('open')
                                    }}
                                    className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate"
                                  >
                                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </details>
                          )}
                        </td>
                        <td
                          className={`p-0 relative align-middle ${isCellReverted('format') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${(!isChild && schedule.type !== 'open lab' && (!schedule.format || missingFormat2)) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]'}`}
                          onMouseEnter={(e) => {
                            if (!isChild && schedule.type !== 'open lab') {
                              if (!schedule.format) {
                                showCustomTooltip(e, 'Missing Format', 'warning');
                              } else if (missingFormat2) {
                                showCustomTooltip(e, 'Missing 2nd Session Format', 'warning');
                              }
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {schedule.type === 'open lab' || schedule.format === 'Flexible' ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              Flexible
                            </div>
                          ) : isChild || onlyAllowTimeDaysRoomStatusEditing ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              {!schedule.format ? '----' : (
                                schedule.format === (schedule as any).format2 ? (
                                  <>{schedule.format}<sup>2</sup></>
                                ) : (
                                  <>{schedule.format} / {(schedule as any).format2 ? (schedule as any).format2 : '----'}</>
                                )
                              )}
                            </div>
                          ) : (
                            <details className="w-full relative h-full group">
                              <summary onClick={handleDropdownPosition} className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent ${(schedule.format || (schedule as any).format2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                <span className="truncate">
                                  {!schedule.format ? (
                                    <span className="text-amber-500 font-bold inline-block">?</span>
                                  ) : (
                                    schedule.format === (schedule as any).format2 ? (
                                      <>{schedule.format}<sup>2</sup></>
                                    ) : (
                                      <>{schedule.format} / {(schedule as any).format2 ? (schedule as any).format2 : (missingFormat2 ? <span className="text-amber-500 font-bold ml-1 inline-block">?</span> : '')}</>
                                    )
                                  )}
                                </span>
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-3 rounded w-full`}>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                  <InnerDropdown
                                    value={schedule.format || ''}
                                    onChange={(val) => {
                                      handleScheduleChange(index, 'format', val);
                                      if (!val) handleScheduleChange(index, 'format2', '');
                                    }}
                                    options={[{ value: 'Lec', label: 'Lec' }, { value: 'Lab', label: 'Lab' }]}
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className={`text-xs font-bold uppercase tracking-wider ${missingFormat2 ? 'text-amber-600' : 'text-gray-500'}`}>2nd Session</label>
                                  <InnerDropdown
                                    value={(schedule as any).format2 || ''}
                                    disabled={!schedule.format}
                                    onChange={(val) => handleScheduleChange(index, 'format2', val)}
                                    options={[{ value: 'Lec', label: 'Lec' }, { value: 'Lab', label: 'Lab' }]}
                                  />
                                </div>
                              </div>
                            </details>
                          )}
                        </td>
                        <td
                          className={`p-0 relative ${isCellReverted('subjectCode') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${hasSectionConflict ? '!bg-purple-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-purple-400 border-r border-purple-200 shadow-[inset_1px_1px_0_0_#c084fc]' : (!isChild && !schedule.subjectCode ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                          onMouseEnter={(e) => {
                            if (hasSectionConflict && conflict.sectionConflictDetails.length > 0) {
                              showCustomTooltip(e, conflict.sectionConflictDetails, 'purple')
                            } else if (!isChild && !schedule.subjectCode) {
                              showCustomTooltip(e, 'Missing Subject Code', 'warning')
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {isChild || onlyAllowTimeDaysRoomStatusEditing ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              {schedule.subjectCode || parentSchedule?.subjectCode || '----'}
                            </div>
                          ) : (
                            <input
                              type="text"
                              placeholder="?"
                              disabled={!isRowEditable}
                              value={schedule.subjectCode}
                              onChange={(e) => handleScheduleChange(index, 'subjectCode', e.target.value)}
                              onBlur={(e) => {
                                e.target.scrollLeft = 0;
                              }}
                              onFocus={hideCustomTooltip}
                              onClick={hideCustomTooltip}
                              className={`h-full w-full min-h-[2.75rem] py-3 px-3 text-sm focus:outline-none focus:ring-0 transition-colors bg-transparent uppercase ${schedule.subjectCode ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-amber-500 placeholder:font-bold'}`}
                            />
                          )}
                        </td>
                        {!hideTitleColumn && (
                          <td
                            className={`p-0 relative ${isCellReverted('subjectTitle') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${hasSectionConflict ? '!bg-purple-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-purple-400 border-r border-purple-200 shadow-[inset_0_1px_0_0_#c084fc]' : (!isChild && !schedule.subjectTitle ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                            onMouseEnter={(e) => {
                              if (hasSectionConflict && conflict.sectionConflictDetails.length > 0) {
                                showCustomTooltip(e, conflict.sectionConflictDetails, 'purple')
                              } else if (!isChild && !schedule.subjectTitle) {
                                showCustomTooltip(e, 'Missing Subject Title', 'warning')
                              }
                            }}
                            onMouseLeave={hideCustomTooltip}
                          >
                            {isChild || onlyAllowTimeDaysRoomStatusEditing ? (
                              <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                                {schedule.subjectTitle || parentSchedule?.subjectTitle || '----'}
                              </div>
                            ) : (
                              <input
                                type="text"
                                placeholder="?"
                                disabled={!isRowEditable}
                                value={schedule.subjectTitle}
                                onChange={(e) => handleScheduleChange(index, 'subjectTitle', e.target.value)}
                                onBlur={(e) => {
                                  e.target.scrollLeft = 0;
                                }}
                                onFocus={hideCustomTooltip}
                                onClick={hideCustomTooltip}
                                className={`h-full w-full min-h-[2.75rem] py-3 px-3 text-sm focus:outline-none focus:ring-0 transition-colors bg-transparent ${schedule.subjectTitle ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-amber-500 placeholder:font-bold'}`}
                              />
                            )}
                          </td>
                        )}
                        <td
                          className={`p-0 relative ${isCellReverted('classSection') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${hasSectionConflict ? '!bg-purple-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-purple-400 border-r border-purple-400 shadow-[inset_0_1px_0_0_#c084fc]' : (!schedule.classSection ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                          onMouseEnter={(e) => {
                            if (hasSectionConflict && conflict.sectionConflictDetails.length > 0) {
                              showCustomTooltip(e, conflict.sectionConflictDetails, 'purple')
                            } else if (!schedule.classSection) {
                              showCustomTooltip(e, 'Missing Section', 'warning')
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {onlyAllowTimeDaysRoomStatusEditing ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              {schedule.classSection || '----'}
                            </div>
                          ) : (
                            <div className="relative w-full h-full flex items-center">
                              <input
                                type="text"
                                placeholder="?"
                                disabled={!isRowEditable}
                                value={schedule.classSection}
                                onChange={(e) => handleScheduleChange(index, 'classSection', e.target.value)}
                                onBlur={(e) => {
                                  e.target.scrollLeft = 0;
                                }}
                                onFocus={hideCustomTooltip}
                                onClick={hideCustomTooltip}
                                className={`h-full w-full min-h-[2.75rem] py-3 px-3 ${hasSectionConflict ? 'pr-8' : ''} text-sm focus:outline-none focus:ring-0 transition-colors bg-transparent uppercase ${schedule.classSection ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-amber-500 placeholder:font-bold'}`}
                              />
                              {hasSectionConflict && (
                                <DuplicateIcon className="h-4 w-4 text-purple-600 shrink-0 absolute right-3 pointer-events-none" />
                              )}
                            </div>
                          )}
                        </td>
                        <td
                          className={`p-0 relative align-middle max-w-[16.25rem] ${isCellReverted('instructorId') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${hasInstructorConflict ? '!bg-rose-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-rose-400 border-r border-rose-200 shadow-[inset_1px_1px_0_0_#fb7185]' : (!isChild && (!schedule.instructorId || missingInstructor2) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                          onMouseEnter={(e) => {
                            const details = [...(conflict?.instructorConflictDetails1 || []), ...(conflict?.instructorConflictDetails2 || [])]
                            if (details.length > 0) {
                              showCustomTooltip(e, details, 'danger')
                            } else if (!isChild && !schedule.instructorId) {
                              showCustomTooltip(e, 'Missing Instructor', 'warning')
                            } else if (!isChild && missingInstructor2) {
                              showCustomTooltip(e, 'Missing 2nd Session Instructor', 'warning')
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {isChild || onlyAllowTimeDaysRoomStatusEditing ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium cursor-default flex items-center justify-between gap-1.5 overflow-hidden w-full">
                              <div className="flex items-center min-w-0 truncate">
                                <span className="truncate min-w-0 leading-none">
                                  {members.find(m => (m as any).membershipId === schedule.instructorId || m.id === schedule.instructorId)?.name || '----'}
                                </span>
                                {(schedule as any).instructorId2 && ((schedule as any).instructorId2 !== schedule.instructorId || !isSecondSessionUnlocked) ? (
                                  <>
                                    <span className="shrink-0 whitespace-pre leading-none">{' / '}</span>
                                    <span className={`truncate min-w-0 leading-none ${!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}`}>
                                      {members.find(m => (m as any).membershipId === (schedule as any).instructorId2 || m.id === (schedule as any).instructorId2)?.name || '?'}
                                    </span>
                                  </>
                                ) : (missingInstructor2 ? <> <span className="shrink-0 whitespace-pre leading-none">{' / '}</span> <span>----</span></> : '')}
                              </div>
                              {hasInstructorConflict && (
                                <ExclamationIcon className="h-4 w-4 text-rose-500 shrink-0 ml-auto" />
                              )}
                            </div>
                          ) : (
                            <details className="w-full relative h-full group">
                              <summary onClick={handleDropdownPosition} className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between gap-1.5 transition-colors bg-transparent ${(schedule.instructorId || (schedule as any).instructorId2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                <div className="inline-flex items-center min-w-0 truncate">
                                  {!schedule.instructorId ? (
                                    <span className="text-amber-500 font-bold shrink-0 inline-block leading-none">?</span>
                                  ) : (
                                    <span className="truncate min-w-0 leading-none">
                                      {members.find(m => m.membershipId === schedule.instructorId)?.name || '?'}
                                    </span>
                                  )}
                                  {(schedule as any).instructorId2 && ((schedule as any).instructorId2 !== schedule.instructorId || !isSecondSessionUnlocked) ? (
                                    <>
                                      <span className="shrink-0 whitespace-pre leading-none">{' / '}</span>
                                      <span className={`truncate min-w-0 leading-none ${!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}`}>
                                        {members.find(m => m.membershipId === (schedule as any).instructorId2)?.name || '?'}
                                      </span>
                                    </>
                                  ) : (missingInstructor2 ? <> <span className="shrink-0 whitespace-pre leading-none">{' / '}</span> <span className="text-amber-500 font-bold ml-1 inline-block leading-none">?</span></> : '')}
                                </div>
                                {hasInstructorConflict && (
                                  <ExclamationIcon className="h-4 w-4 text-rose-500 shrink-0 ml-auto" />
                                )}
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-3 rounded w-full`}>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                  <InnerDropdown
                                    value={schedule.instructorId || ''}
                                    onChange={(val) => {
                                      handleScheduleChange(index, 'instructorId', val);
                                      if (!val) handleScheduleChange(index, 'instructorId2', '');
                                    }}
                                    options={members.filter(m => m.status === 'Active' && (m.role === 'Instructor' || m.role === 'Program Head')).map(m => ({ value: m.membershipId || '', label: m.name }))}
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                  <InnerDropdown
                                    value={(schedule as any).instructorId2 || ''}
                                    disabled={!isSecondSessionUnlocked || !schedule.instructorId}
                                    onChange={(val) => handleScheduleChange(index, 'instructorId2', val)}
                                    options={members.filter(m => m.status === 'Active' && (m.role === 'Instructor' || m.role === 'Program Head')).map(m => ({ value: m.membershipId || '', label: m.name }))}
                                  />
                                </div>
                              </div>
                            </details>
                          )}
                        </td>
                        <td
                          className={`p-0 relative align-middle ${isCellReverted('time') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${(hasInstructorConflict || hasRoomConflict) ? `!bg-rose-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-rose-400 ${hasRoomConflict ? 'border-r border-rose-200' : 'border-r border-rose-400'} ${!hasInstructorConflict ? 'shadow-[inset_1px_1px_0_0_#fb7185]' : 'shadow-[inset_0_1px_0_0_#fb7185]'}` : (!isChild && (!schedule.startTime || missingTime2)) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]'}`}
                          onMouseEnter={(e) => {
                            const details = [
                              ...(conflict?.roomConflictDetails1 || []),
                              ...(conflict?.roomConflictDetails2 || []),
                              ...(conflict?.instructorConflictDetails1 || []),
                              ...(conflict?.instructorConflictDetails2 || [])
                            ]
                            if (details.length > 0) {
                              showCustomTooltip(e, details, 'danger')
                            } else if (!isChild && !schedule.startTime) {
                              showCustomTooltip(e, 'Missing Time', 'warning')
                            } else if (!isChild && missingTime2) {
                              showCustomTooltip(e, 'Missing 2nd Session Time', 'warning')
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {isChild ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              {(() => {
                                if (!schedule.startTime && !(schedule as any).startTime2) return '----';
                                const time1raw = schedule.startTime ? `${schedule.startTime} - ${schedule.endTime}` : '----';
                                if (!(schedule as any).startTime2) {
                                  if (missingTime2) {
                                    return `${time1raw} / ----`;
                                  }
                                  return time1raw;
                                }
                                const time2raw = `${(schedule as any).startTime2} - ${(schedule as any).endTime2}`;
                                const isSameInstructor = !!(schedule as any).instructorId2 && (schedule as any).instructorId2 === schedule.instructorId;
                                const isSameDay = schedule.days.length === 2 && schedule.days[0] === schedule.days[1];
                                const isSameBuilding = !!(schedule as any).buildingId2 && (schedule as any).buildingId2 === schedule.buildingId;
                                const isSameRoom = !!(schedule as any).roomId2 && (schedule as any).roomId2 === schedule.roomId;

                                if (isSecondSessionUnlocked && schedule.startTime && schedule.endTime === (schedule as any).startTime2 && isSameInstructor && isSameDay) {
                                  return `${schedule.startTime} - ${(schedule as any).endTime2}`;
                                }
                                return (
                                  <>
                                    {time1raw} / <span className={!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}>{time2raw}</span>
                                  </>
                                );
                              })()}
                            </div>
                          ) : (
                            <details className="w-full relative h-full group">
                              <summary onClick={handleDropdownPosition} className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent ${(schedule.startTime || schedule.endTime || (schedule as any).startTime2 || (schedule as any).endTime2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                <span className="truncate">
                                  {(() => {
                                    const time1raw = schedule.startTime ? (
                                      `${schedule.startTime} - ${schedule.endTime}`
                                    ) : (
                                      <span className="text-amber-500 font-bold inline-block">?</span>
                                    );

                                    if ((schedule as any).startTime2) {
                                      const isSameInstructor = !!(schedule as any).instructorId2 && (schedule as any).instructorId2 === schedule.instructorId;
                                      const isSameDay = schedule.days.length === 2 && schedule.days[0] === schedule.days[1];
                                      const isSameBuilding = !!(schedule as any).buildingId2 && (schedule as any).buildingId2 === schedule.buildingId;
                                      const isSameRoom = !!(schedule as any).roomId2 && (schedule as any).roomId2 === schedule.roomId;

                                      if (isSecondSessionUnlocked && schedule.startTime && schedule.endTime === (schedule as any).startTime2 && isSameInstructor && isSameDay) {
                                        return (
                                          <>
                                            {schedule.startTime} - {(schedule as any).endTime2}
                                          </>
                                        );
                                      }
                                      return (
                                        <>
                                          {time1raw} / <span className={!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}>{(schedule as any).startTime2} - {(schedule as any).endTime2}</span>
                                        </>
                                      );
                                    }

                                    if (missingTime2) {
                                      return (
                                        <>
                                          {time1raw} / <span className="text-amber-500 font-bold ml-1 inline-block">?</span>
                                        </>
                                      );
                                    }

                                    return <>{time1raw}</>;
                                  })()}
                                </span>
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-4 rounded w-full`}>
                                {(() => {
                                  const duration1 = getDurationMins(schedule.startTime, schedule.endTime);
                                  const session2Disabled = !isSecondSessionUnlocked || duration1 === 180;

                                  return (
                                    <>
                                      <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                        <InnerDropdown
                                          value={schedule.startTime || ''}
                                          placeholder="Start Time"
                                          onChange={(val) => {
                                            handleScheduleChange(index, 'startTime', val);
                                            if (!val) {
                                              handleScheduleChange(index, 'endTime', '');
                                              handleScheduleChange(index, 'startTime2', '');
                                              handleScheduleChange(index, 'endTime2', '');
                                            } else {
                                              handleScheduleChange(index, 'endTime', calculateEndTime(val, 90));
                                            }
                                          }}
                                          options={START_TIME_OPTIONS}
                                        />
                                      </div>
                                      <div className="flex flex-col gap-2">
                                        <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingTime2 ? 'text-amber-600' : 'text-gray-500'}`}>
                                          2nd Session
                                        </label>
                                        <InnerDropdown
                                          value={(schedule as any).startTime2 || ''}
                                          placeholder="Start Time"
                                          disabled={!isSecondSessionUnlocked || !schedule.startTime}
                                          onChange={(val) => {
                                            handleScheduleChange(index, 'startTime2', val);
                                            if (!val) {
                                              handleScheduleChange(index, 'endTime2', '');
                                            } else {
                                              handleScheduleChange(index, 'endTime2', calculateEndTime(val, 90));
                                            }
                                          }}
                                          options={START_TIME_OPTIONS}
                                        />
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </details>
                          )}
                        </td>
                        <td
                          className={`p-0 relative align-middle ${isCellReverted('days') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${(hasInstructorConflict || hasRoomConflict) ? `!bg-rose-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-rose-400 shadow-[inset_0_1px_0_0_#fb7185] ${hasRoomConflict ? 'border-r border-rose-200' : 'border-r border-rose-400'}` : (!isChild && (schedule.days.length === 0 || missingDay2) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                          onMouseEnter={(e) => {
                            const details = [
                              ...(conflict?.roomConflictDetails1 || []),
                              ...(conflict?.roomConflictDetails2 || []),
                              ...(conflict?.instructorConflictDetails1 || []),
                              ...(conflict?.instructorConflictDetails2 || [])
                            ]
                            if (details.length > 0) {
                              showCustomTooltip(e, details, 'danger')
                            } else if (!isChild && schedule.days.length === 0) {
                              showCustomTooltip(e, 'Missing Day', 'warning')
                            } else if (!isChild && missingDay2) {
                              showCustomTooltip(e, 'Missing 2nd Session Day', 'warning')
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {isChild ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium flex items-center cursor-default">
                              <span className="truncate max-w-[6.25rem]">
                                {schedule.days.length > 0 ? (
                                  <>
                                    {schedule.days[0]}
                                    {schedule.days[1] && (schedule.days[1] !== schedule.days[0] || !isSecondSessionUnlocked) && (
                                      <>
                                        {' / '}
                                        <span className={!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}>
                                          {schedule.days[1]}
                                        </span>
                                      </>
                                    )}
                                    {missingDay2 && (
                                      <> {' / '} <span>----</span></>
                                    )}
                                  </>
                                ) : (
                                  missingDay2 ? '---- / ----' : '----'
                                )}
                              </span>
                            </div>
                          ) : (
                            <details className="w-full relative h-full group">
                              <summary onClick={handleDropdownPosition} className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent ${schedule.days.length > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                <span className="truncate max-w-[6.25rem]">
                                  {schedule.days.length > 0 ? (
                                    <>
                                      {schedule.days[0]}
                                      {schedule.days[1] && (schedule.days[1] !== schedule.days[0] || !isSecondSessionUnlocked) && (
                                        <>
                                          {' / '}
                                          <span className={!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}>
                                            {schedule.days[1]}
                                          </span>
                                        </>
                                      )}
                                      {missingDay2 && (
                                        <> / <span className="text-amber-500 font-bold ml-1 inline-block">?</span></>
                                      )}
                                    </>
                                  ) : (
                                    missingDay2 ? (
                                      <>
                                        <span className="text-amber-500 font-bold inline-block">?</span> / <span className="text-amber-500 font-bold ml-1 inline-block">?</span>
                                      </>
                                    ) : (
                                      <span className="text-amber-500 font-bold inline-block">?</span>
                                    )
                                  )}
                                </span>
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-3 rounded w-full`}>
                                {(() => {
                                  const missingDay1 = schedule.days.length === 0 && (!!schedule.startTime || !!(schedule as any).startTime2);
                                  return (
                                    <>
                                      <div className="flex flex-col gap-1.5">
                                        <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingDay1 ? 'text-amber-600' : 'text-gray-500'}`}>
                                          1st Session
                                        </label>
                                        <InnerDropdown
                                          value={schedule.days[0] || ''}
                                          onChange={(val) => handleDayChange(index, 0, val)}
                                          options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(d => {
                                            const isSameTime = !!(schedule as any).startTime2 && schedule.startTime === (schedule as any).startTime2;
                                            const isSameInstructor = !(schedule as any).instructorId2 || (schedule as any).instructorId2 === schedule.instructorId;
                                            if (isSameTime && isSameInstructor && schedule.days[1] === d) return false;
                                            return true;
                                          }).map(d => ({ value: d, label: d }))}
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1.5">
                                        <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingDay2 ? 'text-amber-600' : 'text-gray-500'}`}>
                                          2nd Session
                                        </label>
                                        <InnerDropdown
                                          value={schedule.days[1] || ''}
                                          disabled={!isSecondSessionUnlocked || !schedule.days[0] || getDurationMins(schedule.startTime, schedule.endTime) === 180}
                                          onChange={(val) => handleDayChange(index, 1, val)}
                                          options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(d => {
                                            const isSameTime = !!(schedule as any).startTime2 && schedule.startTime === (schedule as any).startTime2;
                                            const isSameInstructor = !(schedule as any).instructorId2 || (schedule as any).instructorId2 === schedule.instructorId;
                                            if (isSameTime && isSameInstructor && schedule.days[0] === d) return false;
                                            return true;
                                          }).map(d => ({ value: d, label: d }))}
                                        />
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </details>
                          )}
                        </td>
                        <td
                          className={`p-0 relative align-middle ${isCellReverted('buildingId') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${hasRoomConflict ? '!bg-rose-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-rose-400 border-r border-rose-200 shadow-[inset_0_1px_0_0_#fb7185]' : (!isChild && (!schedule.buildingId || missingBuilding2) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                          onMouseEnter={(e) => {
                            const details = [...(conflict?.roomConflictDetails1 || []), ...(conflict?.roomConflictDetails2 || [])]
                            if (details.length > 0) {
                              showCustomTooltip(e, details, 'danger')
                            } else if (!isChild && !schedule.buildingId) {
                              showCustomTooltip(e, 'Missing Building', 'warning');
                            } else if (!isChild && missingBuilding2) {
                              showCustomTooltip(e, 'Missing 2nd Session Building', 'warning');
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          {isChild ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              {resolveBuildingCode(buildings.find(b => b.id === schedule.buildingId), rooms) || '----'}
                              {(schedule as any).buildingId2 && ((schedule as any).buildingId2 !== schedule.buildingId || !isSecondSessionUnlocked) ? (
                                <>
                                  {' / '}
                                  <span className={!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}>
                                    {resolveBuildingCode(buildings.find(b => b.id === (schedule as any).buildingId2), rooms) || '?'}
                                  </span>
                                </>
                              ) : (missingBuilding2 ? <> {' / '} <span>----</span></> : '')}
                            </div>
                          ) : (
                            <details className="w-full relative h-full group">
                              <summary onClick={handleDropdownPosition} className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent ${(schedule.buildingId || (schedule as any).buildingId2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                <span className="truncate">
                                  {resolveBuildingCode(buildings.find(b => b.id === schedule.buildingId), rooms) || (
                                    <span className="text-amber-500 font-bold inline-block">?</span>
                                  )}
                                  {(schedule as any).buildingId2 && ((schedule as any).buildingId2 !== schedule.buildingId || !isSecondSessionUnlocked) ? (
                                    <>
                                      {' / '}
                                      <span className={!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}>
                                        {resolveBuildingCode(buildings.find(b => b.id === (schedule as any).buildingId2), rooms) || '?'}
                                      </span>
                                    </>
                                  ) : (missingBuilding2 ? <> / <span className="text-amber-500 font-bold ml-1 inline-block leading-none">?</span></> : '')}
                                </span>
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-3 rounded w-full`}>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                  <InnerDropdown
                                    value={schedule.buildingId || ''}
                                    onChange={(val) => {
                                      handleScheduleChange(index, 'buildingId', val)
                                      handleScheduleChange(index, 'roomId', '')
                                      if (!val) {
                                        handleScheduleChange(index, 'buildingId2', '')
                                        handleScheduleChange(index, 'roomId2', '')
                                      }
                                    }}
                                    options={buildings.map(b => ({
                                      value: b.id,
                                      label: resolveBuildingCode(b, rooms) || ''
                                    }))}
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                  <InnerDropdown
                                    value={(schedule as any).buildingId2 || ''}
                                    disabled={!isSecondSessionUnlocked || !schedule.buildingId}
                                    onChange={(val) => {
                                      handleScheduleChange(index, 'buildingId2', val)
                                      handleScheduleChange(index, 'roomId2', '')
                                    }}
                                    options={buildings.map(b => ({
                                      value: b.id,
                                      label: resolveBuildingCode(b, rooms) || ''
                                    }))}
                                  />
                                </div>
                              </div>
                            </details>
                          )}
                        </td>
                        <td
                          className={`p-0 relative align-middle ${isCellReverted('roomId') ? 'animate-undo-highlight' : ''} ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} ${hasRoomConflict ? '!bg-rose-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-rose-400 border-r border-rose-400 shadow-[inset_0_1px_0_0_#fb7185]' : ((!schedule.roomId || missingRoom2) ? '!bg-amber-50 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]' : 'border-b border-r border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]')}`}
                          onMouseEnter={(e) => {
                            const details = [...(conflict?.roomConflictDetails1 || []), ...(conflict?.roomConflictDetails2 || [])]
                            if (details.length > 0) {
                              showCustomTooltip(e, details, 'danger')
                            } else if (!schedule.roomId) {
                              showCustomTooltip(e, 'Missing Room', 'warning')
                            } else if (missingRoom2) {
                              showCustomTooltip(e, 'Missing 2nd Session Room', 'warning')
                            }
                          }}
                          onMouseLeave={hideCustomTooltip}
                        >
                          <details
                            className="w-full relative h-full group"
                            onClick={(e) => {
                              if (!schedule.buildingId || (isChild && availableRooms.length === 0)) e.preventDefault();
                            }}
                          >
                            <summary 
                              onMouseDown={(e) => {
                                if (!schedule.buildingId || (isChild && availableRooms.length === 0)) e.preventDefault();
                              }}
                              tabIndex={(!schedule.buildingId || (isChild && availableRooms.length === 0)) ? -1 : undefined}
                              onClick={(e) => { handleDropdownPosition(e); }} 
                              className={`h-full min-h-[2.75rem] list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between gap-1.5 transition-colors bg-transparent ${(!schedule.buildingId || (isChild && availableRooms.length === 0)) ? 'cursor-default text-gray-400' : 'cursor-pointer ' + ((schedule.roomId || (schedule as any).roomId2) ? 'text-gray-900 font-medium' : 'text-gray-500')}`}
                            >
                              <span className="truncate leading-none">
                                {rooms.find(r => r.id === schedule.roomId)?.name || rooms.find(r => r.id === schedule.roomId)?.code || (
                                  <span className="text-amber-500 font-bold inline-block leading-none">?</span>
                                )}
                                {(schedule as any).roomId2 && ((schedule as any).roomId2 !== schedule.roomId || !isSecondSessionUnlocked) ? (
                                  <>
                                    <span className="shrink-0 whitespace-pre leading-none">{' / '}</span>
                                    <span className={`leading-none ${!isSecondSessionUnlocked ? "text-gray-400 font-normal" : ""}`}>
                                      {rooms.find(r => r.id === (schedule as any).roomId2)?.name || rooms.find(r => r.id === (schedule as any).roomId2)?.code || '?'}
                                    </span>
                                  </>
                                ) : (missingRoom2 ? <> / <span className="text-amber-500 font-bold ml-1 inline-block leading-none">?</span></> : '')}
                              </span>
                              {(conflict?.hasRoomConflict1 || conflict?.hasRoomConflict2) && (
                                <ExclamationIcon className="h-4 w-4 text-rose-500 shrink-0 ml-auto" />
                              )}
                            </summary>
                            {schedule.buildingId && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                                <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-3 flex flex-col gap-3 rounded w-full`}>
                                  <div className="flex flex-col gap-1.5">
                                    <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingRoom1 ? 'text-amber-600' : 'text-gray-500'}`}>
                                      1st Session
                                    </label>
                                    <InnerDropdown
                                      value={schedule.roomId || ''}
                                      onChange={(val) => {
                                        handleScheduleChange(index, 'roomId', val);
                                        if (!val) handleScheduleChange(index, 'roomId2', '');
                                      }}
                                      options={availableRooms.map(room => ({ value: room.id, label: room.name || room.code || '' }))}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingRoom2 ? 'text-amber-600' : 'text-gray-500'}`}>
                                      2nd Session
                                    </label>
                                    <InnerDropdown
                                      value={(schedule as any).roomId2 || ''}
                                      disabled={!isSecondSessionUnlocked || !schedule.roomId}
                                      onChange={(val) => handleScheduleChange(index, 'roomId2', val)}
                                      options={availableRooms2.map(room => ({ value: room.id, label: room.name || room.code || '' }))}
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </details>
                        </td>
                        {!hideStatusColumn && (
                          <td
                            className={`p-0 relative align-middle ${isSelected ? (isPlotMode ? 'bg-emerald-100' : 'bg-red-100') : ((!isSelected && isChild) ? 'bg-gray-50/50 group-hover/row:!bg-slate-100' : 'group-hover/row:!bg-slate-100')} border-b border-gray-300 focus-within:!bg-[#e3edda] has-[details[open]]:!bg-[#e3edda]`}
                          >
                          {isRowEditable && !isChild && (isDraft || isRevising || isPlotStatus || isReturnStatus) ? (
                            <details className="w-full relative h-full group">
                              <summary
                                onClick={handleDropdownPosition}
                                className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent`}
                              >
                                <span className="truncate flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                                    isPlotStatus ? 'bg-emerald-500' :
                                    isRevising ? 'bg-amber-500' :
                                    isReturnStatus ? 'bg-rose-500' :
                                    'bg-slate-400'
                                  }`} />
                                  <span className={`text-sm font-medium ${
                                    isPlotStatus ? 'text-emerald-700' :
                                    isRevising ? 'text-amber-700' :
                                    isReturnStatus ? 'text-rose-700' :
                                    'text-slate-600'
                                  }`}>
                                    {statusLabel}
                                  </span>
                                </span>
                              </summary>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 ring-1 ring-black/5 shadow-[0_12px_28px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] p-1 flex flex-col gap-1 rounded w-full min-w-[7.5rem]`}>
                                {isDraft && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        handleScheduleChange(index, 'status', 'Plot');
                                        if (schedule.type === 'parallel') {
                                          schedules.forEach((s, idx) => {
                                            if (s.id === schedule.id || s.parentId === schedule.id || (schedule.parentId && (s.id === schedule.parentId || s.parentId === schedule.parentId))) {
                                              handleScheduleChange(idx, 'status', 'Plot');
                                            }
                                          });
                                        }
                                        e.currentTarget.closest('details')?.removeAttribute('open');
                                      }}
                                      className="flex items-center gap-2 text-left px-2 py-1.5 text-sm hover:bg-emerald-50 rounded truncate transition-colors cursor-pointer w-full"
                                    >
                                      <span className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                                      <span className="text-emerald-700 font-medium">Plot</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        handleScheduleChange(index, 'status', 'Return');
                                        if (schedule.type === 'parallel') {
                                          schedules.forEach((s, idx) => {
                                            if (s.id === schedule.id || s.parentId === schedule.id || (schedule.parentId && (s.id === schedule.parentId || s.parentId === schedule.parentId))) {
                                              handleScheduleChange(idx, 'status', 'Return');
                                            }
                                          });
                                        }
                                        e.currentTarget.closest('details')?.removeAttribute('open');
                                      }}
                                      className="flex items-center gap-2 text-left px-2 py-1.5 text-sm hover:bg-rose-50 rounded truncate transition-colors cursor-pointer w-full"
                                    >
                                      <span className="h-2 w-2 rounded-full shrink-0 bg-rose-500" />
                                      <span className="text-rose-700 font-medium">Return</span>
                                    </button>
                                  </>
                                )}
                                {(isRevising || isPlotStatus || isReturnStatus) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.currentTarget.closest('details')?.removeAttribute('open');
                                      setPendingUndoIndex(index);
                                    }}
                                    className={`flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded truncate transition-colors cursor-pointer w-full ${
                                      isPlotStatus ? 'hover:bg-emerald-50 text-emerald-700' :
                                      isReturnStatus ? 'hover:bg-rose-50 text-rose-700' :
                                      'hover:bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    <UndoIcon className={`h-3.5 w-3.5 shrink-0 ${
                                      isPlotStatus ? 'text-emerald-600' :
                                      isReturnStatus ? 'text-rose-600' :
                                      'text-amber-600'
                                    }`} />
                                    <span className="font-medium">Undo</span>
                                  </button>
                                )}
                              </div>
                            </details>
                          ) : isChild ? (
                            <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                              ----
                            </div>
                          ) : (
                            <div className="px-3 py-3 text-sm font-medium truncate cursor-default flex items-center gap-2">
                              {(() => {
                                const currentStatus = (isChild && parentSchedule?.status) ? parentSchedule.status : schedule.status;
                                const currentIsPlot = currentStatus === 'Plot' || currentStatus === 'Plotted';
                                const currentIsRevising = currentStatus === 'Revising';
                                const currentIsRevised = currentStatus === 'Revise' || currentStatus === 'Revised';
                                const currentIsReturn = currentStatus === 'Return' || currentStatus === 'Returned' || currentStatus === 'Removed';
                                const currentLabel = currentIsPlot ? 'Plotted' : (currentIsRevising ? 'Revising' : (currentIsRevised ? 'Revised' : (currentIsReturn ? 'Returned' : 'Draft')));

                                return (
                                  <>
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                                      currentIsPlot ? 'bg-emerald-500' :
                                      (currentIsRevising || currentIsRevised) ? 'bg-amber-500' :
                                      currentIsReturn ? 'bg-rose-500' :
                                      'bg-slate-400'
                                    }`} />
                                    <span className={
                                      currentIsPlot ? 'text-emerald-700 font-medium' :
                                      (currentIsRevising || currentIsRevised) ? 'text-amber-700 font-medium' :
                                      currentIsReturn ? 'text-rose-700 font-medium' :
                                      'text-slate-600 font-medium'
                                    }>
                                      {currentLabel}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 bg-white flex justify-between gap-3 shrink-0 rounded-b-2xl">
            {isEditable ? (
              <div className="flex items-center gap-4">
                {isRemoveMode ? (
                  <>
                    <Button
                      variant={selectedScheduleIds.length > 0 ? 'primary' : 'outline'}
                      className={selectedScheduleIds.length > 0 ? '!bg-rose-500 hover:!bg-rose-600 !border-none !text-white !shadow-md' : ''}
                      onClick={() => {
                        const rowsToDeleteCount = schedules.filter(s => selectedScheduleIds.includes(s.id) || (s.parentId && selectedScheduleIds.includes(s.parentId))).length;
                        if (rowsToDeleteCount > 0) {
                          setIsDeleteConfirmModalOpen(true);
                        } else {
                          setIsRemoveMode(false);
                        }
                      }}
                    >
                      {selectedScheduleIds.length > 0 && <TrashIcon className="h-4 w-4" />}
                      {selectedScheduleIds.length > 0 ? `Delete Selected (${schedules.filter(s => selectedScheduleIds.includes(s.id) || (s.parentId && selectedScheduleIds.includes(s.parentId))).length})` : 'Cancel Remove'}
                    </Button>
                    {selectedScheduleIds.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsRemoveMode(false);
                          setSelectedScheduleIds([]);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </>
                ) : isPlotMode ? (
                  <>
                    <Button
                      variant={selectedScheduleIds.length > 0 ? 'primary' : 'outline'}
                      className={selectedScheduleIds.length > 0 ? '!bg-emerald-500 hover:!bg-emerald-600 !border-none !text-white !shadow-md' : ''}
                      onClick={() => {
                        if (selectedScheduleIds.length > 0) {
                          setIsPlotConfirmModalOpen(true);
                        } else {
                          setIsPlotMode(false);
                        }
                      }}
                    >
                      {selectedScheduleIds.length > 0 && <CheckCircleIcon className="h-4 w-4 text-white" />}
                      {selectedScheduleIds.length > 0 ? `Plot Selected (${schedules.filter(s => selectedScheduleIds.includes(s.id) || (s.parentId && selectedScheduleIds.includes(s.parentId))).length})` : 'Cancel Plot'}
                    </Button>
                    {selectedScheduleIds.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsPlotMode(false);
                          setSelectedScheduleIds([]);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {!hideAddRemoveButtons && (
                      <>
                        {schedules.length > 0 && (
                          <DashedButton
                            variant="danger"
                            onClick={() => setIsRemoveMode(true)}
                            icon={<TrashIcon className="h-4 w-4" />}
                          >
                            Remove
                          </DashedButton>
                        )}
                        <DashedButton
                          variant="brand"
                          onClick={() => setSchedules(prev => {
                            let lastDraftIndex = -1;
                            for (let i = prev.length - 1; i >= 0; i--) {
                              const status = prev[i].status || 'Draft';
                              if (status === 'Draft' || status === 'Drafted') {
                                lastDraftIndex = i;
                                break;
                              }
                            }
                            const insertIndex = lastDraftIndex !== -1 ? lastDraftIndex + 1 : 0;
                            const newSchedules = [
                              ...prev.slice(0, insertIndex),
                              createDefaultSchedule(),
                              ...prev.slice(insertIndex)
                            ];
                            return newSchedules.map((s, idx) => ({ ...s, orderIndex: idx }));
                          })}
                          icon={<PlusIcon className="h-4 w-4" />}
                        >
                          Add Row
                        </DashedButton>
                      </>
                    )}
                    {!hidePlotAllReadyButton && schedules.length > 0 && (
                      <DashedButton
                        type="button"
                        variant="success"
                        onClick={() => setIsPlotMode(true)}
                        icon={<CheckCircleIcon className="h-4 w-4" />}
                      >
                        Plot
                      </DashedButton>
                    )}
                  </>
                )}
                <span className="text-sm font-medium text-gray-500">
                  Rows: {schedules.length}
                </span>
                {scheduleConflicts.overlapCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConflictModalTab('overlap')
                      setIsConflictSummaryModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold hover:bg-rose-200 transition-all cursor-pointer shadow-sm animate-pulse"
                    title="Schedule Overlaps (Room / Instructor)"
                  >
                    <ExclamationIcon className="h-3.5 w-3.5 text-rose-600 shrink-0" /> {scheduleConflicts.overlapCount} Overlap{scheduleConflicts.overlapCount > 1 ? 's' : ''}
                  </button>
                )}
                {scheduleConflicts.sectionCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConflictModalTab('section')
                      setIsConflictSummaryModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-300 text-xs font-bold hover:bg-purple-200 transition-all cursor-pointer shadow-sm animate-pulse"
                    title="Duplicate Subject / Title for Section"
                  >
                    <DuplicateIcon className="h-3.5 w-3.5 text-purple-600 shrink-0" /> {scheduleConflicts.sectionCount} Duplicate Section{scheduleConflicts.sectionCount > 1 ? 's' : ''}
                  </button>
                )}
                {scheduleConflicts.missingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConflictModalTab('missing')
                      setIsConflictSummaryModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300 text-xs font-bold hover:bg-amber-200 transition-all cursor-pointer shadow-sm"
                    title="Missing / Incomplete Fields"
                  >
                    <QuestionIcon className="h-3.5 w-3.5 text-amber-600 shrink-0" /> {scheduleConflicts.missingCount} Missing Field{scheduleConflicts.missingCount > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-500 mr-1">
                  Rows: {schedules.length}
                </span>
                {scheduleConflicts.overlapCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConflictModalTab('overlap')
                      setIsConflictSummaryModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold hover:bg-rose-200 transition-all cursor-pointer shadow-sm animate-pulse"
                    title="Schedule Overlaps (Room / Instructor)"
                  >
                    <ExclamationIcon className="h-3.5 w-3.5 text-rose-600 shrink-0" /> {scheduleConflicts.overlapCount} Overlap{scheduleConflicts.overlapCount > 1 ? 's' : ''}
                  </button>
                )}
                {scheduleConflicts.sectionCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConflictModalTab('section')
                      setIsConflictSummaryModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-300 text-xs font-bold hover:bg-purple-200 transition-all cursor-pointer shadow-sm animate-pulse"
                    title="Duplicate Subject / Title for Section"
                  >
                    <DuplicateIcon className="h-3.5 w-3.5 text-purple-600 shrink-0" /> {scheduleConflicts.sectionCount} Duplicate Section{scheduleConflicts.sectionCount > 1 ? 's' : ''}
                  </button>
                )}
                {scheduleConflicts.missingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConflictModalTab('missing')
                      setIsConflictSummaryModalOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300 text-xs font-bold hover:bg-amber-200 transition-all cursor-pointer shadow-sm"
                    title="Missing / Incomplete Fields"
                  >
                    <QuestionIcon className="h-3.5 w-3.5 text-amber-600 shrink-0" /> {scheduleConflicts.missingCount} Missing Field{scheduleConflicts.missingCount > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (isEditable) {
                    const hasUnsavedChanges = JSON.stringify(schedules) !== originalSchedulesSnapshot || deletedScheduleIds.length > 0;
                    if (hasUnsavedChanges) {
                      setIsCancelConfirmModalOpen(true);
                    } else {
                      onClose();
                    }
                  } else {
                    onClose();
                  }
                }}
              >
                {isEditable ? 'Cancel' : 'Close'}
              </Button>
              {isEditable && (schedules.length > 0 || deletedScheduleIds.length > 0) && (
                <Button
                  variant="brand"
                  disabled={isSubmittingSchedules}
                  onClick={() => {
                    const isStrictPhase = selectedSemesterPhase?.phase !== 'Drafting';
                    if (scheduleConflicts.hardConflictsCount > 0 || (isStrictPhase && scheduleConflicts.missingCount > 0)) {
                      setConflictModalTab(scheduleConflicts.hardConflictsCount > 0 ? 'all' : 'missing');
                      setIsConflictSummaryModalOpen(true);
                      return;
                    }
                    const hasUnsavedChanges = JSON.stringify(schedules) !== originalSchedulesSnapshot || deletedScheduleIds.length > 0;
                    if (hasUnsavedChanges) {
                      setIsSaveConfirmModalOpen(true);
                    } else {
                      onClose();
                    }
                  }}
                >
                  {isSubmittingSchedules ? 'Saving...' : `Save All`}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="absolute inset-0 -z-10" />
      </div>

      {/* Confirm Type Change Modal */}
      {pendingTypeChange && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setPendingTypeChange(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-4 text-white rounded-t-2xl">
              <h3 className="text-lg font-bold">Confirm Type Change</h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                {pendingTypeChange.newType === 'parallel'
                  ? 'Are you sure you want to select Parallel? This will create 3 additional rows for the child classes.'
                  : 'Are you sure you want to deselect Parallel? This will remove the 3 additional child rows.'}
              </p>

              <div className="flex items-center gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPendingTypeChange(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  className="flex-1"
                  onClick={confirmTypeChange}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Undo Confirmation Modal */}
      {pendingUndoIndex !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-5 text-white rounded-t-2xl">
              <h3 className="text-lg font-bold">Confirm Undo</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">
                {(() => {
                  const s = schedules[pendingUndoIndex];
                  if (!s) return 'Are you sure you want to undo changes to this schedule?';
                  if (s.status === 'Plot' || s.status === 'Plotted') {
                    return 'Are you sure you want to undo and return this plotted schedule back to Draft?';
                  }
                  if (s.status === 'Return' || s.status === 'Returned') {
                    return 'Are you sure you want to undo and return this schedule back to Draft?';
                  }
                  return 'Are you sure you want to undo your changes and restore this schedule to its previous values?';
                })()}
              </p>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPendingUndoIndex(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  className="flex-1"
                  onClick={() => {
                    const idx = pendingUndoIndex;
                    setPendingUndoIndex(null);
                    handleUndoSchedule(idx);
                  }}
                >
                  Confirm Undo
                </Button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setPendingUndoIndex(null)} />
        </div>
      )}

      {/* Delete Rows Confirmation Modal */}
      {isDeleteConfirmModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-rose-600 p-5 text-white rounded-t-2xl">
              <h3 className="text-lg font-bold">Confirm Deletion</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">Are you sure you want to delete these rows? This action cannot be undone once saved.</p>
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsDeleteConfirmModalOpen(false)}>Cancel</Button>
                <Button className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white !border-none !shadow-md" onClick={() => { setIsDeleteConfirmModalOpen(false); setIsRemoveMode(false); executeBulkRemove(); }}>Confirm Delete</Button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setIsDeleteConfirmModalOpen(false)} />
        </div>
      )}

      {/* Plot Confirmation Modal */}
      {isPlotConfirmModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-600 p-5 text-white rounded-t-2xl">
              <h3 className="text-lg font-bold">Confirm Plotting</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">Are you sure you want to plot these selected schedules?</p>
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsPlotConfirmModalOpen(false)}>Cancel</Button>
                <Button className="flex-1 !bg-emerald-600 hover:!bg-emerald-700 !text-white !border-none !shadow-md" onClick={() => { setIsPlotConfirmModalOpen(false); handlePlotSelected(); }}>Confirm Plot</Button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setIsPlotConfirmModalOpen(false)} />
        </div>
      )}

      {/* Save Changes Confirmation Modal */}
      {isSaveConfirmModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className={`${scheduleConflicts.missingCount > 0 ? 'bg-amber-600' : 'bg-[var(--brand-color)]'} p-5 text-white rounded-t-2xl`}>
              <h3 className="text-lg font-bold flex items-center gap-2">
                {scheduleConflicts.missingCount > 0 ? (
                  <><AlertCircleIcon className="h-5 w-5 text-white shrink-0 inline-block" /> Warning: Missing Fields</>
                ) : (
                  'Save Changes'
                )}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              {scheduleConflicts.missingCount > 0 ? (
                <div className="space-y-2.5">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertCircleIcon className="h-4 w-4 text-amber-800 shrink-0 inline-block" /> {scheduleConflicts.missingCount} Incomplete Field{scheduleConflicts.missingCount > 1 ? 's' : ''} Found
                    </p>
                    <p className="text-amber-700 leading-relaxed">
                      Some schedule rows have missing fields (e.g. Type, Instructor, Days, or Room). You can proceed to save these drafts now, but remember to complete all fields before schedule publication.
                    </p>
                  </div>
                  <p className="text-sm text-gray-700">Are you sure you want to proceed and save anyway?</p>
                </div>
              ) : (
                <p className="text-sm text-gray-700">Are you sure you want to save all changes to the schedules?</p>
              )}
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsSaveConfirmModalOpen(false)}>Review Changes</Button>
                <Button 
                  variant="brand" 
                  className={`flex-1 ${scheduleConflicts.missingCount > 0 ? '!bg-amber-600 hover:!bg-amber-700 !text-white' : ''}`} 
                  onClick={() => { setIsSaveConfirmModalOpen(false); handleSaveSchedules(); }}
                >
                  {scheduleConflicts.missingCount > 0 ? 'Proceed & Save' : 'Confirm Save'}
                </Button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setIsSaveConfirmModalOpen(false)} />
        </div>
      )}

      {/* Discard Changes Confirmation Modal */}
      {isCancelConfirmModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-200 p-5 border-b border-gray-300 rounded-t-2xl">
              <h3 className="text-lg font-bold text-gray-900">Unsaved Changes</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">You have unsaved changes. Are you sure you want to discard them?</p>
              <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsCancelConfirmModalOpen(false)}>Go Back</Button>
                <Button className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white !border-none !shadow-md" onClick={() => { setIsCancelConfirmModalOpen(false); onClose(); }}>Discard</Button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setIsCancelConfirmModalOpen(false)} />
        </div>
      )}

      {/* Conflict Summary Modal */}
      {isConflictSummaryModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-7xl h-[40rem] max-h-[90vh] rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Brand Header (No Icon in Title, No X button) */}
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-8 py-5 text-white rounded-t-2xl shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-white">
                    Schedule Conflicts & Issues
                  </h3>
                  <p className="mt-0.5 text-xs text-white/80 font-medium">
                    {scheduleConflicts.hardConflictsCount > 0
                      ? 'Resolve all hard conflicts (overlaps & duplicate sections) before publishing.'
                      : 'Incomplete fields can be saved as drafts, but will show a confirmation before saving.'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="inline-flex items-center rounded-full bg-white/20 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white border border-white/30 backdrop-blur-sm">
                    {scheduleConflicts.totalConflicts} Total
                  </span>
                </div>
              </div>
            </div>

            {/* Top Toolbar: Search Bar on Left, Type Filter Tabs on Right */}
            <div className="px-8 py-3.5 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-gray-50/50 border-b border-gray-100">
              {/* Top Left: Search Bar */}
              <div className="flex-1 min-w-0">
                <SearchInput
                  value={conflictSearchQuery}
                  onChange={setConflictSearchQuery}
                  placeholder="Search room, instructor, subject, row..."
                />
              </div>

              {/* Top Right: Type Filter Tabs */}
              <div className="bg-gray-100/90 p-1.5 rounded-xl flex items-center gap-1.5 border border-gray-200/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setConflictModalTab('all')}
                  className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    conflictModalTab === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  <span>All</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[0.65rem] font-bold ${conflictModalTab === 'all' ? 'bg-gray-100 text-gray-700' : 'bg-gray-200/70 text-gray-600'}`}>
                    {scheduleConflicts.totalConflicts}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setConflictModalTab('overlap')}
                  className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    conflictModalTab === 'overlap'
                      ? 'bg-white text-rose-700 shadow-sm'
                      : 'text-gray-500 hover:text-rose-600 hover:bg-white/50'
                  }`}
                >
                  <ExclamationIcon className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  <span>Overlaps</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[0.65rem] font-bold ${conflictModalTab === 'overlap' ? 'bg-rose-100 text-rose-800' : 'bg-gray-200/70 text-gray-600'}`}>
                    {scheduleConflicts.overlapCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setConflictModalTab('section')}
                  className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    conflictModalTab === 'section'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-gray-500 hover:text-purple-600 hover:bg-white/50'
                  }`}
                >
                  <DuplicateIcon className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  <span>Duplicates</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[0.65rem] font-bold ${conflictModalTab === 'section' ? 'bg-purple-100 text-purple-800' : 'bg-gray-200/70 text-gray-600'}`}>
                    {scheduleConflicts.sectionCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setConflictModalTab('missing')}
                  className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    conflictModalTab === 'missing'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-gray-500 hover:text-amber-700 hover:bg-white/50'
                  }`}
                >
                  <QuestionIcon className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>Missing</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[0.65rem] font-bold ${conflictModalTab === 'missing' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200/70 text-gray-600'}`}>
                    {scheduleConflicts.missingCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Structured Full-Width Table Container */}
            <div className="overflow-y-auto flex-1 custom-scrollbar bg-white">
              {(() => {
                const query = conflictSearchQuery.trim().toLowerCase();
                const displayedItems = scheduleConflicts.allConflictItems.filter(item => {
                  // Type filter
                  if (conflictModalTab === 'overlap' && item.type !== 'room' && item.type !== 'instructor') return false;
                  if (conflictModalTab === 'section' && item.type !== 'section') return false;
                  if (conflictModalTab === 'missing' && item.type !== 'missing') return false;

                  // Search query filter
                  if (query) {
                    const rowText = `row #${item.rowIndex + 1} row ${item.rowIndex + 1}`;
                    const targetText = (item.conflictTarget || '').toLowerCase();
                    const messageText = (item.message || '').toLowerCase();
                    const subjectText = (item.subject || '').toLowerCase();
                    const sectionText = (item.section || '').toLowerCase();
                    const typeText = item.type === 'room' ? 'room overlap' : item.type === 'instructor' ? 'instructor overlap' : item.type === 'section' ? 'duplicate section' : 'missing field';

                    return (
                      rowText.includes(query) ||
                      targetText.includes(query) ||
                      messageText.includes(query) ||
                      subjectText.includes(query) ||
                      sectionText.includes(query) ||
                      typeText.includes(query)
                    );
                  }
                  return true;
                });

                if (scheduleConflicts.allConflictItems.length === 0) {
                  return (
                    <div className="py-16 px-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                      <CheckCircleIcon className="h-8 w-8 text-emerald-500" />
                      <p className="font-bold text-gray-700">All Clear</p>
                      <p className="text-xs text-gray-400">No conflicts or missing fields detected in this schedule.</p>
                    </div>
                  );
                }

                if (displayedItems.length === 0) {
                  return (
                    <div className="py-16 px-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                      <SearchIcon className="h-8 w-8 text-gray-300" />
                      <p className="font-bold text-gray-700">No Matching Issues</p>
                      <p className="text-xs text-gray-400">
                        {query ? `No issues matching "${conflictSearchQuery}".` : 'No issues in this category.'}
                      </p>
                      {query && (
                        <button
                          type="button"
                          onClick={() => setConflictSearchQuery('')}
                          className="mt-1 text-xs text-[var(--brand-color)] hover:underline font-bold cursor-pointer"
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 shadow-[0_2px_6px_rgba(15,23,42,0.08)] text-[0.7rem] font-extrabold text-slate-800 uppercase tracking-wider">
                      <tr>
                        <th className="py-3.5 pl-8 pr-4 w-44">Type</th>
                        <th className="py-3.5 px-4 w-28">Row</th>
                        <th className="py-3.5 px-4 w-52">Resource / Target</th>
                        <th className="py-3.5 px-4">Conflict Details & Reason</th>
                        <th className="py-3.5 pl-4 pr-8 w-44 text-right">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {displayedItems.map((item: any, idx: number) => {
                        const isOverlap = item.type === 'room' || item.type === 'instructor';
                        const isSection = item.type === 'section';

                        const typeBadge = isOverlap
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : isSection
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200';

                        const typeLabel = isOverlap
                          ? (item.type === 'room' ? 'Room Overlap' : 'Instructor')
                          : isSection
                          ? 'Duplicate Section'
                          : 'Missing Field';

                        return (
                          <tr
                            key={idx}
                            className="hover:bg-[#f3f7ee]/60 transition-colors"
                          >
                            {/* Type */}
                            <td className="py-4 pl-8 pr-4 whitespace-nowrap">
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[0.68rem] font-bold uppercase tracking-wider ${typeBadge}`}>
                                {isOverlap ? (
                                  <ExclamationIcon className="h-3 w-3 shrink-0" />
                                ) : isSection ? (
                                  <DuplicateIcon className="h-3 w-3 shrink-0" />
                                ) : (
                                  <QuestionIcon className="h-3 w-3 shrink-0" />
                                )}
                                <span>{typeLabel}</span>
                              </div>
                            </td>

                            {/* Row */}
                            <td className="py-4 px-4 whitespace-nowrap font-extrabold text-gray-900">
                              Row #{item.rowIndex + 1}
                            </td>

                            {/* Resource / Target */}
                            <td className="py-4 px-4 whitespace-nowrap font-bold text-gray-900 text-[0.8rem]" title={item.conflictTarget}>
                              {item.conflictTarget}
                            </td>

                            {/* Details & Reason */}
                            <td className="py-4 px-4 text-gray-600 font-medium leading-relaxed">
                              {item.message}
                            </td>

                            {/* Severity */}
                            <td className="py-4 pl-4 pr-8 whitespace-nowrap text-right">
                              {isOverlap || isSection ? (
                                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-bold text-rose-600 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                  Blocking
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-bold text-amber-700 uppercase tracking-wider bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  Draft Warning
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-4 border-t border-gray-200 bg-gray-50/80 flex items-center justify-between gap-3 shrink-0 rounded-b-2xl">
              <div className="text-xs text-gray-600 flex items-center gap-2">
                {scheduleConflicts.hardConflictsCount > 0 ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1.5">
                    <ExclamationIcon className="h-3.5 w-3.5 shrink-0" />
                    {scheduleConflicts.hardConflictsCount} blocking conflict{scheduleConflicts.hardConflictsCount > 1 ? 's' : ''} must be resolved before saving.
                  </span>
                ) : scheduleConflicts.missingCount > 0 ? (
                  <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                    <QuestionIcon className="h-3.5 w-3.5 shrink-0" />
                    {scheduleConflicts.missingCount} incomplete field{scheduleConflicts.missingCount > 1 ? 's' : ''} can be drafted.
                  </span>
                ) : (
                  <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                    No issues detected.
                  </span>
                )}
              </div>
              <Button
                variant="brand"
                className="!bg-[var(--brand-color)] hover:!bg-[var(--brand-color-hover)] !text-white !font-bold !px-6 !py-2.5 !rounded-xl !shadow-sm transition-all"
                onClick={() => setIsConflictSummaryModalOpen(false)}
              >
                Close & Review
              </Button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setIsConflictSummaryModalOpen(false)} />
        </div>
      )}

      {/* Custom Global Floating Tooltip with Edge Clamping */}
      {customTooltip && customTooltip.visible && (
        <div
          ref={tooltipRef}
          className={`fixed z-[350] pointer-events-none ${tooltipPos.isRight ? '' : `transform -translate-x-1/2 ${tooltipPos.isBelow ? 'translate-y-0' : '-translate-y-full'}`} px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md border text-xs font-semibold whitespace-nowrap max-w-[90vw] animate-in fade-in-0 zoom-in-95 ${customTooltip.type === 'danger'
            ? 'bg-rose-950/95 border-rose-500/40 text-rose-100 shadow-[0_8px_30px_rgba(225,29,72,0.35)]'
            : customTooltip.type === 'purple'
              ? 'bg-purple-950/95 border-purple-500/40 text-purple-100 shadow-[0_8px_30px_rgba(168,85,247,0.35)]'
              : customTooltip.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/40 text-amber-100 shadow-[0_8px_30px_rgba(245,158,11,0.35)]'
                : customTooltip.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100 shadow-[0_8px_30px_rgba(16,185,129,0.35)]'
                  : 'bg-slate-900/95 border-slate-700/60 text-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.5)]'
            }`}
          style={{
            left: tooltipPos.left || customTooltip.targetX,
            top: tooltipPos.top || customTooltip.targetY
          }}
        >
          <div className="space-y-1">
            {customTooltip.lines.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5 leading-snug">
                {customTooltip.lines.length > 1 && (
                  <span className={`shrink-0 font-bold ${
                    customTooltip.type === 'danger' ? 'text-rose-400' :
                    customTooltip.type === 'purple' ? 'text-purple-400' :
                    customTooltip.type === 'success' ? 'text-emerald-400' :
                    'text-amber-400'
                  }`}>•</span>
                )}
                <span>{line}</span>
              </div>
            ))}
          </div>
          {/* Dynamic Arrow Pointer */}
          {tooltipPos.isRight ? (
            <div
              className={`absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-r-[6px] ${
                customTooltip.type === 'danger' ? 'border-r-rose-950/95'
                : customTooltip.type === 'purple' ? 'border-r-purple-950/95'
                : customTooltip.type === 'warning' ? 'border-r-amber-950/95'
                : customTooltip.type === 'success' ? 'border-r-emerald-950/95'
                : 'border-r-slate-900/95'
              }`}
            />
          ) : (
            <div
              className={`absolute ${tooltipPos.isBelow ? 'bottom-full border-b-[6px]' : 'top-full border-t-[6px]'} -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent ${tooltipPos.isBelow
                ? (customTooltip.type === 'danger'
                  ? 'border-b-rose-950/95'
                  : customTooltip.type === 'purple'
                    ? 'border-b-purple-950/95'
                    : customTooltip.type === 'warning'
                      ? 'border-b-amber-950/95'
                      : customTooltip.type === 'success'
                        ? 'border-b-emerald-950/95'
                        : 'border-b-slate-900/95')
                : (customTooltip.type === 'danger'
                  ? 'border-t-rose-950/95'
                  : customTooltip.type === 'purple'
                    ? 'border-t-purple-950/95'
                    : customTooltip.type === 'warning'
                      ? 'border-t-amber-950/95'
                      : customTooltip.type === 'success'
                        ? 'border-t-emerald-950/95'
                        : 'border-t-slate-900/95')
                }`}
              style={{
                left: `${tooltipPos.arrowLeft}%`
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

export { DepartmentEditScheduleModal }
export type { DepartmentEditScheduleModalProps }
