import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

let _db: admin.firestore.Firestore | null = null;

function getDb(): admin.firestore.Firestore {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  if (!_db) {
    _db = admin.firestore();
  }
  return _db;
}

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
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }

    try {
      await admin.auth().getUserByEmail(email);
    } catch (error: unknown) {
      if (isUserNotFoundError(error)) {
        // Return the same response for unknown addresses to avoid email enumeration.
        return { success: true };
      }
      throw error;
    }

    const generatedResetLink = await admin.auth().generatePasswordResetLink(email);
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
 * Scheduled Cloud Function (Runs automatically every 5 minutes in Asia/Manila timezone).
 */
export const autoUpdateReservationStatus = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Asia/Manila",
    retryCount: 3,
  },
  async () => {
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
      const result = await processReservationStatusUpdates();
      res.status(200).json({
        success: true,
        message: "Reservation statuses successfully processed.",
        result,
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
