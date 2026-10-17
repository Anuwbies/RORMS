import { facultyScheduleInstructorConflict, facultyScheduleRoomConflict, parseExcelScheduleDays, parseExcelScheduleTime,
  splitScheduleMeetings, type FacultySubjectAssignment } from './ScheduleValidation.ts'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
// Match the standard whole-day calendar (07:30–18:00); preserve lesson duration.
const OPENING = 7 * 60 + 30, CLOSING = 18 * 60
const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`

function combinations<T>(choices: readonly T[][]): T[][] {
  return choices.reduce<T[][]>((rows, values) => rows.flatMap(row => values.map(value => [...row, value])), [[]])
}

/** Null means no recommendation search applies; an empty list means no alternatives fit. */
export function recommendInstructorScheduleOptions(assignments: readonly FacultySubjectAssignment[], rowKey: string,
  column: number, value: string, alwaysRecommend = false): string[] | null {
  const isTime = column === 15 || column === 16, isDay = column === 17 || column === 18
  if (!isTime && !isDay) return null
  const roomColumn = column + (isTime ? 4 : 2)
  const targets = assignments.filter(assignment => assignment.rowKey === rowKey && assignment.roomColumn === roomColumn)
  if (!targets.length || targets.some(target => target.start === undefined || target.end === undefined
    || target.end <= target.start || !target.days?.length)) return null
  const conflictsByTarget = new Map(targets.map(target => [target,
    assignments.filter(other => other !== target && facultyScheduleInstructorConflict(target, other))]))
  if (!alwaysRecommend && !targets.some(target => conflictsByTarget.get(target)!.length)) return null
  const valid = (proposed: FacultySubjectAssignment[]) => {
    const replacements = new Map(targets.map((target, index) => [target, proposed[index]]))
    return proposed.every((target, index) => assignments.every(other => other === targets[index]
      || !facultyScheduleInstructorConflict(target, replacements.get(other) ?? other)
        && !facultyScheduleRoomConflict(target, replacements.get(other) ?? other)))
  }
  const candidates: { text: string; changes: number; distance: number; proposed: FacultySubjectAssignment[] }[] = []
  if (isTime) {
    const original = splitScheduleMeetings(value).map(parseExcelScheduleTime)
    if (!original.length || original.length > 2 || original.some(time => !time)
      || original.length > 1 && original.length !== targets.length) return null
    const choices = original.map((time, index) => {
      const affected = original.length === 1 ? targets : [targets[index]]
      if (!alwaysRecommend && !affected.some(target => conflictsByTarget.get(target)!.length)) return [time!]
      const duration = time!.end - time!.start
      const starts = new Set<number>([time!.start])
      for (let start = OPENING; start + duration <= CLOSING; start += 30) starts.add(start)
      return [...starts].filter(start => start === time!.start || start >= OPENING && start + duration <= CLOSING)
        .map(start => ({ start, end: start + duration }))
    })
    for (const times of combinations(choices)) candidates.push({
      text: times.map(time => `${clock(time.start)}-${clock(time.end)}`).join('/'),
      changes: times.filter((time, index) => time.start !== original[index]!.start).length,
      distance: times.reduce((sum, time, index) => sum + Math.abs(time.start - original[index]!.start), 0),
      proposed: targets.map((target, index) => ({ ...target, ...times[times.length === 1 ? 0 : index] })),
    })
  } else {
    const original = value.toUpperCase().split('/').map(day => day.trim())
    const positional = targets.length > 1 && original.length === targets.length
    // Two meeting entries may share a weekday (FRI/FRI); one meeting's day set must remain unique.
    if (original.length > 2 || (positional ? original.some(day => parseExcelScheduleDays(day).length !== 1)
      : !parseExcelScheduleDays(value).length)) return null
    const usedDays = new Set(assignments.flatMap(assignment => (assignment.days ?? (assignment.day ? [assignment.day] : []))
      .flatMap(day => parseExcelScheduleDays(day).map(parsed => parsed.toUpperCase()))))
    const workbookDays = DAYS.filter(day => usedDays.has(day))
    const choices = original.map((day, index) => {
      const affected = positional ? [targets[index]] : targets
      const overlaps = affected.some(target => conflictsByTarget.get(target)!.some(other =>
        (other.days ?? (other.day ? [other.day] : [])).some(otherDay => otherDay.toUpperCase() === day)))
      return alwaysRecommend || overlaps ? workbookDays : [day]
    })
    for (const days of combinations(choices)) {
      if (!positional && new Set(days).size !== days.length) continue
      candidates.push({ text: days.join('/'),
        changes: days.filter((day, index) => day !== original[index]).length,
        distance: days.reduce((sum, day, index) => sum + Math.abs(DAYS.indexOf(day) - DAYS.indexOf(original[index])), 0),
        proposed: targets.map((target, index) => ({ ...target, days: parseExcelScheduleDays(positional ? days[index] : days.join('/')) })),
      })
    }
  }
  candidates.sort((a, b) => a.changes - b.changes || a.distance - b.distance || a.text.localeCompare(b.text))
  const recommendations: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = isDay ? JSON.stringify(candidate.proposed.map(target => target.days)) : candidate.text
    if (!candidate.changes || seen.has(key) || !valid(candidate.proposed)) continue
    seen.add(key)
    recommendations.push(candidate.text)
    if (alwaysRecommend && recommendations.length >= 30) break
  }
  return recommendations
}

/** Return whole-cell replacements; selecting one preserves other meeting entries. */
export function recommendInstructorSchedule(assignments: readonly FacultySubjectAssignment[], rowKey: string,
  column: number, value: string): string[] {
  return recommendInstructorScheduleOptions(assignments, rowKey, column, value) ?? []
}
