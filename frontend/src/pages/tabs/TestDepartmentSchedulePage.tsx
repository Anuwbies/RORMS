import { useState } from 'react'
import { BookIcon } from '../../components/Icons'
import { SectionHeader } from '../../components/SectionHeader'
import { DepartmentScheduleImportModal } from '../../components/DepartmentScheduleImportModal'
import { DepartmentCoursesImportModal } from '../../components/DepartmentCoursesImportModal'

export default function TestDepartmentSchedulePage() {
  const [workbookOpen, setWorkbookOpen] = useState(false)
  const [coursesOpen, setCoursesOpen] = useState(false)

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <SectionHeader
        title="Test Department Schedule"
        description="Test department schedule imports from Excel workbooks."
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setWorkbookOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-color)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-color-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-color)]"
          >
            <BookIcon className="h-5 w-5" />
            Open Workbook
          </button>
          <button
            type="button"
            onClick={() => setCoursesOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-color)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-color-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-color)]"
          >
            <BookIcon className="h-5 w-5" />
            Open Courses
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500">Open a blank workbook or import an XLSX file from inside the workbook.</p>
      </div>
      {workbookOpen && <DepartmentScheduleImportModal onClose={() => setWorkbookOpen(false)} />}
      {coursesOpen && <DepartmentCoursesImportModal onClose={() => setCoursesOpen(false)} />}
    </section>
  )
}
