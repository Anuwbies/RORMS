import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const countKeys = ["workbook", "sheetOrder", "sheetsRenamed", "sheetsAdded", "sheetsIncluded", "sheetsRemoved", "cellsChanged", "cellDetailsChanged", "formattingChanged", "layoutChanged", "setupChanged", "schedulesAdded", "schedulesUpdated", "schedulesRemoved"];

export interface WorkbookSaveEvent {
  path: string;
  before?: Data;
  after?: Data;
  authId?: string;
  authType: string;
  committedAt: Timestamp;
}

/** Consumes the committed revision snapshot, never mutable sheet/chunk documents. */
export async function recordWorkbookScheduleLog(db: Firestore, event: WorkbookSaveEvent): Promise<boolean> {
  const after = event.after;
  if (!after || after.schemaVersion !== 3 || !/^departments\/[^/]+\/workbooks\/\d{4}-\d{4}\/semesters\/sem[12]$/.test(event.path)) return false;
  const audit = record(after.audit);
  const revisionId = text(after.revisionId), revision = after.revision;
  if (!revisionId || !Number.isSafeInteger(revision) || Number(revision) < 1 || revisionId === event.before?.revisionId
    || audit.version !== 1 || audit.revisionId !== revisionId || audit.previousRevision !== Number(revision) - 1
    || !["created", "imported", "updated", "repaired"].includes(text(audit.kind)) || typeof audit.baselineAvailable !== "boolean") return false;
  const counts = record(audit.counts);
  if (Object.entries(counts).some(([key, value]) => !countKeys.includes(key) || !Number.isSafeInteger(value) || Number(value) < 0)
    || !Number.isSafeInteger(audit.totalChanges) || audit.totalChanges !== Object.values(counts).reduce<number>((sum, value) => sum + Number(value), 0)
    || !Number.isSafeInteger(audit.omittedSamples) || Number(audit.omittedSamples) < 0) return false;
  if (!Array.isArray(audit.samples) || audit.samples.length > 80) return false;
  const samples = audit.samples.map(value => record(value));
  if (samples.some(sample => !["kind", "sheet", "location", "field"].every(key => typeof sample[key] === "string" && String(sample[key]).length <= 500)
    || !["before", "after"].every(key => sample[key] === null || typeof sample[key] === "string" && String(sample[key]).length <= 400))) return false;
  // Saving only the selection or a new technical revision is not an activity event.
  if (audit.kind === "updated" && audit.totalChanges === 0) return false;
  const digest = createHash("sha256").update(`${event.path}\0${revisionId}`).digest("hex");
  const logRef = db.collection("logs").doc(`schedule_${digest}`);
  return db.runTransaction(async transaction => {
    const saved = await transaction.get(logRef);
    if (saved.exists) return false;
    // Client writes can carry api_key auth context with the Firebase user's ID.
    // Resolve only the event principal, never the client-controlled savedBy field.
    let authenticatedUser = ["unknown", "api_key"].includes(event.authType) && event.authId && !event.authId.includes("/") ? event.authId : "";
    let actorName = "Unknown member", actorRole = "Unknown";
    if (authenticatedUser) {
      const membershipId = text(after.membershipId);
      const [profile, membership] = await Promise.all([
        transaction.get(db.collection("users").doc(authenticatedUser)),
        membershipId && !membershipId.includes("/") ? transaction.get(db.collection("memberships").doc(membershipId)) : Promise.resolve(undefined),
      ]);
      const user = profile.data() || {}, member = membership?.data() || {};
      // An API-key-only principal is not a member. Require an existing profile
      // before treating this context's ID as a Firebase user.
      if (event.authType === "api_key" && !profile.exists) {
        authenticatedUser = "";
      } else {
        actorName = text(user.firstName) && text(user.surname) ? `${text(user.surname)}, ${text(user.firstName)}` : text(user.fullName) || authenticatedUser;
        if (member.userId === authenticatedUser && ["Admin", "Registrar", "Dean", "Program Head", "Instructor"].includes(text(member.role))) actorRole = text(member.role);
      }
    }
    transaction.create(logRef, {
      category: "Scheduling", action: "schedule.workbook_saved", source: "user", actorId: authenticatedUser || "", actorName, actorRole,
      membershipId: text(after.membershipId), authType: event.authType,
      targetCollection: "workbooks", targetId: text(after.workbookId), sourcePath: event.path,
      departmentId: text(after.departmentId), department: text(after.departmentCode), academicYearId: text(after.academicYearId),
      academicYear: text(after.academicYear), semester: text(after.semester), fileName: text(after.fileName),
      revision, revisionId, sheetNames: Array.isArray(after.sheetNames) ? after.sheetNames.filter(name => typeof name === "string") : [],
      kind: audit.kind, counts, samples, omittedSamples: audit.omittedSamples, baselineAvailable: audit.baselineAvailable,
      createdAt: event.committedAt,
    });
    return true;
  });
}
