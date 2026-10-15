import { excelScheduleRoomKey, type ExcelScheduleRoom } from './ScheduleValidation'

export interface ExcelRoomDirectory {
  rooms: readonly ExcelScheduleRoom[]
  loading: boolean
  error?: string
}

export function filterRoomNames(rooms: readonly ExcelScheduleRoom[], query: string): string[] {
  const key = excelScheduleRoomKey(query)
  return [...new Set(rooms.filter(room => [room.code ?? '', room.name ?? ''].some(value => excelScheduleRoomKey(value).includes(key)))
    .map(room => room.name?.trim() || room.code?.trim() || '').filter(Boolean))].sort((left, right) => left.localeCompare(right))
}
