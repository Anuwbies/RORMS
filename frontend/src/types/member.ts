export type MemberRole = 'Admin' | 'Registrar' | 'Dean' | 'Program Head' | 'Instructor'
export type MemberStatus = 'Active' | 'Inactive' | 'Pending'

export interface Department {
  id: string
  name: string
  code: string
  dean: string
  programHead?: string
}

export interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
  department?: string
  joinedDate: string
  avatar: string
  membershipId?: string
}
