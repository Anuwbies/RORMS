const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");
const { manageFacilityRecords } = require("../lib/facilityLogs");

const room = {
  buildingId: "building", name: "PTC 201", code: "PTC-201", type: "Laboratory", floor: 2, capacity: 50,
  status: "Available", image: "https://example.com/image.jpg", description: "Computer laboratory", amenities: ["WiFi"],
  availableDays: ["Monday", "Tuesday"], startTime: "07:30", endTime: "18:00", minBookingMins: 30, maxBookingMins: 90,
};
const request = (action, fields = {}) => ({ action, operationId: "op-1", ...fields });

function fixture({ role = "Admin", active = true, membershipStatus = "accepted", failLog = false, retry = false } = {}) {
  const documents = new Map([
    ["users/actor", { firstName: "Maria", surname: "Santos", isActive: active }],
    ["memberships/actor", { userId: "actor", role, status: membershipStatus }],
    ["buildings/building", { name: "PTC Building", code: "PTC" }],
    ["rooms/room", { ...room }],
    ["comments/comment", { roomId: "room", authorId: "author", authorName: "Cruz, Juan", text: "The projector is broken.", createdAt: Timestamp.fromMillis(1000000) }],
  ]);
  const ref = (collection, id) => ({ id, path: `${collection}/${id}`, parent: { id: collection } });
  const snapshot = reference => ({ id: reference.id, ref: reference, exists: documents.has(reference.path), data: () => documents.get(reference.path) });
  const db = {
    collection(collection) {
      return { collection, doc: id => ref(collection, id), where: (field, operator, value) => ({ collection, field, operator, value }) };
    },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
        const staged = new Map();
        const result = await callback({
          async get(reference) {
            assert.equal(staged.size, 0, "All transaction reads must precede writes");
            if (!reference.collection) return snapshot(reference);
            const docs = [...documents].filter(([path, data]) => path.startsWith(`${reference.collection}/`) && (!reference.field || data[reference.field] === reference.value))
              .map(([path]) => snapshot(ref(reference.collection, path.split("/").at(-1))));
            return { docs, empty: !docs.length };
          },
          update(reference, data) { assert(documents.has(reference.path)); staged.set(reference.path, { ...documents.get(reference.path), ...data }); },
          create(reference, data) {
            assert.equal(documents.has(reference.path), false);
            if (reference.parent.id === "logs" && failLog) throw new Error("Log failed");
            staged.set(reference.path, data);
          },
          delete(reference) { staged.set(reference.path, null); },
        });
        if (retry && attempt === 0) continue;
        for (const [path, data] of staged) if (data === null) documents.delete(path); else documents.set(path, data);
        return result;
      }
    },
  };
  return { db, documents, logs: () => [...documents].filter(([path]) => path.startsWith("logs/")).map(([, data]) => data) };
}

test("building creation records trusted actor, source and initial snapshot without misleading field changes", async () => {
  const fake = fixture();
  await manageFacilityRecords(fake.db, "actor", request("create_building", { targetId: "new", data: { name: "New Building", code: "NEW", createdAt: "forged" }, actorId: "forged" }));
  const [log] = fake.logs();
  assert.equal(log.action, "facility.building_created");
  assert.equal(log.actorId, "actor");
  assert.equal(log.actorName, "Santos, Maria");
  assert.equal(log.actorRole, "Admin");
  assert.equal(log.targetCollection, "buildings");
  assert.equal(log.targetId, "new");
  assert.deepEqual(log.targetSnapshot, { name: "New Building", code: "NEW" });
  assert.deepEqual(log.changes, {});
  assert.equal(fake.documents.get("buildings/new").createdAt.constructor.name, "ServerTimestampTransform");
  assert.equal(log.createdAt.constructor.name, "ServerTimestampTransform");
});

test("University Administrator can manage facilities with its own audit role", async () => {
  const fake = fixture({ role: "University Administrator" });
  await manageFacilityRecords(fake.db, "actor", request("update_building", { targetId: "building", data: { name: "Renamed", code: "PTC" } }));
  assert.equal(fake.documents.get("buildings/building").name, "Renamed");
  assert.equal(fake.logs()[0].actorRole, "University Administrator");
});

test("building edits record only changed fields and preserve unrelated metadata", async () => {
  const fake = fixture({ role: "Registrar" });
  fake.documents.get("buildings/building").metadata = "preserved";
  await manageFacilityRecords(fake.db, "actor", request("update_building", { targetId: "building", data: { name: "Renamed", code: "PTC" } }));
  assert.deepEqual(fake.logs()[0].changes, { name: { before: "PTC Building", after: "Renamed" } });
  assert.equal(fake.documents.get("buildings/building").metadata, "preserved");
});

test("room creation includes final image, full room settings and building context in one event", async () => {
  const fake = fixture();
  await manageFacilityRecords(fake.db, "actor", request("create_room", { targetId: "new-room", data: { ...room, name: "PTC 202", code: "PTC-202" } }));
  const [log] = fake.logs();
  assert.equal(log.action, "facility.room_created");
  assert.equal(log.buildingName, "PTC Building");
  assert.equal(log.targetSnapshot.image, room.image);
  assert.equal(log.targetSnapshot.capacity, 50);
  assert.deepEqual(log.changes, {});
});

test("facility creation accepts a custom type and records its building context", async () => {
  const fake = fixture();
  const data = { buildingId: "building", name: "Main Hall", code: "HALL-01", type: "Event Hall", floor: 1, capacity: 200, status: "Available", image: "https://example.com/hall.jpg", description: "Events and presentations", amenities: ["Projector"], availableDays: ["Monday", "Tuesday"], startTime: "07:30", endTime: "18:00", minBookingMins: 30, maxBookingMins: 90 };
  await manageFacilityRecords(fake.db, "actor", request("create_facility", { targetId: "new-facility", data }));
  assert.equal(fake.documents.get("facilities/new-facility").type, "Event Hall");
  assert.deepEqual(fake.documents.get("facilities/new-facility").amenities, ["Projector"]);
  assert.equal(fake.logs()[0].action, "facility.facility_created");
  assert.equal(fake.logs()[0].targetCollection, "facilities");
  assert.equal(fake.logs()[0].buildingName, "PTC Building");
  await assert.rejects(manageFacilityRecords(fake.db, "actor", request("create_facility", { targetId: "duplicate", data })), { code: "already-exists" });
});

test("room edits log every changed property with server-read before values", async () => {
  const fake = fixture();
  const data = { ...room, name: "Room Updated", capacity: 100, status: "Maintenance", amenities: ["WiFi", "Projector"], startTime: "08:00", image: "https://example.com/new.jpg" };
  await manageFacilityRecords(fake.db, "actor", request("update_room", { targetId: "room", data }));
  const log = fake.logs()[0];
  assert.equal(log.action, "facility.room_updated");
  assert.deepEqual(log.changes.capacity, { before: 50, after: 100 });
  assert.deepEqual(log.changes.status, { before: "Available", after: "Maintenance" });
  assert.deepEqual(log.changes.amenities, { before: ["WiFi"], after: ["WiFi", "Projector"] });
  assert.deepEqual(log.changes.startTime, { before: "07:30", after: "08:00" });
  assert.equal(log.changes.code, undefined);
  assert.equal(fake.documents.get("rooms/room").status, "Maintenance");
});

test("room deletion preserves its snapshot and comments and returns the committed image for cleanup", async () => {
  const fake = fixture();
  const result = await manageFacilityRecords(fake.db, "actor", request("delete_room", { targetId: "room" }));
  assert.equal(fake.documents.has("rooms/room"), false);
  assert(fake.documents.has("comments/comment"));
  assert.equal(fake.logs()[0].targetSnapshot.name, "PTC 201");
  assert.equal(fake.logs()[0].buildingName, "PTC Building");
  assert.deepEqual(result.deletedRooms, [{ id: "room", image: room.image }]);
});

test("building deletion discovers all current rooms and records their names even when client lists would be stale", async () => {
  const fake = fixture();
  fake.documents.set("rooms/second", { ...room, name: "PTC 202", code: "PTC-202" });
  fake.documents.set("rooms/unrelated", { ...room, buildingId: "other" });
  fake.documents.set("facilities/hall", { buildingId: "building", name: "Main Hall", code: "HALL-01", type: "Auditorium", floor: 1, capacity: 200, status: "Available", image: "", description: "", amenities: [], availableDays: [], startTime: "07:30", endTime: "18:00", minBookingMins: 30, maxBookingMins: 90 });
  const result = await manageFacilityRecords(fake.db, "actor", request("delete_building", { targetId: "building" }));
  assert.equal(fake.documents.has("buildings/building"), false);
  assert.equal(fake.documents.has("rooms/room"), false);
  assert.equal(fake.documents.has("rooms/second"), false);
  assert(fake.documents.has("rooms/unrelated"));
  assert.equal(fake.documents.has("facilities/hall"), false);
  assert(fake.documents.has("comments/comment"));
  assert.equal(result.deletedRooms.length, 2);
  const [log] = fake.logs();
  assert.equal(log.action, "facility.building_deleted");
  assert.deepEqual(log.changes.rooms, { before: 2, after: 0 });
  assert.deepEqual(log.changes.facilities, { before: 1, after: 0 });
  assert.deepEqual(log.deletedRooms.map(room => room.name), ["PTC 201", "PTC 202"]);
});

test("bulk room deletion creates an event per deleted room and skips missing records", async () => {
  const fake = fixture();
  fake.documents.set("rooms/second", { ...room, name: "PTC 202", code: "PTC-202" });
  const input = request("delete_rooms", { buildingId: "building", roomIds: ["room", "missing", "second"] });
  await manageFacilityRecords(fake.db, "actor", input);
  assert.equal(fake.logs().length, 2);
  assert.deepEqual(fake.logs().map(log => log.targetId), ["room", "second"]);
  await manageFacilityRecords(fake.db, "actor", input);
  assert.equal(fake.logs().length, 2);
});

for (const role of ["Admin", "Registrar", "Instructor"]) test(`${role} comment deletion records author/text/room and respects ownership`, async () => {
  const fake = fixture({ role });
  if (role === "Instructor") fake.documents.get("comments/comment").authorId = "actor";
  await manageFacilityRecords(fake.db, "actor", request("delete_comment", { targetId: "comment" }));
  assert.equal(fake.documents.has("comments/comment"), false);
  const [log] = fake.logs();
  assert.equal(log.action, "facility.comment_deleted");
  assert.equal(log.actorRole, role);
  assert.equal(log.targetSnapshot.text, "The projector is broken.");
  assert.equal(log.targetSnapshot.authorName, "Cruz, Juan");
  assert.equal(log.roomName, "PTC 201");
  assert.equal(log.buildingName, "PTC Building");
});

test("foreign comment deletion, inactive actors and non-manager facility changes are denied", async () => {
  for (const role of ["Dean", "Program Head", "Instructor"]) {
    const fake = fixture({ role });
    await assert.rejects(manageFacilityRecords(fake.db, "actor", request("delete_comment", { targetId: "comment" })), { code: "permission-denied" });
    await assert.rejects(manageFacilityRecords(fake.db, "actor", request("delete_room", { targetId: "room" })), { code: "permission-denied" });
    assert.equal(fake.logs().length, 0);
  }
  for (const options of [{ active: false }, { membershipStatus: "pending" }]) {
    const fake = fixture(options);
    await assert.rejects(manageFacilityRecords(fake.db, "actor", request("delete_room", { targetId: "room" })), { code: "permission-denied" });
  }
  const fake = fixture();
  await assert.rejects(manageFacilityRecords(fake.db, undefined, request("delete_room", { targetId: "room" })), { code: "unauthenticated" });
});

test("an active author without a department membership can still delete their own comment", async () => {
  const fake = fixture();
  fake.documents.delete("memberships/actor");
  fake.documents.get("comments/comment").authorId = "actor";
  await manageFacilityRecords(fake.db, "actor", request("delete_comment", { targetId: "comment" }));
  assert.equal(fake.logs()[0].actorRole, "Unknown");
});

test("transaction retries and duplicate operation IDs do not duplicate logs or writes", async () => {
  const fake = fixture({ retry: true });
  const input = request("update_room", { targetId: "room", data: { ...room, capacity: 100 } });
  await manageFacilityRecords(fake.db, "actor", input);
  const updatedAt = fake.documents.get("rooms/room").updatedAt;
  await manageFacilityRecords(fake.db, "actor", input);
  assert.equal(fake.logs().length, 1);
  assert.equal(fake.documents.get("rooms/room").updatedAt, updatedAt);
  await assert.rejects(manageFacilityRecords(fake.db, "actor", { ...input, data: { ...room, capacity: 120 } }), { code: "already-exists" });
});

test("no-op edits and repeated deletions create no false success events", async () => {
  const fake = fixture();
  assert.equal((await manageFacilityRecords(fake.db, "actor", request("update_room", { targetId: "room", data: room }))).changed, false);
  assert.equal((await manageFacilityRecords(fake.db, "actor", request("delete_room", { targetId: "missing" }))).changed, false);
  assert.equal(fake.logs().length, 0);
});

test("log failures roll back every kind of mutation including bulk deletes", async () => {
  const cases = [
    request("create_building", { targetId: "new", data: { name: "New", code: "NEW" } }),
    request("update_building", { targetId: "building", data: { name: "Renamed", code: "PTC" } }),
    request("delete_building", { targetId: "building" }),
    request("create_room", { targetId: "new", data: { ...room, name: "New", code: "NEW" } }),
    request("update_room", { targetId: "room", data: { ...room, capacity: 100 } }),
    request("delete_room", { targetId: "room" }),
    request("delete_rooms", { buildingId: "building", roomIds: ["room"] }),
    request("delete_comment", { targetId: "comment" }),
  ];
  for (const input of cases) {
    const fake = fixture({ failLog: true });
    const before = [...fake.documents];
    await assert.rejects(manageFacilityRecords(fake.db, "actor", input), /Log failed/);
    assert.deepEqual([...fake.documents], before);
  }
});

test("duplicate names/codes, deleted parents, malformed requests and wrong-building bulk selections are rejected", async () => {
  const fake = fixture();
  await assert.rejects(manageFacilityRecords(fake.db, "actor", request("create_building", { targetId: "new", data: { name: "ptc building", code: "NEW" } })), { code: "already-exists" });
  await assert.rejects(manageFacilityRecords(fake.db, "actor", request("create_room", { targetId: "new", data: { ...room, buildingId: "missing" } })), { code: "failed-precondition" });
  await assert.rejects(manageFacilityRecords(fake.db, "actor", request("delete_rooms", { buildingId: "other", roomIds: ["room"] })), { code: "failed-precondition" });
  fake.documents.set("buildings/other", { name: "Other", code: "OTH" });
  await assert.rejects(manageFacilityRecords(fake.db, "actor", request("update_room", { targetId: "room", data: { ...room, buildingId: "other" } })), { code: "failed-precondition" });
  for (const input of [null, {}, request("delete_room", { targetId: "../room" }), request("create_room", { targetId: "new", data: { ...room, startTime: "20:00" } }), request("delete_rooms", { buildingId: "building", roomIds: ["room", "room"] })]) {
    await assert.rejects(manageFacilityRecords(fake.db, "actor", input), { code: "invalid-argument" });
  }
  assert.equal(fake.logs().length, 0);
  assert(fake.documents.has("rooms/room"));
});

test("oversized building deletion is rejected before any write, with guidance to use room batches", async () => {
  const fake = fixture();
  for (let i = 0; i < 498; i++) fake.documents.set(`rooms/room-${i}`, { ...room });
  await assert.rejects(manageFacilityRecords(fake.db, "actor", request("delete_building", { targetId: "building" })), { code: "resource-exhausted" });
  assert.equal(fake.logs().length, 0);
  assert(fake.documents.has("buildings/building"));
  assert(fake.documents.has("rooms/room"));
});
