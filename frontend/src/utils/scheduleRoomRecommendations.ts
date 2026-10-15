import type { ScheduleDirectory } from './excelScheduleRows'
import { excelScheduleRoomKey, facultyScheduleRoomConflict, type FacultySubjectAssignment } from './ScheduleValidation'

/** Recommend against every meeting affected by this room entry, across all sheets. */
export function recommendScheduleRooms(assignments: readonly FacultySubjectAssignment[], rooms: ScheduleDirectory['rooms'],
  rowKey: string, column: number, entryIndex: number): string[] {
  const targets = assignments.filter(assignment => assignment.rowKey === rowKey
    && assignment.roomColumn === column && (entryIndex < 0 || assignment.roomEntryIndex === entryIndex))
  if (!targets.length || targets.some(target => target.start === undefined || target.end === undefined || target.end <= target.start || !target.days?.length)) return []
  if (!targets.some(target => assignments.some(other => other !== target && facultyScheduleRoomConflict(target, other)))) return []
  const roomsById = new Map(rooms.map(room => [room.id, room]))
  const roomsByAlias = new Map<string, Set<ScheduleDirectory['rooms'][number]>>()
  for (const room of rooms) for (const value of [room.name, room.code]) {
    const key = excelScheduleRoomKey(value)
    if (!key) continue
    const matches = roomsByAlias.get(key) ?? new Set()
    matches.add(room)
    roomsByAlias.set(key, matches)
  }
  // Each schedule counts once per building, even when Lec/Lab share its rooms.
  const buildingUsage = new Map<string, Set<string>>()
  for (const assignment of assignments) {
    const matches = roomsByAlias.get(excelScheduleRoomKey(assignment.room ?? ''))
    const room = roomsById.get(assignment.roomId ?? '') ?? (matches?.size === 1 ? [...matches][0] : undefined)
    if (!room?.buildingId) continue
    const schedules = buildingUsage.get(room.buildingId) ?? new Set<string>()
    schedules.add(assignment.rowKey ?? assignment.location)
    buildingUsage.set(room.buildingId, schedules)
  }
  const buildingRank = new Map([...buildingUsage].sort(([left, a], [right, b]) => b.size - a.size || left.localeCompare(right))
    .slice(0, 3).map(([building], index) => [building, index]))
  const targetSet = new Set(targets)
  const available = rooms.filter(room => {
    if (!buildingRank.has(room.buildingId)) return false
    const candidates = new Map(targets.map(target => [target, { ...target, roomId: room.id, room: room.name || room.code }]))
    return targets.every(target => assignments.every(other => other === target
      || !facultyScheduleRoomConflict(candidates.get(target)!, targetSet.has(other) ? candidates.get(other)! : other)))
  }).sort((a, b) => buildingRank.get(a.buildingId)! - buildingRank.get(b.buildingId)!
    || (a.name || a.code).localeCompare(b.name || b.code))
  const unique = new Map<string, string>()
  let thirdBuildingRooms = 0
  for (const room of available) {
    const name = room.name.trim() || room.code.trim(), key = excelScheduleRoomKey(name)
    if (!key || unique.has(key)) continue
    const thirdBuilding = buildingRank.get(room.buildingId) === 2
    if (thirdBuilding && thirdBuildingRooms >= 5) continue
    unique.set(key, name)
    if (thirdBuilding) thirdBuildingRooms++
  }
  return [...unique.values()]
}
