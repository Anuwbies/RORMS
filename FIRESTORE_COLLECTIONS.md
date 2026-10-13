# Firestore Collections

## Deployed rules note (2026-10-12)

The user supplied the current deployed policy: all top-level documents permit read/write, and nested documents permit read/write except `users/{userId}/notifications/{notificationId}`. Notifications require the recipient's authentication for read/update/delete and disallow client creation. This differs from the stricter local `firestore.rules` file. Under the supplied deployed policy, the top-level `logs` collection is also open; append-only protection applies only after deploying the local log rules. Do not assume the local rules are already deployed or replace the user's deployed policy as a CORS fix.

HTTPS callable deployment and CORS are independent of Firestore rules. The `updateReservationStatus` endpoint in `us-central1` returned HTTP 404 during diagnosis. Build the functions package and deploy that function before using the new status actions:

```powershell
npm --prefix functions run build
firebase deploy --only functions:updateReservationStatus --project rorms-dd983
```

This command deploys only the callable; it does not deploy Firestore rules. Firebase callable functions already allow CORS by default. If a deployed callable still fails before reaching its handler, inspect its actual endpoint, region, and invocation access rather than opening Firestore rules.

## `users`
Stores user account profile information (roles and departments are maintained in `memberships`).

- **Document ID**: Firebase Auth `uid`
- **Fields**:
  - `email`: string (User's email address) | **Default: from Auth**
  - `firstName`: string (Trimmed given names saved separately at signup; each word is title-cased while typing and before saving)
  - `surname`: string (Trimmed surname saved separately at signup, including compound surnames; each word is title-cased while typing and before saving)
  - `fullName`: string (Compatibility name in First name Surname order) | **Default: from Auth (or empty string)**
  - Name displays use Surname, First name when both separate fields exist, otherwise the saved fullName. Legacy accounts are not automatically split into name parts.
  - `isVerify`: boolean (Whether the user's email is verified) | **Default: from Auth**
  - `createdAt`: timestamp (Date the profile was created) | **Default: serverTimestamp()**
  - `updatedAt`: timestamp (Date the profile was last updated) | **Default: serverTimestamp()**
  - `profilePicture`: string (URL to the user's profile picture) | **Default: from Auth (or empty string)**
  - `isActive`: boolean (Whether the account is active) | **Default: true**

### `users/{userId}/notifications`
Stores notifications privately beneath the recipient's user document.

- **Document ID**: Firebase event ID, or a deterministic source-event ID for scheduled notifications
- **Fields**:
  - `title`: string (Notification heading)
  - `message`: string (Notification body)
  - `type`: string (Supported notification event type)
  - `isRead`: boolean (Whether the recipient has read the notification) | **Default: false**
  - `createdAt`: timestamp (Server timestamp used for ordering)
  - `sourceCollection`: string (Collection that produced the event)
  - `sourceId`: string (Source document ID)

### `users/{userId}/roomCommentReads`
Private per-user room comment read positions, synchronized across devices. Only the owning signed-in user can read or write these documents.

- **Document ID**: Room document ID
- **Fields**: `lastSeenAt`: timestamp of the newest committed comment loaded when the comments panel is closed; `seenComments`: optional map of individually clicked comment IDs to their creation timestamps (legacy documents without the map remain supported).
- Opening the panel preserves unread highlights. Each unread comment from another author has an amber highlight; clicking it or pressing Enter/Space marks only that exact comment seen. Closing/hiding the panel or closing Room Information advances the room read position and clears the remaining highlights. Bulk writes compact individually seen entries covered by the new timestamp. Transactions merge concurrent individual reads and preserve newer read positions.
- Clicked comments clear immediately in the current session while saving. Cached query results cannot temporarily reinstate notices; unread calculations wait for confirmed server snapshots. If saving fails, the panel offers retry and the current session still remembers what the user has seen.
- Buildings & Rooms shows a **New comments** badge on room cards and an amber dot on the comment toggle while another author's comment remains unread. With no read position, existing comments are unread. Own comments never trigger notices or highlights.
- The page subscribes to one latest-comment query per existing room (using the existing `roomId`/`createdAt` index), plus the current user's read-position collection. The query window doubles past own/individually seen comments until it finds unread feedback, reaches the room read position, or exhausts the room's comments. If the composite index is missing, the same room-only fallback as the comments panel is used. Comments remain stored in the top-level `comments` collection. Deploy the updated Firestore rules to allow the optional per-comment map.

## `invitations`
Tracks secure onboarding invitations and activation links for members.

- **Document ID**: Unique Token (e.g., auto-generated ID)
- **Fields**:
  - `email`: string (The invited email address)
  - `membershipId`: string (Reference to the pre-created `memberships` document ID)
  - `status`: string (`"pending"`, `"accepted"`, or `"revoked"`) | **Default: "pending"**
  - `isReactivation`: boolean (Optional flag indicating a reactivation invitation)
  - `invitedBy`: string (UID of the user who sent the invite)
  - `createdAt`: timestamp (Date the invite was created) | **Default: serverTimestamp()**
  - `expiresAt`: timestamp (Expiration date)

## `departments`
Manages university departments, assigned deans, and resource metadata.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `name`: string (Full name of the department, e.g., "College of Information Technology")
  - `code`: string (Short department code, e.g., "CITE")
  - `dean`: string (UID of the assigned Dean)
  - `programHead`: string (Optional legacy single-head metadata; no longer maintained by member assignment. Program Heads are derived from `memberships` by department code and role.)
  - `logo`: string (URL to the department logo)
  - `createdAt`: timestamp (Date the department was created) | **Default: serverTimestamp()**
  - `updatedAt`: timestamp (Date the department was last updated) | **Default: serverTimestamp()**

## `mail`
Trigger collection for the Firebase "Trigger Email" extension.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `to`: string (Recipient email address)
  - `message`: object (Email content)
    - `subject`: string (Email subject line)
    - `html`: string (HTML body of the email)
  - `delivery`: object (Managed and populated automatically by the Firebase extension)
    - `state`: string (`"PENDING"`, `"SUCCESS"`, `"ERROR"`)
    - `attempts`: number (Number of delivery attempts made)
    - `startTime`: timestamp (Timestamp when dispatch started)
    - `endTime`: timestamp (Timestamp when dispatch finished)
    - `error`: string | null (Error message if state is `"ERROR"`, or `null` on success)
    - `leaseExpireTime`: timestamp | null (Internal queue lock lease timer)
    - `sendgridQueueId`: string | null (SendGrid queue ID, or `null` if using SMTP)
    - `info`: object (Detailed SMTP / Mail server response data)
      - `accepted`: array of strings (List of accepted recipient emails)
      - `rejected`: array of strings (List of rejected recipient emails)
      - `pending`: array of strings (List of pending recipient emails)
      - `messageId`: string (Unique SMTP message tracking ID header)
      - `response`: string (Server status code and response, e.g. `"250 2.0.0 OK"`)

## `buildings`
Manages campus buildings and infrastructure metadata.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `name`: string (Full name of the building, e.g., "Administration Building")
  - `code`: string (Short building code, e.g., "ADM")
  - `createdAt`: timestamp | **Default: serverTimestamp()**
  - `updatedAt`: timestamp | **Default: serverTimestamp()**

## `rooms`
Centralized inventory of all campus rooms and their real-time status.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `buildingId`: string (Reference to the parent building document ID)
  - `name`: string (Room name, e.g., "Registrar Receiving")
  - `code`: string (Full room code, e.g., "ADM-101")
  - `type`: string (Lecture Room, Laboratory, Office, Meeting Room, or Studio)
  - `floor`: number (The specific floor where the room is located)
  - `capacity`: number (Room seating/standing capacity)
  - `status`: string (`"Available"`, `"Unavailable"`, or `"Maintenance"`)
  - `image`: string (URL to the room's photo)
  - `description`: string (Detailed description of the room)
  - `amenities`: array (Flat array of strings, e.g., `["WiFi", "Projector"]`)
  - `availableDays`: array (Days of the week the room is available, e.g., `["Monday", "Tuesday"]`)
  - `startTime`: string (Daily availability start time, e.g., "08:00")
  - `endTime`: string (Daily availability end time, e.g., "17:00")
  - `minBookingMins`: number (Minimum allowed booking duration in minutes)
  - `maxBookingMins`: number (Maximum standard booking duration in minutes; extended requests may exceed this with Admin/Registrar approval)
  - `createdAt`: timestamp | **Default: serverTimestamp()**
  - `updatedAt`: timestamp | **Default: serverTimestamp()**

## `comments`
Shared room feedback displayed in a separate panel to the right of the Buildings & Rooms room information popup. The header's Show/Hide Comments button toggles the panel; on smaller screens it overlays the information popup. Hiding the panel preserves the current draft while the room information popup remains open.

The comments panel matches the information popup's measured width and height. Its comment list scrolls above the composer at the bottom. The header toggle is an icon sized to the full title-and-description block. Comment avatars subscribe to each visible author's existing `users/{authorId}.profilePicture`, including comments posted before avatars were added, and use the Members table's slate user-icon fallback when a picture is missing or fails to load. No additional comment fields are required.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `roomId`: string (Reference to the room document ID)
  - `authorId`: string (Firebase Auth UID of the commenter)
  - `authorName`: string (Snapshot of the commenter's formatted profile name; up to 200 characters)
  - `text`: string (Trimmed comment; required, maximum 1,000 characters)
  - `createdAt`: timestamp | **Default: serverTimestamp()**
- Signed-in users can read and post comments for existing rooms. Authors can delete their own comments, and Admins or Registrars can delete any comment after confirmation. The UI uses the `manageFacility` callable, which verifies an active profile and ownership or an accepted Admin/Registrar membership, then deletes the comment and writes its audit event atomically. Posting still uses Firestore directly. The local comment delete rule and supplied deployed policy still permit direct writes outside the callable; those bypass this audit flow. Comments cannot be edited through the UI. The local create rule requires the authenticated author's UID and a server creation timestamp.
- The popup filters by `roomId`, subscribes to the newest 20 comments, and can load older comments in increments of 20. The `comments` composite index on `roomId` (ascending) and `createdAt` (descending) in `firestore.indexes.json` keeps reads bounded. If that index is unavailable, the popup subscribes to all comments for this room using the default single-field index, sorts by timestamp locally, and displays the same pages. Loading failures do not disable posting; permission failures are displayed explicitly, and the user can retry loading without closing the popup. Deploy the updated `firestore.rules` to enforce comment permissions.
- Deleting a room retains its comment documents; they are inaccessible for reading or new posts once the room no longer exists.

## `memberships`
Tracks the association between users and departments.

A department can have multiple Program Head memberships. Each assignment, role change, acceptance, or removal affects only that member's membership; promoting a Program Head does not demote existing heads. The one-Dean-per-department assignment rule remains unchanged.

- **Document ID**: Auto-generated ID (or a composite like `userId_department`)
- **Fields**:
  - `userId`: string (Reference to the user's UID; empty string for pending invited users)
  - `firstName`, `surname`: string (Name parts copied from the user profile at signup/reactivation)
  - `fullName`: string (Compatibility name in First name Surname order)
  - `email`: string (User's email address)
  - `department`: string (Reference to the department's code, or "Administrative Office" for Admin, "Registrar's Office" for Registrar)
  - `role`: string (User's role: Admin, Registrar, Dean, Program Head, or Instructor)
  - `status`: string (`"accepted"`, `"pending"`, `"declined"`) | **Default: "pending" on invitation, "accepted" on signup/activation**
  - `joinedAt`: timestamp | string | **Default: "" on invitation, serverTimestamp() on acceptance**
  - `createdAt`: timestamp | **Default: serverTimestamp()**

## `reservations`
Manages room reservation requests and their approval status.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `roomId`: string (Reference to the room document ID)
  - `buildingId`: string (Reference to the building document ID)
  - `userId`: string (Reference to the user's UID)
  - `date`: string (Date of reservation, e.g., "2024-05-20")
  - `startTime`: string (e.g., "08:00")
  - `endTime`: string (e.g., "09:00")
  - `duration`: number (Duration in minutes)
  - `requestType`: string (`"Standard"` or `"Extended"`; missing values on legacy records are treated as Standard)
  - `extensionReason`: string (Legacy field; no longer collected, displayed, or required. Existing stored values are preserved.)
  - `purpose`: string (Required reason for new reservations; trimmed, maximum 50 characters)
  - `subjectCode`: string (Optional; trimmed and saved in uppercase, or an empty string when omitted. Reservation entries in ScheduleModal display N/A when empty.)
  - `classSection`: string (Optional; trimmed and saved in uppercase, e.g., "3BSIT - 1", or an empty string when omitted. Reservation entries in ScheduleModal display N/A when empty.)
  - `department`: string (Required for new reservations; automatically copied from the reserving user's membership, including the administrative or registrar office for those roles; read again during the reservation transaction)
  - `attendees`: number (Expected number of attendees)
  - `status`: string (`"Pending"`, `"Approved"`, `"Declined"`, `"Cancelled"`, or `"Completed"`) | **Default: "Pending"**
  - `declinedReason`: string (Optional reason if declined by reviewer or auto-expired)
  - `cancellationReason`: string (Optional; automatic cancellation explains that a class schedule occupies the reserved room/time)
  - `cancelledByScheduleId`: string (Optional reference to the saved schedule that caused automatic cancellation)
  - `cancelledAt`: timestamp (Optional automatic cancellation timestamp)
  - `autoProcessed`: boolean (Optional flag for automatic status changes)
  - `completedAt`: timestamp (Optional timestamp when an approved reservation concludes)
  - `createdAt`: timestamp | **Default: serverTimestamp()**
  - `updatedAt`: timestamp | **Default: serverTimestamp()**

Extended reservations cover one date within the room's operating hours and available days. The form uses start and end time pickers, bypassing only the standard maximum duration and 90-minute slot boundaries. Minimum duration, capacity, reservation date limits, the two-hour same-day submission lead time, and reservation/class conflicts remain enforced. Pending extended requests hold their selected interval just like standard requests. The room's current availability, hours, days, minimum duration, and capacity are read again during extended submission. My Reservations, Manage Reservations, reservation details, and ScheduleModal (including its PDF output) label these bookings Extended reservation; the calendar repeats the booking in each overlapping slot.

Before approving an Extended request, `updateReservationStatus` transactionally rereads the room, same-room reservations, schedules, and academic years. It rejects invalid times, events that already started (Philippine time), changed room constraints, overlapping Pending/Approved requests, and conflicting class meetings within their semester dates. A separate extension reason is not required; the form retains its required Purpose field for all bookings. Legacy split sessions and workbook meetings are included; unresolved class terms conservatively block overlapping approvals. Standard approval behavior is unchanged. Deploy the updated `updateReservationStatus` callable to enable this server check; no new collection or index is required.

Saving a new schedule or changing its room, weekdays, times, academic year, or semester triggers `cancelReservationsForSchedule`. It cancels overlapping Pending/Approved reservations for the same room within the inclusive semester dates, considering every resolved workbook meeting and legacy split sessions. Saved Draft/Plot schedules take precedence; Returned/inactive schedules, expired reservations, terminal statuses, and adjacent time slots are excluded. Legacy academic years use their stored full-month boundaries when exact dates are absent. Missing/invalid/ambiguous terms are skipped. Paginated Firestore transactions recheck the current schedule, semester dates, and reservation status, making duplicate/out-of-order deliveries safe. Cancellation preserves the record and records its reason, timestamp, and schedule ID. The existing status-change notification includes the reason. This is asynchronous after Save and requires deployment of `cancelReservationsForSchedule` and `notifyReservationStatusChanged`; it does not backfill unchanged schedules or restore reservations when schedules are removed.

## `logs`
Append-only audit events. Manage Reservations uses the `updateReservationStatus` callable to atomically update a reservation and create one log per actual status change (Approve, Decline, or Edit Status).

Schedules use `logDepartmentWorkbookSave`, an auth-context Firestore trigger on the canonical department semester manifest. Each meaningful committed workbook revision produces one `schedule.workbook_saved` event in category `Scheduling`. The manifest carries an optional version-1 `audit` summary in the same transaction as its sheet references and schedule projection. It contains the revision ID, previous revision, operation kind (`created`, `imported`, `updated`, or `repaired`), full change counts, up to 80 before/after descriptions (values limited to 400 characters), an omitted-description count, and whether a comparison baseline was available. The summary covers schedule additions, updates and removals; subject, faculty, room, time, day, year, section and status edits; cells, comments, notes, links, formatting, layout, schedule setup, and sheet additions/removals/renames/order. Selection-only saves produce no event. Unsaved changes and failed commits are not logged. Schedule update counts compare authored schedule fields such as room, faculty, meeting time/day, subject, section and status. Recalculated meeting references, validation results and parallel-group links still refresh in the schedule projection but do not count as member edits. Raw row values are already covered by workbook cell changes and are not duplicated as schedule field changes. One room-cell edit can therefore appear as one cell edited and one schedule updated, describing the same edit at two levels. Existing events retain their originally recorded counts.

Schedule log IDs are a SHA-256 digest of source path and revision ID, prefixed `schedule_`. Transactional creation makes trigger retries idempotent. The trigger consumes the event's immutable summary, so later saves or deleted sheet data do not rewrite earlier changes. `createdAt` is the manifest commit time. Actor identity comes from the event's auth context with server-read user/membership names and role. Both `unknown` and client `api_key` contexts are considered; an `api_key` principal must resolve to an existing user profile, and a role is used only when the referenced membership belongs to that principal. Missing identities, API-key-only principals, service accounts, system and unauthenticated contexts use Unknown rather than trusting `savedBy`. Names/roles are resolved when the trigger runs. Change summaries originate in the workbook client; this is application history, not independent verification of arbitrary direct database edits. Historical revisions and clients that do not write an audit summary are not backfilled. Existing events that discarded their actor ID cannot be attributed reliably from the current workbook's latest saver.

Deploy `logDepartmentWorkbookSave` to enable schedule logging. If using the strict local workbook rules, deploy the updated audit-field allowlist as well; review the existing deployed-policy note before deploying the entire rules file. Logs → Schedules reads real events using the existing `action` ASC / `createdAt` DESC index, shows the department and term as the source, and opens the saved change descriptions in Details without downloading the current workbook. Search, filters, loading older events, summaries, and CSV export use the loaded window.

### Facilities events

Buildings & Rooms uses `manageFacility` for building/room creation, editing, deletion, bulk room deletion, and comment deletion. Each mutation and its event commit in the same Firestore transaction with server-read actor identity and before values. Events use `category: "Facilities"` and actions `facility.building_created`, `facility.building_updated`, `facility.building_deleted`, `facility.room_created`, `facility.room_updated`, `facility.room_deleted`, or `facility.comment_deleted`. Building/room management requires an active profile and an accepted Admin/Registrar membership. Comment authors can delete their own comments without an accepted department membership; moderators require accepted Admin/Registrar membership.

Events use IDs `facility_{operationId}` (bulk room events append a room ID after the first event), `requestFingerprint` for retry protection, the common actor/source/timestamp fields, `targetCollection`, `targetId`, `targetSnapshot`, and `changes` with before/after values for edited fields. Room events retain the building ID, name and code; comment events preserve text, author identity, posting date, and room/building context. Initial values are saved as a snapshot, with creation summaries rather than edit arrows. Deletion logs survive source deletion. No-op edits, repeated deletions and failed transactions produce no new success events.

Bulk room creation records each successfully created room independently. Bulk room deletion uses transactions of up to 200 room deletes and events. Building deletion queries all current associated rooms, removes them atomically with the building, and records one building event containing `deletedRooms` (IDs/names/codes) and a room count; it retains comment documents, matching existing behavior. Buildings with more than 498 rooms must have rooms removed through bulk deletion first to stay within the transaction write limit. Room image uploads finish before creation/update so the event captures the final URL; old/deleted room images are cleaned up only after the database transaction succeeds. Storage operations are separate from Firestore transactions.

Deploy `manageFacility` before using these updated actions. Logs → Facilities reads the latest 100 facility events, supports loading older events, search, filters, summaries and CSV export. It reuses the existing `logs` index (`action` ASC, `createdAt` DESC). Details opens the saved source snapshot, exact edits, deleted comment text, and rooms removed with a building. Historical events are not backfilled. This does not log comment creation, map edits, or direct writes outside these actions. Schedules and Facilities both read real events without sample records.

### Member and reservation events

Members uses the `manageMember` callable to save each member action and its Accounts log in the same transaction. Supported actions are `account.invited`, `account.reinvited`, `account.member_updated`, `account.invitation_updated`, `account.deactivated`, `account.invitation_cancelled`, and `account.reinvitation_cancelled`. Bulk invitations record one event per successfully queued recipient. Editing a pending invitation, assigning a previously unassigned membership, and removing a department are also recorded. No-op saves, existing users, already-pending invitations, and failed transactions do not produce success events. Email events confirm queuing, not delivery or acceptance.

Accounts events use document ID `account_{operationId}`. They include `category: "Accounts"`, `operation`, `requestFingerprint` (SHA-256 digest for retry protection), server-read actor fields, `memberName`, `memberEmail`, `memberRole`, `department`, `isReactivation`, `source`, `createdAt`, and `changes` with before/after values for the fields changed (`role`, `department`, `membershipStatus`, `membership`, `invitationStatus`, `isActive`, or `pendingInvitations`). `targetCollection`/`targetId` reference the affected membership or user; cancelled invitations retain a historical membership reference and member snapshot even if the pending membership is deleted. Legacy invitations without a membership reference use an existing user or the log itself as the source snapshot. Invitation bearer tokens and email HTML are never stored in logs. The callable requires an active, accepted Admin, rejects stale edits and conflicting Dean assignments, and preserves other Program Head memberships and existing memberships on re-invitation cancellation.

Deploy `manageMember` before using these Members actions. The Accounts tab displays the latest 100 events, supports loading older events, search/filtering, and CSV export, and reuses the `logs` composite index (`action` ASC, `createdAt` DESC) with an action `in` query. Historical member identities and changes are read from the log snapshot. Existing events are not backfilled; invitation acceptance and profile edits outside Members are outside this callable's scope.

The tab is labelled Members in the UI. Its right-aligned Details eye button opens Member Log Details, showing the recorded action, actor, event date/time, affected member snapshot and Before/After cards first. Invitations and re-invitations show their queued-action summary without initialization changes. Opening it reads the saved source membership and linked user, or the source user and its membership. Current member information appears in a separate expandable section. The scrollable content is capped at 400px, with the header and Close button fixed. Deleted or unreadable source records fall back to the saved log snapshot with an explanatory notice; opening details performs no writes.

- **Reservation event document ID**: Auto-generated ID; retained across transaction retries.
- **Fields**:
  - `action`: `"reservation.status_changed"`
  - `targetCollection`: `"reservations"`
  - `targetId`: Reservation document ID
  - `actorId`, `actorName`, `actorRole`, `membershipId`: Authenticated UID and server-read member identity at the time of the change; the name uses Surname, First name when available, otherwise fullName or UID.
  - `changes`: `{ status: { before, after } }`
  - `createdAt`: Server timestamp
  - `source`: `"user"`
  - `roomId`, `buildingId`, `requesterId`, `department`, `reservationDate`: Reservation context captured at the time of the change; legacy missing values are empty strings.

The callable requires an accepted Admin/Registrar membership and rejects explicitly deactivated profiles. It reads current documents in a transaction, rejects stale expected statuses, and skips no-op updates without creating duplicate logs. A failed transaction saves neither the status nor the log. Existing status-change notifications still run from the reservation update. Logs survive reservation deletion.

Deploy `updateReservationStatus` and the updated `firestore.rules` before using the new status actions. Rules allow signed-in users to read logs and deny all client log writes, including nested log documents; Admin SDK writes bypass these rules. Existing permissive rules for other top-level collections remain unchanged, so direct reservation writes outside this callable are not forced to create logs. This feature covers Manage Reservations only; My Reservations, automated status changes, deletions, and historical changes are not logged by this callable. The first Logs tab, Reservations, reads these events live using action == reservation.status_changed ordered by createdAt descending. It initially loads the latest 100 records and can load older logs in increments of 100. Each row names the resulting status, spells out the recorded before/after status, and resolves the saved `requesterId` and `roomId` to the current requester and room names in the Source record column. The Details column opens Reservation Log Details, showing the recorded actor, event timestamp, before/after status, booking date and department first. A separate expandable Current reservation information section reads `reservations/{targetId}` and its related requester/room; it is labelled as current information that may differ from the event. Deleted or unreadable reservations leave the historical event visible with an explanatory notice. The modal opens before source loading finishes and performs no writes. Its scrollable content is capped at 400px, with a fixed header and Close button. Search, filters, summaries, and CSV export apply to the loaded window; dates and times use Asia/Manila. Schedules, Members and Facilities read their own live events. Deploy the logs action/createdAt composite index in firestore.indexes.json. Loading errors are shown explicitly with Retry; no sample records are mixed into Reservations.

## `schedule`
Manages schedule allocations for subjects, rooms, and instructors.

### Workbook schedule rows (schema version 2)

The semester workbook's **Save** writes one document per nonempty row assigned to years 1–4 in Schedule Setup, across all configured sheets. Empty separators, curriculum headings, and unconfigured sheets are skipped. Hidden sheets, rows, and columns are included. Edited cell values and merged Faculty/F2F cells are respected.

- **Document ID**: deterministic `workbook_` ID containing the department ID, academic year ID, semester key, sheet name, and Excel row number. Row coordinates identify the current snapshot; inserting/deleting rows or renaming sheets replaces the affected IDs on the next save.
- **Header fields**:
  - `college`, `subjectArea`, `subjectCode` (Code), `subjectTitle` (Descriptive Title), `course`, `classSection` (Section): string
  - `units`: `{ lec, lab, total }`, each number or null
    This breakdown applies to legacy 21-column workbooks only. New paired-template schedules use `credits`: number or null from the course template's Credits column, with no `units` object or inferred lecture/lab credit split. Their next Save replaces any earlier unit breakdown for the same template schedule row; unrelated legacy records are not migrated.
  - `hours`: `{ lec, lab, total }`, each number or null; the template's unnamed Lec/Lab/Total group after Units
  - `maxStudents`: number or null (Max No. of Stud.)
  - `faculty`, `f2fTime`, `f2fDays`, `f2fRoom`: `{ lec: string[], lab: string[] }`
  - `rawValues`: the 21 original displayed cell strings, including blanks and unparsed numeric values
- **Meetings**: `meetings` is an array of `{ format, faculty, time, day, room, startTime, endTime, days, instructorId, roomId, buildingId }`. `format` is Lec or Lab. Parsed times use 24-hour `HH:mm`, and `days` uses Mon–Sun abbreviations. Slash, semicolon, and newline separate entries; commas remain part of faculty names and N/A stays one placeholder. Multiple times/faculty/rooms pair by position. A single value is shared across meetings. Days pair when their count matches multiple meetings; otherwise the day set applies to each meeting. One time with two days and one faculty/room is one recurring meeting. Blank positions and invalid entries are retained rather than shifted or discarded.
- Faculty IDs resolve to active, accepted Instructor or Program Head memberships in the matching department; room IDs resolve by code/name. Only unique matches are used. Unmatched/ambiguous names and invalid or incomplete values remain saved with `validationIssues`; they do not receive guessed resource IDs.
- Faculty-existence validation checks every nonblank Lec/Lab faculty entry against that department's active Instructor/Program Head directory. Complete names match regardless of case, spacing, punctuation, accents, or surname-first comma notation. Multiple names are checked separately; unknown names and placeholders other than TBA receive red validation shading within the schedule header columns and hover messages in both the editor and Schedule Setup preview. TBA is allowed regardless of case or surrounding whitespace, retains its text, and saves without an instructor ID or faculty-validation error. Loading/read failures skip this check rather than flagging all names. The same check is included in saved `validationIssues`.
- Editable workbooks automatically format Faculty Lec/Lab entries in title case as Surname, First name after editing, pasting, importing, or loading a configured schedule. Unique directory matches supply the registered spelling; unmatched/ambiguous names are also formatted but retain their validation errors and receive no guessed membership IDs. For names without a comma, the last word is treated as the surname; compound surnames can be entered explicitly before a comma. TBA is always uppercase. Separators, N/A placeholders, cell styling, and fonts are preserved. Formatting also works when the faculty directory is unavailable. Save and export retain the corrected cell text; read-only workbooks are not rewritten.
- Room-existence validation checks every nonblank Lec/Lab room entry against the live `rooms` collection by normalized code or name (case, spacing, dots, and hyphens are ignored). Multiple entries are checked separately, including incomplete meetings. TBA is allowed regardless of case or surrounding whitespace, retains its text, and saves without room/building IDs or a room-validation error. Other unknown rooms receive red validation shading within the schedule header columns and hover error messages in both editor and Schedule Setup preview. Loading/read failures do not masquerade as an empty room directory. The same check is included in saved `validationIssues`.
- **Scope/source fields**: `source: 'workbook'`, `schemaVersion: 2`, `sourceWorkbook` (semester document path), `sourceSheet`, `sourceRow` (1-based), `yearLevel`, `departmentId`, `department`, `academicYearId`, `academicYear`, `semester` (1st/2nd Semester), `semesterKey` (sem1/sem2), `workbookRevision`, `workbookRevisionId`, `savedBy`, `orderIndex`, timestamps.
- `status` defaults to Draft on workbook save. The toolbar's Plot tool marks selected nonempty schedule rows assigned to a year as Plot; Save persists each row's status in the schedule collection. Per-sheet `ScheduleSetup.rowStatuses` maps zero-based row indexes to Plot in the saved editor state, preserving status across reopening, undo/redo, sheet duplication/rename, and whole-row insertion/deletion. Removing a row's year assignment clears its Plot marker; registering a different header clears the old markers. Empty separators and curriculum headings are not plotted. `parallelSourceRow` and `groupId` retain the validation's parallel groups, including its time-continuation rules. `type` retains the College label or inherited parallel classification.
- The workbook editor displays a read-only Status column immediately after the configured F2F Room header. It is not a lettered worksheet column, cannot be edited or resized, and is excluded from cell addresses, clipboard contents, XLSX exports, and the 21 saved template fields. It shows Draft/Plot for assigned nonempty schedule rows and stays blank for separator/heading rows.
- Compatibility fields (`id`, `parentId`, `isSplitSession`, `format`, `startTime`, `endTime`, `days`, `instructorId`, `roomId`, `buildingId`) expose the first meeting. `instructorIds` and `roomIds` list all resolved resources. Calendar/resource readers expand `meetings` through `scheduleMeetingRecords`; department subject statistics continue counting stored rows.
- Instructor timetables and their PDF exports display the registered room name when `roomId` resolves, otherwise the individual meeting's saved `room` text. TBA is shown only when neither is available; displaying saved text does not assign a room ID.
- Buildings & Rooms uses `ScheduleModal` to subscribe to schedule documents whose `roomId` matches or whose `roomIds` contains the selected room. The room timetable displays only that room's individual meetings with valid times/days, including secondary meetings and parallel sections. School-year IDs and semester keys isolate workbook terms, with label matching for legacy schedules. Cards show course/section and fall back to saved faculty names when membership IDs are unresolved; PDF output uses the same meeting data.
- Workbook metadata, all schedule row writes, and deletion of obsolete rows are committed in one transaction after Storage uploads finish. The term revision prevents concurrent saves from mixing versions. Only rows with this exact `sourceWorkbook` are replaced; legacy schedules and other departments/terms are untouched. Saving with no assigned subject rows removes this workbook's previously synchronized rows.

### Legacy schedule documents

Existing manually created documents remain supported by schedule readers.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `id`: string (Locally generated identifier used for parent/child mapping)
  - `department`: string (e.g., "CITE")
  - `session`: string (Session group label, e.g., "Combine") | **Default: null**
  - `isSplitSession`: boolean (Indicates if this schedule has multiple sessions)
  - `classSection`: string (e.g., "BSIT 3-1")
  - `type`: string (e.g., "open lab", "parallel", "normal")
  - `subjectCode`: string (e.g., "ITE 298", "ITE 083", "ITE 031")
  - `subjectTitle`: string (e.g., "IT project management", "Data Structures and Algorithms", "Networking 1")
  - `format`: string (e.g., "Lec", "Lab", or "Flexible")
  - `startTime`: string (e.g., "07:30")
  - `endTime`: string (e.g., "09:00")
  - `days`: array (Days of the week, e.g., `["Thu", "Sat", "Mon"]`)
  - `buildingId`: string (Reference to the building document ID)
  - `roomId`: string (Reference to the room document ID)
  - `instructorId`: string (Reference to the memberships collection)
  - `groupId`: string (Unique ID used to group parallel schedules together)
  - `parentId`: string (Reference to the main schedule's locally generated `id` if this is a child row)
  - `orderIndex`: number (Visual top-to-bottom sorting index)
  - `status`: string (`"Draft"`, `"Plot"`, `"Revise"`, `"Return"`) | **Default: "Draft"**
  - `academicYear`, `semester`: string (school year label and 1st/2nd Semester)
  - `academicTerm`: string (older combined term label, if present)
  - `createdAt`: timestamp | **Default: serverTimestamp()**
  - `updatedAt`: timestamp | **Default: serverTimestamp()**

## `academicYears`
Tracks current and historical academic years and both semester phases.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `academicYear`: string (e.g., `"2024-2025"`)
  - `isActive`: boolean (Only one document should be true at a time)
  - `sem1`: object
    - `startDate`: string (Exact inclusive start date in `YYYY-MM-DD` format)
    - `endDate`: string (Exact inclusive end date in `YYYY-MM-DD` format; must be after `startDate`)
    - `startMonth`: string (Derived from `startDate`, retained for compatibility)
    - `startYear`: number (Derived from `startDate`)
    - `endMonth`: string (Derived from `endDate`, retained for compatibility)
    - `endYear`: number (Derived from `endDate`)
    - `phase`: string (`"Closed"`, `"Drafting"`, `"Plotting"`, `"Revision"`, `"Final"`, or `"Ended"`)
  - `sem2`: object (Same fields and phases as `sem1`)
  - `createdAt`: timestamp | **Default: serverTimestamp()**

Semester dates must fall within the academic year's two calendar years. The second semester starts after the first ends, and academic-year ranges cannot overlap. New academic years default to July 6–October 31 for the first semester and November 3–March 15 of the following year for the second semester. Defaults follow the entered academic year and remain editable. Older records without exact dates display their saved month/year ranges; editing or managing them prefills missing dates with these defaults, while preserving any saved exact dates. Overlap checks treat legacy ranges as the full start/end months. Current-semester selection uses exact dates when available and falls back to month/year values for older records.

`autoEndSemesterPhases` runs daily at midnight in `Asia/Manila`. After a semester's inclusive end date, it changes its phase to `Ended`, including overdue semesters in inactive academic years. Exact dates take precedence; legacy records use the last day of their saved end month. Invalid/inverted date ranges, missing/unknown phases, and semesters already `Ended` are skipped. Paginated transactions recheck dates and phases to preserve concurrent edits. Only the phase fields change; the active academic year and dates stay unchanged. The existing academic-year notification trigger reports changes for the active year.

## Department semester workbooks

### Production Firestore workbooks

Department schedule creation imports the supplied **Faculty Schedules** and **PHINMA Department Courses** templates together, with **Rooms & Labs** as an optional third template. Editors choose one worksheet from each file. An existing workbook with the first two templates can import Rooms & Labs alone without replacing faculty/course edits. Original worksheet cells, merges, dimensions, and formatting are retained. Each imported sheet has a persisted `!rormsDepartmentTemplate` marker (`version: 1`, `role: faculty|courses|rooms`) inside its compressed editor snapshot. Full reimport replaces marked template sheets; room-only reimport replaces only the previous room sheet. Other sheets remain. Save regenerates schedules from current template cells and edits, so no manual 21-column header setup is needed for these sheets. Adding a faculty assignment with a matching course creates a schedule; removing an assignment or its course removes the corresponding schedule on Save, including when the last class is removed. Faculty assignments without a matching course are reported as skipped. Ambiguous subjects, missing source sheets, unreadable assignments, and invalid time blocks block saving; missing sections, unknown subject types, curriculum semester differences, and overlapping faculty assignments are reported for review. Empty faculty blocks do not create classes.

Workbooks imported before paired-template schedule creation have no template markers. Save recognizes a unique course table by its six supplied headers and a unique faculty grid by its faculty-name/weekday/time layout, using current cells and overrides rather than sheet names. These existing imports generate schedule rows without reimporting or changing their layouts. Explicitly marked sheets remain authoritative. Missing or multiple matching sources require selecting the two sheets through Import schedule templates. Populated workbooks without recognized templates fail before publication instead of saving an empty schedule projection. A workbook with both valid templates can intentionally save zero classes after its assignments or courses are removed.

Course headers remain `Session, Semester, Code, Course, Type, Credits`. `Y3S1` supplies year level 3 and curriculum semester 1; the selected application term supplies the saved academic year/semester. Course session labels are retained as curriculum metadata and do not override that term. Faculty block names, weekday headers, and merged time rows supply meetings. `ITE 314-2` and `ITE 083 G1` provide subject and section/group identifiers. Each faculty timetable assignment cell is a separate meeting, even when adjacent cells have the same subject, section, day, and modality. The optional Rooms & Labs sheet uses room-code column headers and day/time rows; its subject/section entries assign rooms to uniquely matching faculty meetings. Consecutive room slots can split one longer faculty cell so each meeting has its own room. Missing, malformed, unmatched, or ambiguous room entries leave meetings unassigned and appear as preview warnings. `X` and blank cells do not assign a room. Room codes resolve against the existing rooms collection; unknown or nonunique codes retain their text and a validation issue without inventing a room ID. The template color legend supplies F2F/Remote Coaching/Independent Learning; unrecognized colors remain Unspecified. Lecture and Laboratory subjects save with meeting `format: Flexible` and schedule `type: open lab`; Lecture/Laboratory-only subjects use Lec/Lab. A missing type stays Unspecified. Credits never imply contact hours, a lecture/lab split, or program name.

Template schedule rows retain `sourceSheet`, physical 1-based `sourceRow`, `sourceCell`, and `sourceKey` (faculty block anchor + subject code + section). Deterministic IDs use `sourceKey` in place of the legacy row-number key to distinguish side-by-side instructor blocks. Rows additionally retain `subjectType`, `curriculumSemester`, and `curriculumSession`; rows created with the optional room sheet retain `roomSourceSheet`. Meetings may include `modality`. Resource arrays may include `flexible`/`unspecified` alongside `lec`/`lab`. Faculty names resolve only to unique active accepted Instructor/Program Head memberships in the selected department, ignoring a trailing `(NEW)` annotation for matching. Unmatched names retain text and validation issues without an invented ID. Meetings without a unique room assignment remain TBA with no room/building ID. Removing an imported room assignment on the next Save clears its room unless the Registrar separately plotted that meeting. Newly generated records start Draft. The existing atomic manifest/schedule save, revision checks, live updates, and permissions apply; no new collection or index is introduced.

Registrar plotting uses the member's ScheduleModal in Department Schedules. The room dropdowns stage choices locally; Plot updates the existing `schedule` documents in one Firestore transaction. It saves each meeting's room text, `roomId` and `buildingId`, the first meeting's top-level room/building, all `roomIds`, the `f2fRoom` resource arrays, and Draft/Plot status. A class is Plot when all physical (F2F/Unspecified, including legacy meetings without modality) meetings have rooms; other classes remain Draft. Selecting TBA clears an assignment. `registrarPlot` stores `{ version: 1, revisionId, savedBy, assignments: [{ key, roomId, room, buildingId }] }`; keys contain the instructor identity, start/end, sorted days, format, and modality. `plottedBy`, `plottedAt`, and `updatedAt` record the latest Plot action. The transaction rereads the actor's profile/membership, current semester phase, selected schedule records, rooms, and existing competing schedules. It rejects stale selections, removed records, unavailable rooms, invalid operating days/hours, insufficient capacity, and overlapping classes in the selected academic year/semester. Pending or Approved reservations do not block classes; the existing schedule-triggered cancellation workflow applies after Plot. This client workflow uses the project's existing top-level Firestore permissions; it does not add a callable or change deployed rules. Direct writes by other clients remain subject to those existing permissions.

Workbook Save retains Registrar assignments for matching meeting keys when the workbook room is TBA, including existing Plot status. Previously assigned rooms without Registrar metadata are retained too. Subject title/credit edits do not erase rooms. If a source block moves or its sheet is renamed, a unique subject/section/program/year/instructor match retains its matching meeting rooms; ambiguous matches are not guessed. Removed classes are still deleted. A changed instructor, day, time, format or modality changes the meeting key; its old room is dropped and the class returns to Draft until the required rooms are assigned. Worksheet rooms explicitly assigned to a different room take precedence over retained metadata. Save transactionally rechecks the Plot revision before replacing/deleting changed schedule documents; concurrent Plot changes fail that Save with a retry message instead of being overwritten. Repeated calendar cards for a merged meeting share the same staged choice. Other ScheduleModal uses retain PDF download and their existing read-only room labels.

My Department and Department Schedules use DepartmentExcelScheduleModal and save directly to Firestore. Workbook metadata is stored at `departments/{departmentId}/workbooks/{schoolYear}/semesters/{sem1|sem2}`, with the school year formatted as `2026-2027`. Each sheet is stored at `sheets/{workbookId}_sheet_{index}`, compressed snapshots at `chunks/part_{index}`, and small text/style changes at `cells/{cellAddress}` beneath that sheet. Production workbook IDs use `workbook_` plus the SHA-256 hash of the original year-ID Storage manifest path. The version 3 fields, compression, dual slots, patch thresholds, save locks, revision checks, and live updates follow the Firestore implementation described below.

Production Save also synchronizes configured schedule rows into `schedule` in the same transaction as the manifest, retaining stable schedule row IDs and removing rows deleted from the workbook. Only changed schedule rows are rewritten; unchanged rows retain the revision of their last change. Existing Storage manifests and historical paths remain readable: the loader resolves the original file's formatting locally, and the next successful Save replaces the manifest with schema version 3 while preserving `createdAt` and advancing the existing revision. Migration does not upload new Storage files or delete historical files. Subsequent opens and saves use Firestore only. Deploy the updated `firestore.rules` and `firestore.indexes.json` before saving production workbooks.

The department workbook modal listens to committed manifest revisions while open, including legacy paths until migration. After another session saves, the editor reloads the committed workbook without reopening, preserving its selected sheet and selection. Unfinished cell edits, imports, dialogs, and local saves defer application. Different cell/formatting changes merge against the last saved baseline; conflicting changes prompt the user to keep their edits or the saved edits. Incompatible layout/source changes require choosing a whole workbook. Incoming saves establish a new undo baseline. Updates occur after Save, not on every keystroke. Listeners stop on close or account/term changes; failed reloads retain local edits and offer retry.

Semesters without a saved workbook start with zero sheets and a centered empty message; a default sheet is not created automatically. Editors can add or import sheets and delete the last sheet. A workbook with zero sheets remains saveable and keeps Add sheet/Import available where permitted. Empty saved snapshots use `selectedSheet: ''`; Firestore version 3 manifests contain empty sheet ID/name/slot/revision/count arrays and no active sheet documents. After a successful production save, the website directly deletes unused `sheets` documents and their `chunks` and `cells` subcollections. Cleanup checks the committed revision, saver, latest sheet references, and save lease in every deletion transaction; a newer or staged save defers cleanup. Parents are deleted only after their children, with bounded batches and a 30-second cleanup limit. Failed or deferred cleanup does not undo a successful save: the editor displays a warning and the next Save retries, including older unused sheet trees. Closing the browser can interrupt cleanup, which resumes on the next Save. The semester manifest is retained: it advances the same term revision, reopens empty, and broadcasts to other open viewers. Production empty saves remove previously synchronized schedule rows in the normal save transaction. Deploy the updated `firestore.rules` to permit direct cleanup; no cleanup Cloud Function is required. Historical XLSX archives remain stored but are no longer needed after migration.

### Firestore sheets and saves

- **Sheet collection**: `sheets/{workbookId}_sheet_{index}`. `workbookId` is `workbook_` plus the SHA-256 hash of the original year-ID Storage term path, retained for stable sheet/chunk IDs when the manifest moves. Schema version **3** retains stable sheet and chunk IDs. Later saves update those documents; adding sheets, chunks, or previously unedited cells creates only the needed documents.
- **Compressed snapshots**: each sheet's complete editor JSON is compressed with gzip, encoded as base64 text, and stored in `chunks/part_{partIndex}`. Encoded text is divided into **400 KiB ASCII parts**. Each chunk has `slots.a` and/or `slots.b`, keeping both copies plus metadata below 1 MiB. Chunk slots contain `encoding: 'gzip-base64'`, `data`, `byteLength`, `revisionId`, `savedBy`, `membershipId`, and `updatedAt`. Top-level fields identify the workbook, department, term, sheet ID/index, and part index. No XLSX/XML archive is persisted.
- **Parent sheet slots** contain `name`, `encoding`, `jsonByteLength`, `encodedLength`, `jsonHash`, `baseHash`, `partCount`, ordered `partSlots`, `partRevisionIds`, and `partHashes`, plus save metadata. A snapshot preserves values/formulas, comments, resolved formatting, merges, hidden ranges, dimensions, colors, schedule setup, and current text/style overrides. Total uncompressed editor data is limited to 50 MiB.
- **Small cell edits**: `sheets/{sheetId}/cells/{A1Address}` stores `schemaVersion: 3`, workbook/term/sheet identity, `baseRevisionId`, workbook `revision` and `revisionId`, `text`, `styleJson`, and save metadata. Text/style changes update the same cell document atomically with the term manifest, without rewriting the snapshot. Null removes an override; an empty string explicitly clears text. Opening queries only cell records whose `baseRevisionId` matches the active snapshot and overlays them on that snapshot. Structural edits, bulk edits (over 128 changed cells per save), or large individual edits fold current overrides into a new compressed snapshot. Older cell generations remain stored but are ignored.
- **Workbook manifest**: `departments/{departmentId}/workbooks/{schoolYear}/semesters/{semester}` is updated in place. It holds `schemaVersion: 3`, `workbookId`, term identifiers, `fileName`, ordered `sheetIds`, `sheetNames`, `sheetSlots`, `sheetRevisionIds`, `cellCounts`, `selectedSheet`, `selectionJson`, `revision`, `revisionId`, `membershipId`, `savedBy`, `createdAt`, and `updatedAt`. Per-sheet references allow unchanged sheets to keep their existing snapshot generation. `cellCounts` detects missing active cell records.
- **Persistent workbook cache**: the complete saved workbook snapshot (all sheets, cell values/formulas, formatting, dimensions, hidden sheets, and schedule setup) is cached in IndexedDB, alongside the existing memory cache. It uses the bounded workbook-file cache (64 MiB memory / 150 MiB disk shared with legacy workbook files), isolated by Firebase project/app, account, and term. A single cache slot per account/term replaces older revisions after successful loads and saves, including empty saves and sheet deletions. Cache entries include the exact manifest revision/index, per-sheet generation signatures, cell-patch values, and sheet-text checksums. Before reuse, the loader fetches current server metadata and sheet parents, verifies the existence of every required chunk ID using bounded aggregate queries, and reads active cell edits. It rechecks the manifest and account before returning. Cache hits avoid downloading/decompressing large chunk payloads; live checks still require a connection. Missing sheet/chunk/cell documents retain the replacement-import workflow. Revision/generation/patch mismatches or corrupt/unavailable local storage fall back to verified cloud loading; server permission/network errors never fall back to cached data. Failed verification invalidates the local entry. Browser eviction or disabled IndexedDB affects performance only. Unsaved editor changes are not persisted in this cache.
- **Fast saves** use one transaction for changed snapshots or cells and the manifest. The transaction concurrently reads the current manifest, lock, year, and membership, checks the prior revision and semester permissions, and commits all changes together. The memory baseline scoped to the account, term, and revision avoids downloading snapshots again during subsequent saves and is rebuilt from a server-verified persistent snapshot after refresh. Preparation compares the full editor state locally; saving a small cell edit still validates/serializes the workbook but transmits only changed cell records and the manifest. The modal displays elapsed save time; console metrics report preparation, commit time, document counts, and estimated sheet/cell payload bytes (excluding manifest, lock, and protocol overhead).
- **Large-save fallback**: requests estimated above 4 MiB or touching more than six sheets use `.../workbooks/{schoolYear}/semesters/{semester}/saveLocks/current`. This reusable lease holds `status` (saving/idle), `saveId`, `savedBy`, `membershipId`, `academicYearId`, and `createdAt`, and expires after ten minutes. Up to four chunk writes run concurrently, then parent writes, then a transaction publishes the manifest and releases the lease. Cell edits are folded into snapshots for this path. Rules protect active slots and require either the matching atomic manifest commit or a fresh authorized lease. Failed staging preserves the previous complete workbook; stale/concurrent saves are rejected. Historical Storage manifests are checked for revision conflicts during migration.
- The `slots` maps in `sheets` and `chunks`, and `cells.text`/`cells.styleJson`, are exempt from indexing. `cells.baseRevisionId` remains indexed for the loader query. Deploy `firestore.rules`, `firestore.indexes.json`, and `storage.rules` before using these paths against the live project.
- Requests have a 90-second deadline and saves an eight-minute overall limit. Timeout/failure stops further publication. Lease cleanup waits at most three seconds; a late lease acknowledgement is released without resuming the cancelled save. A timed-out final commit may already have reached Firestore, so the UI asks users to reopen and check the saved version before retrying.
- A sheet, chunk, or active cell record deleted directly in Firestore permits authorized editors to import a replacement against the same term revision. Recovery rewrites the missing snapshots at stable paths and preserves creation time. Connection, permission, and malformed-data errors block saving.
- Excel import/export remains local to the browser. The retired test tab, copied modal, and test saving mode have been removed. Historical test documents and their security rules are retained; the application does not use them.

### Legacy Storage-backed workbooks (migration input)

- **Document path**: `departments/{departmentId}/workbooks/{schoolYear}/semesters/{semester}`.
- Each department, school year, and semester has an independent workbook.
- **Fields**:
  - `schemaVersion`: number (currently `1`).
  - `departmentId`, `departmentCode`, `academicYearId`, `academicYear`, `semester`: string.
  - `fileName`: string (original imported `.xlsx` filename).
  - `workbookPath`: string (Firebase Storage path to the original `.xlsx`).
  - `editorStatePath`: string (Firebase Storage path to the current editor JSON snapshot).
    - `ScheduleSetup.statusColumn` stores the physical zero-based column index for Status, immediately after F2F Room when initialized (for example W after V). It uses normal worksheet selection, formatting and borders, while its text is computed and protected. Save/export include the Status header and Draft/Plot values in actual XLSX cells. Old display-only Status formatting is migrated into normal `cellStyleOverrides`; data and formatting to its right shift one column. Validation colors also highlight Status and temporarily override its custom fill.
  - `revision`: positive integer, incremented on save.
  - `revisionId`, `savedBy`, `membershipId`: string.
  - `createdAt`, `updatedAt`: timestamp.
- **Storage files**: new saves use `department-workbooks/{departmentId}/{schoolYear}/{semester}/semesters/{revisionId}/{original.xlsx|editor.json}`. Previous uploads under `department-workbooks/.../{schoolYear}/.../workbooks/` and both historical `department-workbooks/.../{schoolYear}/.../revisions/` and `department-workbooks/.../{academicYearId}/.../revisions/` remain readable. The distinct new segment lets Storage rules check the new upload grant and academic year within their two-document lookup limit. Subsequent saves reuse the original XLSX unless replacing missing files; editor snapshots have a new revision path.
- **Upload grants**: `.../workbooks/{schoolYear}/semesters/{semester}/uploads/{revisionId}` holds `savedBy`, `membershipId`, `academicYearId`, and `createdAt`. Grants are immutable and authorize staging for ten minutes. Failed saves remove their staging objects and then their grant when cleanup succeeds. A committed workbook retains its grant.
- **Schedule rows**: saving this modal synchronizes only rows with its `sourceWorkbook`. New and historical manifest paths are queried during migration; deterministic row IDs keep their existing creation timestamps. Rows and the manifest commit together, and removed workbook rows are deleted. Other terms and unrelated rows are retained.
- **Permissions**: accepted Admin members can save during Drafting, Plotting, Revision, or Final. Accepted Dean/Program Head members can save their own department during Drafting or Revision. Registrar department workbooks are read-only in every phase; the UI hides Save and the toolbox, blocks Ctrl/Cmd+S, and exposes only View comments in each sheet's options. Viewing remains available for all phases. Workbook services reject Registrar saves independently of the UI. Registrar room plotting has a separate permission check and remains available in Drafting, Plotting, Revision, or Final. The local `canSaveWorkbook` Firestore rule excludes Registrar; deploying it is necessary for server enforcement, and the existing deployed-policy note still applies. Rules check the main `academicYears` document and membership. Stale revisions cannot overwrite newer saves. Signed-in readers can open saved workbooks; missing objects prompt an authorized replacement import without resetting the revision. The deprecated Schedule Setup dropdown is removed from the toolbox; saved legacy setup metadata remains readable.
- Opening first verifies server metadata and object generations. Cached original/snapshot files are scoped to project, bucket, and account. Access, deletions, and changed generations are rechecked before using the cached files.
