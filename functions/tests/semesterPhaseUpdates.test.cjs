const { test } = require("node:test");
const assert = require("node:assert/strict");
const { expiredSemesterPhaseUpdates, endExpiredSemesters } = require("../lib/semesterPhaseUpdates");

const year = {
  academicYear: "2026 - 2027",
  isActive: true,
  sem1: { startDate: "2026-07-06", endDate: "2026-10-31", phase: "Final" },
  sem2: { startDate: "2026-11-03", endDate: "2027-03-15", phase: "Drafting" },
};

test("the end date remains inclusive and the next day ends only the expired semester", () => {
  assert.deepEqual(expiredSemesterPhaseUpdates(year, "2026-10-30"), {});
  assert.deepEqual(expiredSemesterPhaseUpdates(year, "2026-10-31"), {});
  assert.deepEqual(expiredSemesterPhaseUpdates(year, "2026-11-01"), { "sem1.phase": "Ended" });
  assert.deepEqual(expiredSemesterPhaseUpdates(year, "2027-03-15"), { "sem1.phase": "Ended" });
  assert.deepEqual(expiredSemesterPhaseUpdates(year, "2027-03-16"), { "sem1.phase": "Ended", "sem2.phase": "Ended" });
});

test("all defined non-ended phases and historical academic years are eligible", () => {
  for (const phase of ["Closed", "Drafting", "Plotting", "Revision", "Final"]) {
    assert.deepEqual(expiredSemesterPhaseUpdates({ ...year, isActive: false, sem1: { ...year.sem1, phase } }, "2026-11-01"), { "sem1.phase": "Ended" });
  }
  for (const phase of ["Ended", "Unknown", "", undefined]) {
    assert.deepEqual(expiredSemesterPhaseUpdates({ sem1: { ...year.sem1, phase } }, "2026-11-01"), {});
  }
});

test("legacy month ranges use the actual last day, including leap years", () => {
  const legacy = { sem1: { startMonth: "January", startYear: 2028, endMonth: "February", endYear: 2028, phase: "Final" } };
  assert.deepEqual(expiredSemesterPhaseUpdates(legacy, "2028-02-29"), {});
  assert.deepEqual(expiredSemesterPhaseUpdates(legacy, "2028-03-01"), { "sem1.phase": "Ended" });
  assert.deepEqual(expiredSemesterPhaseUpdates({ sem1: { ...legacy.sem1, startYear: 2027, endYear: 2027 } }, "2027-03-01"), { "sem1.phase": "Ended" });
});

test("exact dates take precedence over legacy months and invalid exact dates never fall back", () => {
  const semester = { ...year.sem1, startMonth: "July", startYear: 2026, endMonth: "October", endYear: 2026, endDate: "2026-10-25" };
  assert.deepEqual(expiredSemesterPhaseUpdates({ sem1: semester }, "2026-10-26"), { "sem1.phase": "Ended" });
  for (const endDate of ["2026-02-30", "2026-13-01", "", null, "2026-10-1"]) {
    assert.deepEqual(expiredSemesterPhaseUpdates({ sem1: { ...semester, endDate } }, "2027-01-01"), {});
  }
});

test("missing, malformed, and inverted date ranges are skipped safely", () => {
  for (const sem1 of [null, [], "Final", {}, { phase: "Final" }, { ...year.sem1, startDate: "2026-11-03" }, { ...year.sem1, startDate: "2026-02-30" }]) {
    assert.deepEqual(expiredSemesterPhaseUpdates({ sem1 }, "2027-01-01"), {});
  }
  assert.throws(() => expiredSemesterPhaseUpdates(year, "2026-02-30"), /valid current date/);
});

function fakeFirestore(rows) {
  const documents = new Map(rows.map((row, index) => [String(index).padStart(4, "0"), structuredClone(row)]));
  const fake = { documents, writes: 0, transactions: 0, beforeRead: undefined };
  const query = (cursor = "", pageSize = 100) => ({
    orderBy: () => query(cursor, pageSize),
    limit: value => query(cursor, value),
    startAfter: value => query(value, pageSize),
    read: () => {
      const docs = [...documents.keys()].sort().filter(id => id > cursor).slice(0, pageSize)
        .map(id => ({ id, ref: { id }, data: () => documents.get(id) }));
      return { docs, size: docs.length };
    },
  });
  fake.db = {
    collection: name => { assert.equal(name, "academicYears"); return query(); },
    runTransaction: async callback => {
      fake.transactions++;
      fake.beforeRead?.();
      const writes = [];
      const result = await callback({
        get: async page => page.read(),
        update: (ref, updates) => writes.push([ref.id, updates]),
      });
      for (const [id, updates] of writes) {
        const data = documents.get(id);
        for (const [path, value] of Object.entries(updates)) {
          const [key, field] = path.split(".");
          data[key][field] = value;
        }
        fake.writes++;
      }
      return result;
    },
  };
  return fake;
}

test("updates only expired phase fields, preserves dates/active year, and repeating creates no writes", async () => {
  const fake = fakeFirestore([year, { ...year, isActive: false }]);
  assert.deepEqual(await endExpiredSemesters(fake.db, "2026-11-01"), { yearsEvaluated: 2, semestersEnded: 2 });
  assert.deepEqual(fake.documents.get("0000"), { ...year, sem1: { ...year.sem1, phase: "Ended" } });
  assert.equal(fake.documents.get("0001").isActive, false);
  assert.equal(fake.writes, 2);
  assert.deepEqual(await endExpiredSemesters(fake.db, "2026-11-01"), { yearsEvaluated: 2, semestersEnded: 0 });
  assert.equal(fake.writes, 2);
});

test("all pages are processed, with both semesters handled and no 100-year limit", async () => {
  const fake = fakeFirestore(Array.from({ length: 205 }, () => year));
  assert.deepEqual(await endExpiredSemesters(fake.db, "2027-03-16"), { yearsEvaluated: 205, semestersEnded: 410 });
  assert.equal(fake.transactions, 3);
  assert.equal(fake.writes, 205);
});

test("current dates are evaluated in the transaction, including an extended end date", async () => {
  const fake = fakeFirestore([year]);
  fake.beforeRead = () => { fake.documents.get("0000").sem1.endDate = "2026-11-10"; };
  assert.deepEqual(await endExpiredSemesters(fake.db, "2026-11-01"), { yearsEvaluated: 1, semestersEnded: 0 });
  assert.equal(fake.writes, 0);
});

test("empty collections and exact page boundaries finish, and failures propagate for scheduler retries", async () => {
  assert.deepEqual(await endExpiredSemesters(fakeFirestore([]).db, "2026-11-01"), { yearsEvaluated: 0, semestersEnded: 0 });
  const fake = fakeFirestore(Array.from({ length: 100 }, () => year));
  assert.deepEqual(await endExpiredSemesters(fake.db, "2026-11-01"), { yearsEvaluated: 100, semestersEnded: 100 });
  assert.equal(fake.transactions, 2);
  fake.db.runTransaction = async () => { throw new Error("Firestore unavailable"); };
  await assert.rejects(endExpiredSemesters(fake.db, "2026-11-01"), /Firestore unavailable/);
  await assert.rejects(endExpiredSemesters(fake.db, "invalid"), /valid current date/);
});
