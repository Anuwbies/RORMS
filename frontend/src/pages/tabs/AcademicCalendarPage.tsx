import { useState, useEffect } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { SearchFilters } from '../../components/SearchFilters'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db } from '../../firebase'
import { collection, doc, setDoc, deleteDoc, writeBatch, query, orderBy, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { PlusIcon, CheckCircleIcon, CalendarIcon, LayersIcon, ClipboardIcon, DashboardIcon, TrashIcon, EditIcon, SpinnerIcon, CloseIcon } from '../../components/Icons'

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

function AcademicCalendarPage() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPhaseModalOpen, setIsPhaseModalOpen] = useState(false)
  const [editingYearId, setEditingYearId] = useState<string | null>(null)
  
  // Manage Phase State
  const [manageYearId, setManageYearId] = useState('')
  const [manageSem1Phase, setManageSem1Phase] = useState('Closed')
  const [manageSem2Phase, setManageSem2Phase] = useState('Closed')
  const [manageError, setManageError] = useState('')
  const [isManageSubmitting, setIsManageSubmitting] = useState(false)
  
  // Form State
  const [newYear, setNewYear] = useState('')
  const [sem1Start, setSem1Start] = useState('July')
  const [sem1End, setSem1End] = useState('September')
  const [sem2Start, setSem2Start] = useState('November')
  const [sem2End, setSem2End] = useState('January')
  
  const [createError, setCreateError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'academicYears'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AcademicYear))
      setYears(fetched)
      setIsLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const filteredYears = years.filter(y => 
    y.academicYear.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return b.academicYear.localeCompare(a.academicYear)
  })

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
    setSem2Start(year.sem2.startMonth)
    setSem2End(year.sem2.endMonth)
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
      const existingYear = editingYearId ? years.find(y => y.id === editingYearId) : null
      const sem1Phase = existingYear ? existingYear.sem1.phase : 'Closed'
      const sem2Phase = existingYear ? existingYear.sem2.phase : 'Closed'

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
      setSem2Start('November')
      setSem2End('January')
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
      setManageSem1Phase(currentActive.sem1.phase)
      setManageSem2Phase(currentActive.sem2.phase)
    } else if (years.length > 0) {
      setManageYearId(years[0].id)
      setManageSem1Phase(years[0].sem1.phase)
      setManageSem2Phase(years[0].sem2.phase)
    }
    setManageError('')
    setIsPhaseModalOpen(true)
  }

  const handleManageYearChangeStr = (academicYearStr: string) => {
    const selectedYear = years.find(y => y.academicYear === academicYearStr)
    if (selectedYear) {
      setManageYearId(selectedYear.id)
      setManageSem1Phase(selectedYear.sem1.phase)
      setManageSem2Phase(selectedYear.sem2.phase)
    }
  }

  const handleSavePhases = async (e: React.FormEvent) => {
    e.preventDefault()
    setManageError('')
    if (!manageYearId) {
      setManageError('Please select a school year.')
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
            'sem1.phase': manageSem1Phase,
            'sem2.phase': manageSem2Phase
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

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--brand-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-color)] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <PageHeader 
            title="Academic Calendar" 
            description="Manage academic years, historical records, and scheduling phases." 
          />

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <LayersIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="Total Years">Total Years</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{years.length}</p>
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 shrink-0">
                  <CalendarIcon className="h-9 w-9 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="Active Year">Active Year</p>
                  <p className="mt-0.5 text-xl font-bold text-gray-900 leading-none">{activeYear ? activeYear.academicYear : 'None'}</p>
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 border border-amber-100 shrink-0">
                  <DashboardIcon className="h-9 w-9 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="1st Sem Phase">1st Sem Phase</p>
                  <p className="mt-0.5 text-xl font-bold text-gray-900 leading-none">{activeYear ? activeYear.sem1.phase : 'None'}</p>
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-purple-50 border border-purple-100 shrink-0">
                  <ClipboardIcon className="h-9 w-9 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="2nd Sem Phase">2nd Sem Phase</p>
                  <p className="mt-0.5 text-xl font-bold text-gray-900 leading-none">{activeYear ? activeYear.sem2.phase : 'None'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search school years..."
          primaryButton={{
            label: "New School Year",
            onClick: () => {
              setEditingYearId(null)
              setNewYear('')
              setSem1Start('July')
              setSem1End('September')
              setSem2Start('November')
              setSem2End('January')
              setCreateError('')
              setIsModalOpen(true)
            },
            icon: <PlusIcon className="h-5 w-5" />
          }}
          secondaryButton={{
            label: "Manage Active Year",
            onClick: handleOpenPhaseModal,
            icon: <CalendarIcon className="h-5 w-5" />
          }}
        />

        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[33%]">Academic Year</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[33%]">1st Semester</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[33%]">2nd Semester</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 text-right w-1 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredYears.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      {searchTerm ? 'No school years found matching your search.' : 'No school years found. Create a new year to get started.'}
                    </td>
                  </tr>
                ) : (
                  filteredYears.map((year) => (
                    <tr key={year.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <span className={`font-bold text-base ${year.isActive ? 'text-emerald-600' : 'text-gray-900'}`}>{year.academicYear}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-700">
                            {year.sem1.startMonth} - {year.sem1.endMonth}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-700">
                            {year.sem2.startMonth} - {year.sem2.endMonth}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right align-middle">
                        <div className="flex justify-end gap-2">
                          <button
                            title="Edit School Year"
                            onClick={() => handleEditClick(year)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-700 shadow-sm border border-gray-200 transition-colors"
                          >
                            <EditIcon className="h-4 w-4" />
                          </button>
                          <button
                            title="Delete School Year"
                            onClick={() => handleDeleteYear(year.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-md bg-white border border-rose-100 text-rose-400 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                          >
                            <TrashIcon className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Manage Active Year & Phases</h3>
              <p className="mt-1 text-sm text-white/80">Set the active school year and its semester phases.</p>
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
                    <label className="block text-[0.65rem] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phase</label>
                    <SingleSelectDropdown value={manageSem1Phase} options={['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended']} onChange={setManageSem1Phase} />
                  </div>
                </div>

                {/* 2nd Semester Config */}
                <div className="space-y-4 rounded-md border border-gray-200 bg-gray-100 p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-800">2nd Semester</h4>
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
</section>
  )
}

export default AcademicCalendarPage
