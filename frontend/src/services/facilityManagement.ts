import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { Room } from '../types/room'

export type FacilityAction =
  | { action: 'create_building' | 'update_building'; targetId: string; data: { name: string; code: string } }
  | { action: 'create_room' | 'update_room'; targetId: string; data: Omit<Room, 'id' | 'buildingId'> & { buildingId: string } }
  | { action: 'delete_building' | 'delete_room' | 'delete_comment'; targetId: string }
  | { action: 'delete_rooms'; buildingId: string; roomIds: string[] }

interface FacilityResult {
  changed: boolean
  targetId: string
  logIds: string[]
  deletedRooms: Array<{ id: string; image: string }>
}

const callable = httpsCallable<FacilityAction & { operationId: string }, FacilityResult>(functions, 'manageFacility')

export async function manageFacility(action: FacilityAction): Promise<FacilityResult> {
  return (await callable({ ...action, operationId: crypto.randomUUID() })).data
}

export function facilityActionError(error: unknown, fallback: string): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    && ['functions/permission-denied', 'functions/failed-precondition', 'functions/not-found', 'functions/already-exists', 'functions/resource-exhausted'].includes(error.code)
    ? error.message : fallback
}
