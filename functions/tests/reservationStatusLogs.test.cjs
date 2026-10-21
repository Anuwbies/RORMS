const { test } = require("node:test");
const assert = require("node:assert/strict");
const { changeReservationStatus } = require("../lib/reservationStatusLogs");

const request = { reservationId: "res1", status: "Approved", expectedStatus: "Pending" };

test("University Administrator can approve reservations with its own audit role", async () => {
  const fake = fixture({ role: "University Administrator" });
  await changeReservationStatus(fake.db, "reviewer", request);
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
  assert.equal(fake.logs()[0].actorRole, "University Administrator");
});

function fixture({ role = "University Administrator", membershipStatus = "accepted", active = true, reservationStatus = "Pending", failLog = false, retry = false } = {}) {
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
    status: { before: "Pending", after: "Approved" },
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
  assert.deepEqual(fake.logs()[0].changes.status, { before: "Pending", after: "Cancelled" });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: "Cancelled", status: "Pending" }), { code: "failed-precondition" });
  assert.equal(fake.logs().length, 1);

  const pending = fixture({ role: "Admin", reservationStatus: "Pending" });
  await changeReservationStatus(pending.db, "reviewer", {
    reservationId: "res1", status: "Cancelled", expectedStatus: "Pending",
  });
  assert.equal(pending.documents.get("reservations/res1").status, "Cancelled");
});

test("Admin can manually set each review step and status with an audit event", async () => {
  const states = [
    ["deanPending", "Pending", false, false, false, null],
    ["deanApproved", "Pending", false, true, false, null],
    ["deanDeclined", "Declined", false, false, false, "Dean"],
    ["registrarApproved", "Pending", true, true, false, null],
    ["registrarDeclined", "Declined", false, true, false, "Registrar"],
    ["administratorApproved", "Approved", true, true, true, null],
    ["administratorDeclined", "Declined", true, true, false, "University Administrator"],
  ];
  for (const [adminReviewState, status, registrar, dean, universityAdministrator, declinedByRole] of states) {
    const fake = fixture({ role: "Admin" });
    const reviewingRegistrar = adminReviewState.startsWith("registrar");
    const reviewingDean = adminReviewState.startsWith("dean");
    const beforeDean = !reviewingDean;
    const beforeRegistrar = !reviewingRegistrar && !reviewingDean;
    fake.documents.get("reservations/res1").registrarRecommend = beforeRegistrar;
    fake.documents.get("reservations/res1").deanRecommend = beforeDean;
    const result = await changeReservationStatus(fake.db, "reviewer", {
      reservationId: "res1", status, expectedStatus: "Pending", adminReviewState,
      expectedReview: { registrar: beforeRegistrar, dean: beforeDean, universityAdministrator: false, declinedByRole: null },
      ...(declinedByRole ? { declinedReason: "Reviewed by Admin" } : {}),
    });
    assert.equal(result.changed, adminReviewState !== "deanPending");
    const saved = fake.documents.get("reservations/res1");
    assert.equal(saved.status, status);
    assert.equal(saved.registrarRecommend, registrar);
    assert.equal(saved.deanRecommend, dean);
    assert.equal(saved.universityAdministratorRecommend, universityAdministrator);
    if (declinedByRole) assert.equal(saved.declinedByRole, declinedByRole);
    if (result.changed) assert.equal(fake.logs()[0].actorRole, "Admin");
  }
});

test("Admin approvals advance Dean, Registrar, and University Administrator in order", async () => {
  const fake = fixture({ role: "Admin" });
  fake.documents.get("reservations/res1").registrarRecommend = false;
  fake.documents.get("reservations/res1").deanRecommend = false;

  for (const [adminReviewState, status, registrar, dean, universityAdministrator] of [
    ["deanApproved", "Pending", false, true, false],
    ["registrarApproved", "Pending", true, true, false],
    ["administratorApproved", "Approved", true, true, true],
  ]) {
    const current = fake.documents.get("reservations/res1");
    await changeReservationStatus(fake.db, "reviewer", {
      reservationId: "res1", status, expectedStatus: current.status, adminReviewState,
      expectedReview: {
        registrar: current.registrarRecommend, dean: current.deanRecommend,
        universityAdministrator: current.universityAdministratorRecommend, declinedByRole: null,
      },
    });
    const saved = fake.documents.get("reservations/res1");
    assert.equal(saved.status, status);
    assert.equal(saved.registrarRecommend, registrar);
    assert.equal(saved.deanRecommend, dean);
    assert.equal(saved.universityAdministratorRecommend, universityAdministrator);
  }
  assert.equal(fake.logs().length, 3);
});

test("Admin resetting final approval to Pending clears the University Administrator check", async () => {
  const fake = fixture({ role: "Admin", reservationStatus: "Approved" });
  fake.documents.get("reservations/res1").universityAdministratorRecommend = true;

  await changeReservationStatus(fake.db, "reviewer", {
    reservationId: "res1", status: "Pending", expectedStatus: "Approved",
    adminReviewState: "registrarApproved",
    expectedReview: { registrar: true, dean: true, universityAdministrator: true, declinedByRole: null },
  });

  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Pending");
  assert.equal(saved.registrarRecommend, true);
  assert.equal(saved.deanRecommend, true);
  assert.equal(saved.universityAdministratorRecommend, false);
  assert.deepEqual(fake.logs()[0].changes.universityAdministratorRecommend, { before: true, after: false });
});

test("Admin declining final approval clears its check and records the declining step", async () => {
  const fake = fixture({ role: "Admin", reservationStatus: "Approved" });
  fake.documents.get("reservations/res1").universityAdministratorRecommend = true;

  await changeReservationStatus(fake.db, "reviewer", {
    reservationId: "res1", status: "Declined", expectedStatus: "Approved",
    adminReviewState: "administratorDeclined", declinedReason: "Room unavailable",
    expectedReview: { registrar: true, dean: true, universityAdministrator: true, declinedByRole: null },
  });

  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Declined");
  assert.equal(saved.registrarRecommend, true);
  assert.equal(saved.deanRecommend, true);
  assert.equal(saved.universityAdministratorRecommend, false);
  assert.equal(saved.declinedByRole, "University Administrator");
  assert.deepEqual(fake.logs()[0].changes.universityAdministratorRecommend, { before: true, after: false });
});

test("Admin review rejects stale decisions, invalid combinations, and other roles", async () => {
  const input = {
    reservationId: "res1", status: "Approved", expectedStatus: "Pending",
    adminReviewState: "administratorApproved",
    expectedReview: { registrar: true, dean: true, universityAdministrator: false, declinedByRole: null },
  };
  const stale = fixture({ role: "Admin" });
  await assert.rejects(changeReservationStatus(stale.db, "reviewer", {
    ...input, expectedReview: { ...input.expectedReview, dean: false },
  }), { code: "failed-precondition" });
  assert.equal(stale.logs().length, 0);
  const mismatched = fixture({ role: "Admin" });
  await assert.rejects(changeReservationStatus(mismatched.db, "reviewer", {
    ...input, status: "Pending",
  }), { code: "invalid-argument" });
  const otherRole = fixture({ role: "University Administrator" });
  await assert.rejects(changeReservationStatus(otherRole.db, "reviewer", input), { code: "permission-denied" });
  const wrongStep = fixture({ role: "Admin" });
  await assert.rejects(changeReservationStatus(wrongStep.db, "reviewer", {
    ...input, status: "Declined", declinedReason: "No", adminReviewState: "registrarDeclined",
  }), { code: "failed-precondition" });
  assert.equal(wrongStep.logs().length, 0);
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
    assert.equal(fake.documents.get("reservations/res1").status, "Pending");
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
  assert.equal(fake.documents.get("reservations/res1").status, "Pending");
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
  fake.documents.set("reservations/res1", { status: "Pending", registrarRecommend: true, deanRecommend: true });
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

test("Admin final approval of an extended request checks current room constraints", async () => {
  const fake = extendedFixture();
  fake.documents.get("memberships/member1").role = "Admin";
  const input = {
    reservationId: "res1", status: "Approved", expectedStatus: "Pending",
    adminReviewState: "administratorApproved",
    expectedReview: { registrar: true, dean: true, universityAdministrator: false, declinedByRole: null },
  };
  fake.documents.get("rooms/room1").status = "Maintenance";
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", input), { code: "failed-precondition" });
  assert.equal(fake.documents.get("reservations/res1").status, "Pending");
  assert.equal(fake.logs().length, 0);
});

test("an extended whole-day request exceeds normal limits and is approved without a separate extension reason", async () => {
  const fake = extendedFixture();
  fake.documents.get("reservations/res1").status = "Pending";
  await changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: "Pending" });
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
    assert.equal(fake.documents.get("reservations/res1").status, "Pending");
    assert.equal(fake.logs().length, 0);
  }
});

test("extended approval checks other reservations, ignoring itself and terminal requests", async () => {
  for (const status of ["Pending", "Approved", "Declined", "Cancelled", "Completed"]) {
    const fake = extendedFixture();
    fake.documents.set("reservations/other", {
      roomId: "room1", date: "2099-10-13", startTime: "10:00", endTime: "11:00", status,
    });
    if (["Pending", "Approved"].includes(status)) {
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

test("Registrar recommendation after Dean review keeps a request Pending and writes one audit event", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  Object.assign(fake.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: true });
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

test("Registrar cannot review before the Dean recommends", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  Object.assign(fake.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: false });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", {
    reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Registrar",
  }), { code: "failed-precondition" });
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", {
    reservationId: "res1", status: "Declined", expectedStatus: "Pending", declinedReason: "Unavailable",
  }), { code: "failed-precondition" });
  assert.equal(fake.logs().length, 0);
});

test("Dean recommendation starts review and requires an accepted membership in the requester's department", async () => {
  const recommendation = { reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Dean" };
  const dean = fixture({ role: "Dean", reservationStatus: "Pending" });
  Object.assign(dean.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: false });
  await changeReservationStatus(dean.db, "reviewer", recommendation);
  const saved = dean.documents.get("reservations/res1");
  assert.equal(saved.status, "Pending");
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

test("Dean can decline a new request with a reason only in their department", async () => {
  const decline = { reservationId: "res1", status: "Declined", expectedStatus: "Pending", declinedReason: "Department cannot support this booking" };
  const dean = fixture({ role: "Dean", reservationStatus: "Pending" });
  Object.assign(dean.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: false });
  await changeReservationStatus(dean.db, "reviewer", decline);
  const saved = dean.documents.get("reservations/res1");
  assert.equal(saved.status, "Declined");
  assert.equal(saved.registrarRecommend, false);
  assert.equal(saved.deanRecommend, false);
  assert.equal(saved.declinedByRole, "Dean");
  assert.equal(saved.declinedReason, decline.declinedReason);
  assert.deepEqual(dean.logs()[0].changes.declinedReason, { before: "", after: decline.declinedReason });

  const afterRegistrar = fixture({ role: "Dean", reservationStatus: "Pending" });
  afterRegistrar.documents.get("reservations/res1").deanRecommend = false;
  await changeReservationStatus(afterRegistrar.db, "reviewer", decline);
  assert.equal(afterRegistrar.documents.get("reservations/res1").registrarRecommend, false);
  const foreign = fixture({ role: "Dean", reservationStatus: "Pending" });
  foreign.documents.get("reservations/res1").department = "CAS";
  await assert.rejects(changeReservationStatus(foreign.db, "reviewer", decline), { code: "permission-denied" });
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

test("older open requests can receive Dean and Registrar recommendations in order", async () => {
  const fake = fixture({ role: "Dean" });
  const saved = fake.documents.get("reservations/res1");
  delete saved.registrarRecommend;
  delete saved.deanRecommend;
  await changeReservationStatus(fake.db, "reviewer", { reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Dean" });
  assert.equal(saved.registrarRecommend, undefined);
  assert.equal(fake.documents.get("reservations/res1").deanRecommend, true);
  fake.documents.get("memberships/member1").role = "Registrar";
  await changeReservationStatus(fake.db, "reviewer", { reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Registrar" });
  assert.equal(fake.documents.get("reservations/res1").registrarRecommend, true);
  assert.equal(fake.documents.get("reservations/res1").deanRecommend, true);
  assert.equal(fake.documents.get("reservations/res1").status, "Pending");
  fake.documents.get("memberships/member1").role = "University Administrator";
  await changeReservationStatus(fake.db, "reviewer", { ...request, expectedStatus: "Pending" });
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
  assert.equal(fake.logs().length, 3);
});

test("Dean review resets a legacy Registrar-first recommendation", async () => {
  const fake = fixture({ role: "Dean" });
  fake.documents.get("reservations/res1").deanRecommend = false;
  await changeReservationStatus(fake.db, "reviewer", {
    reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Dean",
  });
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.deanRecommend, true);
  assert.equal(saved.registrarRecommend, false);
  assert.deepEqual(fake.logs()[0].changes.registrarRecommend, { before: true, after: false });
  fake.documents.get("memberships/member1").role = "Registrar";
  await changeReservationStatus(fake.db, "reviewer", {
    reservationId: "res1", status: "Pending", expectedStatus: "Pending", recommendation: "Registrar",
  });
  assert.equal(fake.documents.get("reservations/res1").registrarRecommend, true);
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
  assert.equal(fake.documents.get("reservations/res1").declinedByRole, "University Administrator");
  assert.equal(fake.documents.get("reservations/res1").universityAdministratorRecommend, false);
});

test("University Administrator can make the final decision while a fully recommended request remains Pending", async () => {
  const approval = fixture({ reservationStatus: "Pending" });
  await changeReservationStatus(approval.db, "reviewer", { ...request, expectedStatus: "Pending" });
  assert.equal(approval.documents.get("reservations/res1").status, "Approved");
  assert.equal(approval.documents.get("reservations/res1").universityAdministratorRecommend, true);

  const decline = fixture({ reservationStatus: "Pending" });
  await changeReservationStatus(decline.db, "reviewer", {
    reservationId: "res1", expectedStatus: "Pending", status: "Declined", declinedReason: "Unavailable",
  });
  assert.equal(decline.documents.get("reservations/res1").status, "Declined");
  assert.equal(decline.documents.get("reservations/res1").universityAdministratorRecommend, false);
});

test("University Administrator can manually reverse final approval with a required reason", async () => {
  const fake = fixture({ reservationStatus: "Approved" });
  fake.documents.get("reservations/res1").universityAdministratorRecommend = true;
  const decline = {
    reservationId: "res1", expectedStatus: "Approved", status: "Declined",
    declinedReason: "Room unavailable", manualOverride: true,
  };
  await changeReservationStatus(fake.db, "reviewer", decline);
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Declined");
  assert.equal(saved.universityAdministratorRecommend, false);
  assert.equal(saved.declinedByRole, "University Administrator");
  assert.equal(saved.declinedReason, "Room unavailable");
  assert.deepEqual(fake.logs()[0].changes.universityAdministratorRecommend, { before: true, after: false });

  const unauthorized = fixture({ role: "Registrar", reservationStatus: "Approved" });
  await assert.rejects(changeReservationStatus(unauthorized.db, "reviewer", decline), { code: "permission-denied" });
  assert.equal(unauthorized.logs().length, 0);
});

test("University Administrator can reopen only their own declined request after both recommendations", async () => {
  const reopen = { reservationId: "res1", expectedStatus: "Declined", status: "Approved", manualOverride: true };
  const fake = fixture({ reservationStatus: "Declined" });
  Object.assign(fake.documents.get("reservations/res1"), {
    declinedByRole: "University Administrator", declinedReason: "Previously unavailable",
  });
  await changeReservationStatus(fake.db, "reviewer", reopen);
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
  assert.equal(fake.documents.get("reservations/res1").universityAdministratorRecommend, true);
  assert.deepEqual(fake.logs()[0].changes.universityAdministratorRecommend, { before: false, after: true });

  const deanDecline = fixture({ reservationStatus: "Declined" });
  deanDecline.documents.get("reservations/res1").declinedByRole = "Dean";
  await assert.rejects(changeReservationStatus(deanDecline.db, "reviewer", reopen), { code: "failed-precondition" });
  const missingDean = fixture({ reservationStatus: "Declined" });
  Object.assign(missingDean.documents.get("reservations/res1"), { declinedByRole: "University Administrator", deanRecommend: false });
  await assert.rejects(changeReservationStatus(missingDean.db, "reviewer", reopen), { code: "failed-precondition" });
});

test("reopening an extended final decline still checks current room constraints", async () => {
  const fake = extendedFixture();
  Object.assign(fake.documents.get("reservations/res1"), {
    status: "Declined", declinedByRole: "University Administrator", declinedReason: "Earlier conflict",
  });
  const reopen = { reservationId: "res1", expectedStatus: "Declined", status: "Approved", manualOverride: true };
  fake.documents.get("rooms/room1").status = "Maintenance";
  await assert.rejects(changeReservationStatus(fake.db, "reviewer", reopen), { code: "failed-precondition" });
  assert.equal(fake.logs().length, 0);
  fake.documents.get("rooms/room1").status = "Available";
  await changeReservationStatus(fake.db, "reviewer", reopen);
  assert.equal(fake.documents.get("reservations/res1").status, "Approved");
});

test("Registrar can decline a Dean-recommended request before Registrar recommendation with a required audited reason", async () => {
  const fake = fixture({ role: "Registrar", reservationStatus: "Pending" });
  Object.assign(fake.documents.get("reservations/res1"), { registrarRecommend: false, deanRecommend: true });
  const decline = { reservationId: "res1", status: "Declined", expectedStatus: "Pending", declinedReason: "  Room unavailable  " };
  await changeReservationStatus(fake.db, "reviewer", decline);
  const saved = fake.documents.get("reservations/res1");
  assert.equal(saved.status, "Declined");
  assert.equal(saved.declinedReason, "Room unavailable");
  assert.equal(saved.declinedByRole, "Registrar");
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
