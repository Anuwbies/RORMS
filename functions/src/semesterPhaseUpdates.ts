import { FieldPath, type Firestore, type Query } from "firebase-admin/firestore";
import { semesterRange, validDate } from "./reservationScheduleConflicts";

type SemesterPhaseUpdates = Partial<Record<"sem1.phase" | "sem2.phase", "Ended">>;

export function expiredSemesterPhaseUpdates(year: Record<string, unknown>, today: string): SemesterPhaseUpdates {
  if (!validDate(today)) throw new Error("A valid current date is required to end semesters.");
  const updates: SemesterPhaseUpdates = {};
  for (const key of ["sem1", "sem2"] as const) {
    const semester = year[key];
    if (!semester || typeof semester !== "object" || Array.isArray(semester)) continue;
    const phase = (semester as Record<string, unknown>).phase;
    if (typeof phase !== "string" || !["Closed", "Drafting", "Plotting", "Revision", "Final"].includes(phase)) continue;
    const range = semesterRange({ semesterKey: key }, year);
    if (range && range.end < today) updates[`${key}.phase`] = "Ended";
  }
  return updates;
}

export async function endExpiredSemesters(db: Firestore, today: string): Promise<{
  yearsEvaluated: number;
  semestersEnded: number;
}> {
  if (!validDate(today)) throw new Error("A valid current date is required to end semesters.");
  const pageSize = 100;
  const years = db.collection("academicYears").orderBy(FieldPath.documentId());
  let cursor: string | undefined;
  let yearsEvaluated = 0;
  let semestersEnded = 0;

  while (true) {
    let page: Query = years.limit(pageSize);
    if (cursor) page = page.startAfter(cursor);
    // Read and update each page atomically so an edited end date cannot be
    // overwritten by a stale scheduled run. Retries re-evaluate current values.
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(page);
      let ended = 0;
      for (const year of snapshot.docs) {
        const updates = expiredSemesterPhaseUpdates(year.data(), today);
        const count = Object.keys(updates).length;
        if (count > 0) {
          transaction.update(year.ref, updates);
          ended += count;
        }
      }
      return { size: snapshot.size, cursor: snapshot.docs[snapshot.size - 1]?.id, ended };
    });

    yearsEvaluated += result.size;
    semestersEnded += result.ended;
    if (result.size < pageSize) break;
    cursor = result.cursor;
  }

  return { yearsEvaluated, semestersEnded };
}
