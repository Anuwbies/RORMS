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

function fixture({ role = "University Administrator", membershipStatus = "accepted", active = true, reservationStatus = "Recommending Approval", failLog = false, retry = false } = {}) {
  const documents = new Map([
    ["reservations/res1", { status: reservationStatus, registrarRecommend: true, deanRecommend: true, universityAdministratorRecommend: false, userId: "requester", roomId: "room1", buildingId: "building1", department: "CITE", date: "2026-10-12" }],
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
  assert.equal(log.actorRole, "University Administrator");
  assert.equal(log.membershipId, "member1");
  assert.equal(log.source, "user");
  assert.equal(log.roomId, "room1");
  assert.equal(log.requesterId, "requester");
  assert.equal(log.department, "CITE");
  assert.deepEqual(log.changes, {
    status: { before: "Recommending Approval", after: "Approved" },
    universityAdministratorRecommend: { before: false, after: true },
  });
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Approved");
  assert.equal(saved.universityAdministratorRecommend, true);
  assert.equal(saved.updatedAt.constructor.name, "ServerTimestampTransform");
  assert.equal(log.createdAt.constructor.name, "ServerTimestampTransform");
  // Historical identity is captured, rather than joined from mutable profile data.
  fake.documents.get("users/reviewer").surname = "Changed";
  assert.equal(log.actorName, "Santos, Maria");
});

test("Admin retains cancellation and completion management but cannot grant final approval", async () => {
  const fake = fixture({ role: "Admin" });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "permission-denied" });
  await changeReservationStatus(fake.db, "reviewer", { ...request, status: "Cancelled" });
  assert.deepEqual(fake.logs()[0].changes.status, { before: "Recommending Approval", after: "Cancelled" });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: "Cancelled", status: "Pending" }), { code: "failed-precondition" });
  assert.equal(fake.logs().length, 1);
});

test("repeated requests with a stale expected status do not add a log", async () => {
  const fake = fixture();
  await changeReservationStatus(fake.db, "reviewer", request);
  const firstUpdate = fake.documents.get("reservations/res1").updatedAt;
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "failed-precondition" });
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
  for (const options of [{ role: "Dean" }, { role: "Program Head" }, { role: "Registrar" }, { role: "Instructor" }, { membershipStatus: "pending" }, { active: false }]) {
    const fake = fixture(options);
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "permission-denied" });
    assert.equal(fake.logs().length, 0);
    assert.equal(fake.documents.get("reservations/res1").status, "Recommending Approval");
  }
  const foreign = fixture();
  await assert.rejects(changeReservationStatus(foreign.db, "another-user", request), { code: "permission-denied" });
});

test("invalid inputs, deleted reservations, and invalid saved statuses do not create logs", async () => {
  for (const input of [null, {}, { ...request, reservationId: "../res1" }, { ...request, status: "Invalid" }, { ...request, expectedStatus: "Invalid" }, { ...request, recommendation: "Program Head" }]) {
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
  fake.documents.set("reservations/res1", { status: "Recommending Approval", registrarRecommend: true, deanRecommend: true });
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
  await changeReservationStatus(fake.db, "reviewer", { ...request, status: "Declined", declinedReason: "Room unavailable" });
  assert.equal(fake.documents.get("reservations/res1").status, "Declined");
});

test("Registrar recommendation keeps a new request Pending and writes one audit event", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  Object.assign(fake.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: false });
  const recommendation = { reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Registrar" };
  await changeReservationStatus(fake.db, "reviewer", recommendation);
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Pending");
  assert.equal(saved.registrarRecommend, true);
  assert.equal(saved.registrarRecommendedBy, "reviewer");
  assert.equal(fake.logs()[0].reviewStage, "Registrar");
  assert.deepEqual(fake.logs()[0].changes.registrarRecommend, { before: false, after: true });
  assert.deepEqual(await changeReservationStatus(fake.db, "reviewer", recommendation), { changed: false, logId: null });
  assert.equal(fake.logs().length, 1);
});

test("Dean recommendation requires Registrar review and an accepted membership in the requester's department", async () => {
  const recommendation = { reservationId: "res1", status: "Recommending Approval", expectedStatus: "Pending", recommendation: "Dean" };
  const missingRegistrar = fixture({ role: "Dean", reservationStatus: "Pending" });
  missingRegistrar.documents.get("reservations/res1").registrarRecommend = false;
  await assert.rejects(changeReservationStatus(missingRegistrar.db, "reviewer", recommendation), { code: "failed-precondition" });

  const dean = fixture({ role: "Dean", reservationStatus: "Pending" });
  dean.documents.get("reservations/res1").deanRecommend = false;
  await changeReservationStatus(dean.db, "reviewer", recommendation);
  const saved = dean.documents.get("reservations/res1");
  assert.equal(saved.status, "Recommending Approval");
  assert.equal(saved.deanRecommend, true);
  assert.equal(saved.recommendedByRole, "Dean");
  assert.equal(dean.logs()[0].reviewStage, "Dean");

  for (const department of ["CAS", ""]) {
    const foreign = fixture({ role: "Dean", reservationStatus: "Pending" });
    foreign.documents.get("reservations/res1").department = department;
    await assert.rejects(changeReservationStatus(foreign.db, "reviewer", recommendation), { code: "permission-denied" });
  }
  const programHead = fixture({ role: "Program Head", reservationStatus: "Pending" });
  await assert.rejects(changeReservationStatus(programHead.db, "reviewer", recommendation), { code: "permission-denied" });
});

test("University Administrator approval requires both recommendations", async () => {
  for (const flags of [{ registrarRecommend: false, deanRecommend: true }, { registrarRecommend: true, deanRecommend: false }]) {
    const fake = fixture();
    Object.assign(fake.documents.get("reservations/res1"), flags);
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", request), { code: "failed-precondition" });
    assert.equal(fake.logs().length, 0);
  }
  const registrar = fixture({ role: "Registrar" });
  await assert.rejects(changeReservationStatus(registrar.db, "reviewer", request), { code: "permission-denied" });
  const dean = fixture({ role: "Dean" });
  await assert.rejects(changeReservationStatus(dean.db, "reviewer", request), { code: "permission-denied" });
});

test("older open requests can receive Registrar and Dean recommendations in the new order", async () => {
  const fake = fixture({ role: "Registrar" });
  const saved = fake.documents.get("reservations/res1");
  delete saved.registrarRecommend;
  saved.deanRecommend = true;
  await changeReservationStatus(fake.db, "reviewer", { reservationId: "res1", status: "Recommending Approval", expectedStatus: "Recommending Approval", recommendation: "Registrar" });
  assert.equal(saved.registrarRecommend, undefined);
  assert.equal(fake.documents.get("reservations/res1").registrarRecommend, true);
  assert.equal(fake.documents.get("reservations/res1").deanRecommend, false);
  assert.deepEqual(fake.logs()[0].changes.deanRecommend, { before: true, after: false });
  fake.documents.get("memberships/member1").role = "Dean";
  await changeReservationStatus(fake.db, "reviewer", { reservationId: "res1", status: "Recommending Approval", expectedStatus: "Recommending Approval", recommendation: "Dean" });
  assert.equal(fake.documents.get("reservations/res1").deanRecommend, true);
  fake.documents.get("memberships/member1").role = "University Administrator";
  await changeReservationStatus(fake.db, "reviewer", request);
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
  assert.equal(fake.logs().length, 3);
});

test("final decline also requires both recommendations and University Administrator role", async () => {
  const decline = { ...request, status: "Declined", declinedReason: "Room unavailable" };
  const fake = fixture();
  fake.documents.get("reservations/res1").deanRecommend = false;
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", decline), { code: "failed-precondition" });
  fake.documents.get("reservations/res1").deanRecommend = true;
  await changeReservationStatus(fake.db, "reviewer", decline);
  assert.equal(fake.documents.get("reservations/res1").status, "Declined");
  assert.equal(fake.documents.get("reservations/res1").declinedReason, "Room unavailable");
});

test("Registrar can decline an open request before recommendation with a required audited reason", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  Object.assign(fake.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: false });
  const decline = { reservationId: "res1", status: "Declined", expectedStatus: "Pending", declinedReason: "  Room unavailable  " };
  await changeReservationStatus(fake.db, "reviewer", decline);
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Declined");
  assert.equal(saved.declinedReason, "Room unavailable");
  assert.deepEqual(fake.logs()[0].changes.declinedReason, { before: "", after: "Room unavailable" });
  assert.equal(fake.logs()[0].actorRole, "Registrar");
});

test("declines require a reason and Registrar cannot decline after recommending", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  fake.documents.get("reservations/res1").registrarRecommend = false;
  const decline = { reservationId: "res1", status: "Declined", expectedStatus: "Pending" };
  for (const declinedReason of [undefined, "  ", "x".repeat(501)]) {
    await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...decline, declinedReason }), { code: "invalid-argument" });
  }
  fake.documents.get("reservations/res1").registrarRecommend = true;
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...decline, declinedReason: "Cannot accommodate" }), { code: "failed-precondition" });
  assert.equal(fake.logs().length, 0);
});

test("Registrar manual status edit can cancel a Pending request", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  await changeReservationStatus(fake.db, "reviewer", { reservationId: "res1", status: "Cancelled", expectedStatus: "Pending" });
  assert.equal(fake.documents.get("reservations/res1").status, "Cancelled");
});
