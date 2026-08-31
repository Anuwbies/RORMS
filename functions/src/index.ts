import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
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
