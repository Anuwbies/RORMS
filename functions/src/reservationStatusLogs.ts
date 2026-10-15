import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { validateExtendedReservationApproval } from "./extendedReservationApproval";

const STATUSES = ["Pending", "Recommending Approval", "Approved", "Declined", "Cancelled", "Completed"] as const;
type ReservationStatus = typeof STATUSES[number];

interface StatusChangeRequest {
  reservationId: string;
  status: ReservationStatus;
  expectedStatus: ReservationStatus;
}

function isStatus(value: unknown): value is ReservationStatus {
  return typeof value === "string" && STATUSES.some(status => status === value);
}

function parseRequest(value: unknown): StatusChangeRequest {
  if (!value || typeof value !== "object") {
    throw new HttpsError("invalid-argument", "A reservation status change is required.");
  }
  const data = value as Record<string, unknown>;
  if (typeof data.reservationId !== "string" || !data.reservationId.trim()
    || data.reservationId.includes("/") || data.reservationId.length > 1500
    || !isStatus(data.status) || !isStatus(data.expectedStatus)) {
    throw new HttpsError("invalid-argument", "A valid reservation ID and statuses are required.");
  }
  return { reservationId: data.reservationId, status: data.status, expectedStatus: data.expectedStatus };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function actorName(profile: Record<string, unknown>, member: Record<string, unknown>, uid: string): string {
  const structured = [profile, member].find(data => text(data.firstName) && text(data.surname));
  if (structured) return `${text(structured.surname)}, ${text(structured.firstName)}`;
  return text(profile.fullName) || text(member.fullName) || uid;
}

/** The callable supplies the authenticated UID; names and roles come from server reads. */
export async function changeReservationStatus(
  db: Firestore, uid: string | undefined, input: unknown
): Promise<{ changed: boolean; logId: string | null }> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before changing a reservation status.");
  const data = parseRequest(input);
  const reservationRef = db.collection("reservations").doc(data.reservationId);
  // Reuse this reference if Firestore retries the transaction.
  const logRef = db.collection("logs").doc();
  const membershipQuery = db.collection("memberships").where("userId", "==", uid);
  const profileRef = db.collection("users").doc(uid);

  return db.runTransaction(async transaction => {
    const [reservationSnapshot, memberships, profileSnapshot] = await Promise.all([
      transaction.get(reservationRef), transaction.get(membershipQuery), transaction.get(profileRef),
    ]);
    const reservation = reservationSnapshot.data();
    if (!reservation) throw new HttpsError("not-found", "This reservation no longer exists.");
    const membership = memberships.docs.find(snapshot => {
      const member = snapshot.data();
      return member.status === "accepted" && (data.status === "Recommending Approval"
        ? ["Dean", "Program Head"].includes(member.role) && !!text(reservation.department)
          && text(member.department) === text(reservation.department)
        : data.status === "Approved"
          ? ["Registrar", "University Administrator"].includes(member.role)
          : ["Admin", "Registrar", "University Administrator"].includes(member.role));
    });
    const profile = profileSnapshot.data() || {};
    if (!membership || profile.isActive === false) {
      throw new HttpsError("permission-denied", "Your role or department cannot perform this reservation action.");
    }
    if (!isStatus(reservation.status)) {
      throw new HttpsError("failed-precondition", "This reservation has an invalid status. Reload the page before continuing.");
    }
    // A repeated request must not create a second event or overwrite the timestamp.
    if (reservation.status === data.status) return { changed: false, logId: null };
    if (reservation.status !== data.expectedStatus) {
      throw new HttpsError("failed-precondition", "The reservation status changed. Reopen the reservation and try again.");
    }

    if (data.status === "Recommending Approval" && reservation.status !== "Pending") {
      throw new HttpsError("failed-precondition", "Only pending requests can be recommended for approval.");
    }
    if (data.status === "Approved" && reservation.status !== "Recommending Approval") {
      throw new HttpsError("failed-precondition", "A department Dean or Program Head must recommend approval first.");
    }
    if (reservation.status === "Pending" && data.status !== "Recommending Approval") {
      throw new HttpsError("failed-precondition", "This request is awaiting department review.");
    }

    if (data.status === "Approved" && reservation.requestType === "Extended") {
      await validateExtendedReservationApproval(db, transaction, reservationRef.id, reservation);
    }

    const member = membership.data();
    transaction.update(reservationRef, {
      status: data.status, updatedAt: FieldValue.serverTimestamp(),
      ...(data.status === "Recommending Approval" ? {
        recommendedBy: uid, recommendedAt: FieldValue.serverTimestamp(),
        recommendedByRole: member.role,
      } : {}),
    });
    transaction.create(logRef, {
      action: "reservation.status_changed",
      targetCollection: "reservations",
      targetId: reservationRef.id,
      actorId: uid,
      actorName: actorName(profile, member, uid),
      actorRole: member.role,
      membershipId: membership.id,
      changes: { status: { before: reservation.status, after: data.status } },
      createdAt: FieldValue.serverTimestamp(),
      source: "user",
      roomId: text(reservation.roomId),
      buildingId: text(reservation.buildingId),
      requesterId: text(reservation.userId),
      department: text(reservation.department),
      reservationDate: text(reservation.date),
    });
    return { changed: true, logId: logRef.id };
  });
}
