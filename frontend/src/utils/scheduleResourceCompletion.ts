import type { ScheduleDirectory } from './excelScheduleRows'
import { filterFacultyNames } from './excelFacultySuggestions'
import { excelScheduleFacultyKeys, excelScheduleRoomKey } from './ScheduleValidation'
import { completeScheduleTimeText, normalizeScheduleCellText } from './departmentScheduleEdits'

/** Complete only exact or unambiguous directory matches, preserving meeting separators. */
export function completeScheduleResourceText(text: string, column: number, directory?: ScheduleDirectory | null): string {
  text = normalizeScheduleCellText(column, text)
  if (column === 15 || column === 16) return completeScheduleTimeText(text)
  const isRoom = column === 19 || column === 20
  if (!directory || !isRoom && column !== 13 && column !== 14) return text
  const names = [...new Set(directory.faculty.filter(member => member.department === directory.departmentCode).map(member => member.fullName))]
  const placeholders = [...text.matchAll(/\bN\s*\/\s*A\b/gi)]
  return text.replace(/[^/;\r\n]+/g, (entry: string, offset: number) => {
    const query = entry.trim()
    if (!query || /^(?:TBA|TBD|TBC|NA|NONE|VACANT|TO BE ASSIGNED|TO BE ANNOUNCED|[-–—]+)$/i.test(query)
      || placeholders.some(match => offset < match.index + match[0].length && offset + entry.length > match.index)) return entry
    let replacement: string | undefined
    if (isRoom) {
      const key = excelScheduleRoomKey(query)
      if (!key) return entry
      const exact = directory.rooms.filter(room => [room.code, room.name].some(value => excelScheduleRoomKey(value) === key))
      const matches = exact.length ? exact : directory.rooms.filter(room => [room.code, room.name].some(value => excelScheduleRoomKey(value).includes(key)))
      if (matches.length === 1) replacement = matches[0].name.trim() || matches[0].code.trim()
    } else {
      const keys = excelScheduleFacultyKeys(query)
      const exact = names.filter(name => excelScheduleFacultyKeys(name).some(key => keys.includes(key)))
      const matches = exact.length ? exact : filterFacultyNames(names, query)
      if (matches.length === 1) replacement = matches[0]
    }
    return replacement ? entry.slice(0, entry.length - entry.trimStart().length) + normalizeScheduleCellText(column, replacement) + entry.slice(entry.trimEnd().length) : entry
  })
}
