import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { validateExtendedReservationApproval } from "./extendedReservationApproval";

const STATUSES = ["Pending", "Approved", "Declined", "Cancelled", "Completed"] as const;
type ReservationStatus = typeof STATUSES[number];
const ADMIN_REVIEW_STATES = ["deanPending", "deanApproved", "deanDeclined", "registrarApproved", "registrarDeclined", "administratorApproved", "administratorDeclined"] as const;
type AdminReviewState = typeof ADMIN_REVIEW_STATES[number];
interface ExpectedReview {
  registrar: boolean;
  dean: boolean;
  universityAdministrator: boolean;
  declinedByRole: string | null;
}

interface StatusChangeRequest {
  reservationId: string;
  status: ReservationStatus;
  expectedStatus: ReservationStatus;
  recommendation?: "Registrar" | "Dean";
  declinedReason?: string;
  manualOverride?: boolean;
  adminReviewState?: AdminReviewState;
  expectedReview?: ExpectedReview;
}

function isStatus(value: unknown): value is ReservationStatus {
  return typeof value === "string" && STATUSES.some(status => status === value);
}

function isAdminReviewState(value: unknown): value is AdminReviewState {
  return typeof value === "string" && ADMIN_REVIEW_STATES.some(state => state === value);
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
    || (data.status !== "Declined" && data.declinedReason !== undefined)
    || (data.manualOverride !== undefined && typeof data.manualOverride !== "boolean")
    || (data.adminReviewState !== undefined && !isAdminReviewState(data.adminReviewState))
    || (data.adminReviewState !== undefined && (data.manualOverride !== undefined || data.recommendation !== undefined))
    || (data.adminReviewState === undefined && data.expectedReview !== undefined)
    || (data.adminReviewState !== undefined && (!data.expectedReview || typeof data.expectedReview !== "object"
      || typeof (data.expectedReview as Record<string, unknown>).registrar !== "boolean"
      || typeof (data.expectedReview as Record<string, unknown>).dean !== "boolean"
      || typeof (data.expectedReview as Record<string, unknown>).universityAdministrator !== "boolean"
      || ((data.expectedReview as Record<string, unknown>).declinedByRole !== null
        && typeof (data.expectedReview as Record<string, unknown>).declinedByRole !== "string")))) {
    throw new HttpsError("invalid-argument", "A valid reservation ID and statuses are required.");
  }
  return {
    reservationId: data.reservationId, status: data.status, expectedStatus: data.expectedStatus,
    recommendation: data.recommendation as StatusChangeRequest["recommendation"],
    declinedReason: data.status === "Declined" ? (data.declinedReason as string).trim() : undefined,
    manualOverride: data.manualOverride as boolean | undefined,
    adminReviewState: data.adminReviewState as AdminReviewState | undefined,
    expectedReview: data.expectedReview as ExpectedReview | undefined,
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
      return member.status === "accepted" && (data.manualOverride === true
        ? member.role === "University Administrator"
        : data.adminReviewState
          ? member.role === "Admin"
        : data.recommendation === "Registrar"
        ? member.role === "Registrar"
        : data.recommendation === "Dean"
          ? member.role === "Dean" && !!text(reservation.department)
            && text(member.department) === text(reservation.department)
          : data.status === "Approved"
            ? member.role === "University Administrator"
            : data.status === "Declined"
              ? member.role === "Registrar" || member.role === "University Administrator"
                || (member.role === "Dean" && !!text(reservation.department)
                  && text(member.department) === text(reservation.department))
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

    if (data.adminReviewState) {
      const expected = data.expectedReview!;
      const beforeRegistrar = reservation.registrarRecommend === true;
      const beforeDean = reservation.deanRecommend === true;
      const beforeAdministrator = reservation.universityAdministratorRecommend === true;
      const beforeDeclinedByRole = text(reservation.declinedByRole) || null;
      if (beforeRegistrar !== expected.registrar || beforeDean !== expected.dean
        || beforeAdministrator !== expected.universityAdministrator
        || beforeDeclinedByRole !== expected.declinedByRole) {
        throw new HttpsError("failed-precondition", "The reservation review changed. Reopen it and try again.");
      }
      const allowedStates: readonly AdminReviewState[] = !beforeDean
        ? ["deanPending", "deanApproved", "deanDeclined"]
        : !beforeRegistrar
          ? ["deanApproved", "registrarApproved", "registrarDeclined"]
          : ["registrarApproved", "administratorApproved", "administratorDeclined"];
      if (!allowedStates.includes(data.adminReviewState)) {
        throw new HttpsError("failed-precondition", "Only the reservation's current review step can be edited.");
      }
      const nextDean = !["deanPending", "deanDeclined"].includes(data.adminReviewState);
      const nextRegistrar = ["registrarApproved", "administratorApproved", "administratorDeclined"].includes(data.adminReviewState);
      const nextAdministrator = data.adminReviewState === "administratorApproved";
      const registrarRecommend = nextRegistrar;
      const deanRecommend = nextDean;
      const universityAdministratorRecommend = nextAdministrator;
      const declinedByRole = data.adminReviewState === "deanDeclined" ? "Dean"
        : data.adminReviewState === "registrarDeclined" ? "Registrar"
          : data.adminReviewState === "administratorDeclined" ? "University Administrator" : null;
      const nextStatus: ReservationStatus = data.adminReviewState === "administratorApproved" ? "Approved"
        : declinedByRole ? "Declined" : "Pending";
      if (data.status !== nextStatus) {
        throw new HttpsError("invalid-argument", "The review state does not match the requested status.");
      }
      const previousReason = text(reservation.declinedReason);
      const nextReason = declinedByRole ? data.declinedReason! : "";
      if (reservation.status === nextStatus && beforeRegistrar === registrarRecommend
        && beforeDean === deanRecommend && beforeAdministrator === universityAdministratorRecommend
        && beforeDeclinedByRole === declinedByRole && previousReason === nextReason) {
        return { changed: false, logId: null };
      }
      if (nextStatus === "Approved" && reservation.requestType === "Extended") {
        await validateExtendedReservationApproval(db, transaction, reservationRef.id, reservation);
      }
      const changes: Record<string, { before: unknown; after: unknown }> = {
        status: { before: reservation.status, after: nextStatus },
      };
      if (beforeRegistrar !== registrarRecommend) changes.registrarRecommend = { before: beforeRegistrar, after: registrarRecommend };
      if (beforeDean !== deanRecommend) changes.deanRecommend = { before: beforeDean, after: deanRecommend };
      if (beforeAdministrator !== universityAdministratorRecommend) changes.universityAdministratorRecommend = { before: beforeAdministrator, after: universityAdministratorRecommend };
      if (previousReason !== nextReason) changes.declinedReason = { before: previousReason, after: nextReason };
      if (beforeDeclinedByRole !== declinedByRole) changes.declinedByRole = { before: beforeDeclinedByRole, after: declinedByRole };
      const member = membership.data();
      transaction.update(reservationRef, {
        status: nextStatus,
        registrarRecommend,
        deanRecommend,
        universityAdministratorRecommend,
        registrarRecommendedBy: registrarRecommend ? beforeRegistrar ? reservation.registrarRecommendedBy || uid : uid : FieldValue.delete(),
        registrarRecommendedAt: registrarRecommend ? beforeRegistrar ? reservation.registrarRecommendedAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp() : FieldValue.delete(),
        recommendedBy: deanRecommend ? beforeDean ? reservation.recommendedBy || uid : uid : FieldValue.delete(),
        recommendedByRole: deanRecommend ? beforeDean ? reservation.recommendedByRole || "Admin" : "Admin" : FieldValue.delete(),
        recommendedAt: deanRecommend ? beforeDean ? reservation.recommendedAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp() : FieldValue.delete(),
        declinedReason: declinedByRole ? nextReason : FieldValue.delete(),
        declinedByRole: declinedByRole || FieldValue.delete(),
        declinedBy: declinedByRole ? uid : FieldValue.delete(),
        declinedAt: declinedByRole ? FieldValue.serverTimestamp() : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
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
        createdAt: FieldValue.serverTimestamp(),
        source: "user",
        roomId: text(reservation.roomId),
        buildingId: text(reservation.buildingId),
        requesterId: text(reservation.userId),
        department: text(reservation.department),
        reservationDate: text(reservation.date),
      });
      return { changed: true, logId: logRef.id };
    }

    const canReview = reservation.status === "Pending";
    const registrarRecommended = reservation.registrarRecommend === true;
    const deanRecommended = reservation.deanRecommend === true;
    const administratorManualEdit = data.manualOverride === true && !data.recommendation
      && membership.data().role === "University Administrator" && registrarRecommended && deanRecommended
      && ((reservation.status === "Approved" && data.status === "Declined")
        || (reservation.status === "Declined" && !reservation.autoProcessed
          && (reservation.declinedByRole === "University Administrator"
            || (!reservation.declinedByRole && reservation.universityAdministratorRecommend !== true))
          && (data.status === "Approved" || data.status === "Declined")));
    if (data.manualOverride === true && !administratorManualEdit) {
      throw new HttpsError("failed-precondition", "Only a University Administrator can edit their final decision.");
    }
    if (data.recommendation === "Registrar") {
      if (!canReview || data.status !== reservation.status || !deanRecommended) {
        throw new HttpsError("failed-precondition", "A Dean must recommend this request before the Registrar.");
      }
      if (registrarRecommended) return { changed: false, logId: null };
    } else if (data.recommendation === "Dean") {
      if (!canReview || data.status !== "Pending") {
        throw new HttpsError("failed-precondition", "Only open requests awaiting Dean review can receive a Dean recommendation.");
      }
      if (deanRecommended) return { changed: false, logId: null };
    } else {
      if (reservation.status === data.status
        && (!administratorManualEdit || data.declinedReason === text(reservation.declinedReason))) {
        return { changed: false, logId: null };
      }
      if (administratorManualEdit) {
        // Both prior recommendations remain in place when the final decision changes.
      } else if (data.status === "Declined" && membership.data().role === "Registrar") {
        if (!canReview || !deanRecommended || registrarRecommended) {
          throw new HttpsError("failed-precondition", "The Registrar can decline only after Dean recommendation and before Registrar recommendation.");
        }
      } else if (data.status === "Declined" && membership.data().role === "Dean") {
        if (!canReview || deanRecommended) {
          throw new HttpsError("failed-precondition", "The Dean can decline only before recommending an open request.");
        }
      } else if (data.status === "Approved" || data.status === "Declined") {
        if (!canReview || !registrarRecommended || !deanRecommended) {
          throw new HttpsError("failed-precondition", "Dean and Registrar recommendations are required before University Administrator review.");
        }
      } else if (data.status === "Cancelled") {
        if (reservation.status !== "Approved"
          && !(reservation.status === "Pending" && (membership.data().role === "Registrar"
            || (membership.data().role === "Admin" && registrarRecommended && deanRecommended)))) {
          throw new HttpsError("failed-precondition", "Only recommended or approved requests can be cancelled here.");
        }
      } else if (data.status === "Completed") {
        if (reservation.status !== "Approved") {
          throw new HttpsError("failed-precondition", "Only approved requests can be completed.");
        }
      } else {
        throw new HttpsError("failed-precondition", "Use the Dean and Registrar recommendation steps before approval.");
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
    if (data.recommendation === "Dean" && registrarRecommended) changes.registrarRecommend = { before: true, after: false };
    if (data.status === "Declined" && member.role === "Dean" && registrarRecommended) {
      changes.registrarRecommend = { before: true, after: false };
    }
    if (data.recommendation === "Dean") changes.deanRecommend = { before: deanRecommended, after: true };
    if ((data.status === "Approved" || data.status === "Declined") && membership.data().role === "University Administrator") {
      changes.universityAdministratorRecommend = { before: reservation.universityAdministratorRecommend === true, after: data.status === "Approved" };
    }
    if (data.status === "Declined" && data.declinedReason) changes.declinedReason = { before: text(reservation.declinedReason), after: data.declinedReason };
    transaction.update(reservationRef, {
      status: data.status, updatedAt: FieldValue.serverTimestamp(),
      ...(data.status === "Declined" ? {
        declinedReason: data.declinedReason,
        declinedByRole: member.role,
        declinedBy: uid,
        declinedAt: FieldValue.serverTimestamp(),
        ...(member.role === "Dean" && registrarRecommended ? {
          registrarRecommend: false,
          registrarRecommendedBy: FieldValue.delete(),
          registrarRecommendedAt: FieldValue.delete(),
        } : {}),
      } : {}),
      ...(data.status === "Approved" && reservation.status === "Declined" ? {
        declinedReason: FieldValue.delete(), declinedByRole: FieldValue.delete(),
        declinedBy: FieldValue.delete(), declinedAt: FieldValue.delete(),
      } : {}),
      ...(data.recommendation === "Registrar" ? {
        registrarRecommend: true, registrarRecommendedBy: uid,
        registrarRecommendedAt: FieldValue.serverTimestamp(),
      } : {}),
      ...(data.recommendation === "Dean" ? {
        deanRecommend: true,
        recommendedBy: uid, recommendedAt: FieldValue.serverTimestamp(),
        recommendedByRole: member.role,
        ...(registrarRecommended ? {
          registrarRecommend: false,
          registrarRecommendedBy: FieldValue.delete(),
          registrarRecommendedAt: FieldValue.delete(),
        } : {}),
      } : {}),
      ...((data.status === "Approved" || data.status === "Declined") && member.role === "University Administrator"
        ? { universityAdministratorRecommend: data.status === "Approved" } : {}),
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
