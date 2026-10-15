# RORMS - Room and Schedule Management System

## System Purpose
The **Room and Schedule Management System (RORMS)** is a centralized platform designed to streamline the complex process of academic scheduling. Its primary objective is to manage the mapping of instructors to specific courses, time slots, and physical rooms while preventing conflicts and optimizing campus resource utilization.

---

## User Roles & Responsibilities

### 1. System Administrator (Admin)
The Admin ensures the technical integrity and foundational data of the system.
*   **User Management:** Create, update, and deactivate user accounts (Registrar, Dean, Instructor).
*   **Master Data Management:** Define and manage the list of Buildings, Rooms (including capacity and equipment), and Departments.
*   **System Configuration:** Set global constraints, such as standard time blocks, semester start/end dates, and holiday blackout periods.
*   **Audit Logs:** Monitor system activity to ensure data security and accountability.

### 2. Registrar (Room Plotter & Global Scheduler)
The Registrar is the central authority responsible for campus-wide resource allocation and finalizing the master schedule.
*   **Room Allocation (Plotting):** Review proposed schedules from all departments and plot them into actual physical rooms.
    In Department Schedules, clicking an Instructor or Program Head opens ScheduleModal with a room dropdown on each saved meeting. Plotting means the Registrar assigns rooms to faculty schedules supplied without Rooms & Labs room assignments; the Save button commits the selected rooms together. Saving a room assignment makes that schedule Plot immediately, including partially assigned classes; unassigned meeting cards stay grey. Clearing the last assigned room returns the schedule to Draft. The same meeting shown in several calendar slots shares one room choice. Available room days, hours, capacity, and overlapping classes in the selected term are checked again when plotting. Accepted Registrar/Admin memberships can plot during Drafting, Plotting, Revision, or Final. Registrar access to department workbooks is read-only in every phase: Save and the toolbox are hidden, Ctrl/Cmd+S is blocked, and sheet options expose only View comments. All phases remain selectable for viewing. Admin workbook editing and Dean/Program Head department editing retain their existing phase permissions. The deprecated Schedule Setup dropdown has been removed from the workbook toolbox.
    In the current ScheduleModal, only assigned Draft rooms have a checkbox. Those rooms are read-only; Plot approves the checked schedules without changing their room assignments/text. Plot schedules have no checkbox and retain the existing room picker. Unassigned meetings can still receive rooms. Checking alone does not change saved status. Cards use saved status, so Draft remains grey even with an assigned room and Plot is green.
    For the compact department workbook, Plot commits room changes to both the `schedules` record and the workbook's F2F Room cells. Reopening the workbook shows the updated rooms. Department workbook saves keep unchanged Plot schedules approved; only edited schedules return to Draft, and new schedules start Draft. Room cells are authoritative: clearing one also clears that meeting's saved room/building IDs and Registrar assignment. Registrar access remains limited to room plotting; subject edits and other workbook cells retain their existing role permissions.
*   **Conflict Resolution:** Identify and resolve cross-department double-bookings, overlapping instructor schedules, and room capacity issues.
*   **Publishing:** Finalize and approve the "Proposed" departmental schedules, pushing them live for instructors and students to view.
*   **Ad-hoc Adjustments:** Manage mid-semester room changes or emergency rescheduling due to maintenance.
*   **Reporting:** Generate reports on room utilization, peak-time usage, and overall scheduling efficiency.

### 3. Dean (Department Head / Academic Planner)
The Dean acts as the primary academic planner for their specific department.
*   **Schedule Creation:** Create the initial draft schedule for their department, mapping subjects, instructors, sections, times, and days.
    Department creation uses the supplied Faculty Schedules and PHINMA Department Courses Excel templates together, with Rooms & Labs as an optional third sheet. The faculty timetable supplies instructor/day/time/subject/section; the course table supplies title, year level, credits, and subject type. The room table supplies room codes for uniquely matching faculty meetings, including separate rooms for adjacent time slots. Original templates remain editable in their existing layouts. Save regenerates schedule records from those cells: Plot when at least one meeting has a resolved Rooms & Labs assignment, otherwise Draft for later Registrar plotting. Lecture and Laboratory means Flexible/Open Lab, with delivery chosen by the instructor; the system does not invent a lecture/lab hour split. Meetings without a matching room remain TBA for later Registrar plotting. Existing department/semester editing permissions still apply.
*   **Manage Courses:** Accepted Deans and Program Heads can edit and save their department's complete courses workbook without choosing a semester. Save also writes populated rows to the `courses` collection; blank rows stay in the workbook. Admin memberships are permitted by the persistence service and Firestore rules. Course saves do not publish semester schedules.
*   **Room Requests:** Specify preferred rooms or building requirements for their departmental courses.
*   **Instructor Load Management:** Ensure that instructors are not over-scheduled and that their teaching hours align with department policies before submitting.
*   **Submission:** Submit the drafted departmental schedule to the Registrar as a "Proposed" schedule for room allocation.

### 4. Program Head
*   **Department Assignment:** A department may have multiple Program Heads, each represented by their own membership. Assigning or removing one does not change the others.
*   **Schedule Management:** Accepted Program Heads can edit their department's semester workbook during Drafting and Revision, and can be assigned teaching schedules.
*   **Member Management:** Program Heads can view department members; member-management actions remain restricted to the existing authorized roles.

### 5. Instructor
The Instructor is the end-user who utilizes the assigned resources to deliver education.
*   **Schedule Viewing:** Access a personalized dashboard showing their assigned courses, rooms, and time slots.
*   **Availability Submission:** Submit "Preferred Teaching Times" or personal constraints (e.g., research blocks) for consideration during the scheduling phase.
*   **Change Requests:** Formally request a room or time change if the assigned resource does not meet the course's pedagogical needs.
*   **Room Reporting:** Report issues with room equipment (e.g., broken projector) directly through the system.

---

### 6. University Administrator
* **Department Assignment:** Always assigned to General Service Department. Invitations, role edits, signup, and reactivation preserve this fixed department.
* **Access:** Dashboard, Buildings & Rooms, Manage Reservations, Analytics, and Reports.
* **Dashboard:** A dedicated live facilities/reservations dashboard shows pending requests, today's reservations, building/room readiness, seating capacity, seven-day approved/pending demand, and shortcuts to its four other tabs. Dates use Philippine time. It reads only buildings, rooms, and reservations.
* **Analytics and Reports:** Only Reservations and Buildings & Rooms sections are visible; saved selections for Members or Schedules fall back to Reservations.
* **Facilities:** Can create, edit, and delete buildings and rooms, and moderate room comments through `manageFacility`.
* **Reservations:** Can approve, decline, and change reservation statuses through `updateReservationStatus`, including the existing extended-reservation validation and audit logging.
* **Navigation:** Only the five listed tabs are available. Member management and schedule/calendar management remain with their existing authorized roles.

## High-Level Workflow
All five roles can view Academic Calendar, including semester dates, phases, summaries, search, and filters. Only Admin and Registrar have calendar management controls (Manage Active Year, New School Year, Edit, and Delete); Dean, Program Head, and Instructor see the calendar in read-only mode.

Signed-in users across all roles can leave shared room comments through Buildings & Rooms to provide feedback or report equipment issues. Each comment displays its author and creation date. Users can delete their own comments and Admins or Registrars can delete any comment, with confirmation. The `manageFacility` callable verifies active accounts and author/moderator permissions and saves each deletion with an audit log. Accepted Admins/Registrars also use it for building/room management, including bulk room actions and rooms removed with a building. Existing permissive Firestore rules still allow direct writes outside this UI flow; those are not audited by this callable.
Unread room-comment notices and amber comment highlights are personal to each user. Opening the comments panel preserves highlights; clicking a comment marks only that comment seen. Closing/hiding the panel or closing Room Information marks the loaded discussion seen. The room card badge and comment-icon dot remain while unread feedback exists. Another user's actions do not clear them; read positions are private and persist across devices.
Users' own comments do not trigger unread notices; unread comments from other authors remain eligible even when the newest comment is their own.

1.  **Preparation:** Admin sets up the semester dates and ensures the room database is up to date.
2.  **Input & Academic Planning:** Deans draft their department's schedule (subjects, instructors, times, etc.) and submit them as "Proposed" schedules. Instructors may submit availability.
3.  **Plotting:** The Registrar reviews the proposed schedules and "plots" them into specific rooms on a global matrix, resolving any conflicts.
    Saved schedules take priority over room reservations: creating a schedule or changing its room/day/time/term automatically cancels overlapping Pending or Approved reservations within the semester dates and notifies their owners with the cancellation reason. This applies to saved Draft and Plot schedules; unsaved workbook edits do not cancel reservations.
4.  **Finalization:** Registrar publishes the final approved schedules.
5.  **Operation:** Instructors view their final assignments; the system manages any emergency changes during the semester.
    Users can submit single-day Extended reservations for exhibits and similar events, providing the booking Purpose and selecting start and end times. No separate extended-time reason is required. These requests require department recommendation followed by Registrar/University Administrator approval, may exceed standard duration and slot limits, and still obey room availability, operating hours, capacity, minimum duration, lead time, and conflict rules. Pending requests hold the interval. Registrar/University Administrator approval rechecks current room constraints and booking/class conflicts on the server; saved academic schedules retain their existing priority.
    Semester phases automatically become Ended after their inclusive end date, checked daily at midnight in Philippine time. Admins and Registrars still manage the earlier scheduling phases. Overdue semesters in historical years are included, and the active-year selection is preserved.

## Reservation recommendation and final approval

New requests start Pending and go to the requester's saved department. Deans and Program Heads have Manage Reservations access, see only their department's reservations, and can mark Pending requests Recommending Approval. Either role can provide the recommendation; both are not required. They cannot approve, decline, edit other statuses, or delete requests through this page.

Registrars and University Administrators receive recommended requests for final approval or decline. Final approval requires Recommending Approval, including for Extended reservations. Admin cannot recommend or grant final approval. The callable checks active accounts, accepted memberships, department scope, and current status transactionally. Existing Pending requests follow the same review step; already approved requests retain their status. Missing department assignments or departments without a Dean/Program Head must be resolved before requests can advance. Recommended requests hold rooms until approved, declined, cancelled, or expired, and saved academic schedules retain priority.
