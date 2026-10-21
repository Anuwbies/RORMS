# RORMS System Overview

**RORMS** is a web-based room and academic schedule management system for a university. It keeps a shared inventory of buildings and rooms, organizes academic years and departmental teaching schedules, helps the Registrar assign rooms, accepts one-day room reservations, routes those requests through reviewers, and provides dashboards, reports, notifications, and activity logs.

This document describes the implementation in this repository as inspected on **18 October 2026**. It is a guide to the system, not a claim that every local Firebase rule or Cloud Function has been deployed. The detailed field reference is [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md); role and workflow background is in [SYSTEM_ROLES.md](SYSTEM_ROLES.md). When an older planning document disagrees with the current application, follow the source files cited below.

## 1. What the system contains

| Area | What it does |
| --- | --- |
| Identity and membership | Firebase email/password authentication, invitation-based signup, email verification, password reset, account activation, role and department assignment. |
| Facilities | Building and room directory with status, capacity, amenities, operating days and hours, booking limits, photos, and room comments. |
| Academic planning | Academic years and semester phases; department course workbooks; semester schedule workbooks and saved class meetings. |
| Room plotting | Registrar/Admin room assignment and approval of department schedules, with room and timetable validation. |
| Reservations | Room search, standard and extended requests, personal tracking, three-stage review, automatic expiry/completion, and schedule conflict cancellation. |
| Awareness | Role-specific dashboards, in-app notifications, unread comment notices, analytics, reports, CSV exports, and audit views. |

The application is a React 19 and TypeScript single-page app built with Vite 8 and Tailwind CSS 4. Firebase Authentication handles accounts; Cloud Firestore stores operational records and workbooks; Firebase Storage holds images and legacy workbook files; Cloud Functions handle selected trusted mutations, lifecycle jobs, triggers, and notifications. Recharts supplies charts. The Firebase Hosting configuration serves `frontend/dist` and rewrites application paths to `index.html`. See [frontend/package.json](frontend/package.json), [functions/package.json](functions/package.json), [frontend/src/firebase.ts](frontend/src/firebase.ts), and [firebase.json](firebase.json).

## 2. Users, roles, and access

An authenticated user's role and department come from `memberships`, while `users/{uid}` holds their profile. An accepted membership and active profile are required by several privileged workflows. The navigation below is the **current sidebar configuration** in [LeftSidebarController.tsx](frontend/src/pages/LeftSidebarController.tsx), which is more current than [ROLE_TAB_ACCESS.md](ROLE_TAB_ACCESS.md). Page controls and server checks can impose narrower permissions than tab visibility.

| Role | Sidebar tabs |
| --- | --- |
| **Admin** | Dashboard, Academic Calendar, Members, Departments, Buildings & Rooms, Department Schedules, Manage Reservations, Reserve a Room, My Reservations, Analytics, Reports, Logs. |
| **University Administrator** | Dashboard, Buildings & Rooms, Manage Reservations, Analytics, Reports. This role is assigned to the General Service Department. |
| **Registrar** | Dashboard, Academic Calendar, Department Schedules, Buildings & Rooms, Manage Reservations, Reserve a Room, Analytics, Reports. |
| **Dean** | Dashboard, Academic Calendar, My Schedule, My Department, Manage Reservations, Reserve a Room, My Reservations, Buildings & Rooms. |
| **Program Head** | Dashboard, Academic Calendar, My Schedule, My Department, Reserve a Room, My Reservations, Buildings & Rooms. Multiple Program Heads may belong to one department. |
| **Instructor** | Dashboard, Academic Calendar, My Schedule, My Department, Reserve a Room, My Reservations, Buildings & Rooms. |

All roles with Academic Calendar access can view it; Admin and Registrar can manage years and phases. Admin can edit a department semester workbook in Drafting, Plotting, Revision, or Final. A department's Dean or Program Head can edit it only in Drafting or Revision. Registrar can view workbooks in every phase and plot rooms in the four active editing phases, but cannot save general workbook edits. These checks are implemented in [departmentWorkbookPermissions.ts](frontend/src/utils/departmentWorkbookPermissions.ts). University Administrator manages facilities and gives the final reservation decision; Program Head has no Manage Reservations tab. Accepted Admin, Dean, and Program Head memberships can save their department's course workbook as described in the collection reference.

The dashboard changes by role: Admin and Registrar share the management dashboard, University Administrator has a facilities and reservations dashboard, and Dean/Program Head/Instructor use the faculty dashboard. The University Administrator's Analytics and Reports views are restricted to Reservations and Buildings & Rooms. Sidebar order is saved per user in local browser storage. See [DashboardPage.tsx](frontend/src/pages/tabs/DashboardPage.tsx).

## 3. Main application workflows

### 3.1 Account creation and sign-in

1. An Admin manages invitations and existing members through **Members**. The `manageMember` callable handles invitation, reinvitation, edits, deactivation, and invitation cancellation and records account events. The invitation links to a pending membership and expires.
2. The invitee opens the signup link, creates an email/password account, and supplies their name. Signup links the Firebase Auth user, `users` profile, invitation, and membership. A reactivation invitation can restore an inactive account.
3. The app checks authentication, email verification, and the current server profile before showing the main interface. It signs out a deactivated account and monitors the profile for later deactivation. Forgot Password calls `requestPasswordReset`, which queues an email with a custom reset link.
4. The signup/reset password policy requires at least 12 characters with uppercase, lowercase, number, and symbol. The sign-in page also applies a browser-side failed-attempt cooldown; Firebase Authentication remains the account authority.

The right sidebar lets a user edit their display name and profile photo, inspect notifications, and sign out. A user may choose a remembered or browser-session sign-in. Relevant code: [App.tsx](frontend/src/App.tsx), [SignupPage.tsx](frontend/src/pages/SignupPage.tsx), [SignInPage.tsx](frontend/src/pages/SignInPage.tsx), [RightSidebar.tsx](frontend/src/components/RightSidebar.tsx), [passwordPolicy.ts](frontend/src/utils/passwordPolicy.ts).

### 3.2 Buildings, rooms, and feedback

**Buildings & Rooms** shows the facility directory and room details. A room records its building, type, floor, capacity, status (`Available`, `Unavailable`, or `Maintenance`), image, amenities, available weekdays, operating times, and minimum/maximum standard booking duration. Authorized staff can create, edit, or remove buildings and rooms, including bulk room actions. `manageFacility` performs those mutations with an audit event in the same Firestore transaction; room image Storage work happens separately.

Signed-in users can post room comments. The author may remove their own comment; Admin, Registrar, and University Administrator have moderation paths in the current facility callable. Comments are not edited through the interface. Personal read positions in `users/{uid}/roomCommentReads` drive room-card **New comments** badges and highlights; the user's own comments do not count as unread. See [BuildingsRoomsPage.tsx](frontend/src/pages/tabs/BuildingsRoomsPage.tsx), [RoomComments.tsx](frontend/src/components/RoomComments.tsx), and [useRoomCommentNotices.ts](frontend/src/hooks/useRoomCommentNotices.ts).

### 3.3 Academic calendar and courses

`academicYears` stores school-year labels, active-year state, two semester date ranges, and each semester's phase. The UI validates date order and rejects overlapping academic years. Available phase labels are **Closed, Drafting, Plotting, Revision, Final, and Ended**; administrators can set them explicitly. `autoEndSemesterPhases` marks a semester Ended after its inclusive end date, using Philippine time. The phase determines who may edit or plot a term's workbook. See [AcademicCalendarPage.tsx](frontend/src/pages/tabs/AcademicCalendarPage.tsx).

**Manage Courses** opens one editable courses workbook per department, independent of the selected school year or semester. It saves the complete workbook at `departments/{departmentId}/courseWorkbooks/current` and publishes populated rows into `courses`; blank rows remain in the workbook. The current workbook generation tells readers which course rows are published. The standard columns are **Session, Semester, Code, Course, Type, Credits**. See [DepartmentCoursesWorkbook.tsx](frontend/src/components/DepartmentCoursesWorkbook.tsx) and [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md).

### 3.4 Department schedules and the two schedule collections

The repository currently has **two distinct schedule projections**. They must not be treated as aliases:

| Collection | Produced and used by |
| --- | --- |
| `schedules` (plural) | The compact 21-column `DepartmentScheduleWorkbook` workbook. Each populated row becomes a record; blank rows stay in the workbook. Department Schedules counters and the compact Plot flow read this collection. New or authored-edited rows become Draft; unchanged Plot rows keep their status. |
| `schedule` (singular) | The fuller semester workbook/template flow and its Schedule Setup rows. Faculty and Registrar dashboards, My Schedule, reservation availability, reports/analytics, and the schedule-triggered reservation cancellation currently read this collection. Template-derived records can become Plot when a uniquely resolved source room is present. |

Both are term-scoped class schedules with instructor, subject/section, meeting day/time, room, status, and workbook provenance. They are not automatically migrated between collections. A consumer's choice of collection matters: for example, reports and reservation conflict views that subscribe to `schedule` do not automatically include a compact-only `schedules` row. See [DepartmentScheduleWorkbook.tsx](frontend/src/components/DepartmentScheduleWorkbook.tsx), [departmentScheduleRows.ts](frontend/src/services/departmentScheduleRows.ts), [reportingData.ts](frontend/src/utils/reportingData.ts), and the `schedule`/`schedules` sections of [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md).

The department semester workbook is keyed by department, school year, and `sem1`/`sem2`. Its current version 3 Firestore manifest lives at `departments/{departmentId}/workbooks/{schoolYear}/semesters/{semester}`. Sheet snapshots use compressed Firestore chunks, while small edits may use cell patch documents. Save uses revision checks, accepted membership and semester-phase checks, and an atomic manifest plus schedule projection commit when possible. Large saves use a temporary lease and publish only after staged pieces are ready. Other users' committed revisions arrive live; local unsaved edits require merge/discard handling. IndexedDB caches verified saved snapshots for faster reopening. Historical Storage-backed workbook manifests remain readable and migrate on a later successful save. See [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md) for paths, limits, migration, and cleanup details.

The template flow can import Faculty Schedules and Department Courses sheets plus an optional Rooms & Labs sheet. Faculty cells supply teaching assignments; course rows supply course metadata; room-sheet entries may assign uniquely matching meetings. The compact editor instead uses a two-row, 21-column schedule table with year-level sections. Excel import/export preserves workbook content and formatting. Workbooks are saved explicitly; unsaved typing is not shared. See [SYSTEM_ROLES.md](SYSTEM_ROLES.md) and [DepartmentScheduleWorkbook.tsx](frontend/src/components/DepartmentScheduleWorkbook.tsx).

### 3.5 Validation and room plotting

Schedule checks cover instructor and room time overlaps, duplicate subjects within a section/program/year, room existence, department membership where relevant, and more specific room-plot constraints. The compact workbook checks all its sheets, including split Lec/Lab meetings and hidden year sections. A cross-department saved-room check is shown as a warning in the compact editor; its workbook Save is **not** an atomic claim on every campus room. Some older statements in [SCHEDULE_VALIDATION_RULES.md](SCHEDULE_VALIDATION_RULES.md) describe a proposed Add Schedule flow and should not be read as the full current editor contract.

Registrar/Admin Plot validates the current term, membership, room availability, operating days and hours, capacity, revisions, and overlapping class meetings before committing selected rooms. In the compact flow, a new or changed room assignment requires an explicit checkbox approval. A source-provided room is protected; an explicit source TBA or unresolved value must be fixed in the department workbook. Plot writes approved room changes back to both `schedules` and the compact workbook's room cells. Parallel sections sharing instructor/subject/day/time/format need distinct, consecutively numbered rooms in one building and floor; the entire group must be complete and approved together. Returning an approved row to Draft retains its room assignment. The separate template/singular flow has its own plotting behavior documented in [SYSTEM_ROLES.md](SYSTEM_ROLES.md) and [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md). Key validators: [ScheduleValidation.ts](frontend/src/utils/ScheduleValidation.ts), [plotRoomValidation.ts](frontend/src/utils/plotRoomValidation.ts), and [plotParallelRooms.ts](frontend/src/utils/plotParallelRooms.ts).

### 3.6 Room reservations

**Reserve a Room** lets eligible users browse/search rooms and create a one-day request with date, start/end or duration, attendees, a required Purpose (maximum 50 characters), and optional subject code/section. The request copies the user's accepted membership department and starts **Pending**. A global `settings/reservationAvailability` switch can pause submissions; Admin and Registrar control it in this page. The form checks room status, weekday and operating window, capacity, minimum duration, booking date range, a two-hour same-day lead time, and overlaps with loaded bookings and class schedules. Standard requests also observe the room's maximum booking duration and 90-minute slot boundaries. **Extended** requests may exceed those two standard limits but still obey the other checks; extended submission rereads current room constraints. See [ReserveRoomPage.tsx](frontend/src/pages/tabs/ReserveRoomPage.tsx).

The normal review order is:

1. **Registrar** recommends or declines. A recommendation leaves the request Pending.
2. The request's department **Dean** recommends or declines after the Registrar recommendation. A recommendation still leaves it Pending.
3. **University Administrator** approves or declines after both recommendations. Approval changes status to Approved. Admin can manually act on the current review step through the callable.

Declines require a reason. Authorized status-edit flows can return a decision to Pending and clear later recommendation flags according to the stage. Reviewers cannot edit an earlier stage after the next reviewer has decided. Extended final approvals go through `updateReservationStatus`, which transactionally rechecks current room, booking, and class conflicts. Other review actions in [ManageReservationsPage.tsx](frontend/src/pages/tabs/ManageReservationsPage.tsx) include client Firestore transactions; the deployed Firestore policy affects whether these succeed. Program Heads cannot recommend. See [reservationStatusLogs.ts](functions/src/reservationStatusLogs.ts) and [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md).

**My Reservations** shows a user's requests and lets them cancel eligible requests. Its “Delete Record” action hides a record from that user's list with `isHidden`; it does not physically remove the reservation. Pending requests that pass their end time become Declined, and approved requests that finish become Completed through a five-minute scheduled function. A saved singular `schedule` class that newly conflicts with a Pending or Approved reservation can cancel it asynchronously, preserving the cancellation reason and notifying the requester. This trigger is on `schedule/{scheduleId}`; compact-only `schedules` writes do not invoke it. See [MyReservationsPage.tsx](frontend/src/pages/tabs/MyReservationsPage.tsx), [cancelScheduleReservations.ts](functions/src/cancelScheduleReservations.ts), and [functions/src/index.ts](functions/src/index.ts).

### 3.7 Dashboards, reports, analytics, logs, and notifications

- Dashboards summarize relevant facilities, schedules, reservations, and membership data for the user's role. University Administrator's dashboard uses buildings, rooms, and reservations and evaluates dates in Philippine time.
- **Reports** shows filterable tables and CSV export for Reservations, Buildings & Rooms, Schedules, and Members. **Analytics** presents metrics, charts, operational insights, filters, and CSV export for the same four areas. Their shared data hook currently subscribes to singular `schedule` for schedules.
- **Logs** displays Reservation, Scheduling, Facilities, and Accounts activity with search/filtering, detail views, pagination, and CSV export. Selected mutations write audit events atomically through callables or a workbook trigger. Logs are a record of implemented events, not a complete history of every possible direct database write.
- Cloud Functions create private `users/{uid}/notifications` for booking decisions/reminders, facility changes, membership/invitation changes, and academic-year changes. The right sidebar displays them by category and lets recipients mark or clear them. Room-comment unread positions are a separate feature.

Relevant code: [ReportsPage.tsx](frontend/src/pages/tabs/ReportsPage.tsx), [AnalyticsPage.tsx](frontend/src/pages/tabs/AnalyticsPage.tsx), [LogsPage.tsx](frontend/src/pages/tabs/LogsPage.tsx), [RightSidebar.tsx](frontend/src/components/RightSidebar.tsx), and [functions/src/index.ts](functions/src/index.ts).

## 4. Data model at a glance

Firestore document IDs are generally Firebase-generated unless noted. Most records carry server timestamps. For full fields and compatibility behavior, use [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md).

| Path | Purpose and important fields |
| --- | --- |
| `users/{uid}` | Auth-linked profile: email, name parts/full name, verification, active flag, photo URL, timestamps. |
| `users/{uid}/notifications/{id}` | Recipient-private title, message, type, read flag, source, created time. Server functions create them. |
| `users/{uid}/roomCommentReads/{roomId}` | Recipient-private room discussion read position and individually seen comments. |
| `memberships/{id}` | User/dept association, role, email/name snapshot, status, joined time. Pending invites may have no user UID. |
| `invitations/{token}` | Invite email, membership reference, pending/accepted/revoked state, inviter, expiry, reactivation flag. |
| `departments/{id}` | Department name/code, Dean UID, logo; multiple Program Heads derive from memberships. |
| `departments/{id}/courseWorkbooks/current` | Compressed current courses workbook, generation, revision, saver, row count. |
| `courses/{generation}_{rowIndex}` | Populated rows published from the current course workbook generation. |
| `academicYears/{id}` | Year label, active flag, `sem1`/`sem2` dates and phases. |
| `buildings/{id}` | Building name, code, timestamps. |
| `rooms/{id}` | Building reference, room identity/type/floor/capacity/status, image, amenities, operating days/hours, booking limits. |
| `comments/{id}` | Room feedback with room, author ID/name snapshot, text, created time. |
| `schedule/{id}` | Singular/template or Schedule Setup class projection with term, subject, instructor, meetings, rooms, status, source metadata. |
| `schedules/{id}` | Compact workbook class-row projection with 21 raw values, year label, meetings, resolved resources, status, and workbook metadata. |
| `departments/{id}/workbooks/{year}/semesters/{sem1\|sem2}` | Current term workbook manifest, revision, sheet references, editor state and save metadata. |
| `sheets/{workbookSheetId}` plus `chunks` and `cells` | Compressed worksheet snapshots, chunk parts, and small cell overrides for version 3 workbooks. |
| `reservations/{id}` | User, room, date/interval, request type, purpose, attendees, department, status, three recommendation flags, and decision/cancellation metadata. |
| `logs/{id}` | Audit category/action, actor, source/target, time, before/after detail or saved event snapshot. |
| `settings/reservationAvailability` | Global reservation submission switch and updater metadata. |
| `settings/campusMap` | Map state used by Buildings & Rooms. |
| `mail/{id}` | Outbound email queue consumed by the Firebase Trigger Email extension; delivery fields are extension-managed. |

Firebase Storage contains profile images, department logos, room images, and historical department workbook files. Current version 3 workbook data is in Firestore; legacy Storage-backed workbooks can still be migration inputs. See [FIREBASE_STORAGE.md](FIREBASE_STORAGE.md), [storage.rules](storage.rules), and the workbook sections in [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md).

## 5. Cloud Functions and background behavior

The deployed set must be checked in the Firebase project; these are exports present in [functions/src/index.ts](functions/src/index.ts).

| Export | Trigger / job |
| --- | --- |
| `manageMember` | Callable for member and invitation mutations with Accounts logs. |
| `manageFacility` | Callable for building/room and comment-delete mutations with Facilities logs. |
| `updateReservationStatus` | Callable for authorized reservation changes, especially extended approval validation, with Reservation logs. |
| `requestPasswordReset` | Callable that validates a reset request and queues a custom reset email. |
| `logDepartmentWorkbookSave` | Firestore auth-context trigger for committed department workbook Scheduling logs. |
| `cancelReservationsForSchedule` | Firestore trigger on singular `schedule` writes; cancels conflicting active bookings. |
| `autoUpdateReservationStatus` | Every five minutes: creates near-start reminders, expires Pending requests, completes finished Approved requests. |
| `autoEndSemesterPhases` | Daily at midnight Asia/Manila: ends expired semester phases. |
| `checkReservationsNow` | On-demand HTTP path that runs reservation reminder/status processing. |
| `deleteDeliveredMail` | Removes a `mail` queue document after successful delivery is recorded. |
| `notifyReservationStatusChanged`, `notifyBuildingCreated`, `notifyBuildingUpdated`, `notifyRoomCreated`, `notifyRoomUpdated`, `notifyMembershipCreated`, `notifyMembershipUpdated`, `notifyInvitationAccepted`, `notifyAcademicYearUpdated` | Firestore triggers that create in-app notices for reservation, facility, membership, invitation, and academic calendar events. |

## 6. Security and deployment reality

- The frontend hides unauthorized tabs and controls, but server-side authority depends on the **deployed** Firestore/Storage rules and callable checks. Do not treat a sidebar check alone as data protection.
- [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md) records a user-supplied deployed policy from **12 October 2026**: top-level documents allowed read/write and nested documents allowed read/write except recipient notifications. The local [firestore.rules](firestore.rules) has more specific workbook, course, schedule, comment, read-position, and log rules, plus a permissive fallback for other collections. The deployed policy was not rechecked while writing this overview. Several current client transaction flows assume direct writes permitted by the deployed policy; deploying the local rule file without reconciling those flows can change behavior.
- The local [storage.rules](storage.rules) protect the `department-workbooks/` namespace while preserving a permissive fallback for other storage paths. [FIREBASE_STORAGE.md](FIREBASE_STORAGE.md) describes intended image ownership more strictly than that fallback enforces.
- Cloud Functions and rules must be deployed separately. A local export does not prove that its endpoint or trigger is live. Workbook paths also depend on the indexes in [firestore.indexes.json](firestore.indexes.json); legacy Storage downloads may require the CORS configuration in [storage.cors.json](storage.cors.json).
- Client-side checks and live query results improve the user experience but do not by themselves guarantee that arbitrary direct Firestore writes obey the same business workflow. Logs cover the actions that explicitly write them; historic/direct changes may be absent.

## 7. Repository map and local operation

| Location | Role |
| --- | --- |
| `frontend/src/App.tsx` | Authentication gates and top-level page flow. |
| `frontend/src/pages/LeftSidebarController.tsx` | Role-aware tab list and page selection. |
| `frontend/src/pages/tabs/` | Main user-facing pages. |
| `frontend/src/components/` | Modals, workbook editors, room and scheduling interfaces, reusable UI. |
| `frontend/src/services/` | Firestore/callable operations, workbook persistence, plotting, facility/member services. |
| `frontend/src/utils/` and `frontend/src/hooks/` | Validation, schedule calculations, reports, caches, and subscriptions. |
| `functions/src/` | Cloud Functions and their transaction/business logic. |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Local Firebase policy and indexes. |
| `frontend/tests/`, `frontend/scripts/`, `functions/tests/` | Existing focused automated checks. There is no single frontend `npm test` script. |

Development prerequisites are Node.js and npm plus the Firebase environment variables read by [frontend/src/firebase.ts](frontend/src/firebase.ts): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_MEASUREMENT_ID`. Keep their values in an untracked local environment file. The functions package targets Node 22.

```powershell
cd frontend
npm install
npm run dev
npm run build
```

Build the functions package separately with `npm --prefix functions run build`. The local `firebase.json` points Hosting to `frontend/dist`, Functions to `functions`, and the rule/index files to their root paths. Deployment needs appropriate Firebase access and a deliberate review of the current cloud rules and function state; this document does not prescribe deploying a different policy.

## 8. Detailed reference documents

- [FIRESTORE_COLLECTIONS.md](FIRESTORE_COLLECTIONS.md): collection fields, reservation review states, schedule/workbook persistence, audit event structures, and known deployment notes.
- [SYSTEM_ROLES.md](SYSTEM_ROLES.md): role responsibilities and the evolving scheduling/reservation workflow.
- [SCHEDULE_VALIDATION_RULES.md](SCHEDULE_VALIDATION_RULES.md): earlier planning rules; compare with the current validators before implementing changes.
- [FIREBASE_FUNCTIONS.md](FIREBASE_FUNCTIONS.md): reservation lifecycle and mail-cleanup background notes; use current function exports for the actual inventory.
- [FIREBASE_STORAGE.md](FIREBASE_STORAGE.md) and [WORKBOOK_STORAGE_SETUP.md](WORKBOOK_STORAGE_SETUP.md): asset paths and historical Storage workbook behavior.
- [PROJECT_GOALS.md](PROJECT_GOALS.md), [SCHEDULING_SYSTEM_PLAN.md](SCHEDULING_SYSTEM_PLAN.md), and [project_features.md](project_features.md): project vision and earlier feature plans, not a complete current implementation specification.
- [README.md](README.md) and [ROLE_TAB_ACCESS.md](ROLE_TAB_ACCESS.md): introductory material whose stack/role listings have not kept pace with the current package and sidebar configuration.
- [AGENTS.md](AGENTS.md): repository working conventions and required build verification.
