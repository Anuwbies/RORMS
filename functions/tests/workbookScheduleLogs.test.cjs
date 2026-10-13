const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const { recordWorkbookScheduleLog } = require('../lib/workbookScheduleLogs');

function event(extra = {}) {
  return { path: 'departments/dept/workbooks/2026-2027/semesters/sem1', authType: 'unknown', authId: 'dean',
    committedAt: Timestamp.fromMillis(1000), before: { revisionId: 'old' }, after: {
      schemaVersion: 3, revision: 2, revisionId: 'new', membershipId: 'member', savedBy: 'forged', workbookId: 'workbook_123',
      departmentId: 'dept', departmentCode: 'CITE', academicYear: '2026-2027', academicYearId: 'year', semester: 'sem1', fileName: 'Schedule.xlsx', sheetNames: ['First'],
      audit: { version: 1, kind: 'updated', revisionId: 'new', previousRevision: 1, counts: { cellsChanged: 1 }, totalChanges: 1,
        samples: [{ kind: 'cellsChanged', sheet: 'First', location: 'A1', field: 'Cell value', before: 'Old', after: 'New' }], omittedSamples: 0, baselineAvailable: true },
    }, ...extra };
}
function fixture({ retry = false, fail = false } = {}) {
  const documents = new Map([
    ['users/dean', { firstName: 'Maria', surname: 'Santos' }],
    ['memberships/member', { userId: 'dean', role: 'Dean' }],
  ]);
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }), runTransaction: async callback => {
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
      const writes = [];
      const result = await callback({ get: async ref => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) }),
        create: (ref, data) => { if (fail) throw new Error('Write failed'); writes.push([ref.path, data]); } });
      if (retry && attempt === 0) continue;
      for (const [path, data] of writes) documents.set(path, data);
      return result;
    }
  } };
  return { db, documents, logs: () => [...documents].filter(([path]) => path.startsWith('logs/')).map(([, data]) => data) };
}

test('committed revisions record source, changes, commit time, and authenticated actor', async () => {
  const h = fixture(), saved = event();
  assert.equal(await recordWorkbookScheduleLog(h.db, saved), true);
  const [log] = h.logs();
  assert.equal(log.actorId, 'dean');
  assert.equal(log.actorName, 'Santos, Maria');
  assert.equal(log.actorRole, 'Dean');
  assert.equal(log.sourcePath, saved.path);
  assert.equal(log.action, 'schedule.workbook_saved');
  assert.equal(log.createdAt.toMillis(), 1000);
  assert.deepEqual(log.samples, saved.after.audit.samples);
});

test('transaction retries and redeliveries create exactly one event per revision', async () => {
  const h = fixture({ retry: true });
  assert.equal(await recordWorkbookScheduleLog(h.db, event()), true);
  assert.equal(await recordWorkbookScheduleLog(h.db, event()), false);
  assert.equal(h.logs().length, 1);
});

test('client api_key context resolves the event user and membership rather than savedBy', async () => {
  const h = fixture();
  h.documents.set('users/forged', { fullName: 'Wrong person' });
  await recordWorkbookScheduleLog(h.db, event({ authType: 'api_key' }));
  const [log] = h.logs();
  assert.equal(log.actorId, 'dean');
  assert.equal(log.actorName, 'Santos, Maria');
  assert.equal(log.actorRole, 'Dean');
  assert.equal(log.authType, 'api_key');
});

test('API keys without a user profile, missing IDs and non-user contexts stay unknown', async () => {
  for (const context of [
    { authType: 'api_key', authId: 'project-api-key' },
    { authType: 'api_key', authId: undefined },
    { authType: 'api_key', authId: 'users/dean' },
    { authType: 'service_account', authId: 'dean' },
    { authType: 'system', authId: 'dean' },
    { authType: 'unauthenticated', authId: 'dean' },
  ]) {
    const h = fixture();
    await recordWorkbookScheduleLog(h.db, event(context));
    assert.equal(h.logs()[0].actorId, '');
    assert.equal(h.logs()[0].actorName, 'Unknown member');
    assert.equal(h.logs()[0].actorRole, 'Unknown');
  }
});

test('api_key context cannot use another member role', async () => {
  const h = fixture();
  h.documents.set('memberships/member', { userId: 'someone-else', role: 'Admin' });
  await recordWorkbookScheduleLog(h.db, event({ authType: 'api_key' }));
  assert.equal(h.logs()[0].actorName, 'Santos, Maria');
  assert.equal(h.logs()[0].actorRole, 'Unknown');
});

test('out-of-order events retain their own immutable revision summaries', async () => {
  const h = fixture(), older = event(), newer = event();
  newer.after = { ...newer.after, revision: 3, revisionId: 'newest', audit: { ...newer.after.audit, revisionId: 'newest', previousRevision: 2,
    samples: [{ ...newer.after.audit.samples[0], before: 'New', after: 'Newest' }] } };
  await recordWorkbookScheduleLog(h.db, newer);
  await recordWorkbookScheduleLog(h.db, older);
  assert.deepEqual(h.logs().map(log => log.samples[0].after), ['Newest', 'New']);
});

test('selection-only saves, deletion, stale audit, legacy manifests, and malformed summaries create no log', async () => {
  const h = fixture();
  const candidates = [event({ after: undefined }), event({ before: { revisionId: 'new' } }), event({ path: 'sheets/one' })];
  for (const patch of [{ schemaVersion: 2 }, { audit: { ...event().after.audit, revisionId: 'stale' } },
    { audit: { ...event().after.audit, counts: {}, totalChanges: 0, samples: [] } },
    { audit: { ...event().after.audit, counts: { cellsChanged: -1 } } },
    { audit: { ...event().after.audit, samples: Array(81).fill(event().after.audit.samples[0]) } }]) candidates.push(event({ after: { ...event().after, ...patch } }));
  for (const candidate of candidates) assert.equal(await recordWorkbookScheduleLog(h.db, candidate), false);
  assert.equal(h.logs().length, 0);
});

test('empty initial creation is logged and unknown contexts cannot impersonate savedBy', async () => {
  const h = fixture(), saved = event({ authType: 'service_account', authId: 'dean' });
  saved.after.audit = { ...saved.after.audit, kind: 'created', counts: {}, samples: [], totalChanges: 0 };
  await recordWorkbookScheduleLog(h.db, saved);
  assert.equal(h.logs()[0].actorId, '');
  assert.equal(h.logs()[0].actorName, 'Unknown member');
  assert.equal(h.logs()[0].actorRole, 'Unknown');
});

test('another user membership cannot forge the role and failed log writes can be retried', async () => {
  const h = fixture();
  h.documents.set('memberships/member', { userId: 'someone-else', role: 'Admin' });
  await recordWorkbookScheduleLog(h.db, event());
  assert.equal(h.logs()[0].actorRole, 'Unknown');
  const failing = fixture({ fail: true });
  await assert.rejects(recordWorkbookScheduleLog(failing.db, event()), /Write failed/);
  assert.equal(failing.logs().length, 0);
});
