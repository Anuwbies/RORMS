import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type DocumentReference } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

type Value = string | number | boolean | null | string[];
type Fields = Record<string, Value>;
type Change = { before: Value; after: Value };
const ACTIONS = ["create_building", "update_building", "delete_building", "create_room", "update_room", "delete_room", "delete_rooms", "delete_comment"];
const ROOM_FIELDS = ["buildingId", "name", "code", "type", "floor", "capacity", "status", "image", "description", "amenities", "availableDays", "startTime", "endTime", "minBookingMins", "maxBookingMins", "isCollapsible", "collapsibleWithRoomId"];
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const adjacentRoomCodes = (firstCode: string, secondCode: string): boolean => {
  const first = firstCode.match(/^(.*?)(\d+)$/);
  const second = secondCode.match(/^(.*?)(\d+)$/);
  return Boolean(first && second && first[1].toUpperCase() === second[1].toUpperCase()
    && Math.abs(Number(first[2]) - Number(second[2])) === 1);
};
const roleNames = ["Admin", "Registrar", "University Administrator", "Dean", "Program Head", "Instructor"];

function snapshotFields(data: Record<string, unknown>, fields: string[]): Fields {
  return Object.fromEntries(fields.map(field => {
    const value = data[field];
    return [field, typeof value === "string" || typeof value === "boolean" || typeof value === "number" ? value
      : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null];
  }));
}

function inputFields(value: unknown, room: boolean): Fields {
  const data = record(value);
  const fields = room ? ROOM_FIELDS : ["name", "code"];
  const output: Fields = {};
  for (const field of fields) {
    const input = data[field];
    if (["isCollapsible", "collapsibleWithRoomId"].includes(field) && input === undefined) continue;
    if (field === "isCollapsible") {
      if (typeof input !== "boolean") throw new HttpsError("invalid-argument", "Invalid collapsible room setting.");
      output[field] = input;
    } else if (["floor", "capacity", "minBookingMins", "maxBookingMins"].includes(field)) {
      if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) throw new HttpsError("invalid-argument", `Invalid ${field}.`);
      output[field] = input;
    } else if (["amenities", "availableDays"].includes(field)) {
      if (!Array.isArray(input) || input.length > 100 || input.some(item => typeof item !== "string" || item.length > 200)) throw new HttpsError("invalid-argument", `Invalid ${field}.`);
      output[field] = [...new Set(input.map(text))];
    } else {
      if (typeof input !== "string" || input.length > (field === "image" ? 500000 : field === "description" ? 10000 : 200)) throw new HttpsError("invalid-argument", `Invalid ${field}.`);
      output[field] = input.trim();
    }
  }
  if (!output.name || !output.code) throw new HttpsError("invalid-argument", "Name and code are required.");
  if (room) {
    const clock = (value: Value) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validId(text(output.buildingId)) || !["Available", "Unavailable", "Maintenance"].includes(text(output.status))
      || !clock(output.startTime) || !clock(output.endTime) || String(output.startTime) >= String(output.endTime)
      || (Number(output.maxBookingMins) !== 0 && Number(output.minBookingMins) >= Number(output.maxBookingMins))
      || (output.availableDays as string[]).some(day => !["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(day))) {
      throw new HttpsError("invalid-argument", "Invalid room availability or booking limits.");
    }
    if ((output.isCollapsible !== undefined || output.collapsibleWithRoomId !== undefined)
      && (output.isCollapsible !== Boolean(output.collapsibleWithRoomId)
        || (output.isCollapsible && !validId(text(output.collapsibleWithRoomId))))) {
      throw new HttpsError("invalid-argument", "Select one room to combine with this collapsible room.");
    }
  }
  return output;
}

export interface FacilityResult {
  changed: boolean;
  targetId: string;
  logIds: string[];
  deletedRooms: Array<{ id: string; image: string }>;
}

/** Trusted actor and before values are read in the same transaction as the mutation and log. */
export async function manageFacilityRecords(db: Firestore, uid: string | undefined, input: unknown): Promise<FacilityResult> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before managing facilities.");
  const request = record(input);
  const action = text(request.action);
  const operationId = text(request.operationId);
  const targetId = text(request.targetId);
  const buildingId = text(request.buildingId);
  if (!ACTIONS.includes(action) || !validId(operationId) || (action !== "delete_rooms" && !validId(targetId))) throw new HttpsError("invalid-argument", "A valid facility action is required.");
  const roomIds = action === "delete_rooms" && Array.isArray(request.roomIds) ? request.roomIds.map(text) : [];
  if (action === "delete_rooms" && (!validId(buildingId) || !roomIds.length || roomIds.length > 200 || roomIds.some(id => !validId(id)) || new Set(roomIds).size !== roomIds.length)) throw new HttpsError("invalid-argument", "Select between 1 and 200 distinct rooms.");
  const saving = action.startsWith("create_") || action.startsWith("update_");
  const room = action.endsWith("room");
  const values = saving ? inputFields(request.data, room) : {};
  const fingerprint = createHash("sha256").update(JSON.stringify({ action, targetId, buildingId, roomIds, values })).digest("hex");
  const logRef = db.collection("logs").doc(`facility_${operationId}`);
  return db.runTransaction(async transaction => {
    const [profileSnapshot, assignments, savedLog] = await Promise.all([
      transaction.get(db.collection("users").doc(uid)),
      transaction.get(db.collection("memberships").where("userId", "==", uid)),
      transaction.get(logRef),
    ]);
    const profile = profileSnapshot.data() || {};
    const accepted = assignments.docs.filter(document => document.data().status === "accepted");
    const manager = accepted.find(document => ["Admin", "Registrar", "University Administrator"].includes(document.data().role));
    const actorMembership = manager || accepted.find(document => roleNames.includes(document.data().role));
    if (!profileSnapshot.exists || profile.isActive === false || (!manager && action !== "delete_comment")) throw new HttpsError("permission-denied", "Only active Admins, Registrars, and University Administrators can manage buildings and rooms.");
    if (savedLog.exists) {
      const saved = savedLog.data() || {};
      if (saved.actorId !== uid || saved.requestFingerprint !== fingerprint) throw new HttpsError("already-exists", "This operation ID was already used for another action.");
      return { changed: false, targetId, logIds: [logRef.id], deletedRooms: [] };
    }
    const mutations: Array<() => void> = [];
    const events: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];
    const deletedRooms: FacilityResult["deletedRooms"] = [];
    const identity = [profile, actorMembership?.data() || {}].find(data => text(data.firstName) && text(data.surname));
    const actorName = identity ? `${text(identity.surname)}, ${text(identity.firstName)}`
      : text(profile.fullName) || text(actorMembership?.data().fullName) || uid;
    const addEvent = (source: DocumentReference, eventAction: string, snapshot: Fields, changes: Record<string, Change>, context: Record<string, unknown> = {}) => {
      const ref = action === "delete_rooms" ? (events.length ? db.collection("logs").doc(`${logRef.id}_${source.id}`) : logRef)
        : source.id === targetId ? logRef : db.collection("logs").doc(`${logRef.id}_${source.id}`);
      events.push({ ref, data: {
        category: "Facilities", action: eventAction, operation: action, requestFingerprint: fingerprint,
        actorId: uid, actorName, actorRole: actorMembership?.data().role || "Unknown", membershipId: actorMembership?.id || "",
        targetCollection: source.parent.id, targetId: source.id, targetSnapshot: snapshot,
        changes, ...context, source: "user", createdAt: FieldValue.serverTimestamp(),
      } });
    };
    const deleteRoom = (source: DocumentReference, data: Record<string, unknown>, building: Record<string, unknown>) => {
      mutations.push(() => transaction.delete(source));
      deletedRooms.push({ id: source.id, image: text(data.image) });
      addEvent(source, "facility.room_deleted", snapshotFields(data, ROOM_FIELDS), { record: { before: "Exists", after: "Deleted" } }, {
        buildingId: text(data.buildingId), buildingName: text(building.name), buildingCode: text(building.code), roomId: source.id,
      });
    };
    const unlinkRoom = (source: DocumentReference, data: Record<string, unknown>, removedId: string) => {
      if (text(data.collapsibleWithRoomId) !== removedId) return;
      mutations.push(() => transaction.update(source, {
        isCollapsible: false, collapsibleWithRoomId: "", updatedAt: FieldValue.serverTimestamp(),
      }));
      addEvent(source, "facility.room_updated", snapshotFields(data, ROOM_FIELDS), {
        isCollapsible: { before: true, after: false },
        collapsibleWithRoomId: { before: removedId, after: "" },
      }, { buildingId: text(data.buildingId), roomId: source.id });
    };

    if (action === "delete_rooms") {
      const [building, ...rooms] = await Promise.all([
        transaction.get(db.collection("buildings").doc(buildingId)),
        ...roomIds.map(id => transaction.get(db.collection("rooms").doc(id))),
      ]);
      for (const document of rooms) {
        if (!document.exists) continue;
        const data = document.data() || {};
        if (data.buildingId !== buildingId) throw new HttpsError("failed-precondition", "A selected room moved to another building. Reload and try again.");
        deleteRoom(document.ref, data, building.data() || {});
      }
      const deletedIds = new Set(rooms.map(document => document.id));
      const partners = [...new Set(rooms.map(document => text(document.data()?.collapsibleWithRoomId))
        .filter(id => validId(id) && !deletedIds.has(id)))];
      const partnerDocs = await Promise.all(partners.map(id => transaction.get(db.collection("rooms").doc(id))));
      for (const partner of partnerDocs) if (partner.exists) {
        const deletedId = text(partner.data()?.collapsibleWithRoomId);
        if (deletedIds.has(deletedId)) unlinkRoom(partner.ref, partner.data() || {}, deletedId);
      }
    } else {
      const collectionName = action === "delete_comment" ? "comments" : room ? "rooms" : "buildings";
      const source = db.collection(collectionName).doc(targetId);
      const document = await transaction.get(source);
      const before = document.data() || {};
      if (action.startsWith("create_") ? document.exists : !document.exists) {
        if (action.startsWith("delete_")) return { changed: false, targetId, logIds: [], deletedRooms: [] };
        throw new HttpsError(action.startsWith("create_") ? "already-exists" : "not-found", "The source record changed. Reload and try again.");
      }
      let building: Record<string, unknown> = {};
      const parentId = text(saving ? values.buildingId : before.buildingId);
      if (room && validId(parentId)) {
        const parent = await transaction.get(db.collection("buildings").doc(parentId));
        if (saving && !parent.exists) throw new HttpsError("failed-precondition", "This building no longer exists.");
        building = parent.data() || {};
      }
      if (saving) {
        if (action === "update_room" && before.buildingId !== values.buildingId) throw new HttpsError("failed-precondition", "The room's building changed. Reload and try again.");
        if (room) {
          const previousPartnerId = text(before.collapsibleWithRoomId);
          const nextPartnerId = values.collapsibleWithRoomId === undefined ? previousPartnerId : text(values.collapsibleWithRoomId);
          if (nextPartnerId === targetId) throw new HttpsError("invalid-argument", "A room cannot be combined with itself.");
          const partnerIds = [...new Set([nextPartnerId, previousPartnerId].filter(id => validId(id)))];
          const partners = await Promise.all(partnerIds.map(id => transaction.get(db.collection("rooms").doc(id))));
          const nextPartner = partners.find(document => document.id === nextPartnerId);
          if (nextPartnerId && (!nextPartner?.exists || nextPartner.data()?.buildingId !== values.buildingId
            || nextPartner.data()?.floor !== values.floor
            || !adjacentRoomCodes(text(values.code), text(nextPartner.data()?.code)))) {
            throw new HttpsError("failed-precondition", "Choose an immediately adjacent room number in the same building and floor.");
          }
          if (nextPartnerId && text(nextPartner?.data()?.collapsibleWithRoomId)
            && text(nextPartner?.data()?.collapsibleWithRoomId) !== targetId) {
            throw new HttpsError("failed-precondition", "That room is already combined with another room.");
          }
          if (previousPartnerId !== nextPartnerId) {
            const previousPartner = partners.find(document => document.id === previousPartnerId);
            if (previousPartner?.exists) unlinkRoom(previousPartner.ref, previousPartner.data() || {}, targetId);
          }
          if (nextPartner?.exists && text(nextPartner.data()?.collapsibleWithRoomId) !== targetId) {
            mutations.push(() => transaction.update(nextPartner.ref, {
              isCollapsible: true, collapsibleWithRoomId: targetId, updatedAt: FieldValue.serverTimestamp(),
            }));
            addEvent(nextPartner.ref, "facility.room_updated", snapshotFields(nextPartner.data() || {}, ROOM_FIELDS), {
              isCollapsible: { before: Boolean(nextPartner.data()?.isCollapsible), after: true },
              collapsibleWithRoomId: { before: text(nextPartner.data()?.collapsibleWithRoomId), after: targetId },
            }, { buildingId: text(values.buildingId), roomId: nextPartner.id });
          }
        }
        const catalog = await transaction.get(db.collection(collectionName));
        if (catalog.docs.some(candidate => candidate.id !== targetId && ["name", "code"].some(field => text(candidate.data()[field]).toLowerCase() === text(values[field]).toLowerCase()))) throw new HttpsError("already-exists", `A ${room ? "room" : "building"} with this name or code already exists.`);
        const changes: Record<string, Change> = {};
        const oldFields = snapshotFields(before, Object.keys(values));
        for (const [field, value] of Object.entries(values)) if (JSON.stringify(oldFields[field]) !== JSON.stringify(value)) changes[field] = { before: oldFields[field], after: value };
        if (action.startsWith("update_") && !Object.keys(changes).length) return { changed: false, targetId, logIds: [], deletedRooms: [] };
        mutations.push(() => action.startsWith("create_")
          ? transaction.create(source, { ...values, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
          : transaction.update(source, { ...values, updatedAt: FieldValue.serverTimestamp() }));
        addEvent(source, `facility.${room ? "room" : "building"}_${action.startsWith("create_") ? "created" : "updated"}`, values,
          action.startsWith("create_") ? {} : changes, { buildingId: room ? parentId : targetId, buildingName: room ? text(building.name) : text(values.name), buildingCode: room ? text(building.code) : text(values.code), roomId: room ? targetId : "" });
      } else if (action === "delete_room") {
        const partnerId = text(before.collapsibleWithRoomId);
        if (validId(partnerId)) {
          const partner = await transaction.get(db.collection("rooms").doc(partnerId));
          if (partner.exists) unlinkRoom(partner.ref, partner.data() || {}, targetId);
        }
        deleteRoom(source, before, building);
      } else if (action === "delete_building") {
        const rooms = await transaction.get(db.collection("rooms").where("buildingId", "==", targetId));
        if (rooms.docs.length > 498) throw new HttpsError("resource-exhausted", "Delete rooms in batches before deleting this building.");
        const deletedRoomRecords = rooms.docs.map(snapshot => ({ id: snapshot.id, name: text(snapshot.data().name), code: text(snapshot.data().code) }));
        for (const child of rooms.docs) {
          mutations.push(() => transaction.delete(child.ref));
          deletedRooms.push({ id: child.id, image: text(child.data().image) });
        }
        mutations.push(() => transaction.delete(source));
        addEvent(source, "facility.building_deleted", snapshotFields(before, ["name", "code"]), {
          record: { before: "Exists", after: "Deleted" }, rooms: { before: rooms.docs.length, after: 0 },
        }, { buildingId: targetId, buildingName: text(before.name), buildingCode: text(before.code), deletedRooms: deletedRoomRecords });
      } else {
        if (!manager && before.authorId !== uid) throw new HttpsError("permission-denied", "You can only delete your own comments.");
        const roomId = text(before.roomId);
        const roomSnapshot = validId(roomId) ? await transaction.get(db.collection("rooms").doc(roomId)) : undefined;
        const roomData = roomSnapshot?.data() || {};
        const buildingId = text(roomData.buildingId);
        const parent = validId(buildingId) ? await transaction.get(db.collection("buildings").doc(buildingId)) : undefined;
        mutations.push(() => transaction.delete(source));
        addEvent(source, "facility.comment_deleted", {
          ...snapshotFields(before, ["roomId", "authorId", "authorName", "text"]),
          createdAt: before.createdAt instanceof Timestamp ? before.createdAt.toDate().toISOString() : null,
        }, { record: { before: "Exists", after: "Deleted" } }, {
          roomId, roomName: text(roomData.name), roomCode: text(roomData.code), buildingId,
          buildingName: text(parent?.data()?.name), buildingCode: text(parent?.data()?.code),
        });
      }
    }
    if (mutations.length + events.length > 500) throw new HttpsError("resource-exhausted", "Select fewer rooms and try again.");
    for (const mutation of mutations) mutation();
    for (const event of events) transaction.create(event.ref, event.data);
    return { changed: Boolean(events.length), targetId, logIds: events.map(event => event.ref.id), deletedRooms };
  });
}
