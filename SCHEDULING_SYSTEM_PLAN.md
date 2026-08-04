# Scheduling System Plan

## 1. Overview and Workflow
The system will facilitate a two-step scheduling process, separating department-level academic planning from campus-wide resource (room) allocation.

**Step 1: Department Planning (Dean/Department Head)**
* The Dean focuses on *academic* needs: What subjects must be taught, who will teach them, and when they should ideally happen.
* **Status:** Schedules created here are initially marked as `Draft` and then submitted as `Proposed`.
* **Room Requests:** Even if the Dean selects a "buildingId" or "roomId" during this phase, it is treated as a *request* or *preference* until the Registrar confirms it.

**Step 2: Room Allocation & Plotting (Registrar)**
* The Registrar focuses on *logistics and conflict resolution*. They have a global view of all departments across the entire institution.
* They review all `Proposed` schedules in the system and "plot" them into actual physical rooms.
* The system assists by highlighting conflicts (e.g., two departments requested the same room at the same time, or an instructor was booked for overlapping times).
* **Status:** Once plotted, verified, and confirmed, schedules are marked as `Published` or `Approved`.

---

## 2. Data Model (`schedule` collection)

We will utilize the existing `schedule` collection in Firestore. To fully support this workflow, we will need to add a `status` field to the documents in this collection, as well as a way to track the academic term.

**Relevant fields in the `schedule` collection:**
* `subjectCode`, `subjectTitle`
* `instructorId`
* `classSection`
* `days`, `startTime`, `endTime`
* `buildingId`, `roomId` *(Set by Dean as a preference, finalized by Registrar)*
* **[NEW FIELD]** `status`: string (`"Draft"`, `"Proposed"`, `"Conflict"`, `"Approved"`) - Used to track the lifecycle of the schedule from the Dean's desk to the Registrar's final plot.
* **[NEW FIELD]** `academicTerm`: string (e.g., `"1st Sem 2024-2025"`) - Used to filter schedules so different semesters don't overlap.

---

## 3. User Interfaces (UI/UX)

### A. Dean / Department Head Dashboard
* **Schedule Builder:** A tabular list or a weekly calendar view showing their department's `schedule` documents for the upcoming term.
* **Actions:** "Add Class", "Assign Instructor", "Set Time", "Request Room".
* **Local Validation:** The system prevents the Dean from double-booking the *same instructor* within their own department before submission.
* **Submission:** A "Submit to Registrar" button that locks the drafts and changes their status to `Proposed`, sending them to the Registrar's queue.

### B. Registrar Dashboard (The "Plotter")
* **Global Room Matrix (Interactive Grid/Calendar):**
  * **X-axis:** Days and Times (e.g., Mon 08:00, Mon 09:00)
  * **Y-axis:** Available Rooms
  * **Content:** The scheduled classes placed inside the grid.
* **The "Unplotted" Queue:** A sidebar showing all `Proposed` schedules from all departments that haven't been finalized with a room yet.
* **Drag-and-Drop Plotting:** The Registrar can drag a schedule from the queue directly onto the room matrix to lock in its `roomId` and `buildingId`.
* **Conflict Detection Alerts:** The system visually flags issues (e.g., highlighting a slot in red) if a room is overbooked, capacity is exceeded, or if an instructor has overlapping classes.

---

## 4. Recommended Implementation Steps

1. **Database Update:** 
   * Update the `schedule` collection schema in documentation and code to include the `status` field.
2. **Frontend - Dean View:** Build the department schedule builder form and draft management UI.
3. **Frontend - Registrar View:** Build the interactive room plotting matrix. (Libraries like `FullCalendar` with resource-timeline views or a custom CSS Grid matrix work well here).
4. **Integration & Testing:** Ensure the state flows correctly from `Draft` -> `Proposed` -> `Approved` and test edge cases.
