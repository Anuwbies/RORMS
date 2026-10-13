export interface WorkbookMembership {
  userId?: string
  role?: string
  status?: string
  department?: string
}

const DEPARTMENT_EDIT_PHASES = ['Drafting', 'Revision'] as const
const MANAGER_EDIT_PHASES = ['Drafting', 'Plotting', 'Revision', 'Final'] as const

export function workbookEditablePhases(role?: string): readonly string[] {
  if (role === 'Admin') return MANAGER_EDIT_PHASES
  if (role === 'Dean' || role === 'Program Head') return DEPARTMENT_EDIT_PHASES
  return []
}

export function canEditDepartmentWorkbook(member: WorkbookMembership | undefined, userId: string, departmentCode: string, phase: string): boolean {
  if (!member || member.userId !== userId || member.status !== 'accepted') return false
  const manager = member.role === 'Admin'
  return (manager || member.department === departmentCode) && workbookEditablePhases(member.role).includes(phase)
}

export function schedulePlottingPhases(role?: string): readonly string[] {
  return role === 'Admin' || role === 'Registrar' ? MANAGER_EDIT_PHASES : []
}

export function canPlotDepartmentSchedules(member: WorkbookMembership | undefined, userId: string, phase: string): boolean {
  return Boolean(member && member.userId === userId && member.status === 'accepted' && schedulePlottingPhases(member.role).includes(phase))
}
