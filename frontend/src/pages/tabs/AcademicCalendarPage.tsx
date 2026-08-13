import { useState, useEffect } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { Button } from '../../components/Button'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db } from '../../firebase'
import { collection, doc, setDoc, deleteDoc, writeBatch, query, orderBy, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { PlusIcon, CheckCircleIcon, CalendarIcon, LayersIcon, ClipboardIcon, DashboardIcon, TrashIcon, EditIcon, SpinnerIcon, CloseIcon, UserIcon, ClockIcon, BuildingIcon } from '../../components/Icons'
import { SummaryCard } from '../../components/SummaryCard'

interface SemesterDetails {
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

const formatShortMonth = (monthName: string) => {
  if (!monthName) return ''
  return monthName.slice(0, 3)
}

const phaseClasses: Record<string, string> = {
  Closed: 'bg-gray-100 text-gray-600 border-gray-200',
  Drafting: 'bg-amber-100 text-amber-700 border-amber-200',
  Plotting: 'bg-blue-100 text-blue-700 border-blue-200',
  Revision: 'bg-purple-100 text-purple-700 border-purple-200',
  Final: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Ended: 'bg-rose-100 text-rose-700 border-rose-200',
}

function AcademicCalendarPage() {
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
  
  // Manage Phase State
  const [manageYearId, setManageYearId] = useState('')
  const [manageSem1Start, setManageSem1Start] = useState('July')
  const [manageSem1End, setManageSem1End] = useState('September')
  const [manageSem1Phase, setManageSem1Phase] = useState('Closed')
  const [manageSem2Start, setManageSem2Start] = useState('November')
  const [manageSem2End, setManageSem2End] = useState('January')
  const [manageSem2Phase, setManageSem2Phase] = useState('Closed')
  const [manageError, setManageError] = useState('')
  const [isManageSubmitting, setIsManageSubmitting] = useState(false)
  
  // Form State
  const [newYear, setNewYear] = useState('')
  const [sem1Start, setSem1Start] = useState('July')
  const [sem1End, setSem1End] = useState('September')
  const [sem1Phase, setSem1Phase] = useState('Closed')
  const [sem2Start, setSem2Start] = useState('November')
  const [sem2End, setSem2End] = useState('January')
  const [sem2Phase, setSem2Phase] = useState('Closed')
  
  const [createError, setCreateError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'academicYears'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AcademicYear))
      setYears(fetched)
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
        <span className={`font-bold text-base ${year.isActive ? 'text-emerald-600' : 'text-gray-900'}`}>
          {year.academicYear}
        </span>
      )
    },
    {
      header: '1st Semester',
      render: (year) => (
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-700">
            {formatShortMonth(year.sem1.startMonth)} - {formatShortMonth(year.sem1.endMonth)}
          </span>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider border ${phaseClasses[year.sem1.phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {year.sem1.phase || 'Closed'}
          </span>
        </div>
      )
    },
    {
      header: '2nd Semester',
      render: (year) => (
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-700">
            {formatShortMonth(year.sem2.startMonth)} - {formatShortMonth(year.sem2.endMonth)}
          </span>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider border ${phaseClasses[year.sem2.phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {year.sem2.phase || 'Closed'}
          </span>
        </div>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      render: (year) => (
        <div className="flex justify-end gap-2">
          <button
            title="Edit School Year"
            onClick={(e) => { e.stopPropagation(); handleEditClick(year); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-700 shadow-sm border border-gray-200 transition-colors"
          >
            <EditIcon className="h-4 w-4" />
          </button>
          <button
            title="Delete School Year"
            onClick={(e) => { e.stopPropagation(); handleDeleteYear(year.id); }}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white border border-rose-100 text-rose-400 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
          >
            <TrashIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      )
    }
  ]

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
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
    }
    setCreateError('')
  }

  const handleEditClick = (year: AcademicYear) => {
    setEditingYearId(year.id)
    setNewYear(year.academicYear)
    setSem1Start(year.sem1.startMonth)
    setSem1End(year.sem1.endMonth)
    setSem1Phase(year.sem1.phase || 'Closed')
    setSem2Start(year.sem2.startMonth)
    setSem2End(year.sem2.endMonth)
    setSem2Phase(year.sem2.phase || 'Closed')
    setCreateError('')
    setIsModalOpen(true)
  }

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault()
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

    const yearMatches = yearTrimmed.match(/(\d{4})\s*-\s*(\d{4})/)
    let baseYear = new Date().getFullYear()
    if (yearMatches) {
      baseYear = parseInt(yearMatches[1], 10)
    } else {
      setCreateError('Please format the year properly (type a 2 digit number).')
      return
    }

    const getMonthIndex = (monthName: string) => MONTHS.indexOf(monthName)
    
    // Sem 1 Inference
    const sem1StartIdx = getMonthIndex(sem1Start)
    const sem1EndIdx = getMonthIndex(sem1End)
    const sem1StartYear = baseYear
    const sem1EndYear = sem1EndIdx < sem1StartIdx ? baseYear + 1 : baseYear

    // Sem 2 Inference
    const sem2StartIdx = getMonthIndex(sem2Start)
    const sem2EndIdx = getMonthIndex(sem2End)
    // Cap the inferred year to maximum of baseYear + 1
    const sem2StartYear = Math.min(sem2StartIdx < sem1EndIdx ? sem1EndYear + 1 : sem1EndYear, baseYear + 1)
    const sem2EndYear = Math.min(sem2EndIdx < sem2StartIdx ? sem2StartYear + 1 : sem2StartYear, baseYear + 1)

    // Validation (Absolute Months: Year * 12 + Month)
    const date1Start = sem1StartYear * 12 + sem1StartIdx
    const date1End = sem1EndYear * 12 + sem1EndIdx
    const date2Start = sem2StartYear * 12 + sem2StartIdx
    const date2End = sem2EndYear * 12 + sem2EndIdx

    if (date1Start >= date1End) {
      setCreateError('1st Semester end month must be after its start month.')
      return
    }
    if (date2Start >= date2End) {
      setCreateError('2nd Semester end month must be after its start month.')
      return
    }
    if (date2Start <= date1End) {
      setCreateError('2nd Semester must start after 1st Semester ends.')
      return
    }

    // Inter-Year Overlap Validation
    for (const existing of years) {
      if (editingYearId === existing.id) continue;

      const existingStart = existing.sem1.startYear * 12 + getMonthIndex(existing.sem1.startMonth)
      const existingEnd = existing.sem2.endYear * 12 + getMonthIndex(existing.sem2.endMonth)

      if (date1Start <= existingEnd && date2End >= existingStart) {
        setCreateError(`Overlaps with ${existing.academicYear} (${existing.sem1.startMonth} ${existing.sem1.startYear} - ${existing.sem2.endMonth} ${existing.sem2.endYear})`)
        return
      }
    }

    setIsSubmitting(true)
    try {
      if (editingYearId) {
        const docRef = doc(db, 'academicYears', editingYearId)
        await updateDoc(docRef, {
          sem1: { startMonth: sem1Start, startYear: sem1StartYear, endMonth: sem1End, endYear: sem1EndYear, phase: sem1Phase },
          sem2: { startMonth: sem2Start, startYear: sem2StartYear, endMonth: sem2End, endYear: sem2EndYear, phase: sem2Phase }
        })
      } else {
        const newDocRef = doc(collection(db, 'academicYears'))
        await setDoc(newDocRef, {
          academicYear: yearTrimmed,
          isActive: years.length === 0, // Make it active if it's the first one
          sem1: { startMonth: sem1Start, startYear: sem1StartYear, endMonth: sem1End, endYear: sem1EndYear, phase: sem1Phase },
          sem2: { startMonth: sem2Start, startYear: sem2StartYear, endMonth: sem2End, endYear: sem2EndYear, phase: sem2Phase },
          createdAt: serverTimestamp()
        })
      }
      
      setIsModalOpen(false)
      setEditingYearId(null)
      setNewYear('')
      setSem1Start('July')
      setSem1End('September')
      setSem1Phase('Closed')
      setSem2Start('November')
      setSem2End('January')
      setSem2Phase('Closed')
      setCreateError('')
    } catch (error) {
      console.error('Error creating school year:', error)
      setCreateError('Failed to create school year.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteYear = async (yearId: string) => {
    if (window.confirm("Are you sure you want to delete this school year?")) {
      try {
        await deleteDoc(doc(db, 'academicYears', yearId))
      } catch (error) {
        console.error('Error deleting year:', error)
      }
    }
  }

  const handleOpenPhaseModal = () => {
    const currentActive = years.find(y => y.isActive)
    if (currentActive) {
      setManageYearId(currentActive.id)
      setManageSem1Start(currentActive.sem1.startMonth || 'July')
      setManageSem1End(currentActive.sem1.endMonth || 'September')
      setManageSem1Phase(currentActive.sem1.phase || 'Closed')
      setManageSem2Start(currentActive.sem2.startMonth || 'November')
      setManageSem2End(currentActive.sem2.endMonth || 'January')
      setManageSem2Phase(currentActive.sem2.phase || 'Closed')
    } else if (years.length > 0) {
      setManageYearId(years[0].id)
      setManageSem1Start(years[0].sem1.startMonth || 'July')
      setManageSem1End(years[0].sem1.endMonth || 'September')
      setManageSem1Phase(years[0].sem1.phase || 'Closed')
      setManageSem2Start(years[0].sem2.startMonth || 'November')
      setManageSem2End(years[0].sem2.endMonth || 'January')
      setManageSem2Phase(years[0].sem2.phase || 'Closed')
    }
    setManageError('')
    setIsPhaseModalOpen(true)
  }

  const handleManageYearChangeStr = (academicYearStr: string) => {
    const selectedYear = years.find(y => y.academicYear === academicYearStr)
    if (selectedYear) {
      setManageYearId(selectedYear.id)
      setManageSem1Start(selectedYear.sem1.startMonth || 'July')
      setManageSem1End(selectedYear.sem1.endMonth || 'September')
      setManageSem1Phase(selectedYear.sem1.phase || 'Closed')
      setManageSem2Start(selectedYear.sem2.startMonth || 'November')
      setManageSem2End(selectedYear.sem2.endMonth || 'January')
      setManageSem2Phase(selectedYear.sem2.phase || 'Closed')
    }
  }

  const handleSavePhases = async (e: React.FormEvent) => {
    e.preventDefault()
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

    const yearMatches = selectedYearDoc.academicYear.match(/(\d{4})\s*-\s*(\d{4})/)
    let baseYear = new Date().getFullYear()
    if (yearMatches) {
      baseYear = parseInt(yearMatches[1], 10)
    }

    const getMonthIndex = (monthName: string) => MONTHS.indexOf(monthName)

    // Sem 1 Inference
    const sem1StartIdx = getMonthIndex(manageSem1Start)
    const sem1EndIdx = getMonthIndex(manageSem1End)
    const sem1StartYear = baseYear
    const sem1EndYear = sem1EndIdx < sem1StartIdx ? baseYear + 1 : baseYear

    // Sem 2 Inference
    const sem2StartIdx = getMonthIndex(manageSem2Start)
    const sem2EndIdx = getMonthIndex(manageSem2End)
    const sem2StartYear = Math.min(sem2StartIdx < sem1EndIdx ? sem1EndYear + 1 : sem1EndYear, baseYear + 1)
    const sem2EndYear = Math.min(sem2EndIdx < sem2StartIdx ? sem2StartYear + 1 : sem2StartYear, baseYear + 1)

    // Validation (Absolute Months: Year * 12 + Month)
    const date1Start = sem1StartYear * 12 + sem1StartIdx
    const date1End = sem1EndYear * 12 + sem1EndIdx
    const date2Start = sem2StartYear * 12 + sem2StartIdx
    const date2End = sem2EndYear * 12 + sem2EndIdx

    if (date1Start >= date1End) {
      setManageError('1st Semester end month must be after its start month.')
      return
    }
    if (date2Start >= date2End) {
      setManageError('2nd Semester end month must be after its start month.')
      return
    }
    if (date2Start <= date1End) {
      setManageError('2nd Semester must start after 1st Semester ends.')
      return
    }

    // Inter-Year Overlap Validation
    for (const existing of years) {
      if (manageYearId === existing.id) continue;

      const existingStart = existing.sem1.startYear * 12 + getMonthIndex(existing.sem1.startMonth)
      const existingEnd = existing.sem2.endYear * 12 + getMonthIndex(existing.sem2.endMonth)

      if (date1Start <= existingEnd && date2End >= existingStart) {
        setManageError(`Overlaps with ${existing.academicYear} (${existing.sem1.startMonth} ${existing.sem1.startYear} - ${existing.sem2.endMonth} ${existing.sem2.endYear})`)
        return
      }
    }

    setIsManageSubmitting(true)
    try {
      const batch = writeBatch(db)
      years.forEach(y => {
        const ref = doc(db, 'academicYears', y.id)
        if (y.id === manageYearId) {
          batch.update(ref, { 
            isActive: true,
            sem1: {
              startMonth: manageSem1Start,
              startYear: sem1StartYear,
              endMonth: manageSem1End,
              endYear: sem1EndYear,
              phase: manageSem1Phase
            },
            sem2: {
              startMonth: manageSem2Start,
              startYear: sem2StartYear,
              endMonth: manageSem2End,
              endYear: sem2EndYear,
              phase: manageSem2Phase
            }
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
      <div className="space-y-6">
        
        <SectionHeader 
          title="Academic Calendar" 
          description="Manage academic years, historical records, and scheduling phases." 
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
          <SummaryCard
            title="Card 1"
            subtitle="Subtitle 1"
            icon={<UserIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          />
          <SummaryCard
            title="Card 2"
            subtitle="Subtitle 2"
            icon={<CalendarIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          />
          <SummaryCard
            title="Card 3"
            subtitle="Subtitle 3"
            icon={<ClockIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-blue-400 to-indigo-500"
            blobClasses="bg-blue-400/8 group-hover:bg-blue-400/14"
          />
        </div>
        <DataTable
          data={filteredYears}
          columns={columns}
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
          primaryAction={
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
                  setSem1Start('July')
                  setSem1End('September')
                  setSem1Phase('Closed')
                  setSem2Start('November')
                  setSem2End('January')
                  setSem2Phase('Closed')
                  setCreateError('')
                  setIsModalOpen(true)
                }} 
                icon={<PlusIcon className="h-4 w-4" />}
              >
                New School Year
              </Button>
            </div>
          }
        />
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">{editingYearId ? 'Edit School Year' : 'Create New School Year'}</h3>
                <p className="mt-1 text-sm text-white/80">{editingYearId ? 'Reconfigure the start and end months for this year.' : 'Add a new academic year and configure its semesters.'}</p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  setEditingYearId(null)
                }}
                className="text-white/80 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateYear} className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Academic Year <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingYearId}
                  placeholder="e.g. Type '25' for 2025 - 2026"
                  value={newYear}
                  onChange={handleYearChange}
                  className={`w-full rounded-md border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm ${editingYearId ? 'bg-gray-50 cursor-not-allowed text-gray-500' : 'bg-white'}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 1st Semester Config */}
                <div className="space-y-4 rounded-md border border-gray-200 bg-gray-100 p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800">1st Semester</h4>
                  
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Month</label>
                    <SingleSelectDropdown value={sem1Start} options={MONTHS} onChange={setSem1Start} />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Month</label>
                    <SingleSelectDropdown value={sem1End} options={MONTHS} onChange={setSem1End} />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={sem1Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setSem1Phase} />
                  </div>
                </div>

                {/* 2nd Semester Config */}
                <div className="space-y-4 rounded-md border border-gray-200 bg-gray-100 p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800">2nd Semester</h4>
                  
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Month</label>
                    <SingleSelectDropdown value={sem2Start} options={MONTHS} onChange={setSem2Start} />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Month</label>
                    <SingleSelectDropdown value={sem2End} options={MONTHS} onChange={setSem2End} />
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

              <div className="flex items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditingYearId(null)
                  }}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-50 active:shadow-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !/^\d{4}\s*-\s*\d{4}$/.test(newYear.trim())}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[var(--brand-color-hover)] hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#7b9d4f]/30 active:shadow-none disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <SpinnerIcon className="h-5 w-5" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5" />
                  )}
                  {editingYearId ? 'Save Changes' : 'Create School Year'}
                </button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => !isSubmitting && setIsModalOpen(false)}
          />
        </div>
      )}
    
      {isPhaseModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Manage Active Year & Phases</h3>
                <p className="mt-1 text-sm text-white/80">Set the active school year and its semester details.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPhaseModalOpen(false)}
                className="text-white/80 hover:text-white transition"
              >
                ✕
              </button>
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
                <div className="space-y-4 rounded-md border border-gray-200 bg-gray-100 p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800">1st Semester</h4>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Month</label>
                    <SingleSelectDropdown value={manageSem1Start} options={MONTHS} onChange={setManageSem1Start} />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Month</label>
                    <SingleSelectDropdown value={manageSem1End} options={MONTHS} onChange={setManageSem1End} />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={manageSem1Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setManageSem1Phase} />
                  </div>
                </div>

                {/* 2nd Semester Config */}
                <div className="space-y-4 rounded-md border border-gray-200 bg-gray-100 p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800">2nd Semester</h4>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Month</label>
                    <SingleSelectDropdown value={manageSem2Start} options={MONTHS} onChange={setManageSem2Start} />
                  </div>
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Month</label>
                    <SingleSelectDropdown value={manageSem2End} options={MONTHS} onChange={setManageSem2End} />
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

              <div className="flex items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPhaseModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-50 active:shadow-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isManageSubmitting || !manageYearId}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[var(--brand-color-hover)] hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#7b9d4f]/30 active:shadow-none disabled:opacity-50"
                >
                  {isManageSubmitting ? (
                    <SpinnerIcon className="h-5 w-5" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5" />
                  )}
                  Save Settings
                </button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => !isManageSubmitting && setIsPhaseModalOpen(false)}
          />
        </div>
      )}
      </div>
    </section>
  )
}

export default AcademicCalendarPage
