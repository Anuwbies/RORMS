export function reservationUsesRoom(reservation: { roomId?: unknown; roomIds?: unknown }, roomId: string): boolean {
  return reservation.roomId === roomId
    || (Array.isArray(reservation.roomIds) && reservation.roomIds.includes(roomId))
}

export function reservationRoomIds(reservation: { roomId?: unknown; roomIds?: unknown }): string[] {
  return [...new Set([
    typeof reservation.roomId === 'string' ? reservation.roomId : '',
    ...(Array.isArray(reservation.roomIds) ? reservation.roomIds.filter((id): id is string => typeof id === 'string') : []),
  ].filter(Boolean))]
}
