import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentWrittenWithAuthContext } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { cancelScheduleReservations } from "./cancelScheduleReservations";
import { scheduleSignature } from "./reservationScheduleConflicts";
import { endExpiredSemesters } from "./semesterPhaseUpdates";
import { changeReservationStatus } from "./reservationStatusLogs";
import { recordWorkbookScheduleLog } from "./workbookScheduleLogs";
import { manageMemberAccount } from "./memberAccountLogs";
import { manageFacilityRecords } from "./facilityLogs";

let _db: admin.firestore.Firestore | null = null;

function getDefaultAdminApp(): admin.app.App {
  try {
    return admin.app();
  } catch {
    return admin.initializeApp();
  }
}

const defaultAdminApp = getDefaultAdminApp();

function getDb(): admin.firestore.Firestore {
  if (!_db) {
    _db = admin.firestore(defaultAdminApp);
  }
  return _db;
}

export const updateReservationStatus = onCall(async request => {
  return changeReservationStatus(getDb(), request.auth?.uid, request.data);
});

export const logDepartmentWorkbookSave = onDocumentWrittenWithAuthContext({
  document: "departments/{departmentId}/workbooks/{yearId}/semesters/{semester}", retry: true,
}, async event => {
  if (!event.data?.after.exists || !event.data.after.updateTime) return;
  await recordWorkbookScheduleLog(getDb(), {
    path: event.data.after.ref.path, before: event.data.before.data(), after: event.data.after.data(),
    authId: event.authId, authType: event.authType,
    committedAt: event.data.after.updateTime ?? admin.firestore.Timestamp.fromDate(new Date(event.time)),
  });
});

export const manageMember = onCall(async request => {
  return manageMemberAccount(getDb(), request.auth?.uid, request.data);
});

export const manageFacility = onCall(async request => {
  return manageFacilityRecords(getDb(), request.auth?.uid, request.data);
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '\"': "&quot;",
    };
    return entities[character];
  });
}

function getAllowedAppOrigin(value: unknown): string {
  const defaultOrigin = "https://rorms-dd983.web.app";
  if (typeof value !== "string" || !value.trim()) return defaultOrigin;

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new HttpsError("invalid-argument", "The app origin is invalid.");
  }

  const isLocalOrigin = origin.protocol === "http:" &&
    (origin.hostname === "localhost" || origin.hostname === "127.0.0.1");
  const isProductionOrigin = origin.protocol === "https:" &&
    (origin.hostname === "rorms-dd983.web.app" || origin.hostname === "rorms-dd983.firebaseapp.com");

  if (!isLocalOrigin && !isProductionOrigin) {
    throw new HttpsError("invalid-argument", "The app origin is not authorized.");
  }

  return origin.origin;
}

function createCustomPasswordResetLink(generatedLink: string, handlerUrl: string): string {
  const firebaseActionUrl = new URL(generatedLink);
  const customActionUrl = new URL(handlerUrl);

  for (const parameter of ["mode", "oobCode", "apiKey", "lang"]) {
    const value = firebaseActionUrl.searchParams.get(parameter);
    if (value) customActionUrl.searchParams.set(parameter, value);
  }

  return customActionUrl.toString();
}

function isUserNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const errorWithDetails = error as { code?: unknown; message?: unknown };
  const code = errorWithDetails.code;
  const message = errorWithDetails.message;

  return (
    typeof code === "string" && code.endsWith("user-not-found")
  ) || (
    typeof message === "string" && /no user record|user.*not found/i.test(message)
  );
}

/**
 * Removes an email-extension queue document only after the extension confirms
 * that delivery succeeded. Deleting before this state is reached can prevent
 * the extension from sending the email.
 */
export const deleteDeliveredMail = onDocumentUpdated("mail/{mailId}", async (event) => {
  const mail = event.data?.after;
  if (!mail || mail.data()?.delivery?.state !== "SUCCESS") return;

  await mail.ref.delete();
  logger.info("Deleted delivered email queue document.", { mailId: event.params.mailId });
});

/**
 * Generates a Firebase password-reset link and queues a branded email for the
 * Trigger Email extension. The Firebase Admin SDK must remain server-side so
 * the reset link cannot be generated or sent by an untrusted client.
 */
export const requestPasswordReset = onCall(async (request) => {
  const email = typeof request.data?.email === "string"
    ? request.data.email.trim().toLowerCase()
    : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  const appOrigin = getAllowedAppOrigin(request.data?.origin);
  const passwordResetHandlerUrl = `${appOrigin}/reset-password`;

  try {
    try {
      await admin.auth(defaultAdminApp).getUserByEmail(email);
    } catch (error: unknown) {
      if (isUserNotFoundError(error)) {
        // Return the same response for unknown addresses to avoid email enumeration.
        return { success: true };
      }
      throw error;
    }

    const generatedResetLink = await admin.auth(defaultAdminApp).generatePasswordResetLink(email);
    const resetLink = createCustomPasswordResetLink(generatedResetLink, passwordResetHandlerUrl);
    const safeEmail = escapeHtml(email);
    const safeResetLink = escapeHtml(resetLink);
    const db = getDb();

    await db.collection("mail").add({
      to: email,
      message: {
        subject: "Reset your RORMS password",
        html: `
          <!doctype html>
          <html lang="en">
            <body style="margin:0;background:transparent;font-family:Arial,sans-serif;color:#0f172a;">
              <div style="max-width:600px;margin:32px auto;background:#ffffff;border:1px solid #e3edda;border-radius:16px;overflow:hidden;">
                <div style="background:#62853e;padding:28px 32px;color:#ffffff;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:3px;">PHINMA UPANG</div>
                  <div style="margin-top:8px;font-size:20px;font-weight:700;">Registrar Office Room Management System</div>
                </div>
                <div style="padding:32px;">
                  <h1 style="margin:0 0 16px;font-size:24px;">Reset your password</h1>
                  <p style="margin:0 0 16px;line-height:1.6;">Hello,</p>
                  <p style="margin:0 0 24px;line-height:1.6;">We received a request to reset the password for your RORMS account (${safeEmail}). Click the button below to choose a new password.</p>
                  <p style="margin:0 0 28px;"><a href="${safeResetLink}" style="display:inline-block;background:#62853e;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 22px;font-weight:700;">Reset password</a></p>
                  <p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.6;">If you did not request this change, you can safely ignore this email.</p>
                  <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">For your security, do not forward this email or share the reset link.</p>
                </div>
                <div style="padding:20px 32px;background:#f8fafc;color:#64748b;font-size:12px;">© 2026 RORMS · PHINMA Education</div>
              </div>
            </body>
          </html>
        `,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    if (isUserNotFoundError(error)) {
      // Keep the response identical for unknown addresses to avoid email enumeration.
      return { success: true };
    }

    logger.error("Error creating password reset email:", error);
    throw new HttpsError("internal", "Unable to send the password reset email.");
  }
});

/**
 * Returns the current date and time formatted in the Asia/Manila (UTC+8) timezone.
 */
function getManilaDateTime(): { currentDateStr: string; currentTimeStr: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";

  return {
    currentDateStr: `${year}-${month}-${day}`,
    currentTimeStr: `${hour}:${minute}`,
  };
}

/**
 * Normalizes time strings like "8:00" into 2-digit padded "08:00".
 */
function normalizeTime(t?: string): string {
  if (!t) return "00:00";
  const [h, m] = t.split(":");
  return `${(h || "00").padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
}

/**
 * Evaluates whether a reservation's schedule has concluded compared to the current date and time.
 */
function isReservationExpired(
  resDate: string,
  resEndTime: string,
  curDate: string,
  curTime: string
): boolean {
  if (!resDate) return false;
  const endT = normalizeTime(resEndTime);

  // If the reservation date is before today, it has expired
  if (resDate < curDate) return true;

  // If the reservation is today, check if end time is equal or past the current time
  if (resDate === curDate && endT <= curTime) return true;

  return false;
}

/**
 * Core business logic that transitions expired reservations:
 * - Pending -> Declined (if past date & time)
 * - Approved -> Completed (if past date & time)
 */
export async function processReservationStatusUpdates(): Promise<{
  declinedCount: number;
  completedCount: number;
  totalEvaluated: number;
}> {
  const db = getDb();
  const { currentDateStr, currentTimeStr } = getManilaDateTime();
  logger.info(`Evaluating reservations against Manila time: ${currentDateStr} ${currentTimeStr}`);

  const pendingSnap = await db.collection("reservations").where("status", "==", "Pending").get();
  const approvedSnap = await db.collection("reservations").where("status", "==", "Approved").get();

  let declinedCount = 0;
  let completedCount = 0;
  let operationsInBatch = 0;
  const maxBatchSize = 450;
  const batchPromises: Promise<FirebaseFirestore.WriteResult[]>[] = [];

  let currentBatch = db.batch();

  // 1. Process Pending -> Declined
  for (const doc of pendingSnap.docs) {
    const data = doc.data();
    const isExpired = isReservationExpired(
      data.date,
      data.endTime || data.startTime,
      currentDateStr,
      currentTimeStr
    );

    if (isExpired) {
      currentBatch.update(doc.ref, {
        status: "Declined",
        declinedReason: "Auto-declined: Reservation request expired before review",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        autoProcessed: true,
      });
      declinedCount++;
      operationsInBatch++;

      if (operationsInBatch >= maxBatchSize) {
        batchPromises.push(currentBatch.commit());
        currentBatch = db.batch();
        operationsInBatch = 0;
      }
    }
  }

  // 2. Process Approved -> Completed
  for (const doc of approvedSnap.docs) {
    const data = doc.data();
    const isExpired = isReservationExpired(
      data.date,
      data.endTime,
      currentDateStr,
      currentTimeStr
    );

    if (isExpired) {
      currentBatch.update(doc.ref, {
        status: "Completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        autoProcessed: true,
      });
      completedCount++;
      operationsInBatch++;

      if (operationsInBatch >= maxBatchSize) {
        batchPromises.push(currentBatch.commit());
        currentBatch = db.batch();
        operationsInBatch = 0;
      }
    }
  }

  if (operationsInBatch > 0) {
    batchPromises.push(currentBatch.commit());
  }

  await Promise.all(batchPromises);

  logger.info(
    `Reservation lifecycle completed: ${declinedCount} Pending -> Declined, ${completedCount} Approved -> Completed`
  );

  return {
    declinedCount,
    completedCount,
    totalEvaluated: pendingSnap.size + approvedSnap.size,
  };
}

/**
 * Ends expired semesters daily after their inclusive end date in Philippine time.
 */
export const autoEndSemesterPhases = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Manila",
    retryCount: 3,
    timeoutSeconds: 540,
  },
  async () => {
    const { currentDateStr } = getManilaDateTime();
    const result = await endExpiredSemesters(getDb(), currentDateStr);
    logger.info("Expired semester phases updated.", { currentDate: currentDateStr, ...result });
  }
);

/**
 * Scheduled Cloud Function (Runs automatically every 5 minutes in Asia/Manila timezone).
 */
export const autoUpdateReservationStatus = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Asia/Manila",
    retryCount: 3,
  },
  async () => {
    await processReservationReminders();
    await processReservationStatusUpdates();
  }
);

/**
 * On-Demand HTTP Cloud Function for manual triggers and testing.
 */
export const checkReservationsNow = onRequest(
  { cors: true },
  async (_req, res) => {
    try {
      const remindersCreated = await processReservationReminders();
      const result = await processReservationStatusUpdates();
      res.status(200).json({
        success: true,
        message: "Reservation statuses successfully processed.",
        result: { ...result, remindersCreated },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      logger.error("Error processing reservations:", error);
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
);

type NotificationType =
  | "booking_recommended"
  | "booking_approved"
  | "booking_rejected"
  | "booking_cancelled"
  | "booking_completed"
  | "booking_reminder"
  | "building_added"
  | "building_updated"
  | "room_added"
  | "room_updated"
  | "room_status_changed"
  | "department_invited"
  | "department_member_removed"
  | "department_invitation_accepted"
  | "department_reinvitation_accepted"
  | "member_department_assigned"
  | "member_role_changed"
  | "academic_year_changed"
  | "academic_phase_changed";

type UserRole = "Admin" | "Registrar" | "Dean" | "Program Head" | "Instructor" | "University Administrator";

interface NotificationPayload {
  title: string;
  message: string;
  type: NotificationType;
  sourceCollection: string;
  sourceId: string;
}

function notificationDocumentId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestampsEqual(first: unknown, second: unknown): boolean {
  const firstTimestamp = first as { toMillis?: () => number } | null | undefined;
  const secondTimestamp = second as { toMillis?: () => number } | null | undefined;
  const firstMillis = firstTimestamp?.toMillis?.();
  const secondMillis = secondTimestamp?.toMillis?.();

  if (typeof firstMillis === "number" || typeof secondMillis === "number") {
    return firstMillis === secondMillis;
  }

  return first === second;
}

async function createUserNotifications(
  userIds: string[],
  payload: NotificationPayload,
  notificationId: string
): Promise<number> {
  const db = getDb();
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const safeNotificationId = notificationDocumentId(notificationId);

  for (let offset = 0; offset < uniqueUserIds.length; offset += 450) {
    const batch = db.batch();
    uniqueUserIds.slice(offset, offset + 450).forEach((userId) => {
      const notificationRef = db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .doc(safeNotificationId);

      batch.set(notificationRef, {
        ...payload,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return uniqueUserIds.length;
}

async function getUserIdsForRoles(roles: UserRole[]): Promise<string[]> {
  if (roles.length === 0) return [];

  const snapshot = await getDb().collection("memberships").where("role", "in", roles).get();
  return [...new Set(snapshot.docs
    .map((membership) => membership.data())
    .filter((membership) => membership.status === "accepted")
    .map((membership) => stringValue(membership.userId))
    .filter(Boolean))];
}

async function getReservationReviewerUserIds(role: "Dean" | "University Administrator", department: string): Promise<string[]> {
  if (role === "Dean" && !department) return [];
  const snapshot = await getDb().collection("memberships").where("role", "==", role).get();
  return [...new Set(snapshot.docs
    .map(membership => membership.data())
    .filter(membership => membership.status === "accepted"
      && (role !== "Dean" || stringValue(membership.department) === department))
    .map(membership => stringValue(membership.userId))
    .filter(Boolean))];
}

async function getManagerUserIds(department: string, excludedUserId: string): Promise<string[]> {
  const snapshot = await getDb()
    .collection("memberships")
    .where("role", "in", ["Admin", "Registrar", "Dean", "Program Head"])
    .get();

  return [...new Set(snapshot.docs
    .map((membership) => membership.data())
    .filter((membership) => {
      if (membership.status !== "accepted") return false;
      if (membership.role === "Admin" || membership.role === "Registrar") return true;
      return Boolean(department) && stringValue(membership.department) === department;
    })
    .map((membership) => stringValue(membership.userId))
    .filter((userId) => Boolean(userId) && userId !== excludedUserId))];
}

async function getRoomName(roomId: string): Promise<string> {
  if (!roomId) return "the selected room";
  const room = await getDb().collection("rooms").doc(roomId).get();
  return room.exists ? stringValue(room.data()?.name) || "the selected room" : "the selected room";
}

async function getDepartmentName(departmentCode: string): Promise<string> {
  if (!departmentCode) return "the assigned department";
  const departments = await getDb()
    .collection("departments")
    .where("code", "==", departmentCode)
    .limit(1)
    .get();
  if (departments.empty) return departmentCode;
  return stringValue(departments.docs[0].data().name) || departmentCode;
}

async function processReservationReminders(): Promise<number> {
  const db = getDb();
  const reservations = await db.collection("reservations").where("status", "==", "Approved").get();
  const now = Date.now();
  let remindersCreated = 0;

  for (const reservation of reservations.docs) {
    const data = reservation.data();
    const userId = stringValue(data.userId);
    const date = stringValue(data.date);
    const startTime = normalizeTime(stringValue(data.startTime));
    if (!userId || !date) continue;

    const startAt = new Date(`${date}T${startTime}:00+08:00`).getTime();
    const minutesUntilStart = Math.ceil((startAt - now) / (60 * 1000));
    if (minutesUntilStart <= 0 || minutesUntilStart > 15) continue;

    const roomName = await getRoomName(stringValue(data.roomId));
    remindersCreated += await createUserNotifications(
      [userId],
      {
        title: "Booking reminder",
        message: `Your reservation for ${roomName} starts in ${minutesUntilStart} minutes.`,
        type: "booking_reminder",
        sourceCollection: "reservations",
        sourceId: reservation.id,
      },
      `booking_reminder_${reservation.id}`
    );
  }

  return remindersCreated;
}

export const cancelReservationsForSchedule = onDocumentWritten(
  { document: "schedule/{scheduleId}", retry: true, timeoutSeconds: 540 },
  async event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || (before && scheduleSignature(before) === scheduleSignature(after))) return;
    const cancelled = await cancelScheduleReservations(
      getDb(), event.data!.after.ref, getManilaDateTime()
    );
    logger.info("Schedule reservation conflicts processed", { scheduleId: event.params.scheduleId, cancelled });
  }
);

export const notifyReservationStatusChanged = onDocumentUpdated(
  { document: "reservations/{reservationId}", retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const statusChanged = before.status !== after.status;
    const registrarRecommended = before.registrarRecommend !== true && after.registrarRecommend === true;
    const deanRecommended = before.deanRecommend !== true && after.deanRecommend === true;
    if (!statusChanged && !registrarRecommended && !deanRecommended) return;

    const userId = stringValue(after.userId);
    const roomName = await getRoomName(stringValue(after.roomId));
    const status = stringValue(after.status);
    let notification: Pick<NotificationPayload, "title" | "message" | "type"> | null = null;

    if (statusChanged && status === "Approved") {
      notification = {
        title: "Reservation approved",
        message: `Your reservation for ${roomName} has been approved.`,
        type: "booking_approved",
      };
    } else if (deanRecommended && status === "Pending") {
      notification = {
        title: "Dean recommended your reservation",
        message: `Your request for ${roomName} has been recommended by the Dean and is awaiting University Administrator approval.`,
        type: "booking_recommended",
      };
    } else if (registrarRecommended && status === "Pending") {
      notification = {
        title: "Registrar recommended your reservation",
        message: `Your request for ${roomName} has been recommended by the Registrar and is awaiting Dean review.`,
        type: "booking_recommended",
      };
    } else if (statusChanged && status === "Declined") {
      const reason = stringValue(after.declinedReason);
      notification = {
        title: "Reservation declined",
        message: reason
          ? `Your request for ${roomName} was declined. ${reason}`
          : `Your request for ${roomName} was declined.`,
        type: "booking_rejected",
      };
    } else if (statusChanged && status === "Cancelled") {
      const reason = stringValue(after.cancellationReason);
      notification = {
        title: "Reservation cancelled",
        message: `Your reservation for ${roomName} has been cancelled.${reason ? ` ${reason}` : ""}`,
        type: "booking_cancelled",
      };
    } else if (statusChanged && status === "Completed") {
      notification = {
        title: "Reservation completed",
        message: `Your session in ${roomName} has concluded.`,
        type: "booking_completed",
      };
    }

    if (notification && userId) {
      await createUserNotifications(
        [userId],
        {
          ...notification,
          sourceCollection: "reservations",
          sourceId: event.params.reservationId,
        },
        `${event.id}_${status}`
      );
    }

    const nextReviewer = status === "Pending" && deanRecommended && after.universityAdministratorRecommend !== true
      ? "University Administrator"
      : status === "Pending" && registrarRecommended && after.deanRecommend !== true
        ? "Dean" : null;
    if (!nextReviewer) return;

    const reviewers = await getReservationReviewerUserIds(nextReviewer, stringValue(after.department));
    await createUserNotifications(
      reviewers,
      {
        title: "Reservation ready for review",
        message: `${nextReviewer === "Dean" ? "The Registrar" : "The Dean"} recommended a reservation for ${roomName}. Review it in Manage Reservations.`,
        type: "booking_recommended",
        sourceCollection: "reservations",
        sourceId: event.params.reservationId,
      },
      `${event.id}_${nextReviewer === "Dean" ? "dean" : "university_administrator"}_review`
    );
  }
);

export const notifyBuildingCreated = onDocumentCreated("buildings/{buildingId}", async (event) => {
  const building = event.data?.data();
  if (!building) return;

  const recipients = await getUserIdsForRoles(["Instructor", "Dean", "Program Head"]);
  const buildingName = stringValue(building.name) || "A new building";
  await createUserNotifications(
    recipients,
    {
      title: "Building added",
      message: `${buildingName} has been added to the system.`,
      type: "building_added",
      sourceCollection: "buildings",
      sourceId: event.params.buildingId,
    },
    event.id
  );
});

export const notifyBuildingUpdated = onDocumentUpdated("buildings/{buildingId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.name === after.name && before.code === after.code) return;

  const recipients = await getUserIdsForRoles(["Instructor", "Dean", "Program Head"]);
  const buildingName = stringValue(after.name) || "A building";
  await createUserNotifications(
    recipients,
    {
      title: "Building updated",
      message: `${buildingName} details have been updated.`,
      type: "building_updated",
      sourceCollection: "buildings",
      sourceId: event.params.buildingId,
    },
    event.id
  );
});

export const notifyRoomCreated = onDocumentCreated("rooms/{roomId}", async (event) => {
  const room = event.data?.data();
  if (!room) return;

  const recipients = await getUserIdsForRoles(["Instructor", "Dean", "Program Head"]);
  const roomName = stringValue(room.name) || "A new room";
  await createUserNotifications(
    recipients,
    {
      title: "Room added",
      message: `${roomName} has been added and is now available for scheduling.`,
      type: "room_added",
      sourceCollection: "rooms",
      sourceId: event.params.roomId,
    },
    event.id
  );
});

export const notifyRoomUpdated = onDocumentUpdated("rooms/{roomId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;

  const recipients = await getUserIdsForRoles(["Instructor", "Dean", "Program Head"]);
  const roomName = stringValue(after.name) || "A room";
  const statusChanged = before.status !== after.status;
  const detailFields = [
    "buildingId", "name", "code", "type", "floor", "capacity", "description",
    "amenities", "availableDays", "startTime", "endTime", "minBookingMins", "maxBookingMins",
  ];
  const detailsChanged = detailFields.some((field) =>
    JSON.stringify(before[field]) !== JSON.stringify(after[field])
  ) || (
    before.image !== after.image && !timestampsEqual(before.updatedAt, after.updatedAt)
  );

  if (statusChanged) {
    const newStatus = stringValue(after.status) || "Unavailable";
    const statusMessage = newStatus === "Maintenance"
      ? `${roomName} has been placed under maintenance.`
      : `${roomName} is now ${newStatus.toLowerCase()} for reservations.`;
    await createUserNotifications(
      recipients,
      {
        title: `Room status changed: ${newStatus}`,
        message: statusMessage,
        type: "room_status_changed",
        sourceCollection: "rooms",
        sourceId: event.params.roomId,
      },
      `${event.id}_status`
    );
  }

  if (detailsChanged) {
    await createUserNotifications(
      recipients,
      {
        title: "Room updated",
        message: `${roomName} details have been updated.`,
        type: "room_updated",
        sourceCollection: "rooms",
        sourceId: event.params.roomId,
      },
      `${event.id}_details`
    );
  }
});

export const notifyMembershipUpdated = onDocumentUpdated(
  "memberships/{membershipId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const userId = stringValue(after.userId) || stringValue(before.userId);
    if (!userId) return;

    const beforeDepartment = stringValue(before.department);
    const afterDepartment = stringValue(after.department);
    const beforeRole = stringValue(before.role);
    const afterRole = stringValue(after.role);
    const departmentName = await getDepartmentName(afterDepartment || beforeDepartment);

    if (after.status === "pending" && before.status !== "pending" && afterDepartment) {
      await createUserNotifications(
        [userId],
        {
          title: "Department invitation",
          message: `You have been invited to join ${departmentName} as ${afterRole || "a member"}.`,
          type: "department_invited",
          sourceCollection: "memberships",
          sourceId: event.params.membershipId,
        },
        `${event.id}_invited`
      );
    }

    if (beforeDepartment && !afterDepartment) {
      await createUserNotifications(
        [userId],
        {
          title: "Removed from department",
          message: `You have been removed from the ${departmentName} department.`,
          type: "department_member_removed",
          sourceCollection: "memberships",
          sourceId: event.params.membershipId,
        },
        `${event.id}_removed`
      );
    } else if (
      afterDepartment &&
      after.status !== "pending" &&
      (beforeDepartment !== afterDepartment || (!before.userId && after.userId))
    ) {
      await createUserNotifications(
        [userId],
        {
          title: "Department assignment updated",
          message: `You have been assigned to ${departmentName} as ${afterRole || "a member"}.`,
          type: "member_department_assigned",
          sourceCollection: "memberships",
          sourceId: event.params.membershipId,
        },
        `${event.id}_assigned`
      );
    }

    if (beforeRole && afterRole && beforeRole !== afterRole) {
      await createUserNotifications(
        [userId],
        {
          title: "Role updated",
          message: `Your role${afterDepartment ? ` in ${afterDepartment}` : ""} has changed from ${beforeRole} to ${afterRole}.`,
          type: "member_role_changed",
          sourceCollection: "memberships",
          sourceId: event.params.membershipId,
        },
        `${event.id}_role`
      );
    }
  }
);

export const notifyMembershipCreated = onDocumentCreated(
  "memberships/{membershipId}",
  async (event) => {
    const membership = event.data?.data();
    if (!membership) return;

    const userId = stringValue(membership.userId);
    const department = stringValue(membership.department);
    const role = stringValue(membership.role);
    if (!userId || !department || membership.status === "pending") return;

    const departmentName = await getDepartmentName(department);
    await createUserNotifications(
      [userId],
      {
        title: "Department assignment updated",
        message: `You have been assigned to ${departmentName} as ${role || "a member"}.`,
        type: "member_department_assigned",
        sourceCollection: "memberships",
        sourceId: event.params.membershipId,
      },
      `${event.id}_assigned`
    );
  }
);

export const notifyInvitationAccepted = onDocumentUpdated(
  "invitations/{invitationId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === "accepted" || after.status !== "accepted") return;

    const membershipId = stringValue(after.membershipId);
    if (!membershipId) return;

    const membership = await getDb().collection("memberships").doc(membershipId).get();
    if (!membership.exists) return;
    const membershipData = membership.data() || {};
    const acceptedUserId = stringValue(membershipData.userId);
    const department = stringValue(membershipData.department);
    const role = stringValue(membershipData.role) || "Member";
    const firstName = stringValue(membershipData.firstName).trim();
    const surname = stringValue(membershipData.surname).trim();
    const memberName = firstName && surname ? `${surname}, ${firstName}`
      : stringValue(membershipData.fullName) || stringValue(membershipData.email) || "A user";
    const recipients = await getManagerUserIds(department, acceptedUserId);
    const isReactivation = after.isReactivation === true;

    await createUserNotifications(
      recipients,
      {
        title: isReactivation ? "Re-invitation accepted" : "Invitation accepted",
        message: isReactivation
          ? `${memberName} accepted the re-invitation and reactivated their account.`
          : `${memberName} accepted the invitation${department ? ` to join ${department} as ${role}` : ` as ${role}`}.`,
        type: isReactivation
          ? "department_reinvitation_accepted"
          : "department_invitation_accepted",
        sourceCollection: "invitations",
        sourceId: event.params.invitationId,
      },
      event.id
    );
  }
);

export const notifyAcademicYearUpdated = onDocumentUpdated(
  "academicYears/{academicYearId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const recipients = await getUserIdsForRoles(["Admin", "Registrar", "Dean", "Program Head", "Instructor"]);
    const academicYear = stringValue(after.academicYear) || "the selected academic year";

    if (before.isActive !== true && after.isActive === true) {
      await createUserNotifications(
        recipients,
        {
          title: "Active academic year changed",
          message: `The active academic year is now ${academicYear}.`,
          type: "academic_year_changed",
          sourceCollection: "academicYears",
          sourceId: event.params.academicYearId,
        },
        `${event.id}_active`
      );
    }

    if (after.isActive !== true) return;

    for (const semester of [
      { key: "sem1", label: "1st Semester" },
      { key: "sem2", label: "2nd Semester" },
    ]) {
      const previousPhase = stringValue(before[semester.key]?.phase);
      const nextPhase = stringValue(after[semester.key]?.phase);
      if (!nextPhase || previousPhase === nextPhase) continue;

      await createUserNotifications(
        recipients,
        {
          title: `Semester phase changed: ${nextPhase}`,
          message: `The ${semester.label} phase for A.Y. ${academicYear} changed from ${previousPhase || "Not Set"} to ${nextPhase}.`,
          type: "academic_phase_changed",
          sourceCollection: "academicYears",
          sourceId: event.params.academicYearId,
        },
        `${event.id}_${semester.key}`
      );
    }
  }
);
