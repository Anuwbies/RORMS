import { useEffect, useMemo, useState } from 'react'
import { CalendarIcon, ChevronRightIcon, DoorIcon } from './Icons'
import { roomScheduleRoom } from '../utils/roomSchedule'
import { dashboardScheduleDays, type DashboardScheduleMeeting } from '../utils/dashboardSchedules'

interface TodayScheduleCardProps {
  meetings: DashboardScheduleMeeting[]
  roomsById: ReadonlyMap<string, string>
  isLoading: boolean
  hasError: boolean
  onViewTimetable: () => void
}

const formatTime = (value: string) => {
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

export function TodayScheduleCard({ meetings, roomsById, isLoading, hasError, onViewTimetable }: TodayScheduleCardProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const todayDayShort = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(now)
  const todayDayFull = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long' }).format(now)
  const todayDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
  }).format(now)
  const todayMeetings = useMemo(() => dashboardScheduleDays(meetings).get(todayDayShort) || [], [meetings, todayDayShort])

  return (
    <div className="flex h-[360px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 leading-tight">Today's Schedule</h3>
          <p className="text-xs text-gray-500 mt-0.5">{todayDate} · {todayDayFull}</p>
        </div>
        <button type="button" onClick={onViewTimetable} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
          <span>Full Timetable</span>
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto custom-scrollbar">
        {hasError ? (
          <p className="p-6 text-sm text-rose-600">Today's schedule is unavailable.</p>
        ) : isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading today's schedule…</p>
        ) : todayMeetings.length > 0 ? (
          todayMeetings.map((item, index) => (
            <div key={`${item.id}-${index}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="w-20 shrink-0 text-xs font-bold text-slate-900">
                <p>{formatTime(item.startTime)}</p>
                <p className="text-[0.7rem] font-medium text-slate-500">{formatTime(item.endTime)}</p>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900" title={item.subjectCode}>{item.subjectCode}</span>
              <span className="flex max-w-[42%] shrink-0 items-center gap-1 text-xs font-bold text-[var(--brand-color)]">
                <DoorIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{roomScheduleRoom(item, roomsById)}</span>
              </span>
            </div>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[var(--brand-color)] shadow-2xs"><CalendarIcon className="h-6 w-6" /></div>
            <p className="text-sm font-bold text-slate-800">No classes scheduled for today</p>
            <p className="mt-1 text-xs text-slate-400">You have no teaching meetings scheduled for {todayDayFull}.</p>
          </div>
        )}
      </div>
    </div>
  )
}
