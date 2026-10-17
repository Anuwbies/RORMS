import type { ScheduleDirectory } from './excelScheduleRows'
import { areParallelFacultyMeetings, excelScheduleRoomKey, facultyScheduleRoomConflict, isExcelScheduleTba, parallelRoomAssignmentIssue, parallelRoomConnectionIssue, parallelRoomPosition, scheduleRoomStatusIssue, type FacultySubjectAssignment } from './ScheduleValidation.ts'

export interface ParallelRoomGroupRecommendation {
  label: string
  rooms: readonly { rowKey: string; room: string }[]
}

/** Find complete room chains for the actual parallel group, in row order. */
export function recommendParallelRoomGroups(assignments: readonly FacultySubjectAssignment[], rooms: ScheduleDirectory['rooms'],
  rowKey: string, column: number, entryIndex: number, externalAssignments: readonly FacultySubjectAssignment[] = [],
  usageRooms: ScheduleDirectory['rooms'] = rooms): ParallelRoomGroupRecommendation[] {
  const target = assignments.find(assignment => assignment.rowKey === rowKey && assignment.roomColumn === column
    && assignment.roomEntryIndex === entryIndex)
  if (!target?.parallelGroup || target.start === undefined || target.end === undefined || !target.days?.length) return []
  const group = assignments.filter(assignment => assignment === target || areParallelFacultyMeetings(target, assignment))
  if (!group.length || group.some(assignment => !assignment.rowKey || assignment.roomColumn !== column
    || assignment.roomEntryIndex !== entryIndex || assignment.start === undefined || assignment.end === undefined || !assignment.days?.length)
    || new Set(group.map(assignment => assignment.rowKey)).size !== group.length) return []
  const groupSet = new Set(group)
  const occupied = [...assignments.filter(assignment => !groupSet.has(assignment)), ...externalAssignments]
  const roomsById = new Map(usageRooms.map(room => [room.id, room]))
  const roomsByAlias = new Map<string, Set<ScheduleDirectory['rooms'][number]>>()
  for (const room of usageRooms) for (const value of [room.name, room.code]) {
    const key = excelScheduleRoomKey(value)
    if (!key) continue
    const matches = roomsByAlias.get(key) ?? new Set()
    matches.add(room)
    roomsByAlias.set(key, matches)
  }
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
    .map(([building], index) => [building, index]))
  const locations = new Map<string, Map<number, ScheduleDirectory['rooms'][number]>>()
  for (const room of rooms) {
    if (scheduleRoomStatusIssue(room)) continue
    const position = parallelRoomPosition(room)
    if (!position?.building) continue
    const key = JSON.stringify([position.building, position.floor, position.prefix, position.suffix])
    const numbered = locations.get(key) ?? new Map<number, ScheduleDirectory['rooms'][number]>()
    if (!numbered.has(position.number)) numbered.set(position.number, room)
    locations.set(key, numbered)
  }
  const recommendations: { option: ParallelRoomGroupRecommendation; buildingId: string; retained: number }[] = []
  for (const numbered of locations.values()) for (const start of numbered.keys()) {
    const chain = Array.from({ length: group.length }, (_, index) => numbered.get(start + index))
    if (!chain.every((room): room is ScheduleDirectory['rooms'][number] => Boolean(room))) continue
    for (const ordered of group.length === 1 ? [chain] : [chain, [...chain].reverse()]) {
      const available = ordered.every((room, index) => {
        const candidate = { ...group[index], roomId: room.id, room: room.code || room.name }
        return !occupied.some(other => facultyScheduleRoomConflict(candidate, other))
      })
      if (!available) continue
      const entries = ordered.map((room, index) => ({ rowKey: group[index].rowKey!, room: room.code.trim() || room.name.trim() }))
      const retained = ordered.filter((room, index) => group[index].roomId === room.id
        || [room.code, room.name].some(value => excelScheduleRoomKey(group[index].room ?? '') === excelScheduleRoomKey(value))).length
      if (retained === group.length) continue
      recommendations.push({ option: { label: entries.map(entry => entry.room).join(' / '), rooms: entries },
        buildingId: ordered[0].buildingId, retained })
    }
  }
  return recommendations.sort((a, b) => (buildingRank.get(a.buildingId) ?? Infinity) - (buildingRank.get(b.buildingId) ?? Infinity)
    || b.retained - a.retained || a.option.label.localeCompare(b.option.label))
    .slice(0, 5).map(({ option }) => option)
}

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
    if (scheduleRoomStatusIssue(room)) continue
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

/** Keep room and parallel-group recommendations tied to the edited entry's state. */
export function needsScheduleRoomRecommendation(assignments: readonly FacultySubjectAssignment[], rooms: ScheduleDirectory['rooms'],
  rowKey: string, column: number, entryIndex: number,
  hasConflict?: (assignment: FacultySubjectAssignment) => boolean): boolean {
  const targets = assignments.filter(assignment => assignment.rowKey === rowKey && assignment.roomColumn === column
    && (entryIndex < 0 || assignment.roomEntryIndex === entryIndex))
  return targets.some(target => !target.room?.trim() || isExcelScheduleTba(target.room)
    || hasConflict?.(target)
    || rooms.some(room => (target.roomId === room.id
      || [room.code, room.name].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(target.room ?? '')))
      && Boolean(scheduleRoomStatusIssue(room)))
    || parallelRoomAssignmentIssue(assignments, rooms, target)
    || parallelRoomConnectionIssue(assignments, rooms, target)
    || assignments.some(other => other !== target && facultyScheduleRoomConflict(target, other)))
}

/** Recommend against every meeting affected by this room entry, across all sheets. */
export function recommendScheduleRooms(assignments: readonly FacultySubjectAssignment[], rooms: ScheduleDirectory['rooms'],
  rowKey: string, column: number, entryIndex: number, options?: {
    hasConflict?: (assignment: FacultySubjectAssignment) => boolean
    isRoomAvailable?: (room: ScheduleDirectory['rooms'][number]) => boolean
    alwaysRecommend?: boolean
  }): string[] {
  const targets = assignments.filter(assignment => assignment.rowKey === rowKey
    && assignment.roomColumn === column && (entryIndex < 0 || assignment.roomEntryIndex === entryIndex))
  if (!targets.length || targets.some(target => target.start === undefined || target.end === undefined || target.end <= target.start || !target.days?.length)) return []
  if (!options?.alwaysRecommend && !needsScheduleRoomRecommendation(assignments, rooms, rowKey, column, entryIndex, options?.hasConflict)) return []
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
  if (options?.alwaysRecommend && !buildingRank.size) {
    for (const building of [...new Set(rooms.map(room => room.buildingId).filter(Boolean))].sort().slice(0, 3)) {
      buildingRank.set(building, buildingRank.size)
    }
  }
  const targetSet = new Set(targets)
  const parallelCosts = new Map(targets.map(target => [target, parallelRoomRecommendationCosts(assignments, rooms, target)]))
  const changeCost = (roomId: string) => Math.max(0, ...targets.map(target => parallelCosts.get(target)?.get(roomId) ?? 0))
  const available = rooms.filter(room => {
    if (scheduleRoomStatusIssue(room)) return false
    if (!buildingRank.has(room.buildingId)) return false
    if (options?.isRoomAvailable && !options.isRoomAvailable(room)) return false
    if (options?.alwaysRecommend && targets.every(target => target.roomId === room.id
      || [room.code, room.name].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(target.room ?? '')))) return false
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
