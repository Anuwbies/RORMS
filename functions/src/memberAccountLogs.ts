import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type DocumentReference, type DocumentData } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

const ROLES = ["Admin", "Registrar", "University Administrator", "Dean", "Program Head", "Instructor"] as const;
type Role = typeof ROLES[number];
type Action = "invite" | "reinvite" | "edit" | "deactivate" | "cancel_invitation";
type Changes = Record<string, { before: string | boolean | number | null; after: string | boolean | number | null }>;
interface Request {
  action: Action;
  operationId: string;
  targetId: string;
  targetType: "user" | "invitation";
  membershipId: string;
  email: string;
  role: Role;
  department: string;
  invitationId: string;
  invitationHtml: string;
  expected?: { role: string; department: string };
}
export interface MemberActionResult {
  outcome: "changed" | "unchanged" | "exists" | "pending";
  logId: string | null;
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function validId(value: string): boolean { return /^[a-zA-Z0-9_-]{1,128}$/.test(value); }
function name(profile: DocumentData, membership: DocumentData = {}): string {
  const structured = [profile, membership].find(data => text(data.firstName) && text(data.surname));
  return structured ? `${text(structured.surname)}, ${text(structured.firstName)}`
    : text(profile.fullName) || text(membership.fullName);
}
function nameFields(profile: DocumentData, membership: DocumentData = {}) {
  return { firstName: text(profile.firstName) || text(membership.firstName), surname: text(profile.surname) || text(membership.surname), fullName: text(profile.fullName) || text(membership.fullName) };
}
function assignedDepartment(role: Role, department: string): string {
  if (role === "University Administrator") return "General Service Department";
  if (role === "Admin") return "Administrative Office";
  if (role === "Registrar") return "Registrar's Office";
  return ["None", "Administrative Office", "Registrar's Office", "General Service Department"].includes(department) ? "" : department;
}
function parse(value: unknown): Request {
  const data = record(value);
  if (!["invite", "reinvite", "edit", "deactivate", "cancel_invitation"].includes(text(data.action)) || !validId(text(data.operationId))) {
    throw new HttpsError("invalid-argument", "A valid member action is required.");
  }
  const action = text(data.action) as Action;
  const targetId = text(data.targetId);
  const membershipId = text(data.membershipId);
  const invitationId = text(data.invitationId);
  const role = text(data.role);
  if ((action !== "invite" && !validId(targetId)) || (membershipId && !validId(membershipId))
    || (["invite", "reinvite"].includes(action) && (!validId(invitationId) || text(data.invitationHtml).length > 100000 || !text(data.invitationHtml).includes(`token=${invitationId}`)))
    || (["invite", "reinvite", "edit"].includes(action) && !ROLES.includes(role as Role))
    || (action === "edit" && !["user", "invitation"].includes(text(data.targetType)))) {
    throw new HttpsError("invalid-argument", "The member action contains invalid fields.");
  }
  const expected = record(data.expected);
  if (action === "edit" && (typeof expected.role !== "string" || typeof expected.department !== "string")) {
    throw new HttpsError("invalid-argument", "Reload the member before editing.");
  }
  return {
    action, operationId: text(data.operationId), targetId, membershipId, invitationId,
    targetType: data.targetType === "invitation" ? "invitation" : "user",
    email: text(data.email).toLowerCase(), role: role as Role, department: text(data.department),
    invitationHtml: text(data.invitationHtml),
    expected: action === "edit" ? { role: text(expected.role), department: text(expected.department) } : undefined,
  };
}

/** Each mutation and its audit event commit together. Actor identity and before values come from server reads. */
export async function manageMemberAccount(db: Firestore, uid: string | undefined, input: unknown): Promise<MemberActionResult> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before managing members.");
  const request = parse(input);
  const requestFingerprint = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const logRef = db.collection("logs").doc(`account_${request.operationId}`);
  const newMembershipRef = db.collection("memberships").doc();
  const newMailRef = db.collection("mail").doc();
  return db.runTransaction(async transaction => {
    const [actorSnapshot, actorMemberships, existingLog] = await Promise.all([
      transaction.get(db.collection("users").doc(uid)),
      transaction.get(db.collection("memberships").where("userId", "==", uid)),
      transaction.get(logRef),
    ]);
    const actor = actorSnapshot.data() || {};
    const actorMembership = actorMemberships.docs.find(document => document.data().role === "Admin" && document.data().status === "accepted");
    if (!actorSnapshot.exists || !actorMembership || actor.isActive === false) throw new HttpsError("permission-denied", "Only active Admins can manage members.");
    if (existingLog.exists) {
      const saved = existingLog.data() || {};
      if (saved.actorId !== uid || saved.requestFingerprint !== requestFingerprint) {
        throw new HttpsError("already-exists", "This operation ID has already been used.");
      }
      return { outcome: "unchanged", logId: logRef.id };
    }
    const mutations: Array<() => void> = [];
    let action = "";
    let targetRef: DocumentReference;
    let member: DocumentData = {};
    let profile: DocumentData = {};
    let email = request.email;
    let department = "";
    let memberRole = "";
    let reactivation = false;
    const changes: Changes = {};
    const change = (field: string, before: string | boolean | number | null, after: string | boolean | number | null) => {
      if (before !== after) changes[field] = { before, after };
    };
    const set = (ref: DocumentReference, data: DocumentData, merge = false) => mutations.push(() => transaction.set(ref, data, { merge }));
    const update = (ref: DocumentReference, data: DocumentData) => mutations.push(() => transaction.update(ref, data));
    const remove = (ref: DocumentReference) => mutations.push(() => transaction.delete(ref));
    const checkDean = async (role: Role, code: string, userId: string, membershipId: string) => {
      if (role !== "Dean" || !code) return;
      const candidates = await transaction.get(db.collection("memberships").where("department", "==", code));
      for (const candidate of candidates.docs) {
        const data = candidate.data();
        if (candidate.id === membershipId || data.role !== "Dean" || (userId && data.userId === userId)) continue;
        // Expired/cancelled onboarding invitations are absent from the Members roster.
        let conflicts = Boolean(text(data.userId));
        if (!conflicts) {
          const invitations = await transaction.get(db.collection("invitations").where("membershipId", "==", candidate.id));
          conflicts = invitations.docs.some(document => document.data().status === "pending"
            && (!(document.data().expiresAt instanceof Timestamp) || document.data().expiresAt.toMillis() > Date.now()));
        }
        if (conflicts) throw new HttpsError("failed-precondition", `A Dean already exists for ${code}.`);
      }
    };

    if (request.action === "invite" || request.action === "reinvite") {
      reactivation = request.action === "reinvite";
      if (reactivation) {
        const user = await transaction.get(db.collection("users").doc(request.targetId));
        if (!user.exists) throw new HttpsError("not-found", "This member no longer exists.");
        profile = user.data() || {};
        if (profile.isActive !== false) throw new HttpsError("failed-precondition", "Only deactivated accounts can be re-invited.");
        email = text(profile.email).toLowerCase();
      }
      if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "A valid member email is required.");
      const [registered, invitations, invitation] = await Promise.all([
        transaction.get(db.collection("users").where("email", "==", email)),
        transaction.get(db.collection("invitations").where("email", "==", email)),
        transaction.get(db.collection("invitations").doc(request.invitationId)),
      ]);
      if (!reactivation && !registered.empty) return { outcome: "exists", logId: null };
      if (invitation.exists) throw new HttpsError("already-exists", "This invitation ID is already in use.");
      if (invitations.docs.some(document => document.data().status === "pending"
        && document.data().expiresAt instanceof Timestamp && document.data().expiresAt.toMillis() > Date.now())) {
        return { outcome: "pending", logId: null };
      }
      let membershipRef = newMembershipRef;
      if (reactivation && request.membershipId) {
        membershipRef = db.collection("memberships").doc(request.membershipId);
        const snapshot = await transaction.get(membershipRef);
        if (!snapshot.exists || snapshot.data()?.userId !== request.targetId) {
          throw new HttpsError("failed-precondition", "The member assignment changed. Reload Members and try again.");
        }
        member = snapshot.data() || {};
      } else if (reactivation) {
        const assignments = await transaction.get(db.collection("memberships").where("userId", "==", request.targetId));
        if (!assignments.empty) throw new HttpsError("failed-precondition", "The member assignment changed. Reload Members and try again.");
      }
      memberRole = request.role;
      department = assignedDepartment(request.role, request.department);
      if (reactivation && member.role && (member.role !== request.role || (text(member.department) || assignedDepartment(request.role, "")) !== department)) {
        throw new HttpsError("failed-precondition", "The member assignment changed. Reload Members and try again.");
      }
      await checkDean(request.role, department, reactivation ? request.targetId : "", membershipRef.id);
      set(membershipRef, {
        userId: reactivation ? request.targetId : "", ...nameFields(profile, member), email, role: memberRole, department,
        ...(reactivation && request.membershipId ? {} : {
          status: reactivation ? "" : department ? "accepted" : "", joinedAt: "", createdAt: FieldValue.serverTimestamp(),
        }),
      }, reactivation && Boolean(request.membershipId));
      set(db.collection("invitations").doc(request.invitationId), {
        email, membershipId: membershipRef.id, status: "pending", invitedBy: uid,
        ...(reactivation ? { isReactivation: true } : {}),
        createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      set(newMailRef, { to: email, message: {
        subject: reactivation ? "Your Room Track reactivation invitation" : "Your Room Track invitation",
        html: request.invitationHtml,
      } });
      targetRef = membershipRef;
      action = reactivation ? "account.reinvited" : "account.invited";
      change("invitationStatus", "Not pending", "Pending");
      if (!reactivation) {
        change("role", null, memberRole);
        change("department", null, department);
      }
    } else if (request.action === "edit") {
      const pending = request.targetType === "invitation";
      const source = await transaction.get(db.collection(pending ? "invitations" : "users").doc(request.targetId));
      if (!source.exists) throw new HttpsError("not-found", "This member or invitation no longer exists.");
      const sourceData = source.data() || {};
      if (pending && sourceData.status !== "pending") throw new HttpsError("failed-precondition", "This invitation is no longer pending.");
      if (!pending) profile = sourceData;
      const sourceMembershipId = text(sourceData.membershipId);
      const membershipId = pending ? sourceMembershipId || request.membershipId : request.membershipId;
      if (pending && sourceMembershipId && request.membershipId && membershipId !== request.membershipId) throw new HttpsError("failed-precondition", "The invitation assignment changed. Reload Members.");
      const membershipRef = membershipId ? db.collection("memberships").doc(membershipId) : newMembershipRef;
      if (membershipId) {
        const snapshot = await transaction.get(membershipRef);
        if (!snapshot.exists || (!pending && snapshot.data()?.userId !== request.targetId)
          || (pending && text(snapshot.data()?.email).toLowerCase() !== text(sourceData.email).toLowerCase())) throw new HttpsError("failed-precondition", "The membership changed. Reload Members.");
        member = snapshot.data() || {};
      } else if (!pending) {
        const assignments = await transaction.get(db.collection("memberships").where("userId", "==", request.targetId));
        if (!assignments.empty) throw new HttpsError("failed-precondition", "The membership changed. Reload Members.");
      }
      const previousRole = text(member.role) || (pending ? text(sourceData.role) : "") || "Instructor";
      const previousDepartment = text(member.department) || (pending ? text(sourceData.department) : "");
      const displayedDepartment = previousDepartment || (ROLES.includes(previousRole as Role) ? assignedDepartment(previousRole as Role, "") : "");
      if (request.expected?.role !== previousRole || request.expected?.department !== displayedDepartment) {
        throw new HttpsError("failed-precondition", "This member was changed by another session. Reload Members before editing.");
      }
      memberRole = request.role;
      department = assignedDepartment(request.role, request.department);
      email = text(sourceData.email) || text(member.email);
      reactivation = pending && Boolean(sourceData.isReactivation || member.userId);
      if (pending && text(member.userId)) {
        const user = await transaction.get(db.collection("users").doc(text(member.userId)));
        profile = user.data() || {};
      }
      change("role", previousRole, memberRole);
      change("department", previousDepartment, department);
      const nextStatus = department ? "accepted" : "";
      change("membershipStatus", text(member.status), nextStatus);
      if (!membershipId) change("membership", "Unassigned", "Assigned");
      if (!Object.keys(changes).length) return { outcome: "unchanged", logId: null };
      await checkDean(request.role, department, pending ? text(member.userId) : request.targetId, membershipRef.id);
      if (!pending && previousRole === "Dean" && (memberRole !== "Dean" || previousDepartment !== department)) {
        const oldDepartments = await transaction.get(db.collection("departments").where("code", "==", previousDepartment));
        for (const old of oldDepartments.docs) if (old.data().dean === request.targetId) update(old.ref, { dean: "", updatedAt: FieldValue.serverTimestamp() });
      }
      if (!pending && memberRole === "Dean" && department) {
        const newDepartments = await transaction.get(db.collection("departments").where("code", "==", department));
        for (const next of newDepartments.docs) update(next.ref, { dean: request.targetId, updatedAt: FieldValue.serverTimestamp() });
      }
      set(membershipRef, {
        ...(!membershipId ? { userId: pending ? "" : request.targetId, ...nameFields(profile, member), email, joinedAt: "", createdAt: FieldValue.serverTimestamp() } : {}),
        role: memberRole, department, status: nextStatus,
        ...(!pending ? { ...nameFields(profile, member), email,
          ...(!membershipId || previousDepartment !== department ? { joinedAt: department ? FieldValue.serverTimestamp() : "" } : {}),
        } : {}),
      }, true);
      if (pending && !sourceMembershipId) update(source.ref, { membershipId: membershipRef.id });
      if (!pending) update(source.ref, { updatedAt: FieldValue.serverTimestamp() });
      targetRef = membershipRef;
      action = pending ? "account.invitation_updated" : "account.member_updated";
    } else if (request.action === "deactivate") {
      if (request.targetId === uid) throw new HttpsError("failed-precondition", "You cannot deactivate your own account.");
      const user = await transaction.get(db.collection("users").doc(request.targetId));
      if (!user.exists) throw new HttpsError("not-found", "This member no longer exists.");
      profile = user.data() || {};
      if (profile.isActive === false) return { outcome: "unchanged", logId: null };
      email = text(profile.email);
      const [memberships, mail, invitations] = await Promise.all([
        transaction.get(db.collection("memberships").where("userId", "==", request.targetId)),
        transaction.get(db.collection("mail").where("to", "==", email)),
        transaction.get(db.collection("invitations").where("email", "==", email)),
      ]);
      member = (memberships.docs.find(document => document.id === request.membershipId) || memberships.docs[0])?.data() || {};
      memberRole = text(member.role);
      department = text(member.department);
      update(user.ref, { isActive: false, updatedAt: FieldValue.serverTimestamp() });
      for (const document of [...mail.docs, ...invitations.docs]) remove(document.ref);
      change("isActive", true, false);
      change("pendingInvitations", invitations.docs.filter(document => document.data().status === "pending").length, 0);
      targetRef = user.ref;
      action = "account.deactivated";
    } else {
      const invitation = await transaction.get(db.collection("invitations").doc(request.targetId));
      if (!invitation.exists) return { outcome: "unchanged", logId: null };
      const data = invitation.data() || {};
      if (data.status !== "pending") throw new HttpsError("failed-precondition", "Only pending invitations can be cancelled.");
      email = text(data.email);
      const membershipId = text(data.membershipId);
      const membership = membershipId ? await transaction.get(db.collection("memberships").doc(membershipId)) : undefined;
      member = membership?.data() || {};
      const [registered, mail] = await Promise.all([
        transaction.get(db.collection("users").where("email", "==", email)),
        transaction.get(db.collection("mail").where("to", "==", email)),
      ]);
      profile = registered.docs[0]?.data() || {};
      reactivation = Boolean(data.isReactivation || member.userId || !registered.empty);
      memberRole = text(member.role);
      department = text(member.department);
      remove(invitation.ref);
      if (membership?.exists && !reactivation) remove(membership.ref);
      for (const document of mail.docs) remove(document.ref);
      change("invitationStatus", "Pending", "Cancelled");
      targetRef = membership?.ref || registered.docs[0]?.ref || logRef;
      action = reactivation ? "account.reinvitation_cancelled" : "account.invitation_cancelled";
    }

    // The token-bearing invitation ID and email HTML never enter the audit log.
    const event = {
      category: "Accounts", action, operation: request.action, requestFingerprint,
      actorId: uid, actorName: name(actor, actorMembership.data()) || uid, actorRole: "Admin", membershipId: actorMembership.id,
      targetCollection: targetRef.parent.id, targetId: targetRef.id,
      memberName: name(profile, member) || email, memberEmail: email, memberRole, department, isReactivation: reactivation,
      changes, source: "user", createdAt: FieldValue.serverTimestamp(),
    };
    if (mutations.length + 1 > 500) throw new HttpsError("resource-exhausted", "Too many related records. Contact your administrator.");
    for (const mutate of mutations) mutate();
    transaction.create(logRef, event);
    return { outcome: "changed", logId: logRef.id };
  });
}
