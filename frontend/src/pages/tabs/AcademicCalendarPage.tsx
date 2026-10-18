import { useState, useEffect } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { DatePicker } from '../../components/DatePicker'
import { IconButton } from '../../components/IconButton'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db } from '../../firebase'
import { collection, doc, setDoc, deleteDoc, writeBatch, query, orderBy, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { PlusIcon, CheckCircleIcon, CalendarIcon, LayersIcon, ClipboardIcon, DashboardIcon, TrashIcon, EditIcon, SpinnerIcon, CloseIcon, BuildingIcon } from '../../components/Icons'

interface SemesterDetails {
  startDate?: string
  endDate?: string
  startMonth: string
  startYear: number
  endMonth: string
  endYear: number
  phase: string
}

interface AcademicYear {
  id: string
  academicYear: string
  isActive: boolean
  sem1: SemesterDetails
  sem2: SemesterDetails
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
]

const defaultSemesterDates = (academicYear = '') => {
  const startYear = Number.parseInt(academicYear, 10) || new Date().getFullYear()
  return {
    sem1Start: `${startYear}-07-06`,
    sem1End: `${startYear}-10-31`,
    sem2Start: `${startYear}-11-03`,
    sem2End: `${startYear + 1}-03-15`,
  }
}

const semesterBoundary = (semester: SemesterDetails, boundary: 'start' | 'end') => {
  const exactDate = semester[`${boundary}Date`]
  if (exactDate) return exactDate
  const month = MONTHS.indexOf(semester[`${boundary}Month`])
  const year = semester[`${boundary}Year`]
  if (month < 0 || !year) return ''
  const day = boundary === 'start' ? 1 : new Date(year, month + 1, 0).getDate()
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const formatSemesterBoundary = (semester: SemesterDetails, boundary: 'start' | 'end') => {
  const exactDate = semester[`${boundary}Date`]
  if (!exactDate) return `${semester[`${boundary}Month`]?.slice(0, 3) || ''} ${semester[`${boundary}Year`] || ''}`.trim()
  const [year, month, day] = exactDate.split('-').map(Number)
  return `${MONTHS[month - 1].slice(0, 3)} ${day}, ${year}`
}

const semesterDetails = (startDate: string, endDate: string, phase: string): SemesterDetails => ({
  startDate,
  endDate,
  startMonth: MONTHS[Number(startDate.slice(5, 7)) - 1],
  startYear: Number(startDate.slice(0, 4)),
  endMonth: MONTHS[Number(endDate.slice(5, 7)) - 1],
  endYear: Number(endDate.slice(0, 4)),
  phase,
})

const validateSemesterDates = (academicYear: string, dates: string[], years: AcademicYear[], excludedId: string | null) => {
  if (dates.some(date => !date)) {
    return 'Start and end dates are required for both semesters.'
  }
  if (dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    return 'Please select a valid start and end date for each semester.'
  }
  const [firstYear, lastYear] = academicYear.split('-').map(year => Number(year.trim()))
  if (dates.some(date => Number(date.slice(0, 4)) < firstYear || Number(date.slice(0, 4)) > lastYear)) {
    return 'Semester dates must fall within the selected academic year.'
  }
  const [start1, end1, start2, end2] = dates
  if (start1 >= end1) return '1st Semester end date must be after its start date.'
  if (start2 >= end2) return '2nd Semester end date must be after its start date.'
  if (start2 <= end1) return '2nd Semester must start after 1st Semester ends.'
  for (const existing of years) {
    if (existing.id === excludedId) continue
    const existingStart = semesterBoundary(existing.sem1, 'start')
    const existingEnd = semesterBoundary(existing.sem2, 'end')
    if (existingStart && existingEnd && start1 <= existingEnd && end2 >= existingStart) {
      return `Overlaps with ${existing.academicYear} (${formatSemesterBoundary(existing.sem1, 'start')} - ${formatSemesterBoundary(existing.sem2, 'end')})`
    }
  }
  return ''
}

const phaseClasses: Record<string, string> = {
  Closed: 'bg-gray-100 text-gray-600 border-gray-200',
  Drafting: 'bg-amber-100 text-amber-700 border-amber-200',
  Plotting: 'bg-blue-100 text-blue-700 border-blue-200',
  Revision: 'bg-purple-100 text-purple-700 border-purple-200',
  Final: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Ended: 'bg-rose-100 text-rose-700 border-rose-200',
}

interface AcademicCalendarPageProps {
  userRole: string
}

function AcademicCalendarPage({ userRole }: AcademicCalendarPageProps) {
  const canManageCalendar = userRole === 'Admin' || userRole === 'Registrar'
  const [years, setYears] = useState<AcademicYear[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  
  // New Filters
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [sem1PhaseFilters, setSem1PhaseFilters] = useState<string[]>([])
  const [sem2PhaseFilters, setSem2PhaseFilters] = useState<string[]>([])
  const [timingFilters, setTimingFilters] = useState<string[]>([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPhaseModalOpen, setIsPhaseModalOpen] = useState(false)
  const [editingYearId, setEditingYearId] = useState<string | null>(null)
  const [yearToDelete, setYearToDelete] = useState<AcademicYear | null>(null)
  const [isDeletingYear, setIsDeletingYear] = useState(false)
  
  // Manage Phase State
  const [manageYearId, setManageYearId] = useState('')
  const [manageSem1Start, setManageSem1Start] = useState('')
  const [manageSem1End, setManageSem1End] = useState('')
  const [manageSem1Phase, setManageSem1Phase] = useState('Closed')
  const [manageSem2Start, setManageSem2Start] = useState('')
  const [manageSem2End, setManageSem2End] = useState('')
  const [manageSem2Phase, setManageSem2Phase] = useState('Closed')
  const [manageError, setManageError] = useState('')
  const [isManageSubmitting, setIsManageSubmitting] = useState(false)
  
  // Form State
  const [newYear, setNewYear] = useState('')
  const [sem1Start, setSem1Start] = useState(() => defaultSemesterDates().sem1Start)
  const [sem1End, setSem1End] = useState(() => defaultSemesterDates().sem1End)
  const [sem1Phase, setSem1Phase] = useState('Closed')
  const [sem2Start, setSem2Start] = useState(() => defaultSemesterDates().sem2Start)
  const [sem2End, setSem2End] = useState(() => defaultSemesterDates().sem2End)
  const [sem2Phase, setSem2Phase] = useState('Closed')
  
  const [createError, setCreateError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Real-time listener for academic years
  useEffect(() => {
    const q = query(collection(db, 'academicYears'), orderBy('academicYear', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const yearsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AcademicYear[]
      setYears(yearsData)
    }, (error) => {
      console.error("Error fetching academic years: ", error)
    })

    return () => unsubscribe()
  }, [])

  const filteredYears = years.filter(y => {
    const matchesSearch = y.academicYear.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilters.length === 0 || 
      (statusFilters.includes('Active') && y.isActive) ||
      (statusFilters.includes('Inactive') && !y.isActive)
    const matchesSem1Phase = sem1PhaseFilters.length === 0 || sem1PhaseFilters.includes(y.sem1.phase || 'Closed')
    const matchesSem2Phase = sem2PhaseFilters.length === 0 || sem2PhaseFilters.includes(y.sem2.phase || 'Closed')
    const matchesTiming = timingFilters.length === 0 || timingFilters.some(timing => {
       if (timing === 'Early Start') return ['January', 'February', 'March', 'April', 'May', 'June'].includes(y.sem1.startMonth)
       if (timing === 'Regular Start') return ['July', 'August', 'September'].includes(y.sem1.startMonth)
       if (timing === 'Late Start') return ['October', 'November', 'December'].includes(y.sem1.startMonth)
       return false
    })
    return matchesSearch && matchesStatus && matchesSem1Phase && matchesSem2Phase && matchesTiming
  }).sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return b.academicYear.localeCompare(a.academicYear)
  })

  const columns: ColumnDef<AcademicYear>[] = [
    {
      header: 'Academic Year',
      render: (year) => (
        <span className={`font-bold ${year.isActive ? 'text-[var(--brand-color)]' : 'text-gray-900'}`}>
          {year.academicYear}
        </span>
      )
    },
    {
      header: '1st Sem Dates',
      render: (year) => (
        <span className="text-gray-600 font-medium">
          {formatSemesterBoundary(year.sem1, 'start')} - {formatSemesterBoundary(year.sem1, 'end')}
        </span>
      )
    },
    {
      header: '1st Sem Phase',
      render: (year) => (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold border ${phaseClasses[year.sem1.phase] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
          {year.sem1.phase || 'Not Set'}
        </span>
      )
    },
    {
      header: '2nd Sem Dates',
      render: (year) => (
        <span className="text-gray-600 font-medium">
          {formatSemesterBoundary(year.sem2, 'start')} - {formatSemesterBoundary(year.sem2, 'end')}
        </span>
      )
    },
    {
      header: '2nd Sem Phase',
      align: canManageCalendar ? undefined : 'right',
      width: canManageCalendar ? undefined : '1%',
      render: (year) => (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold border ${phaseClasses[year.sem2.phase] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
          {year.sem2.phase || 'Not Set'}
        </span>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      render: (year) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Edit School Year"
            onClick={() => handleEditClick(year)}
            className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5 transition-all"
          >
            <EditIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Delete School Year"
            onClick={() => setYearToDelete(year)}
            className="h-8 w-8 rounded-lg bg-white text-rose-500 shadow-sm border border-slate-200 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5 transition-all"
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      )
    }
  ]

  const handleYearChange = (val: string) => {
    // If the input was already formatted and user presses backspace/changes it, clear it
    if (newYear.length > 2 && val.length < newYear.length) {
      setNewYear('')
      setCreateError('')
      return
    }

    const numbersOnly = val.replace(/[^0-9]/g, '')
    if (numbersOnly.length === 0) {
      setNewYear('')
    } else if (numbersOnly.length === 1) {
      setNewYear(numbersOnly)
    } else if (numbersOnly.length === 2) {
      const start = 2000 + parseInt(numbersOnly)
      setNewYear(`${start} - ${start + 1}`)
      const defaults = defaultSemesterDates(String(start))
      setSem1Start(defaults.sem1Start)
      setSem1End(defaults.sem1End)
      setSem2Start(defaults.sem2Start)
      setSem2End(defaults.sem2End)
    }
    setCreateError('')
  }

  const handleEditClick = (year: AcademicYear) => {
    if (!canManageCalendar) return
    setEditingYearId(year.id)
    setNewYear(year.academicYear)
    setSem1Start(year.sem1.startDate || defaultSemesterDates(year.academicYear).sem1Start)
    setSem1End(year.sem1.endDate || defaultSemesterDates(year.academicYear).sem1End)
    setSem1Phase(year.sem1.phase || 'Closed')
    setSem2Start(year.sem2.startDate || defaultSemesterDates(year.academicYear).sem2Start)
    setSem2End(year.sem2.endDate || defaultSemesterDates(year.academicYear).sem2End)
    setSem2Phase(year.sem2.phase || 'Closed')
    setCreateError('')
    setIsModalOpen(true)
  }

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManageCalendar) return
    setCreateError('')
    const yearTrimmed = newYear.trim()
    
    // Check duplication only if creating a new year
    if (!editingYearId) {
      const exists = years.some(y => y.academicYear === yearTrimmed)
      if (exists) {
        setCreateError('School year already exists.')
        return
      }
    }

    const validationError = validateSemesterDates(yearTrimmed, [sem1Start, sem1End, sem2Start, sem2End], years, editingYearId)
    if (validationError) {
      setCreateError(validationError)
      return
    }

    setIsSubmitting(true)
    try {
      if (editingYearId) {
        const docRef = doc(db, 'academicYears', editingYearId)
        await updateDoc(docRef, {
          sem1: semesterDetails(sem1Start, sem1End, sem1Phase),
          sem2: semesterDetails(sem2Start, sem2End, sem2Phase)
        })
      } else {
        const newDocRef = doc(collection(db, 'academicYears'))
        await setDoc(newDocRef, {
          academicYear: yearTrimmed,
          isActive: years.length === 0, // Make it active if it's the first one
          sem1: semesterDetails(sem1Start, sem1End, sem1Phase),
          sem2: semesterDetails(sem2Start, sem2End, sem2Phase),
          createdAt: serverTimestamp()
        })
      }
      
      setIsModalOpen(false)
      setEditingYearId(null)
      setNewYear('')
      setSem1Start(defaultSemesterDates().sem1Start)
      setSem1End(defaultSemesterDates().sem1End)
      setSem1Phase('Closed')
      setSem2Start(defaultSemesterDates().sem2Start)
      setSem2End(defaultSemesterDates().sem2End)
      setSem2Phase('Closed')
      setCreateError('')
    } catch (error) {
      console.error('Error creating school year:', error)
      setCreateError('Failed to create school year.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDeleteYear = async () => {
    if (!canManageCalendar || !yearToDelete) return
    setIsDeletingYear(true)
    try {
      await deleteDoc(doc(db, 'academicYears', yearToDelete.id))
      setYearToDelete(null)
    } catch (error) {
      console.error('Error deleting year:', error)
    } finally {
      setIsDeletingYear(false)
    }
  }

  const handleOpenPhaseModal = () => {
    if (!canManageCalendar) return
    const currentActive = years.find(y => y.isActive)
    if (currentActive) {
      setManageYearId(currentActive.id)
      setManageSem1Start(currentActive.sem1.startDate || defaultSemesterDates(currentActive.academicYear).sem1Start)
      setManageSem1End(currentActive.sem1.endDate || defaultSemesterDates(currentActive.academicYear).sem1End)
      setManageSem1Phase(currentActive.sem1.phase || 'Closed')
      setManageSem2Start(currentActive.sem2.startDate || defaultSemesterDates(currentActive.academicYear).sem2Start)
      setManageSem2End(currentActive.sem2.endDate || defaultSemesterDates(currentActive.academicYear).sem2End)
      setManageSem2Phase(currentActive.sem2.phase || 'Closed')
    } else if (years.length > 0) {
      setManageYearId(years[0].id)
      setManageSem1Start(years[0].sem1.startDate || defaultSemesterDates(years[0].academicYear).sem1Start)
      setManageSem1End(years[0].sem1.endDate || defaultSemesterDates(years[0].academicYear).sem1End)
      setManageSem1Phase(years[0].sem1.phase || 'Closed')
      setManageSem2Start(years[0].sem2.startDate || defaultSemesterDates(years[0].academicYear).sem2Start)
      setManageSem2End(years[0].sem2.endDate || defaultSemesterDates(years[0].academicYear).sem2End)
      setManageSem2Phase(years[0].sem2.phase || 'Closed')
    }
    setManageError('')
    setIsPhaseModalOpen(true)
  }

  const handleManageYearChangeStr = (academicYearStr: string) => {
    const selectedYear = years.find(y => y.academicYear === academicYearStr)
    if (selectedYear) {
      setManageYearId(selectedYear.id)
      setManageSem1Start(selectedYear.sem1.startDate || defaultSemesterDates(selectedYear.academicYear).sem1Start)
      setManageSem1End(selectedYear.sem1.endDate || defaultSemesterDates(selectedYear.academicYear).sem1End)
      setManageSem1Phase(selectedYear.sem1.phase || 'Closed')
      setManageSem2Start(selectedYear.sem2.startDate || defaultSemesterDates(selectedYear.academicYear).sem2Start)
      setManageSem2End(selectedYear.sem2.endDate || defaultSemesterDates(selectedYear.academicYear).sem2End)
      setManageSem2Phase(selectedYear.sem2.phase || 'Closed')
    }
  }

  const handleSavePhases = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManageCalendar) return
    setManageError('')
    if (!manageYearId) {
      setManageError('Please select a school year.')
      return
    }

    const selectedYearDoc = years.find(y => y.id === manageYearId)
    if (!selectedYearDoc) {
      setManageError('Selected school year not found.')
      return
    }

    const validationError = validateSemesterDates(selectedYearDoc.academicYear, [manageSem1Start, manageSem1End, manageSem2Start, manageSem2End], years, manageYearId)
    if (validationError) {
      setManageError(validationError)
      return
    }

    setIsManageSubmitting(true)
    try {
      const batch = writeBatch(db)
      years.forEach(y => {
        const ref = doc(db, 'academicYears', y.id)
        if (y.id === manageYearId) {
          batch.update(ref, { 
            isActive: true,
            sem1: semesterDetails(manageSem1Start, manageSem1End, manageSem1Phase),
            sem2: semesterDetails(manageSem2Start, manageSem2End, manageSem2Phase)
          })
        } else if (y.isActive) {
          batch.update(ref, { isActive: false })
        }
      })
      await batch.commit()
      setIsPhaseModalOpen(false)
    } catch (error) {
      console.error('Error saving phases:', error)
      setManageError('Failed to update active year and phases.')
    } finally {
      setIsManageSubmitting(false)
    }
  }

  const activeYear = years.find(y => y.isActive)

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        
        <SectionHeader 
          title="Academic Calendar" 
          description="Manage academic years, historical records, and scheduling phases." 
        />
        <DataTable
          data={filteredYears}
          columns={canManageCalendar ? columns : columns.filter(column => column.header !== 'Actions')}
          searchPlaceholder="Search school years..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={
            <FilterDropdown 
              groups={[
                {
                  id: 'status',
                  title: 'Status',
                  options: ['Active', 'Inactive'],
                  selectedValues: statusFilters,
                  onChange: setStatusFilters
                },
                {
                  id: 'sem1Phase',
                  title: '1st Sem Phase',
                  options: ['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended'],
                  selectedValues: sem1PhaseFilters,
                  onChange: setSem1PhaseFilters
                },
                {
                  id: 'sem2Phase',
                  title: '2nd Sem Phase',
                  options: ['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended'],
                  selectedValues: sem2PhaseFilters,
                  onChange: setSem2PhaseFilters
                },
                {
                  id: 'timing',
                  title: 'Sem 1 Start',
                  options: ['Early Start', 'Regular Start', 'Late Start'],
                  selectedValues: timingFilters,
                  onChange: setTimingFilters
                }
              ]}
              onClearAll={() => {
                setStatusFilters([])
                setSem1PhaseFilters([])
                setSem2PhaseFilters([])
                setTimingFilters([])
              }}
            />
          }
          primaryAction={canManageCalendar && (
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Button 
                variant="outline" 
                onClick={handleOpenPhaseModal} 
                icon={<CalendarIcon className="h-4 w-4" />}
              >
                Manage Active Year
              </Button>
              <Button 
                variant="brand" 
                onClick={() => {
                  setEditingYearId(null)
                  setNewYear('')
                  setSem1Start(defaultSemesterDates().sem1Start)
                  setSem1End(defaultSemesterDates().sem1End)
                  setSem1Phase('Closed')
                  setSem2Start(defaultSemesterDates().sem2Start)
                  setSem2End(defaultSemesterDates().sem2End)
                  setSem2Phase('Closed')
                  setCreateError('')
                  setIsModalOpen(true)
                }} 
                icon={<PlusIcon className="h-4 w-4" />}
              >
                New School Year
              </Button>
            </div>
          )}
        />
      {/* Add / Edit School Year Modal */}
      {canManageCalendar && isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">{editingYearId ? 'Edit School Year' : 'Create New School Year'}</h3>
              <p className="mt-1 text-sm text-white/80">{editingYearId ? 'Reconfigure the start and end dates for this year.' : 'Add a new academic year and configure its semesters.'}</p>
            </div>
            <form onSubmit={handleCreateYear} className="p-6 space-y-6">
              <div>
                <label htmlFor="academic-year-input" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Academic Year <span className="text-rose-500">*</span>
                </label>
                <TextInput
                  id="academic-year-input"
                  required
                  disabled={!!editingYearId}
                  placeholder="e.g. Type '25' for 2025 - 2026"
                  value={newYear}
                  onChange={handleYearChange}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 1st Semester Config */}
                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-gray-800">1st Semester</h4>
                  
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={sem1Start} onChange={setSem1Start} hideClear />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={sem1End} onChange={setSem1End} hideClear />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={sem1Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setSem1Phase} />
                  </div>
                </div>

                {/* 2nd Semester Config */}
                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-gray-800">2nd Semester</h4>
                  
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={sem2Start} onChange={setSem2Start} hideClear align="right" />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={sem2End} onChange={setSem2End} hideClear align="right" />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={sem2Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setSem2Phase} />
                  </div>
                </div>
              </div>
              
              {createError && (
                <p className="text-xs font-bold text-rose-600 animate-in fade-in slide-in-from-top-1 text-center">
                  {createError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditingYearId(null)
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSubmitting || !/^\d{4}\s*-\s*\d{4}$/.test(newYear.trim()) || !sem1Start || !sem1End || !sem2Start || !sem2End}
                  icon={isSubmitting ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />}
                  className="flex-1"
                >
                  {editingYearId ? 'Save Changes' : 'Create School Year'}
                </Button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => !isSubmitting && setIsModalOpen(false)}
          />
        </div>
      )}
    
      {/* Manage Active Year & Phases Modal */}
      {canManageCalendar && isPhaseModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Manage Active Year & Phases</h3>
              <p className="mt-1 text-sm text-white/80">Set the active school year and its semester details.</p>
            </div>
            <form onSubmit={handleSavePhases} className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Active School Year <span className="text-rose-500">*</span>
                </label>
                <SingleSelectDropdown 
                  value={years.find(y => y.id === manageYearId)?.academicYear || ''} 
                  options={years.map(y => y.academicYear)} 
                  onChange={handleManageYearChangeStr} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 1st Semester Config */}
                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-gray-800">1st Semester</h4>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={manageSem1Start} onChange={setManageSem1Start} hideClear />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={manageSem1End} onChange={setManageSem1End} hideClear />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={manageSem1Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setManageSem1Phase} />
                  </div>
                </div>

                {/* 2nd Semester Config */}
                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-xs">
                  <h4 className="text-sm font-bold text-gray-800">2nd Semester</h4>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={manageSem2Start} onChange={setManageSem2Start} hideClear align="right" />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Date <span className="text-rose-500">*</span></label>
                    <DatePicker value={manageSem2End} onChange={setManageSem2End} hideClear align="right" />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={manageSem2Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setManageSem2Phase} />
                  </div>
                </div>
              </div>
              
              {manageError && (
                <p className="text-xs font-bold text-rose-600 animate-in fade-in slide-in-from-top-1 text-center">
                  {manageError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPhaseModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isManageSubmitting || !manageYearId || !manageSem1Start || !manageSem1End || !manageSem2Start || !manageSem2End}
                  icon={isManageSubmitting ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />}
                  className="flex-1"
                >
                  Save Settings
                </Button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => !isManageSubmitting && setIsPhaseModalOpen(false)}
          />
        </div>
      )}

      {/* Delete School Year Confirmation Modal */}
      {canManageCalendar && yearToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-bold">Delete School Year</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this school year?</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shrink-0">
                  <CalendarIcon className="h-7 w-7 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">A.Y. {yearToDelete.academicYear}</p>
                  <p className="text-xs font-medium text-gray-500">
                    {yearToDelete.isActive ? 'Active School Year' : 'Inactive'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently remove this academic year configuration. This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setYearToDelete(null)}
                  disabled={isDeletingYear}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={confirmDeleteYear}
                  disabled={isDeletingYear}
                  className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg"
                >
                  {isDeletingYear ? 'Deleting...' : 'Confirm Delete'}
                </Button>
              </div>
            </div>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onClick={() => {
              if (!isDeletingYear) setYearToDelete(null)
            }}
          />
        </div>
      )}
      </div>
    </section>
  )
}

export default AcademicCalendarPage
