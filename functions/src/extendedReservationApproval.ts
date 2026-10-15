import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { scheduleMeetings, scheduleYearLabel, semesterRange, timeMinutes, validDate } from "./reservationScheduleConflicts";

/** Recheck the current room and occupied time inside the status/log transaction. */
export async function validateExtendedReservationApproval(
  db: Firestore, transaction: Transaction, reservationId: string, reservation: Record<string, unknown>
): Promise<void> {
  function fail(message: string): never { throw new HttpsError("failed-precondition", message); }
  const roomId = typeof reservation.roomId === "string" ? reservation.roomId : "";
  const date = validDate(reservation.date);
  const start = timeMinutes(reservation.startTime), end = timeMinutes(reservation.endTime);
  if (!roomId || roomId.includes("/") || !date || start === null || end === null || end <= start
    || reservation.duration !== end - start) {
    fail("The extended reservation has invalid times. Ask the requester to submit it again.");
  }
  // Approval need not satisfy the original two-hour submission lead time, but must precede the event.
  if (Date.parse(`${date}T${String(reservation.startTime).padStart(5, "0")}:00+08:00`) <= Date.now()) {
    fail("This reservation has already started. It cannot be approved.");
  }

  const [roomSnapshot, reservations, schedules, years] = await Promise.all([
    transaction.get(db.collection("rooms").doc(roomId)),
    transaction.get(db.collection("reservations").where("roomId", "==", roomId)),
    transaction.get(db.collection("schedule")),
    transaction.get(db.collection("academicYears")),
  ]);
  const room = roomSnapshot.data();
  if (!room || room.status !== "Available") fail("This room is no longer available for reservations.");
  const opening = timeMinutes(room.startTime || "07:30"), closing = timeMinutes(room.endTime || "18:00");
  const minimum = Math.max(30, typeof room.minBookingMins === "number" ? room.minBookingMins : 30);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
  if (opening === null || closing === null || start < opening || end > closing || end - start < minimum
    || !Array.isArray(room.availableDays) || !room.availableDays.includes(dayName)) {
    fail("The extended reservation no longer fits the room's available days, hours, or minimum duration.");
  }
  if (typeof reservation.attendees !== "number" || !Number.isInteger(reservation.attendees) || reservation.attendees < 1
    || (typeof room.capacity === "number" && reservation.attendees > room.capacity)) {
    fail("The requested attendees exceed this room's current capacity or are invalid.");
  }
  for (const other of reservations.docs) {
    const data = other.data();
    if (other.id === reservationId || data.date !== date || !["Pending", "Recommending Approval", "Approved"].includes(data.status)) continue;
    const otherStart = timeMinutes(data.startTime), otherEnd = timeMinutes(data.endTime);
    if (otherStart !== null && otherEnd !== null && otherStart < end && otherEnd > start) {
      fail("This extended reservation conflicts with another pending or approved reservation.");
    }
  }
  for (const snapshot of schedules.docs) {
    const schedule = snapshot.data();
    const overlaps = scheduleMeetings(schedule).some(meeting => meeting.roomId === roomId
      && meeting.days.includes(day) && meeting.start < end && meeting.end > start);
    if (!overlaps) continue;
    const candidates = typeof schedule.academicYearId === "string" && schedule.academicYearId
      ? years.docs.filter(year => year.id === schedule.academicYearId)
      : years.docs.filter(year => scheduleYearLabel(schedule) && scheduleYearLabel(year.data()) === scheduleYearLabel(schedule));
    const range = candidates.length === 1 ? semesterRange(schedule, candidates[0].data()) : null;
    // Unresolved legacy terms cannot establish that a conflicting class is outside this date.
    if (!range || (date >= range.start && date <= range.end)) {
      fail("This extended reservation conflicts with a class schedule. Check the room schedule before approving.");
    }
  }
}
