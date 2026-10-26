import { PersonalScheduleModal } from './PersonalScheduleModal'
import { PlotScheduleModal } from './PlotScheduleModal'
import type { SchedulePlottingOptions } from '../hooks/useScheduleRoomPlotting'

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
  plotting?: SchedulePlottingOptions
}

export function SectionScheduleModal({ isOpen, onClose, section, department, academicYear, semester, plotting }: SectionScheduleModalProps) {
  const modalProps = {
    isOpen,
    onClose,
    onBack: onClose,
    member: section && department ? {
      name: section.label,
      role: 'Section',
      department: department.code,
      departmentName: department.name || department.code,
    } : null,
    sectionFilter: section && department ? {
      departmentId: department.id,
      yearLevel: section.yearLevel,
      label: section.label,
    } : undefined,
    scheduleTitle: section ? `${section.label} Schedule` : undefined,
    initialAcademicYear: academicYear,
    initialSemester: semester,
    hideFilters: true,
    hideReturnedSchedules: true,
    scheduleStatuses: ['Draft', 'Plot'] as const,
  }

  return plotting ? (
    <PlotScheduleModal {...modalProps} plotting={plotting} />
  ) : (
    <PersonalScheduleModal {...modalProps} schedulesOnly />
  )
}
