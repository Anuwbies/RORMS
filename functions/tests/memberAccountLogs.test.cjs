const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");
const { manageMemberAccount } = require("../lib/memberAccountLogs");

const edit = {
  action: "edit", operationId: "edit-1", targetId: "member", targetType: "user", membershipId: "assignment",
  role: "Program Head", department: "CAS", expected: { role: "Instructor", department: "CITE" },
};
const invite = {
  action: "invite", operationId: "invite-1", email: "NEW@example.com", role: "Instructor", department: "CITE",
  invitationId: "private-token", invitationHtml: '<a href="https://example.com/signup?token=private-token">Join</a>',
};

function fixture({ role = "Admin", active = true, membershipStatus = "accepted", failLog = false, retry = false } = {}) {
  const documents = new Map([
    ["users/admin", { firstName: "Maria", surname: "Santos", email: "admin@example.com", isActive: active }],
    ["memberships/admin-assignment", { userId: "admin", role, status: membershipStatus, department: "Administrative Office" }],
    ["users/member", { firstName: "Juan", surname: "Cruz", email: "member@example.com", isActive: true }],
    ["memberships/assignment", { userId: "member", email: "member@example.com", fullName: "Juan Cruz", role: "Instructor", department: "CITE", status: "accepted", joinedAt: "original-date" }],
    ["departments/cite", { code: "CITE", dean: "" }],
    ["departments/cas", { code: "CAS", dean: "" }],
  ]);
  let nextId = 0;
  const reference = (collection, id) => ({ id, path: `${collection}/${id}`, parent: { id: collection } });
  const snapshot = (ref) => ({ id: ref.id, ref, exists: documents.has(ref.path), data: () => documents.get(ref.path) });
  const db = {
    collection(name) {
      return {
        doc: (id = `generated-${++nextId}`) => reference(name, id),
        where: (field, operator, value) => ({ collection: name, field, operator, value }),
      };
    },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
        const staged = new Map();
        const result = await callback({
          async get(ref) {
            assert.equal(staged.size, 0, "Firestore transactions must finish reads before writing");
            if (!ref.collection) return snapshot(ref);
            const docs = [...documents].filter(([path, data]) => path.startsWith(`${ref.collection}/`) && data[ref.field] === ref.value)
              .map(([path]) => snapshot(reference(ref.collection, path.split("/").at(-1))));
            return { docs, empty: !docs.length };
          },
          set(ref, data, options) { staged.set(ref.path, options.merge ? { ...documents.get(ref.path), ...data } : data); },
          update(ref, data) { assert(documents.has(ref.path)); staged.set(ref.path, { ...documents.get(ref.path), ...data }); },
          delete(ref) { staged.set(ref.path, null); },
          create(ref, data) {
            if (failLog) throw new Error("Log failed");
            assert.equal(documents.has(ref.path), false);
            staged.set(ref.path, data);
          },
        });
        if (retry && !attempt) continue;
        for (const [path, data] of staged) if (data === null) documents.delete(path); else documents.set(path, data);
        return result;
      }
    },
  };
  return { db, documents, logs: () => [...documents].filter(([path]) => path.startsWith("logs/")).map(([, data]) => data) };
}

test("role and department changes record trusted actor, member snapshot, source and before/after", async () => {
  const fake = fixture();
  await manageMemberAccount(fake.db, "admin", { ...edit, actorId: "forged", actorName: "Fake", changes: {} });
  const [log] = fake.logs();
  assert.equal(log.actorId, "admin");
  assert.equal(log.actorName, "Santos, Maria");
  assert.equal(log.actorRole, "Admin");
  assert.equal(log.memberName, "Cruz, Juan");
  assert.equal(log.memberEmail, "member@example.com");
  assert.equal(log.targetCollection, "memberships");
  assert.equal(log.targetId, "assignment");
  assert.deepEqual(log.changes, { role: { before: "Instructor", after: "Program Head" }, department: { before: "CITE", after: "CAS" } });
  assert.equal(log.createdAt.constructor.name, "ServerTimestampTransform");
  assert.equal(fake.documents.get("memberships/assignment").department, "CAS");
  fake.documents.get("users/member").surname = "Changed";
  assert.equal(log.memberName, "Cruz, Juan");
});

test("invitation queues email and assignment atomically without retaining its bearer token in the log", async () => {
  const fake = fixture();
  await manageMemberAccount(fake.db, "admin", invite);
  const saved = fake.documents.get("invitations/private-token");
  assert.equal(saved.email, "new@example.com");
  assert.equal(saved.status, "pending");
  assert(saved.expiresAt instanceof Timestamp);
  assert.equal(fake.documents.get(`memberships/${saved.membershipId}`).role, "Instructor");
  const mail = [...fake.documents].find(([path]) => path.startsWith("mail/"))[1];
  assert.equal(mail.message.html, invite.invitationHtml);
  const [log] = fake.logs();
  assert.equal(log.action, "account.invited");
  assert.equal(log.memberEmail, "new@example.com");
  assert.equal(JSON.stringify(log).includes("private-token"), false);
  assert.deepEqual(log.changes.role, { before: null, after: "Instructor" });
});

test("University Administrator invitations and edits enforce General Service Department", async () => {
  const fake = fixture();
  await manageMemberAccount(fake.db, "admin", { ...invite, role: "University Administrator", department: "CITE" });
  const invitation = fake.documents.get("invitations/private-token");
  const membership = fake.documents.get(`memberships/${invitation.membershipId}`);
  assert.equal(membership.role, "University Administrator");
  assert.equal(membership.department, "General Service Department");
  await manageMemberAccount(fake.db, "admin", { ...edit, role: "University Administrator", department: "CAS" });
  assert.equal(fake.documents.get("memberships/assignment").department, "General Service Department");
  const restricted = fixture({ role: "University Administrator" });
  await assert.rejects(manageMemberAccount(restricted.db, "admin", invite), { code: "permission-denied" });
});

test("existing users and live invitations are skipped without a success log", async () => {
  const existing = fixture();
  assert.equal((await manageMemberAccount(existing.db, "admin", { ...invite, email: "member@example.com" })).outcome, "exists");
  const pending = fixture();
  pending.documents.set("invitations/other", { email: "new@example.com", status: "pending", expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  assert.equal((await manageMemberAccount(pending.db, "admin", invite)).outcome, "pending");
  assert.equal(existing.logs().length + pending.logs().length, 0);
});

test("expired invitations can be replaced and each successful recipient receives an event", async () => {
  const fake = fixture();
  fake.documents.set("invitations/expired", { email: "new@example.com", status: "pending", expiresAt: Timestamp.fromMillis(Date.now() - 60000) });
  await manageMemberAccount(fake.db, "admin", invite);
  await manageMemberAccount(fake.db, "admin", { ...invite, operationId: "invite-2", email: "second@example.com", invitationId: "second-token", invitationHtml: "token=second-token" });
  assert.equal(fake.logs().length, 2);
});

test("re-invitation preserves existing membership dates/status and leaves the account deactivated", async () => {
  const fake = fixture();
  fake.documents.get("users/member").isActive = false;
  await manageMemberAccount(fake.db, "admin", { ...invite, action: "reinvite", targetId: "member", membershipId: "assignment" });
  assert.equal(fake.documents.get("users/member").isActive, false);
  assert.equal(fake.documents.get("memberships/assignment").joinedAt, "original-date");
  assert.equal(fake.documents.get("memberships/assignment").status, "accepted");
  assert.equal(fake.documents.get("invitations/private-token").isReactivation, true);
  assert.equal(fake.logs()[0].action, "account.reinvited");
  assert.equal(fake.logs()[0].memberName, "Cruz, Juan");
});

for (const isReactivation of [false, true]) test(`cancelling ${isReactivation ? "a re-invitation preserves the registered membership" : "an invitation removes only the pending assignment"}`, async () => {
  const fake = fixture();
  fake.documents.set("invitations/to-cancel", { email: isReactivation ? "member@example.com" : "pending@example.com", membershipId: "cancel-assignment", status: "pending", isReactivation });
  fake.documents.set("memberships/cancel-assignment", { userId: isReactivation ? "member" : "", email: "pending@example.com", role: "Instructor", department: "CITE" });
  fake.documents.set("mail/queued", { to: isReactivation ? "member@example.com" : "pending@example.com" });
  const request = { action: "cancel_invitation", operationId: "cancel-1", targetId: "to-cancel" };
  await manageMemberAccount(fake.db, "admin", request);
  assert.equal(fake.documents.has("invitations/to-cancel"), false);
  assert.equal(fake.documents.has("mail/queued"), false);
  assert.equal(fake.documents.has("memberships/cancel-assignment"), isReactivation);
  assert.equal(fake.logs()[0].action, isReactivation ? "account.reinvitation_cancelled" : "account.invitation_cancelled");
  assert.deepEqual(fake.logs()[0].changes.invitationStatus, { before: "Pending", after: "Cancelled" });
  await manageMemberAccount(fake.db, "admin", request);
  assert.equal(fake.logs().length, 1);
});

test("editing a pending invitation logs role/department changes on its source membership", async () => {
  const fake = fixture();
  fake.documents.set("invitations/pending-token", { email: "pending@example.com", membershipId: "pending-assignment", status: "pending" });
  fake.documents.set("memberships/pending-assignment", { userId: "", email: "pending@example.com", role: "Instructor", department: "CITE", status: "accepted" });
  await manageMemberAccount(fake.db, "admin", { ...edit, targetId: "pending-token", targetType: "invitation", membershipId: "pending-assignment" });
  assert.equal(fake.logs()[0].action, "account.invitation_updated");
  assert.equal(fake.logs()[0].targetId, "pending-assignment");
  assert.equal(JSON.stringify(fake.logs()[0]).includes("pending-token"), false);
  assert.equal(fake.documents.get("memberships/pending-assignment").role, "Program Head");
});

test("deactivation logs access changes and cancelled pending invitations, preserving memberships", async () => {
  const fake = fixture();
  fake.documents.set("invitations/old", { email: "member@example.com", status: "pending" });
  fake.documents.set("mail/old", { to: "member@example.com" });
  const request = { action: "deactivate", operationId: "deactivate-1", targetId: "member" };
  await manageMemberAccount(fake.db, "admin", request);
  assert.equal(fake.documents.get("users/member").isActive, false);
  assert(fake.documents.has("memberships/assignment"));
  assert.equal(fake.documents.has("invitations/old"), false);
  assert.equal(fake.documents.has("mail/old"), false);
  assert.equal(fake.logs()[0].action, "account.deactivated");
  assert.deepEqual(fake.logs()[0].changes, { isActive: { before: true, after: false }, pendingInvitations: { before: 1, after: 0 } });
  await manageMemberAccount(fake.db, "admin", { ...request, operationId: "deactivate-2" });
  assert.equal(fake.logs().length, 1);
  await assert.rejects(manageMemberAccount(fake.db, "admin", { ...request, operationId: "self-deactivate", targetId: "admin" }), { code: "failed-precondition" });
});

test("department removal and office roles record the actual normalized department and assignment", async () => {
  for (const [role, department] of [["Instructor", ""], ["Admin", "Administrative Office"], ["Registrar", "Registrar's Office"]]) {
    const fake = fixture();
    await manageMemberAccount(fake.db, "admin", { ...edit, role, department: "None" });
    assert.equal(fake.documents.get("memberships/assignment").department, department);
    assert.deepEqual(fake.logs()[0].changes.department, { before: "CITE", after: department });
    if (!department) assert.deepEqual(fake.logs()[0].changes.membershipStatus, { before: "accepted", after: "" });
  }
});

test("multiple Program Heads remain supported while conflicting Deans are rejected", async () => {
  const fake = fixture();
  fake.documents.set("memberships/another-head", { userId: "other", role: "Program Head", department: "CAS" });
  await manageMemberAccount(fake.db, "admin", edit);
  assert.equal(fake.documents.get("memberships/another-head").userId, "other");
  const conflict = fixture();
  conflict.documents.set("memberships/dean", { userId: "dean", role: "Dean", department: "CAS" });
  await assert.rejects(manageMemberAccount(conflict.db, "admin", { ...edit, role: "Dean" }), { code: "failed-precondition" });
  assert.equal(conflict.logs().length, 0);
  assert.equal(conflict.documents.get("memberships/assignment").role, "Instructor");
});

test("moving a Dean updates only the affected department dean metadata", async () => {
  const fake = fixture();
  fake.documents.get("memberships/assignment").role = "Dean";
  fake.documents.get("departments/cite").dean = "member";
  await manageMemberAccount(fake.db, "admin", { ...edit, role: "Dean", expected: { role: "Dean", department: "CITE" } });
  assert.equal(fake.documents.get("departments/cite").dean, "");
  assert.equal(fake.documents.get("departments/cas").dean, "member");
  assert.deepEqual(fake.logs()[0].changes, { department: { before: "CITE", after: "CAS" } });
});

test("stale edits and no-op saves never create misleading logs", async () => {
  const stale = fixture();
  await assert.rejects(manageMemberAccount(stale.db, "admin", { ...edit, expected: { role: "Dean", department: "CITE" } }), { code: "failed-precondition" });
  const noop = fixture();
  assert.equal((await manageMemberAccount(noop.db, "admin", { ...edit, role: "Instructor", department: "CITE" })).outcome, "unchanged");
  assert.equal(stale.logs().length + noop.logs().length, 0);
});

test("repeated requests and Firestore retries publish one event; operation IDs cannot be reused for another intent", async () => {
  const fake = fixture({ retry: true });
  await manageMemberAccount(fake.db, "admin", invite);
  await manageMemberAccount(fake.db, "admin", invite);
  assert.equal(fake.logs().length, 1);
  await assert.rejects(manageMemberAccount(fake.db, "admin", { ...invite, email: "different@example.com" }), { code: "already-exists" });
});

test("failed log writes roll back edits, invitations, cancellations and deactivation", async () => {
  for (const request of [edit, invite, { action: "deactivate", operationId: "delete-1", targetId: "member" }, { action: "cancel_invitation", operationId: "cancel-1", targetId: "pending" }]) {
    const fake = fixture({ failLog: true });
    fake.documents.set("invitations/pending", { email: "new@example.com", status: "pending", membershipId: "pending-assignment" });
    fake.documents.set("memberships/pending-assignment", { role: "Instructor", userId: "" });
    const before = [...fake.documents];
    await assert.rejects(manageMemberAccount(fake.db, "admin", request), /Log failed/);
    assert.deepEqual([...fake.documents], before);
  }
});

test("only authenticated active accepted Admins can change accounts", async () => {
  const fake = fixture();
  await assert.rejects(manageMemberAccount(fake.db, undefined, edit), { code: "unauthenticated" });
  for (const options of [{ role: "Registrar" }, { role: "Dean" }, { role: "Program Head" }, { role: "Instructor" }, { active: false }, { membershipStatus: "pending" }]) {
    const denied = fixture(options);
    await assert.rejects(manageMemberAccount(denied.db, "admin", edit), { code: "permission-denied" });
    assert.equal(denied.logs().length, 0);
  }
});

test("missing or changed source memberships cannot create duplicate assignments", async () => {
  const fake = fixture();
  await assert.rejects(manageMemberAccount(fake.db, "admin", { ...edit, membershipId: "missing" }), { code: "failed-precondition" });
  await assert.rejects(manageMemberAccount(fake.db, "admin", { ...edit, membershipId: "" }), { code: "failed-precondition" });
  for (const input of [null, {}, { ...edit, targetId: "../member" }, { ...invite, invitationHtml: "missing token" }]) {
    await assert.rejects(manageMemberAccount(fake.db, "admin", input), { code: "invalid-argument" });
  }
  assert.equal(fake.logs().length, 0);
});

test("legacy office memberships use the displayed department for stale checks without losing raw before values", async () => {
  const fake = fixture();
  fake.documents.set("memberships/assignment", { userId: "member", email: "member@example.com", role: "Admin", department: "", status: "accepted" });
  await manageMemberAccount(fake.db, "admin", { ...edit, expected: { role: "Admin", department: "Administrative Office" } });
  assert.deepEqual(fake.logs()[0].changes.department, { before: "", after: "CAS" });
});

test("assigning an unassigned member and editing a legacy invitation preserve member context", async () => {
  const fake = fixture();
  fake.documents.delete("memberships/assignment");
  await manageMemberAccount(fake.db, "admin", { ...edit, membershipId: "", expected: { role: "Instructor", department: "" } });
  assert.deepEqual(fake.logs()[0].changes.membership, { before: "Unassigned", after: "Assigned" });
  const pending = fixture();
  pending.documents.set("invitations/legacy", { email: "new@example.com", status: "pending", role: "Instructor", department: "CITE" });
  await manageMemberAccount(pending.db, "admin", { ...edit, targetId: "legacy", targetType: "invitation", membershipId: "" });
  const assigned = pending.documents.get(`memberships/${pending.documents.get("invitations/legacy").membershipId}`);
  assert.equal(assigned.email, "new@example.com");
  assert.equal(pending.logs()[0].memberEmail, "new@example.com");
});

test("live Dean invitations reserve the assignment but expired invitations do not", async () => {
  for (const expired of [false, true]) {
    const fake = fixture();
    fake.documents.set("memberships/pending-dean", { role: "Dean", department: "CAS", userId: "" });
    fake.documents.set("invitations/pending-dean", { membershipId: "pending-dean", status: "pending", expiresAt: Timestamp.fromMillis(Date.now() + (expired ? -60000 : 60000)) });
    if (expired) {
      await manageMemberAccount(fake.db, "admin", { ...edit, role: "Dean" });
      assert.equal(fake.logs().length, 1);
    } else {
      await assert.rejects(manageMemberAccount(fake.db, "admin", { ...edit, role: "Dean" }), { code: "failed-precondition" });
      assert.equal(fake.logs().length, 0);
    }
  }
});
