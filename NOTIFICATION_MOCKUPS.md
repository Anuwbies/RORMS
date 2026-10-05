# Notification Implementation

This legacy-named document records the live notification behavior. Notifications are created by Firebase Cloud Functions and stored beneath the recipient's user document. No frontend mock notification data remains.

## Firestore location

`users/{userId}/notifications/{notificationId}`

Each notification contains:

- `title`: notification heading
- `message`: notification body
- `type`: event category
- `isRead`: persisted read state, initially `false`
- `createdAt`: server timestamp used for ordering and relative-time display
- `sourceCollection`: collection that produced the event
- `sourceId`: source document identifier

Function event IDs are used for event-driven notification document IDs. Reservation reminders use the reservation ID. This makes retried function executions idempotent.

## Notification groups and recipients

| Sidebar group | Types | Recipients |
| --- | --- | --- |
| Booking status | `booking_approved`, `booking_rejected`, `booking_cancelled`, `booking_completed`, `booking_reminder` | User who owns the reservation |
| Buildings & rooms | `building_added`, `building_updated`, `room_added`, `room_updated`, `room_status_changed` | Instructor, Dean, Program Head |
| Department updates | `department_invited`, `department_member_removed`, `member_department_assigned`, `member_role_changed` | Affected user |
| Department updates | `department_invitation_accepted`, `department_reinvitation_accepted` | Admin and Registrar; Dean and Program Head of the affected department |
| Academic calendar | `academic_year_changed`, `academic_phase_changed` | Admin, Registrar, Dean, Program Head, Instructor |

## Trigger sources

- `reservations`: status changes and the scheduled 15-minute reminder check
- `buildings`: created buildings and edited building names or codes
- `rooms`: created rooms, edited room details, and status changes
- `memberships`: department invitations, removals, assignments, and role changes
- `invitations`: accepted invitations and accepted re-invitations
- `academicYears`: active academic-year and active-semester phase changes

## Example notifications

These examples document how live notifications can appear. They are not loaded into the UI as mock data.

### Booking status — Reservation owner

| Type | Title | Example message |
| --- | --- | --- |
| `booking_approved` | Reservation approved | Your reservation for Meeting Room A has been approved. |
| `booking_rejected` | Reservation declined | Your request for Computer Lab 2 was declined. Schedule conflict. |
| `booking_cancelled` | Reservation cancelled | Your reservation for the AVR has been cancelled. |
| `booking_completed` | Reservation completed | Your session in the Library Study Room has concluded. |
| `booking_reminder` | Booking reminder | Your reservation for MBA Hall starts in 15 minutes. |

### Buildings & rooms — Instructor, Dean, Program Head

| Type | Title | Example message |
| --- | --- | --- |
| `building_added` | Building added | Science & Technology Building has been added to the system. |
| `building_updated` | Building updated | Administration Building details have been updated. |
| `room_added` | Room added | Computer Lab 3 has been added and is now available for scheduling. |
| `room_updated` | Room updated | Computer Lab 3 details have been updated. |
| `room_status_changed` | Room status changed: Available | Computer Lab 3 is now available for reservations. |
| `room_status_changed` | Room status changed: Unavailable | Meeting Room B is now unavailable for reservations. |
| `room_status_changed` | Room status changed: Maintenance | Science Lab A has been placed under maintenance. |

### Department updates — Affected user

| Type | Title | Example message |
| --- | --- | --- |
| `department_invited` | Department invitation | You have been invited to join College of Information Technology as Instructor. |
| `department_member_removed` | Removed from department | You have been removed from the College of Information Technology department. |
| `member_department_assigned` | Department assignment updated | You have been assigned to College of Information Technology as Instructor. |
| `member_role_changed` | Role updated | Your role in CITE has changed from Instructor to Program Head. |
| `member_role_changed` | Role updated | Your role in CITE has changed from Program Head to Instructor. |

### Invitation activity — Admin, Registrar, department Dean and Program Head

| Type | Title | Example message |
| --- | --- | --- |
| `department_invitation_accepted` | Invitation accepted | Jordan Lee accepted the invitation to join CITE as Instructor. |
| `department_reinvitation_accepted` | Re-invitation accepted | Taylor Cruz accepted the re-invitation and reactivated their account. |

### Academic calendar — All roles

| Type | Title | Example message |
| --- | --- | --- |
| `academic_year_changed` | Active academic year changed | The active academic year is now 2026–2027. |
| `academic_phase_changed` | Semester phase changed: Plotting | The 1st Semester phase for A.Y. 2026–2027 changed from Drafting to Plotting. |

The right sidebar subscribes to the signed-in user's notification subcollection. Read, delete, mark-all-read, and clear-all actions persist to Firestore.
