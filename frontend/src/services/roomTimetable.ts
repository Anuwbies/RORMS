import { collection, onSnapshot, query, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { roomScheduleMeetings } from '../utils/roomSchedule'
import type { ScheduleMeetingRecord } from '../utils/scheduleMeetings'

interface RoomTimetable {
  schedules: ScheduleMeetingRecord[]
  reservations: Record<string, unknown>[]
}

// Keep both legacy roomId rows and every room in a compact workbook row live.
export function subscribeRoomTimetable(roomId: string, includeReservations: boolean,
  receive: (value: RoomTimetable) => void, fail: (error: unknown) => void): () => void {
  const sources = [
    query(collection(db, 'schedules'), where('roomId', '==', roomId)),
    query(collection(db, 'schedules'), where('roomIds', 'array-contains', roomId)),
    ...(includeReservations ? [
      query(collection(db, 'reservations'), where('roomId', '==', roomId)),
      query(collection(db, 'reservations'), where('roomIds', 'array-contains', roomId)),
    ] : []),
  ]
  const snapshots = new Map<number, readonly QueryDocumentSnapshot<DocumentData>[]>()
  const errors = new Set<number>()
  const unsubscribes: (() => void)[] = []
  let active = true
  const timer = setTimeout(() => {
    if (active) fail(new Error('Room timetable request timed out.'))
  }, 20_000)

  const report = (index: number, error: unknown) => {
    if (!active) return
    errors.add(index)
    clearTimeout(timer)
    fail(error)
  }
  const publish = () => {
    if (!active || snapshots.size !== sources.length || errors.size) return
    clearTimeout(timer)
    try {
      // A workbook row can match both queries; expand it only once.
      const documents = new Map([...snapshots.get(0)!, ...snapshots.get(1)!].map(document => [document.id, document]))
      receive({
        schedules: roomScheduleMeetings([...documents.values()], roomId),
        reservations: [...new Map([...(snapshots.get(2) ?? []), ...(snapshots.get(3) ?? [])]
          .map(document => [document.id, document] as const)).values()]
          .map((document): Record<string, unknown> => ({ ...document.data(), id: document.id }))
          .filter(reservation => ['Approved', 'Pending'].includes(String(reservation.status))),
      })
    } catch (error) {
      fail(error)
    }
  }

  sources.forEach((source, index) => {
    try {
      unsubscribes.push(onSnapshot(source, snapshot => {
        if (!active) return
        snapshots.set(index, snapshot.docs)
        errors.delete(index)
        publish()
      }, error => report(index, error)))
    } catch (error) {
      report(index, error)
    }
  })

  return () => {
    active = false
    clearTimeout(timer)
    unsubscribes.forEach(unsubscribe => unsubscribe())
  }
}
