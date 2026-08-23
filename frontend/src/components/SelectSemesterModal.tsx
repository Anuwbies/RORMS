import React from 'react'
import { Button } from './Button'
import { SingleSelectDropdown } from './SingleSelectDropdown'
import { CalendarIcon, ChevronRightIcon } from './Icons'

const phaseClasses: Record<string, string> = {
  Closed: 'bg-gray-100 text-gray-600 border-gray-200',
  Drafting: 'bg-amber-50 text-amber-700 border-amber-200',
  Plotting: 'bg-blue-50 text-blue-700 border-blue-200',
  Revision: 'bg-purple-50 text-purple-700 border-purple-200',
  Final: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Ended: 'bg-rose-50 text-rose-700 border-rose-200',
}

const formatShortMonth = (monthName?: string) => {
  if (!monthName) return ''
  return monthName.slice(0, 3)
}

export interface SelectSemesterModalProps {
  isOpen: boolean;
  onClose: () => void;
  academicYears: any[];
  selectedAcademicYear: any;
  setSelectedAcademicYear: (year: any) => void;
  onSelectSemester: (semesterPhase: { name: string, phase: string }) => void;
  subtitle?: React.ReactNode;
  actionText?: string;
}

export function SelectSemesterModal({
  isOpen,
  onClose,
  academicYears,
  selectedAcademicYear,
  setSelectedAcademicYear,
  onSelectSemester,
  subtitle,
  actionText,
}: SelectSemesterModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
          <h3 className="text-xl font-bold">Select School Year & Semester</h3>
          <p className="mt-1 text-sm text-white/80">
            {subtitle || 'Choose the academic year and semester to manage schedules.'}
          </p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              School Year <span className="text-rose-500">*</span>
            </label>
            <SingleSelectDropdown
              value={selectedAcademicYear?.academicYear || ''}
              options={[...academicYears].sort((a: any, b: any) => {
                if (a.isActive && !b.isActive) return -1
                if (!a.isActive && b.isActive) return 1
                return (b.academicYear || '').localeCompare(a.academicYear || '')
              }).map(y => y.academicYear)}
              onChange={(val) => setSelectedAcademicYear(academicYears.find(y => y.academicYear === val))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">
              Select Semester <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1st Semester Card */}
              {(() => {
                const sem1Phase = selectedAcademicYear?.sem1?.phase || 'Closed'
                const isSem1Editable = sem1Phase === 'Drafting' || sem1Phase === 'Revision'
                const sem1Start = selectedAcademicYear?.sem1?.startMonth
                const sem1End = selectedAcademicYear?.sem1?.endMonth
                const sem1Dates = sem1Start && sem1End ? `${formatShortMonth(sem1Start)} - ${formatShortMonth(sem1End)}` : ''

                return (
                  <button
                    type="button"
                    onClick={() => onSelectSemester({ name: '1st Semester', phase: sem1Phase })}
                    disabled={!selectedAcademicYear}
                    className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all cursor-pointer hover:cursor-pointer hover:bg-gray-50 hover:shadow-md active:scale-95 active:bg-gray-100 focus:outline-none disabled:opacity-50 disabled:cursor-default disabled:active:scale-100 disabled:pointer-events-none disabled:hover:shadow-none"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-color)]/10 text-[var(--brand-color)] group-hover:bg-[var(--brand-color)] group-hover:text-white transition-colors shrink-0">
                            <CalendarIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
                              1st Semester
                            </h4>
                            {sem1Dates && (
                              <p className="text-xs font-medium text-gray-500">{sem1Dates}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-gray-400 group-hover:text-[var(--brand-color)] group-hover:translate-x-0.5 transition-all mt-1 shrink-0">
                          <ChevronRightIcon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider border ${phaseClasses[sem1Phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {sem1Phase}
                      </span>
                      {actionText ? (
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                          {actionText}
                        </span>
                      ) : (
                        <span className={`text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${isSem1Editable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {isSem1Editable ? 'Editable' : 'Read-Only'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })()}

              {/* 2nd Semester Card */}
              {(() => {
                const sem2Phase = selectedAcademicYear?.sem2?.phase || 'Closed'
                const isSem2Editable = sem2Phase === 'Drafting' || sem2Phase === 'Revision'
                const sem2Start = selectedAcademicYear?.sem2?.startMonth
                const sem2End = selectedAcademicYear?.sem2?.endMonth
                const sem2Dates = sem2Start && sem2End ? `${formatShortMonth(sem2Start)} - ${formatShortMonth(sem2End)}` : ''

                return (
                  <button
                    type="button"
                    onClick={() => onSelectSemester({ name: '2nd Semester', phase: sem2Phase })}
                    disabled={!selectedAcademicYear}
                    className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all cursor-pointer hover:cursor-pointer hover:bg-gray-50 hover:shadow-md active:scale-95 active:bg-gray-100 focus:outline-none disabled:opacity-50 disabled:cursor-default disabled:active:scale-100 disabled:pointer-events-none disabled:hover:shadow-none"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-color)]/10 text-[var(--brand-color)] group-hover:bg-[var(--brand-color)] group-hover:text-white transition-colors shrink-0">
                            <CalendarIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
                              2nd Semester
                            </h4>
                            {sem2Dates && (
                              <p className="text-xs font-medium text-gray-500">{sem2Dates}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-gray-400 group-hover:text-[var(--brand-color)] group-hover:translate-x-0.5 transition-all mt-1 shrink-0">
                          <ChevronRightIcon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider border ${phaseClasses[sem2Phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {sem2Phase}
                      </span>
                      {actionText ? (
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                          {actionText}
                        </span>
                      ) : (
                        <span className={`text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${isSem2Editable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {isSem2Editable ? 'Editable' : 'Read-Only'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })()}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
      <div
        className="absolute inset-0 -z-10"
        onMouseDown={onClose}
      />
    </div>
  )
}
