import type { Building } from '../types/room'
import type { AcademicYearData } from './academicSemester'
import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { scheduleMatchesTerm } from './roomSchedule'
import { reportingScheduleDays } from './scheduleReporting'

export interface BuildingScheduleUsage {
  totalPercent: number
  departments: { name: string; percent: number }[]
}

const minuteOfDay = (value?: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value?.trim() || '')
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)
  return hour * 60 + minute
}

export function buildingScheduleUsage(
  buildings: readonly Building[],
  meetings: readonly ScheduleMeetingRecord[],
  year: AcademicYearData | null,
  semester: string,
): { buildings: Record<string, BuildingScheduleUsage>; rooms: Record<string, BuildingScheduleUsage> } {
  const result: Record<string, BuildingScheduleUsage> = {}
  const roomResult: Record<string, BuildingScheduleUsage> = {}
  const meetingsByRoom = new Map<string, ScheduleMeetingRecord[]>()

  if (year) {
    meetings.forEach(meeting => {
      const status = String(meeting.status || 'Draft').toLowerCase()
      if (!meeting.roomId || !['draft', 'drafted', 'plot', 'plotted', 'revise', 'revised'].includes(status)
        || !scheduleMatchesTerm(meeting, year, semester)) return
      const roomMeetings = meetingsByRoom.get(meeting.roomId) || []
      roomMeetings.push(meeting)
      meetingsByRoom.set(meeting.roomId, roomMeetings)
    })
  }

  buildings.forEach(building => {
    let availableMinutes = 0
    const minutesByDepartment = new Map<string, number>()

    building.rooms.forEach(room => {
      if (room.status !== 'Available') {
        roomResult[room.id] = { totalPercent: 0, departments: [] }
        return
      }
      const opening = minuteOfDay(room.startTime)
      const closing = minuteOfDay(room.endTime)
      if (opening === null || closing === null || closing <= opening) {
        roomResult[room.id] = { totalPercent: 0, departments: [] }
        return
      }

      const availableDays = new Set(reportingScheduleDays({ days: room.availableDays }))
      const roomAvailableMinutes = availableDays.size * (closing - opening)
      availableMinutes += roomAvailableMinutes
      const roomMinutesByDepartment = new Map<string, number>()

      availableDays.forEach(day => {
        const boundaries = new Set([opening, closing])
        const intervals = (meetingsByRoom.get(room.id) || []).flatMap(meeting => {
          if (!reportingScheduleDays({ days: meeting.days }).includes(day)) return []
          const start = minuteOfDay(meeting.startTime)
          const end = minuteOfDay(meeting.endTime)
          if (start === null || end === null || end <= start) return []
          const clippedStart = Math.max(opening, start)
          const clippedEnd = Math.min(closing, end)
          if (clippedEnd <= clippedStart) return []
          boundaries.add(clippedStart)
          boundaries.add(clippedEnd)
          return [{ start: clippedStart, end: clippedEnd, department: meeting.department?.trim().toUpperCase() || 'Unassigned' }]
        })

        const points = [...boundaries].sort((a, b) => a - b)
        for (let index = 0; index < points.length - 1; index += 1) {
          const start = points[index]
          const end = points[index + 1]
          const departments = new Set(intervals.filter(interval => interval.start < end && interval.end > start).map(interval => interval.department))
          if (!departments.size) continue
          const share = (end - start) / departments.size
          departments.forEach(department => {
            roomMinutesByDepartment.set(department, (roomMinutesByDepartment.get(department) || 0) + share)
            minutesByDepartment.set(department, (minutesByDepartment.get(department) || 0) + share)
          })
        }
      })
      const roomDepartments = roomAvailableMinutes > 0
        ? [...roomMinutesByDepartment].map(([name, minutes]) => ({ name, percent: minutes / roomAvailableMinutes * 100 }))
          .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name))
        : []
      roomResult[room.id] = {
        totalPercent: roomDepartments.reduce((total, department) => total + department.percent, 0),
        departments: roomDepartments,
      }
    })

    const departments = availableMinutes > 0
      ? [...minutesByDepartment].map(([name, minutes]) => ({ name, percent: minutes / availableMinutes * 100 }))
        .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name))
      : []
    result[building.id] = { totalPercent: departments.reduce((total, department) => total + department.percent, 0), departments }
  })

  return { buildings: result, rooms: roomResult }
}
