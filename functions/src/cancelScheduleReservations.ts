import { FieldPath, FieldValue, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { reservationConflicts, scheduleMeetings, scheduleSignature, scheduleYearLabel, semesterRange } from "./reservationScheduleConflicts";

const PAGE_SIZE = 100;

/** Read current documents in each transaction: Firestore events can arrive out of order or more than once. */
export async function cancelScheduleReservations(
  db: Firestore, scheduleRef: DocumentReference,
  now: { currentDateStr: string; currentTimeStr: string }
): Promise<number> {
  const snapshot = await scheduleRef.get();
  const schedule = snapshot.data();
  if (!schedule) return 0;
  const meetings = scheduleMeetings(schedule);
  if (!meetings.length) return 0;

  let yearRef: DocumentReference | undefined;
  if (typeof schedule.academicYearId === "string" && schedule.academicYearId && !schedule.academicYearId.includes("/")) {
    yearRef = db.collection("academicYears").doc(schedule.academicYearId);
  } else {
    const label = scheduleYearLabel(schedule);
    if (!label) return 0;
    const years = await db.collection("academicYears").get();
    const matches = years.docs.filter(year => scheduleYearLabel(year.data()) === label);
    // Never guess between ambiguous academic years.
    if (matches.length !== 1) return 0;
    yearRef = matches[0].ref;
  }

  const signature = scheduleSignature(schedule);
  let cancelled = 0;
  for (const roomId of new Set(meetings.map(meeting => meeting.roomId))) {
    let cursor: string | undefined;
    for (;;) {
      const query = db.collection("reservations").where("roomId", "==", roomId)
        .orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
      const pageQuery = cursor ? query.startAfter(cursor) : query;
      const result = await db.runTransaction(async transaction => {
        const [currentSchedule, currentYear] = await transaction.getAll(scheduleRef, yearRef);
        const data = currentSchedule.data(), year = currentYear.data();
        if (!data || !year || scheduleSignature(data) !== signature) return { size: 0, lastId: undefined, count: 0 };
        const range = semesterRange(data, year);
        if (!range) return { size: 0, lastId: undefined, count: 0 };
        const page = await transaction.get(pageQuery);
        const currentMeetings = scheduleMeetings(data);
        let count = 0;
        for (const reservation of page.docs) {
          if (!reservationConflicts(reservation.data(), currentMeetings, range, now)) continue;
          transaction.update(reservation.ref, {
            status: "Cancelled",
            cancellationReason: "Automatically cancelled because a class schedule now occupies this room at the reserved time.",
            cancelledByScheduleId: scheduleRef.id,
            cancelledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            autoProcessed: true,
          });
          count++;
        }
        return { size: page.size, lastId: page.docs[page.size - 1]?.id, count };
      });
      cancelled += result.count;
      if (result.size < PAGE_SIZE) break;
      cursor = result.lastId;
    }
  }
  return cancelled;
}
