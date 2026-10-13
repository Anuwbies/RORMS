import type { WorkbookAuditChange } from './workbookAudit'

export interface ScheduleLogSnapshot {
  fileName: string
  revision: number
  sheetNames: string[]
  counts: Record<string, number>
  samples: WorkbookAuditChange[]
  omittedSamples: number
  baselineAvailable: boolean
}

const COUNT_LABELS: Record<string, [string, string]> = {
  workbook: ['workbook renamed', 'workbooks renamed'], sheetOrder: ['sheet order changed', 'sheet orders changed'],
  sheetsRenamed: ['sheet renamed', 'sheets renamed'], sheetsAdded: ['sheet added', 'sheets added'],
  sheetsIncluded: ['sheet saved', 'sheets saved'], sheetsRemoved: ['sheet removed', 'sheets removed'],
  cellsChanged: ['cell edited', 'cells edited'], formattingChanged: ['formatting change', 'formatting changes'],
  cellDetailsChanged: ['comment, note or link changed', 'comments, notes or links changed'],
  layoutChanged: ['layout change', 'layout changes'], setupChanged: ['schedule setup changed', 'schedule setups changed'],
  schedulesAdded: ['schedule added', 'schedules added'], schedulesUpdated: ['schedule updated', 'schedules updated'],
  schedulesRemoved: ['schedule removed', 'schedules removed'],
}

export function scheduleActivity(kind: string, counts: Record<string, number>) {
  const actions: Record<string, string> = {
    created: 'Created department schedule', imported: 'Imported schedule workbook',
    updated: 'Updated department schedule', repaired: 'Restored schedule workbook',
  }
  return {
    action: actions[kind] || 'Saved department schedule',
    detail: Object.entries(counts).filter(([key, count]) => COUNT_LABELS[key] && count > 0)
      .map(([key, count]) => `${count} ${COUNT_LABELS[key][count === 1 ? 0 : 1]}`).join(' · ') || 'Saved workbook.',
  }
}

const valueText = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const objectValue = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const fieldLabel = (field: string) => ({ faculty: 'Instructor', instructorId: 'Instructor match', roomId: 'Room link', buildingId: 'Building link', format: 'Class format', day: 'Day', days: 'Days', startTime: 'Starts', endTime: 'Ends' } as Record<string, string>)[field]
  || field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, character => character.toUpperCase())

function readableValue(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => readableValue(item, typeof item === 'object' && item !== null ? `${prefix}${prefix ? ' · ' : ''}Entry ${index + 1}` : prefix))
  if (value !== null && typeof value === 'object') return Object.entries(objectValue(value)).flatMap(([field, item]) => {
    const name = `${prefix}${prefix ? ' · ' : ''}${fieldLabel(field)}`
    if (/Id$/.test(field)) return [`${name}: ${valueText(item) ? 'Linked' : 'Not linked'}`]
    return readableValue(item, name)
  })
  const display = value === null ? 'Not set' : value === '' ? 'Empty' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)
  return [`${prefix}${prefix ? ': ' : ''}${display}`]
}

/** Format the saved event only; never replace historical values with current workbook data. */
export function scheduleChangeValue(field: string, value: string | null): { text: string; recordedText?: string } {
  if (value === null) return { text: 'Not set' }
  if (!value) return { text: 'Empty' }
  if (['Cell value', 'Filename', 'Sheet name', 'Added sheet', 'Saved sheet', 'Removed sheet'].includes(field)) return { text: value }
  const trimmed = value.trim()
  if (!/^[\[{]/.test(trimmed)) return { text: value }
  let parsed: unknown
  try { parsed = JSON.parse(trimmed) }
  catch { return { text: value.endsWith('…') ? 'This saved value was shortened. Its full details are unavailable.' : 'This saved value could not be displayed as structured information.', recordedText: value } }
  if (Array.isArray(parsed) && !parsed.length) return { text: field === 'Validation issues' ? 'No validation issues' : field === 'Resolved meetings' ? 'No meetings' : 'No entries' }
  if (field === 'Resolved meetings' && Array.isArray(parsed) && parsed.every(item => item !== null && typeof item === 'object' && !Array.isArray(item))) {
    const meetings = parsed.map((item, index) => {
      const meeting = objectValue(item)
      const time = valueText(meeting.startTime) && valueText(meeting.endTime) ? `${meeting.startTime} – ${meeting.endTime}` : valueText(meeting.time)
      const days = Array.isArray(meeting.days) ? meeting.days.filter(day => typeof day === 'string').join(', ') : valueText(meeting.day)
      return [
        ...(parsed.length > 1 ? [`Meeting ${index + 1}`] : []),
        `Instructor: ${valueText(meeting.faculty) || 'Not assigned'}`,
        `Room: ${valueText(meeting.room) || 'Not assigned'}`,
        `Time: ${time || 'Not set'}`, `Days: ${days || 'Not set'}`,
        ...(valueText(meeting.format) ? [`Class format: ${meeting.format}`] : []),
        ...('instructorId' in meeting ? [`Instructor match: ${valueText(meeting.instructorId) ? 'Matched' : 'Not matched'}`] : []),
        ...('roomId' in meeting ? [`Room link: ${valueText(meeting.roomId) ? 'Linked' : 'Not linked'}`] : []),
        ...('buildingId' in meeting ? [`Building link: ${valueText(meeting.buildingId) ? 'Linked' : 'Not linked'}`] : []),
      ].join('\n')
    })
    return { text: meetings.join('\n\n'), recordedText: value }
  }
  return { text: readableValue(parsed).join('\n') || 'No settings', recordedText: typeof parsed === 'object' && !Array.isArray(parsed) || Array.isArray(parsed) && parsed.some(item => item !== null && typeof item === 'object') ? value : undefined }
}
