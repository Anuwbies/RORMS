import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { validateExtendedReservationApproval } from "./extendedReservationApproval";

const STATUSES = ["Pending", "Recommending Approval", "Approved", "Declined", "Cancelled", "Completed"] as const;
type ReservationStatus = typeof STATUSES[number];

interface StatusChangeRequest {
  reservationId: string;
  status: ReservationStatus;
  expectedStatus: ReservationStatus;
  recommendation?: "Registrar" | "Dean";
  declinedReason?: string;
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
    || !isStatus(data.status) || !isStatus(data.expectedStatus)
    || (data.recommendation !== undefined && data.recommendation !== "Registrar" && data.recommendation !== "Dean")
    || (data.status === "Declined" && (typeof data.declinedReason !== "string" || !data.declinedReason.trim() || data.declinedReason.trim().length > 500))
    || (data.status !== "Declined" && data.declinedReason !== undefined)) {
    throw new HttpsError("invalid-argument", "A valid reservation ID and statuses are required.");
  }
  return {
    reservationId: data.reservationId, status: data.status, expectedStatus: data.expectedStatus,
    recommendation: data.recommendation as StatusChangeRequest["recommendation"],
    declinedReason: data.status === "Declined" ? (data.declinedReason as string).trim() : undefined,
  };
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
      return member.status === "accepted" && (data.recommendation === "Registrar"
        ? member.role === "Registrar"
        : data.recommendation === "Dean"
          ? member.role === "Dean" && !!text(reservation.department)
            && text(member.department) === text(reservation.department)
          : data.status === "Approved"
            ? member.role === "University Administrator"
            : data.status === "Declined"
              ? member.role === "Registrar" || member.role === "University Administrator"
            : ["Admin", "Registrar", "University Administrator"].includes(member.role));
    });
    const profile = profileSnapshot.data() || {};
    if (!membership || profile.isActive === false) {
      throw new HttpsError("permission-denied", "Your role or department cannot perform this reservation action.");
    }
    if (!isStatus(reservation.status)) {
      throw new HttpsError("failed-precondition", "This reservation has an invalid status. Reload the page before continuing.");
    }
    if (reservation.status !== data.expectedStatus) {
      throw new HttpsError("failed-precondition", "The reservation status changed. Reopen the reservation and try again.");
    }

    const canReview = reservation.status === "Pending" || reservation.status === "Recommending Approval";
    const registrarRecommended = reservation.registrarRecommend === true;
    const deanRecommended = reservation.deanRecommend === true;
    if (data.recommendation === "Registrar") {
      if (!canReview || data.status !== reservation.status) {
        throw new HttpsError("failed-precondition", "Only open requests can receive a Registrar recommendation.");
      }
      if (registrarRecommended) return { changed: false, logId: null };
    } else if (data.recommendation === "Dean") {
      if (!canReview || data.status !== "Recommending Approval" || !registrarRecommended) {
        throw new HttpsError("failed-precondition", "A Registrar must recommend this request before the Dean.");
      }
      if (deanRecommended) return { changed: false, logId: null };
    } else {
      if (reservation.status === data.status) return { changed: false, logId: null };
      if (data.status === "Declined" && membership.data().role === "Registrar") {
        if (!canReview || registrarRecommended) {
          throw new HttpsError("failed-precondition", "The Registrar can decline only before recommending an open request.");
        }
      } else if (data.status === "Approved" || data.status === "Declined") {
        if (reservation.status !== "Recommending Approval" || !registrarRecommended || !deanRecommended) {
          throw new HttpsError("failed-precondition", "Registrar and Dean recommendations are required before University Administrator review.");
        }
      } else if (data.status === "Cancelled") {
        if (reservation.status !== "Recommending Approval" && reservation.status !== "Approved"
          && !(reservation.status === "Pending" && membership.data().role === "Registrar")) {
          throw new HttpsError("failed-precondition", "Only recommended or approved requests can be cancelled here.");
        }
      } else if (data.status === "Completed") {
        if (reservation.status !== "Approved") {
          throw new HttpsError("failed-precondition", "Only approved requests can be completed.");
        }
      } else {
        throw new HttpsError("failed-precondition", "Use the Registrar and Dean recommendation steps before approval.");
      }
    }

    if (data.status === "Approved" && reservation.requestType === "Extended") {
      await validateExtendedReservationApproval(db, transaction, reservationRef.id, reservation);
    }

    const member = membership.data();
    const nextStatus = data.recommendation === "Registrar" ? reservation.status : data.status;
    const changes: Record<string, { before: unknown; after: unknown }> = {
      status: { before: reservation.status, after: nextStatus },
    };
    if (data.recommendation === "Registrar") changes.registrarRecommend = { before: registrarRecommended, after: true };
    if (data.recommendation === "Registrar" && deanRecommended) changes.deanRecommend = { before: true, after: false };
    if (data.recommendation === "Dean") changes.deanRecommend = { before: deanRecommended, after: true };
    if (data.status === "Approved" && !data.recommendation) changes.universityAdministratorRecommend = { before: reservation.universityAdministratorRecommend === true, after: true };
    if (data.status === "Declined" && data.declinedReason) changes.declinedReason = { before: text(reservation.declinedReason), after: data.declinedReason };
    transaction.update(reservationRef, {
      status: data.status, updatedAt: FieldValue.serverTimestamp(),
      ...(data.status === "Declined" ? { declinedReason: data.declinedReason } : {}),
      ...(data.recommendation === "Registrar" ? {
        registrarRecommend: true, registrarRecommendedBy: uid,
        registrarRecommendedAt: FieldValue.serverTimestamp(),
        ...(deanRecommended ? { deanRecommend: false } : {}),
      } : {}),
      ...(data.recommendation === "Dean" ? {
        deanRecommend: true,
        recommendedBy: uid, recommendedAt: FieldValue.serverTimestamp(),
        recommendedByRole: member.role,
      } : {}),
      ...(data.status === "Approved" && member.role === "University Administrator" ? { universityAdministratorRecommend: true } : {}),
    });
    transaction.create(logRef, {
      action: "reservation.status_changed",
      targetCollection: "reservations",
      targetId: reservationRef.id,
      actorId: uid,
      actorName: actorName(profile, member, uid),
      actorRole: member.role,
      membershipId: membership.id,
      changes,
      ...(data.recommendation ? { reviewStage: data.recommendation } : {}),
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
