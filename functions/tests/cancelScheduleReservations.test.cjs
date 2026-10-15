const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reservationConflicts, scheduleMeetings, scheduleSignature, scheduleSemester, scheduleYearLabel, semesterRange } = require("../lib/reservationScheduleConflicts");
const { cancelScheduleReservations } = require("../lib/cancelScheduleReservations");

const now = { currentDateStr: "2026-07-01", currentTimeStr: "12:00" };
const year = { academicYear: "2026 - 2027", sem1: { startDate: "2026-07-06", endDate: "2026-10-31" }, sem2: { startDate: "2026-11-03", endDate: "2027-03-15" } };
const meeting = { roomId: "room-a", startTime: "09:00", endTime: "10:00", days: ["Monday"] };
const schedule = { source: "workbook", schemaVersion: 2, academicYearId: "year", academicYear: "2026 - 2027", semesterKey: "sem1", status: "Draft", meetings: [meeting] };
const reservation = { roomId: "room-a", date: "2026-07-06", startTime: "09:30", endTime: "10:30", status: "Approved", userId: "user" };
const check = (overrides = {}, row = schedule, academicYear = year, reference = now) => reservationConflicts({ ...reservation, ...overrides }, scheduleMeetings(row), semesterRange(row, academicYear), reference);

test("same room, weekday, and overlapping times cancel Pending and Approved reservations", () => {
  assert.equal(check(), true);
  assert.equal(check({ status: "Pending" }), true);
  assert.equal(check({ status: "Recommending Approval" }), true);
  assert.equal(check({ startTime: "08:00", endTime: "11:00" }), true);
  assert.equal(check({ startTime: "09:00", endTime: "10:00" }), true);
});

test("adjacent times, other rooms and weekdays, invalid values, and finished statuses are excluded", () => {
  for (const overrides of [
    { startTime: "08:00", endTime: "09:00" }, { startTime: "10:00", endTime: "11:00" },
    { roomId: "room-b" }, { date: "2026-07-07" }, { startTime: "25:00" }, { endTime: "09:00" },
    { date: "2026-02-30" }, { status: "Completed" }, { status: "Declined" }, { status: "Cancelled" },
  ]) assert.equal(check(overrides), false, JSON.stringify(overrides));
});

test("exact semester dates are inclusive and do not include holidays in the gap or other terms", () => {
  const everyDay = { ...schedule, meetings: [{ ...meeting, days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] }] };
  for (const [date, expected] of [["2026-07-05", false], ["2026-07-06", true], ["2026-10-31", true], ["2026-11-01", false], ["2027-07-06", false]]) {
    assert.equal(check({ date }, everyDay), expected, date);
  }
  const sem2 = { ...everyDay, semesterKey: "sem2" };
  for (const [date, expected] of [["2026-11-02", false], ["2026-11-03", true], ["2027-03-15", true], ["2027-03-16", false]]) {
    assert.equal(check({ date }, sem2), expected, date);
  }
});

test("past and already concluded same-day reservations are left unchanged", () => {
  assert.equal(check({}, schedule, year, { currentDateStr: "2026-07-07", currentTimeStr: "00:00" }), false);
  assert.equal(check({}, schedule, year, { currentDateStr: "2026-07-06", currentTimeStr: "10:30" }), false);
  assert.equal(check({}, schedule, year, { currentDateStr: "2026-07-06", currentTimeStr: "09:45" }), true);
});

test("all workbook meetings and legacy split sessions are supported; unresolved rooms and empty rows are skipped", () => {
  const row = { ...schedule, meetings: [meeting, { ...meeting, roomId: "room-b", days: ["Tue"], startTime: "11:00", endTime: "12:00" }] };
  assert.equal(check({ roomId: "room-b", date: "2026-07-07", startTime: "11:30", endTime: "12:30" }, row), true);
  const legacy = { ...meeting, roomId2: "room-b", startTime2: "11:00", endTime2: "12:00", days2: ["Tue"] };
  assert.equal(scheduleMeetings(legacy).length, 2);
  assert.equal(scheduleMeetings({ ...schedule, meetings: [] }).length, 0);
  assert.equal(scheduleMeetings({ ...schedule, meetings: [{ ...meeting, roomId: "" }] }).length, 0);
  assert.equal(scheduleMeetings({ ...schedule, status: "Return" }).length, 0);
});

test("legacy semester month/year ranges and combined term labels remain supported", () => {
  assert.deepEqual(semesterRange(schedule, { sem1: { startMonth: "July", startYear: 2026, endMonth: "October", endYear: 2026 } }), { start: "2026-07-01", end: "2026-10-31" });
  assert.equal(scheduleYearLabel({ academicTerm: "2026 – 2027 · 2nd Semester" }), "2026-2027");
  assert.equal(scheduleSemester({ academicTerm: "2026 – 2027 · 2nd Semester" }), "sem2");
  assert.equal(semesterRange(schedule, { sem1: { startDate: "2026-02-30", endDate: "2026-10-31" } }), null);
  assert.equal(semesterRange({ ...schedule, semesterKey: "unknown" }, year), null);
});

test("only relevant schedule changes alter the signature", () => {
  assert.equal(scheduleSignature(schedule), scheduleSignature({ ...schedule, subjectTitle: "Renamed", workbookRevision: 99 }));
  assert.notEqual(scheduleSignature(schedule), scheduleSignature({ ...schedule, meetings: [{ ...meeting, roomId: "room-b" }] }));
  assert.notEqual(scheduleSignature(schedule), scheduleSignature({ ...schedule, semesterKey: "sem2" }));
});

function fakeFirestore(rows = [reservation], academicYear = year, savedSchedule = schedule) {
  const documents = new Map([["schedule/row", structuredClone(savedSchedule)], ["academicYears/year", structuredClone(academicYear)], ...rows.map((row, index) => [`reservations/${String(index).padStart(4, "0")}`, structuredClone(row)])]);
  let reads = 0;
  const ref = path => ({ path, id: path.split("/").pop(), get: async () => snapshot(path) });
  const snapshot = path => ({ id: ref(path).id, ref: ref(path), data: () => documents.get(path) });
  const collection = path => ({
    doc: id => ref(`${path}/${id}`),
    get: async () => ({ docs: [...documents.keys()].filter(key => key.startsWith(`${path}/`)).map(snapshot) }),
    where: (_field, _operator, roomId) => {
      let cursor = "", limit = 100;
      const query = {
        orderBy: () => query,
        limit: value => { limit = value; return query; },
        startAfter: value => { cursor = value; return query; },
        read: () => {
          const docs = [...documents.keys()].filter(key => key.startsWith("reservations/") && documents.get(key).roomId === roomId && ref(key).id > cursor).sort().slice(0, limit).map(snapshot);
          return { docs, size: docs.length };
        },
      };
      return query;
    },
  });
  const fake = {
    documents, beforeTransaction: undefined, transactions: 0,
    db: {
      collection,
      runTransaction: async callback => {
        fake.transactions++;
        fake.beforeTransaction?.();
        const writes = [];
        const result = await callback({
          getAll: async (...refs) => refs.map(item => snapshot(item.path)),
          get: async query => { reads++; return query.read(); },
          update: (reference, data) => writes.push([reference.path, data]),
        });
        for (const [path, data] of writes) documents.set(path, { ...documents.get(path), ...data });
        return result;
      },
    },
    ref: ref("schedule/row"), get reads() { return reads; },
  };
  return fake;
}

test("transaction cancels only conflicts, retains records and reasons, and is safe to repeat", async () => {
  const fake = fakeFirestore([reservation, { ...reservation, startTime: "10:00", endTime: "11:00" }, { ...reservation, status: "Completed" }]);
  assert.equal(await cancelScheduleReservations(fake.db, fake.ref, now), 1);
  const cancelled = fake.documents.get("reservations/0000");
  assert.equal(cancelled.status, "Cancelled");
  assert.match(cancelled.cancellationReason, /class schedule/);
  assert.equal(cancelled.cancelledByScheduleId, "row");
  assert.equal(cancelled.autoProcessed, true);
  assert.ok(cancelled.cancelledAt);
  assert.equal(fake.documents.get("reservations/0001").status, "Approved");
  assert.equal(fake.documents.get("reservations/0002").status, "Completed");
  assert.equal(await cancelScheduleReservations(fake.db, fake.ref, now), 0);
});

test("pages beyond 100 reservations are all processed", async () => {
  const fake = fakeFirestore(Array.from({ length: 205 }, () => reservation));
  assert.equal(await cancelScheduleReservations(fake.db, fake.ref, now), 205);
  assert.equal(fake.transactions, 3);
});

test("rechecks moved/deleted schedules, changed semester dates, and completed reservations before cancellation", async () => {
  for (const change of [
    fake => fake.documents.delete("schedule/row"),
    fake => fake.documents.set("schedule/row", { ...schedule, meetings: [{ ...meeting, roomId: "other" }] }),
    fake => fake.documents.set("academicYears/year", { ...year, sem1: { startDate: "2026-07-07", endDate: "2026-10-31" } }),
    fake => fake.documents.set("reservations/0000", { ...reservation, status: "Completed" }),
  ]) {
    const fake = fakeFirestore();
    fake.beforeTransaction = () => change(fake);
    assert.equal(await cancelScheduleReservations(fake.db, fake.ref, now), 0);
  }
});

test("missing and ambiguous academic terms never cancel reservations", async () => {
  const missing = fakeFirestore();
  missing.documents.delete("academicYears/year");
  assert.equal(await cancelScheduleReservations(missing.db, missing.ref, now), 0);
  const legacy = fakeFirestore([reservation], year, { ...schedule, academicYearId: undefined });
  assert.equal(await cancelScheduleReservations(legacy.db, legacy.ref, now), 1);
  const ambiguous = fakeFirestore([reservation], year, { ...schedule, academicYearId: undefined });
  ambiguous.documents.set("academicYears/duplicate", year);
  assert.equal(await cancelScheduleReservations(ambiguous.db, ambiguous.ref, now), 0);
});
