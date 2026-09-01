import { useState, useEffect } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { IconButton } from '../../components/IconButton'
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
  const [yearToDelete, setYearToDelete] = useState<AcademicYear | null>(null)
  const [isDeletingYear, setIsDeletingYear] = useState(false)
  
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
      header: '1st Sem Months',
      render: (year) => (
        <span className="text-gray-600 font-medium">
          {formatShortMonth(year.sem1.startMonth)} - {formatShortMonth(year.sem1.endMonth)}
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
      header: '2nd Sem Months',
      render: (year) => (
        <span className="text-gray-600 font-medium">
          {formatShortMonth(year.sem2.startMonth)} - {formatShortMonth(year.sem2.endMonth)}
        </span>
      )
    },
    {
      header: '2nd Sem Phase',
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

  const confirmDeleteYear = async () => {
    if (!yearToDelete) return
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
      {/* Add / Edit School Year Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">{editingYearId ? 'Edit School Year' : 'Create New School Year'}</h3>
              <p className="mt-1 text-sm text-white/80">{editingYearId ? 'Reconfigure the start and end months for this year.' : 'Add a new academic year and configure its semesters.'}</p>
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
                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-xs">
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
                  disabled={isSubmitting || !/^\d{4}\s*-\s*\d{4}$/.test(newYear.trim())}
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
      {isPhaseModalOpen && (
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
                <div className="space-y-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-xs">
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
                  disabled={isManageSubmitting || !manageYearId}
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
      {yearToDelete && (
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
