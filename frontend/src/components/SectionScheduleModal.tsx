import { PersonalScheduleModal } from './PersonalScheduleModal'

export interface SectionScheduleSelection {
  label: string
  yearLevel: number
}

interface SectionScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  section: SectionScheduleSelection | null
  department: { id: string; code: string; name: string } | null
  academicYear?: string
  semester?: string
}

export function SectionScheduleModal({ isOpen, onClose, section, department, academicYear, semester }: SectionScheduleModalProps) {
  return (
    <PersonalScheduleModal
      isOpen={isOpen}
      onClose={onClose}
      onBack={onClose}
      member={section && department ? {
        name: section.label,
        role: 'Section',
        department: department.code,
        departmentName: department.name || department.code,
      } : null}
      sectionFilter={section && department ? {
        departmentId: department.id,
        yearLevel: section.yearLevel,
        label: section.label,
      } : undefined}
      scheduleTitle={section ? `${section.label} Schedule` : undefined}
      initialAcademicYear={academicYear}
      initialSemester={semester}
      schedulesOnly
      hideFilters
      hideReturnedSchedules
      scheduleStatuses={['Draft', 'Plot']}
    />
  )
}
