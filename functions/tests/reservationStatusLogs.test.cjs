const { test } = require("node:test");
const assert = require("node:assert/strict");
const { changeReservationStatus } = require("../lib/reservationStatusLogs");

const request = { reservationId: "res1", status: "Approved", expectedStatus: "Recommending Approval" };

test("University Administrator can approve reservations with its own audit role", async () => {
  const fake = fixture({ role: "University Administrator" });
  await changeReservationStatus(fake.db, "reviewer", request);
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
  assert.equal(fake.logs()[0].actorRole, "University Administrator");
});

function fixture({ role = "Registrar", membershipStatus = "accepted", active = true, reservationStatus = "Recommending Approval", failLog = false, retry = false } = {}) {
  const documents = new Map([
    ["reservations/res1", { status: reservationStatus, userId: "requester", roomId: "room1", buildingId: "building1", department: "CITE", date: "2026-10-12" }],
    ["memberships/member1", { userId: "reviewer", role, department: "CITE", status: membershipStatus }],
    ["users/reviewer", { firstName: "Maria", surname: "Santos", fullName: "Maria Santos", isActive: active }],
  ]);
  let nextId = 0;
  const logRefs = [];
  function snapshot(path) {
    return { id: path.split("/").at(-1), data: () => documents.get(path) };
  }
  const db = {
    collection(name) {
      return {
        collection: name,
        doc(id = `generated-${++nextId}`) { return { id, path: `${name}/${id}` }; },
        where(field, operator, value) { return { collection: name, field, operator, value }; },
      };
    },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
        const staged = new Map();
        const result = await callback({
          async get(ref) {
            if (ref.collection) {
              return { docs: [...documents].filter(([path, data]) => path.startsWith(`${ref.collection}/`) && (!ref.field || data[ref.field] === ref.value)).map(([path]) => snapshot(path)) };
            }
            return snapshot(ref.path);
          },
          update(ref, data) { staged.set(ref.path, { ...documents.get(ref.path), ...data }); },
          create(ref, data) {
            logRefs.push(ref.path);
            if (failLog) throw new Error("Log write failed");
            assert.equal(documents.has(ref.path), false);
            staged.set(ref.path, data);
          },
        });
        if (retry && attempt === 0) continue;
        for (const [path, data] of staged) documents.set(path, data);
        return result;
      }
    },
  };
  const logs = () => [...documents].filter(([path]) => path.startsWith("logs/")).map(([, data]) => data);
  return { db, documents, logs, logRefs };
}

test("an approval records server-read actor, previous/new status, timestamp and reservation context", async () => {
  const fake = fixture();
  const result = await changeReservationStatus(fake.db, "reviewer", { ...request, actorId: "forged", actorRole: "Admin", actorName: "Fake" });
  assert.deepEqual(result, { changed: true, logId: "generated-1" });
  const [log] = fake.logs();
  assert.equal(log.action, "reservation.status_changed");
  assert.equal(log.targetCollection, "reservations");
  assert.equal(log.targetId, "res1");
  assert.equal(log.actorId, "reviewer");
  assert.equal(log.actorName, "Santos, Maria");
  assert.equal(log.actorRole, "Registrar");
  assert.equal(log.membershipId, "member1");
  assert.equal(log.source, "user");
  assert.equal(log.roomId, "room1");
  assert.equal(log.requesterId, "requester");
  assert.equal(log.department, "CITE");
  assert.deepEqual(log.changes, { status: { before: "Recommending Approval", after: "Approved" } });
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Approved");
  assert.equal(saved.updatedAt.constructor.name, "ServerTimestampTransform");
  assert.equal(log.createdAt.constructor.name, "ServerTimestampTransform");
  // Historical identity is captured, rather than joined from mutable profile data.
  fake.documents.get("users/reviewer").surname = "Changed";
  assert.equal(log.actorName, "Santos, Maria");
});

test("Admin retains status management but cannot grant final approval", async () => {
  const fake = fixture({ role: "Admin" });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "permission-denied" });
  let before = "Recommending Approval";
  for (const status of ["Declined", "Cancelled", "Completed", "Pending"]) {
    await changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: before, status });
    assert.deepEqual(fake.logs().at(-1).changes.status, { before, after: status });
    before = status;
  }
  assert.equal(fake.logs().length, 4);
});

test("repeated/no-op requests do not add a log or update the reservation again", async () => {
  const fake = fixture();
  await changeReservationStatus(fake.db, "reviewer", request);
  const firstUpdate = fake.documents.get("reservations/res1").updatedAt;
  assert.deepEqual(await changeReservationStatus(fake.db, "reviewer", request), { changed: false, logId: null });
  assert.equal(fake.logs().length, 1);
  assert.equal(fake.documents.get("reservations/res1").updatedAt, firstUpdate);
});

test("a stale request cannot overwrite another change or create a false event", async () => {
  const fake = fixture({ reservationStatus: "Cancelled" });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "failed-precondition" });
  assert.equal(fake.documents.get("reservations/res1").status, "Cancelled");
  assert.equal(fake.logs().length, 0);
});

test("authentication, accepted manager membership and active profile are required", async () => {
  const signedOut = fixture();
  await assert.rejects(changeReservationStatus(signedOut.db, undefined, request), { code: "unauthenticated" });
  for (const options of [{ role: "Dean" }, { role: "Program Head" }, { role: "Instructor" }, { membershipStatus: "pending" }, { active: false }]) {
    const fake = fixture(options);
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "permission-denied" });
    assert.equal(fake.logs().length, 0);
    assert.equal(fake.documents.get("reservations/res1").status, "Recommending Approval");
  }
  const foreign = fixture();
  await assert.rejects(changeReservationStatus(foreign.db, "another-user", request), { code: "permission-denied" });
});

test("invalid inputs, deleted reservations, and invalid saved statuses do not create logs", async () => {
  for (const input of [null, {}, { ...request, reservationId: "../res1" }, { ...request, status: "Invalid" }, { ...request, expectedStatus: "Invalid" }]) {
    const fake = fixture();
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", input), { code: "invalid-argument" });
    assert.equal(fake.logs().length, 0);
  }
  const deleted = fixture();
  deleted.documents.delete("reservations/res1");
  await assert.rejects(changeReservationStatus(deleted.db, "reviewer", request), { code: "not-found" });
  const invalid = fixture({ reservationStatus: "Invalid" });
  await assert.rejects(changeReservationStatus(invalid.db, "reviewer", request), { code: "failed-precondition" });
});

test("a log write failure leaves the status unchanged", async () => {
  const fake = fixture({ failLog: true });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), /Log write failed/);
  assert.equal(fake.documents.get("reservations/res1").status, "Recommending Approval");
  assert.equal(fake.documents.get("reservations/res1").updatedAt, undefined);
  assert.equal(fake.logs().length, 0);
});

test("transaction retries reuse the same event reference and publish one event", async () => {
  const fake = fixture({ retry: true });
  await changeReservationStatus(fake.db, "reviewer", request);
  assert.deepEqual(fake.logRefs, ["logs/generated-1", "logs/generated-1"]);
  assert.equal(fake.logs().length, 1);
});

test("legacy profiles and missing reservation context have safe fallbacks", async () => {
  const fake = fixture();
  fake.documents.set("users/reviewer", { fullName: "Legacy Name" });
  fake.documents.set("reservations/res1", { status: "Recommending Approval" });
  await changeReservationStatus(fake.db, "reviewer", request);
  const [log] = fake.logs();
  assert.equal(log.actorName, "Legacy Name");
  assert.equal(log.roomId, "");
  assert.equal(log.department, "");
});

function extendedFixture() {
  const fake = fixture();
  Object.assign(fake.documents.get("reservations/res1"), {
    requestType: "Extended", purpose: "Exhibit",
    date: "2099-10-13", startTime: "07:30", endTime: "18:00", duration: 630, attendees: 25,
  });
  fake.documents.set("rooms/room1", {
    status: "Available", availableDays: ["Tuesday"], startTime: "07:30", endTime: "18:00",
    minBookingMins: 30, maxBookingMins: 90, capacity: 30,
  });
  return fake;
}

test("an extended whole-day request exceeds normal limits and is approved without a separate extension reason", async () => {
  const fake = extendedFixture();
  await changeReservationStatus(fake.db, "reviewer", request);
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
  assert.equal(fake.documents.get("reservations/res1").duration, 630);
  assert.equal(fake.documents.get("reservations/res1").extensionReason, undefined);
  assert.equal(fake.documents.get("reservations/res1").purpose, "Exhibit");
  assert.equal(fake.logs().length, 1);
});

test("extended approvals reject changed room hours, days, availability, capacity and invalid requests atomically", async () => {
  for (const [target, changes] of [
    ["rooms/room1", { endTime: "17:00" }],
    ["rooms/room1", { startTime: "08:00" }],
    ["rooms/room1", { availableDays: ["Monday"] }],
    ["rooms/room1", { status: "Maintenance" }],
    ["rooms/room1", { capacity: 10 }],
    ["reservations/res1", { duration: 30 }],
    ["reservations/res1", { date: "2020-01-01" }],
    ["reservations/res1", { endTime: "06:00", duration: -90 }],
  ]) {
    const fake = extendedFixture();
    Object.assign(fake.documents.get(target), changes);
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "failed-precondition" });
    assert.equal(fake.documents.get("reservations/res1").status, "Recommending Approval");
    assert.equal(fake.logs().length, 0);
  }
});

test("extended approval checks other reservations, ignoring itself and terminal requests", async () => {
  for (const status of ["Pending", "Recommending Approval", "Approved", "Declined", "Cancelled", "Completed"]) {
    const fake = extendedFixture();
    fake.documents.set("reservations/other", {
      roomId: "room1", date: "2099-10-13", startTime: "10:00", endTime: "11:00", status,
    });
    if (["Pending", "Recommending Approval", "Approved"].includes(status)) {
      await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), /conflicts with another/);
      assert.equal(fake.logs().length, 0);
    } else {
      await changeReservationStatus(fake.db, "reviewer", request);
      assert.equal(fake.logs().length, 1);
    }
  }
});

test("extended approval checks workbook and legacy split meetings within their semester dates", async () => {
  for (const schedule of [
    { roomId: "room1", startTime: "09:00", endTime: "10:00", days: ["Tuesday"] },
    { roomId: "other", roomId2: "room1", startTime2: "09:00", endTime2: "10:00", days2: ["Tuesday"] },
    { source: "workbook", schemaVersion: 2, meetings: [{ roomId: "room1", startTime: "09:00", endTime: "10:00", days: ["Tue"] }] },
  ]) {
    const fake = extendedFixture();
    fake.documents.set("academicYears/year1", { sem1: { startDate: "2099-08-01", endDate: "2099-12-31" } });
    fake.documents.set("schedule/class", { ...schedule, status: "Draft", academicYearId: "year1", semesterKey: "sem1" });
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), /conflicts with a class/);
    assert.equal(fake.logs().length, 0);
    fake.documents.get("academicYears/year1").sem1.endDate = "2099-10-12";
    await changeReservationStatus(fake.db, "reviewer", request);
    assert.equal(fake.logs().length, 1);
  }
});

test("extended approvals exclude adjacent meetings and returned schedules", async () => {
  const fake = extendedFixture();
  fake.documents.set("schedule/adjacent", { roomId: "room1", startTime: "18:00", endTime: "19:00", days: ["Tuesday"] });
  fake.documents.set("schedule/returned", { roomId: "room1", startTime: "09:00", endTime: "10:00", days: ["Tuesday"], status: "Returned" });
  await changeReservationStatus(fake.db, "reviewer", request);
  assert.equal(fake.logs().length, 1);
});

test("declining an extended request remains possible when the room or request is no longer valid", async () => {
  const fake = extendedFixture();
  fake.documents.delete("rooms/room1");
  await changeReservationStatus(fake.db, "reviewer", { ...request, status: "Declined" });
  assert.equal(fake.documents.get("reservations/res1").status, "Declined");
});

for (const role of ["Dean", "Program Head"]) {
  test(`${role} can recommend only its own department's pending requests`, async () => {
    const fake = fixture({ role, reservationStatus: "Pending" });
    const recommendation = { ...request, status: "Recommending Approval", expectedStatus: "Pending" };
    await changeReservationStatus(fake.db, "reviewer", recommendation);
    const saved = fake.documents.get("reservations/res1");
    assert.equal(saved.status, "Recommending Approval");
    assert.equal(saved.recommendedBy, "reviewer");
    assert.equal(saved.recommendedByRole, role);
    assert.equal(fake.logs()[0].actorRole, role);
    assert.deepEqual(await changeReservationStatus(fake.db, "reviewer", recommendation), { changed: false, logId: null });
    for (const department of ["CAS", ""]) {
      const foreign = fixture({ role, reservationStatus: "Pending" });
      foreign.documents.get("reservations/res1").department = department;
      await assert.rejects(changeReservationStatus(foreign.db, "reviewer", recommendation), { code: "permission-denied" });
      assert.equal(foreign.logs().length, 0);
    }
    for (const status of ["Approved", "Declined", "Cancelled", "Completed"]) {
      await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...request, status }), { code: "permission-denied" });
    }
    const cancelled = fixture({ role, reservationStatus: "Cancelled" });
    await assert.rejects(changeReservationStatus(cancelled.db, "reviewer", { ...recommendation, expectedStatus: "Cancelled" }), { code: "failed-precondition" });
  });
}

test("final approvers cannot bypass department recommendation", async () => {
  for (const role of ["Registrar", "University Administrator"]) {
    const fake = fixture({ role, reservationStatus: "Pending" });
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: "Pending" }), { code: "failed-precondition" });
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: "Pending", status: "Recommending Approval" }), { code: "permission-denied" });
    assert.equal(fake.logs().length, 0);
  }
});
