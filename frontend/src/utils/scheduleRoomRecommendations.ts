import type { ScheduleDirectory } from './excelScheduleRows'
import { areParallelFacultyMeetings, excelScheduleRoomKey, facultyScheduleRoomConflict, isExcelScheduleTba, parallelRoomConnectionIssue, parallelRoomPosition, type FacultySubjectAssignment } from './ScheduleValidation'

/** A disconnected group may need several edits before its validation can clear. */
function parallelRoomRecommendationCosts(assignments: readonly FacultySubjectAssignment[], rooms: ScheduleDirectory['rooms'],
  target: FacultySubjectAssignment): ReadonlyMap<string, number> | undefined {
  if (!parallelRoomConnectionIssue(assignments, rooms, target)) return
  const group = assignments.filter(other => other === target || areParallelFacultyMeetings(target, other))
  const groupSet = new Set(group)
  const resolve = (assignment: FacultySubjectAssignment) => {
    const matches = rooms.filter(room => assignment.roomId ? room.id === assignment.roomId
      : [room.name, room.code].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(assignment.room ?? '')))
    return matches.length === 1 ? matches[0].id : undefined
  }
  const currentRoom = resolve(target)
  const peerRooms = new Set(group.filter(other => other !== target).map(resolve).filter((id): id is string => Boolean(id)))
  const locations = new Map<string, Map<number, ScheduleDirectory['rooms'][number]>>()
  for (const room of rooms) {
    const position = parallelRoomPosition(room)
    if (!position?.building) continue
    const candidate = { ...target, roomId: room.id, room: room.name || room.code }
    if (assignments.some(other => !groupSet.has(other) && facultyScheduleRoomConflict(candidate, other))) continue
    const key = JSON.stringify([position.building, position.floor, position.prefix, position.suffix])
    const numbered = locations.get(key) ?? new Map()
    numbered.set(position.number, room)
    locations.set(key, numbered)
  }
  const costs = new Map<string, number>()
  for (const numbered of locations.values()) for (const start of numbered.keys()) {
    const chain = Array.from({ length: group.length }, (_, index) => numbered.get(start + index))
    if (!chain.every((room): room is ScheduleDirectory['rooms'][number] => Boolean(room))) continue
    const retained = chain.filter(room => peerRooms.has(room.id)).length
    // Continue toward at least one existing peer; unrelated chains are ordinary room choices.
    if (!retained) continue
    for (const [index, room] of chain.entries()) {
      if (room.id === currentRoom || peerRooms.has(room.id)) continue
      // The edited room is vacated. Join a peer now rather than relying on a later edit to bridge a gap.
      if (![chain[index - 1], chain[index + 1]].some(peer => peer && peerRooms.has(peer.id))) continue
      const changes = group.length - retained
      costs.set(room.id, Math.min(costs.get(room.id) ?? Infinity, changes))
    }
  }
  return costs
}

/** Recommend against every meeting affected by this room entry, across all sheets. */
export function recommendScheduleRooms(assignments: readonly FacultySubjectAssignment[], rooms: ScheduleDirectory['rooms'],
  rowKey: string, column: number, entryIndex: number): string[] {
  const targets = assignments.filter(assignment => assignment.rowKey === rowKey
    && assignment.roomColumn === column && (entryIndex < 0 || assignment.roomEntryIndex === entryIndex))
  if (!targets.length || targets.some(target => target.start === undefined || target.end === undefined || target.end <= target.start || !target.days?.length)) return []
  if (!targets.some(target => isExcelScheduleTba(target.room ?? '')
    || (target.parallelGroup !== undefined && !target.room?.trim())
    || parallelRoomConnectionIssue(assignments, rooms, target)
    || assignments.some(other => other !== target && facultyScheduleRoomConflict(target, other)))) return []
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
  const parallelCosts = new Map(targets.map(target => [target, parallelRoomRecommendationCosts(assignments, rooms, target)]))
  const changeCost = (roomId: string) => Math.max(0, ...targets.map(target => parallelCosts.get(target)?.get(roomId) ?? 0))
  const available = rooms.filter(room => {
    if (!buildingRank.has(room.buildingId)) return false
    const candidates = new Map(targets.map(target => [target, { ...target, roomId: room.id, room: room.name || room.code }]))
    if (targets.some(target => target.parallelGroup !== undefined)) {
      const proposed = assignments.map(assignment => candidates.get(assignment) ?? assignment)
      if (targets.some(target => {
        const costs = parallelCosts.get(target)
        return costs ? !costs.has(room.id) : Boolean(parallelRoomConnectionIssue(proposed, rooms, candidates.get(target)!))
      })) return false
    }
    return targets.every(target => assignments.every(other => other === target
      || !facultyScheduleRoomConflict(candidates.get(target)!, targetSet.has(other) ? candidates.get(other)! : other)))
  }).sort((a, b) => changeCost(a.id) - changeCost(b.id) || buildingRank.get(a.buildingId)! - buildingRank.get(b.buildingId)!
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
