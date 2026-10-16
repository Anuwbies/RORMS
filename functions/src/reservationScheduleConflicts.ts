type DocumentData = Record<string, unknown>;

export interface RoomMeeting {
  roomId: string;
  start: number;
  end: number;
  days: number[];
}

export interface SemesterRange {
  start: string;
  end: string;
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): DocumentData => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as DocumentData : {};

export function validDate(value: unknown): string | null {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function timeMinutes(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function weekday(value: unknown): number | undefined {
  const aliases: Record<string, number> = {
    sun: 0, sunday: 0, mon: 1, monday: 1, m: 1,
    tue: 2, tues: 2, tuesday: 2, tu: 2, t: 2,
    wed: 3, wednesday: 3, w: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4,
    fri: 5, friday: 5, f: 5, sat: 6, saturday: 6,
  };
  return aliases[text(value).toLowerCase().replace(/\./g, "")];
}

export function scheduleSemester(schedule: DocumentData): "sem1" | "sem2" | null {
  const value = text(schedule.semesterKey) || text(schedule.semester);
  if (/^(sem1|1st semester)$/i.test(value)) return "sem1";
  if (/^(sem2|2nd semester)$/i.test(value)) return "sem2";
  const legacyTerm = text(schedule.academicTerm);
  if (/\b1st semester\b/i.test(legacyTerm)) return "sem1";
  if (/\b2nd semester\b/i.test(legacyTerm)) return "sem2";
  return null;
}

export function scheduleYearLabel(schedule: DocumentData): string {
  const value = text(schedule.academicYear) || text(schedule.academicTerm);
  const match = /(\d{4})\s*[-–—/]\s*(\d{4})/.exec(value);
  return match ? `${match[1]}-${match[2]}` : "";
}

export function scheduleMeetings(schedule: DocumentData): RoomMeeting[] {
  if (["return", "returned", "cancelled", "deleted", "inactive"].includes(text(schedule.status).toLowerCase())) return [];
  const source = schedule.source === "workbook" && schedule.schemaVersion === 2
    ? Array.isArray(schedule.meetings) ? schedule.meetings.map(object) : []
    : [schedule, { roomId: schedule.roomId2, startTime: schedule.startTime2, endTime: schedule.endTime2, days: schedule.days2 }];
  return source.flatMap(meeting => {
    const roomId = text(meeting.roomId);
    const start = timeMinutes(meeting.startTime), end = timeMinutes(meeting.endTime);
    const days = Array.isArray(meeting.days)
      ? [...new Set(meeting.days.map(weekday).filter((day): day is number => day !== undefined))].sort() : [];
    return roomId && start !== null && end !== null && start < end && days.length ? [{ roomId, start, end, days }] : [];
  });
}

export function scheduleSignature(schedule: DocumentData): string {
  return JSON.stringify([
    text(schedule.academicYearId), scheduleYearLabel(schedule), scheduleSemester(schedule),
    scheduleMeetings(schedule).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}

export function semesterRange(schedule: DocumentData, year: DocumentData): SemesterRange | null {
  const key = scheduleSemester(schedule);
  if (!key) return null;
  const semester = object(year[key]);
  const boundary = (side: "start" | "end"): string | null => {
    // An invalid exact date must never silently expand to an entire month.
    if (semester[`${side}Date`] !== undefined) return validDate(semester[`${side}Date`]);
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const month = months.indexOf(text(semester[`${side}Month`]).toLowerCase());
    const calendarYear = semester[`${side}Year`];
    if (month < 0 || typeof calendarYear !== "number" || !Number.isInteger(calendarYear) || calendarYear < 1000 || calendarYear > 9999) return null;
    const day = side === "start" ? 1 : new Date(Date.UTC(calendarYear, month + 1, 0)).getUTCDate();
    return validDate(`${calendarYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  };
  const start = boundary("start"), end = boundary("end");
  return start && end && start <= end ? { start, end } : null;
}

export function reservationConflicts(
  reservation: DocumentData, meetings: readonly RoomMeeting[], range: SemesterRange,
  now: { currentDateStr: string; currentTimeStr: string }
): boolean {
  if (reservation.status !== "Pending" && reservation.status !== "Approved") return false;
  const date = validDate(reservation.date);
  const start = timeMinutes(reservation.startTime), end = timeMinutes(reservation.endTime);
  if (!date || start === null || end === null || start >= end || date < range.start || date > range.end) return false;
  const currentMinutes = timeMinutes(now.currentTimeStr);
  if (date < now.currentDateStr || (date === now.currentDateStr && currentMinutes !== null && end <= currentMinutes)) return false;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return meetings.some(meeting => meeting.roomId === reservation.roomId && meeting.days.includes(day) && meeting.start < end && meeting.end > start);
}
