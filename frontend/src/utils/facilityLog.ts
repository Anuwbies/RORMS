export const FACILITY_ACTIONS = [
  'facility.building_created', 'facility.building_updated', 'facility.building_deleted',
  'facility.room_created', 'facility.room_updated', 'facility.room_deleted', 'facility.comment_deleted',
]

export const FACILITY_FIELD_LABELS: Record<string, string> = {
  name: 'Name', code: 'Code', buildingId: 'Building', type: 'Room type', floor: 'Floor', capacity: 'Capacity',
  status: 'Availability', image: 'Image', description: 'Description', amenities: 'Amenities', availableDays: 'Available days',
  startTime: 'Opening time', endTime: 'Closing time', minBookingMins: 'Minimum booking (minutes)', maxBookingMins: 'Maximum booking (minutes)',
  roomId: 'Room', authorId: 'Author ID', authorName: 'Comment author', text: 'Comment', createdAt: 'Posted at', record: 'Record', rooms: 'Rooms',
}

export function facilityValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ') || 'None'
  return value === null || value === undefined || value === '' ? 'Not set' : String(value)
}

export function facilityActivity(action: string, changes: Record<string, unknown>, snapshot: Record<string, unknown>, deletedRoomCount: number) {
  const titles: Record<string, string> = {
    'facility.building_created': 'Added building', 'facility.building_updated': 'Edited building', 'facility.building_deleted': 'Deleted building',
    'facility.room_created': 'Added room', 'facility.room_updated': 'Edited room', 'facility.room_deleted': 'Deleted room', 'facility.comment_deleted': 'Deleted room comment',
  }
  let detail: string
  if (action.endsWith('_created')) detail = action === 'facility.building_created' ? 'Created a new building.' : 'Created a new room.'
  else if (action === 'facility.building_deleted') detail = deletedRoomCount ? `Removed the building and ${deletedRoomCount} room${deletedRoomCount === 1 ? '' : 's'}.` : 'Removed the building.'
  else if (action === 'facility.room_deleted') detail = 'Removed the room.'
  else if (action === 'facility.comment_deleted') detail = `Removed a comment${typeof snapshot.authorName === 'string' && snapshot.authorName ? ` by ${snapshot.authorName}` : ''}.`
  else detail = Object.entries(changes).map(([field, value]) => {
    const change = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
    return field === 'image' ? 'Updated room image.' : `${FACILITY_FIELD_LABELS[field] || field}: ${facilityValue(change.before)} → ${facilityValue(change.after)}`
  }).join('\n')
  return { action: titles[action] || 'Updated facility', detail }
}
