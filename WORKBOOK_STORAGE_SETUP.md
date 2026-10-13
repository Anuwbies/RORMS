# Semester workbook storage

The editor now saves the original XLSX in Firebase Storage and an editor JSON snapshot in the same bucket. Firestore keeps the active revision per department, academic year document ID, and semester. Use **Save** (or Ctrl/Cmd+S) before closing. Reopening the term restores the last saved revision.

Save also synchronizes the nonempty Schedule Setup rows for years 1–4 into the existing `schedule` collection using the 21-column header. Each stored row contains separate Lec/Lab values and a meetings array that pairs multiple faculty, times, days, and rooms. Rows are scoped to the department/year/semester and committed with the workbook revision; deleted rows are removed on the next save. Unresolved resources retain their original names and validation messages. Rows are saved as Draft. Existing saved workbooks populate these documents when Save is clicked again; opening alone does not write schedule data. See `FIRESTORE_COLLECTIONS.md` for the row schema.

Manage Schedule in Department Schedules opens that same semester workbook. Accepted Admins and Registrars can edit and save across departments during Drafting, Plotting, Revision, and Final. Department Deans and Program Heads retain editing during Drafting and Revision for their own department. Closed and Ended semesters are read only.

## Firebase setup

Deploy the workbook rules before using this feature:

```powershell
cd frontend
npx firebase deploy --only firestore:rules,storage --config ../firebase.json
```

The Firebase CLI may ask to enable the Storage service account's Firestore access, required by the cross-service rules. The configured Storage bucket must exist. This change has not deployed rules or created cloud resources automatically.

The deployed Storage rules were inspected during implementation: they allowed public reads and writes to every path. The new rules preserve that existing policy for other locations and exclude `department-workbooks/` from it. Only the new workbook namespace receives the new restrictions. Unrelated existing Firestore access policies remain as they were; this feature does not harden those policies.

The browser loads files with authenticated `getBlob` requests, so the bucket needs CORS for the frontend origins. The configuration in `storage.cors.json` covers both Firebase Hosting domains and localhost/127.0.0.1 on port 5173. Keep this configuration with the bucket when deploying elsewhere; add any custom domain or different development port. For example:

This CORS configuration was applied to `rorms-dd983.firebasestorage.app` on October 8, 2026. GET responses were verified to include the matching `Access-Control-Allow-Origin` header for localhost:5173 and Firebase Hosting. Existing bucket configuration was preserved. This did not deploy the local Firestore or Storage security rules.

```json
[
  {
    "origin": ["https://rorms-dd983.web.app", "http://localhost:5173"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

Keep any existing bucket CORS entries when adding these origins. See [Firebase's direct download setup](https://firebase.google.com/docs/storage/web/download-files#download_data_directly_from_the_sdk).

## Limits and behavior

- Original XLSX: at most 20 MB. Editor JSON: at most 50 MB.
- Saving does not modify the original XLSX or publish plotted schedules.
- Editing after a save remains local until Save is used again.
- Simultaneous saves use a revision check. If a newer save exists, reopen the term before saving.
- Prior successful revision snapshots are retained. Failed uploads are removed when possible; automatic retention/garbage collection is not implemented.
- Selecting a semester opens the Excel editor directly, with loading and errors inside the editor. No saved workbook opens an editable blank Sheet1; Import Excel file is available in the footer before Add sheet. Save also works without importing: a blank original XLSX is created, and edits are stored in the editor snapshot. If saved Storage files were deleted, a blank editor allows importing and saving a replacement against the existing term revision. Network and permission failures still show Retry and disable editing/import/save until loading succeeds.
- Import remains available in editable workbooks. Choosing an XLSX opens a sheet picker with no sheets selected by default. Only checked sheets are added, preserving existing sheets and local edits; duplicate names get a numbered suffix. Selected hidden sheets become visible. Imports retain cell styles, conditional formatting, dimensions, merges, comments, and schedule detection. Save uploads a revised source bundle containing the XML needed by the appended sheets and a new editor snapshot; later saves reuse that bundle until another import. Cancel and failed imports do not change the workbook.
- An untouched default empty Sheet1 is removed when selected sheets are imported. A default sheet with content, comments, formatting, or other customizations is preserved, as are manually added and previously imported empty sheets.
- Saved file bytes are cached in IndexedDB across refreshes, with an in-memory fallback if local persistence is unavailable. Each opening checks Firestore and Storage metadata; unchanged files reuse the cache. A new editor revision downloads only its JSON if the original XLSX is unchanged. Direct Storage edits or deletions are detected through the object generation/existence check.
- The cache is separated by project, bucket, and signed-in account. Memory is limited to 64 MB and persistent cached files to 150 MB; oldest entries are removed as needed. Clearing browser storage or cache eviction causes a fresh download on the next opening.
- The modal distinguishes metadata checks, cached opening, and downloading. Opening has a 30-second deadline, after which Retry becomes available instead of leaving Loading disabled indefinitely.
