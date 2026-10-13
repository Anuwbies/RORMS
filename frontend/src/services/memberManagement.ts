import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { MemberRole } from '../types/member'

type MemberAction =
  | { action: 'invite'; email: string; role: MemberRole; department: string; invitationId: string; invitationHtml: string }
  | { action: 'reinvite'; targetId: string; membershipId?: string; role: MemberRole; department: string; invitationId: string; invitationHtml: string }
  | { action: 'edit'; targetId: string; targetType: 'user' | 'invitation'; membershipId?: string; role: MemberRole; department: string; expected: { role: string; department: string } }
  | { action: 'deactivate' | 'cancel_invitation'; targetId: string; membershipId?: string }

interface MemberActionResult {
  outcome: 'changed' | 'unchanged' | 'exists' | 'pending'
  logId: string | null
}

const callable = httpsCallable<MemberAction & { operationId: string }, MemberActionResult>(functions, 'manageMember')

export async function manageMember(action: MemberAction): Promise<MemberActionResult> {
  const result = await callable({ ...action, operationId: crypto.randomUUID() })
  return result.data
}

export function memberActionError(error: unknown, fallback: string): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string'
    && ['functions/failed-precondition', 'functions/permission-denied', 'functions/not-found', 'functions/resource-exhausted'].includes(error.code)) return error.message
  return fallback
}
