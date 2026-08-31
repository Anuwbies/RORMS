# Firebase Cloud Functions (FIREBASE_FUNCTIONS.md)

This document outlines the implemented and planned backend Firebase Cloud Functions, automated background triggers, and scheduled tasks for the **RORMS** (Registrar Office Room Management System) platform.

---

## 1. Automatic Reservation Status Lifecycle Manager

### Overview
Monitors and updates the status of time-sensitive room reservations in the `reservations` collection when the requested reservation timeframe has elapsed.

- **Source Code**: [`functions/src/index.ts`](functions/src/index.ts)
- **Target Collection**: `reservations`

### Exported Functions

#### A. `autoUpdateReservationStatus` (Scheduled Cron Function)
- **Trigger**: `onSchedule({ schedule: "every 5 minutes", timeZone: "Asia/Manila", retryCount: 3 })`
- **Execution**: Automatically runs in the background every 5 minutes against the Philippine timezone (`Asia/Manila`, UTC+8).

#### B. `checkReservationsNow` (On-Demand HTTP Function)
- **Trigger**: `onRequest({ cors: true })`
- **Execution**: Allows manual invocation from testing tools or administrative scripts to trigger an immediate status evaluation across all reservations.

---

### Business Logic & State Transitions

| Initial Status | Condition | New Status | Description / Notes |
| :--- | :--- | :--- | :--- |
| **`Pending`** | Current Manila date & time $\ge$ `date` + `endTime` (or `startTime`) | **`Declined`** | Unreviewed reservation requests that were not approved/declined before the scheduled time expires are automatically declined with a system note (`"Auto-declined: Reservation request expired before review"`). |
| **`Approved`** | Current Manila date & time $\ge$ `date` + `endTime` | **`Completed`** | Successfully booked reservations that have completed their scheduled duration are automatically marked as fulfilled (`Completed`). |

---

### Implementation Details

#### Evaluation Criteria
1. Resolves the current date and time in `Asia/Manila` (UTC+8) format (`YYYY-MM-DD` and `HH:mm`).
2. Normalizes 1-digit hour strings (e.g., `"8:00"` $\rightarrow$ `"08:00"`).
3. Compares against reservation records:
   - If `res.date < curDate`: Expired.
   - If `res.date === curDate` AND `res.endTime <= curTime`: Expired.
4. Executes batched Firestore writes (up to 450 documents per batch) with `admin.firestore.FieldValue.serverTimestamp()`.

#### Fields Updated on Reservation Documents
- `status`: Updated to `"Declined"` or `"Completed"`
- `updatedAt`: `serverTimestamp()`
- `declinedReason` *(for expired Pending)*: `"Auto-declined: Reservation request expired before review"`
- `completedAt` *(for expired Approved)*: `serverTimestamp()`
- `autoProcessed`: `true`

---

### Deployment & Build Commands

```bash
# 1. Install functions dependencies (first time)
cd functions
npm install

# 2. Build TypeScript
npm run build

# 3. Deploy Cloud Functions to Firebase
npm run deploy
# or from root:
firebase deploy --only functions
```

---

## Future Planned Functions
*(Additional background tasks, notifications, audit logging, and timetable automated operations will be documented here as development continues.)*
