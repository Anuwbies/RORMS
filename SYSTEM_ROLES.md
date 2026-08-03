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
*   **Conflict Resolution:** Identify and resolve cross-department double-bookings, overlapping instructor schedules, and room capacity issues.
*   **Publishing:** Finalize and approve the "Proposed" departmental schedules, pushing them live for instructors and students to view.
*   **Ad-hoc Adjustments:** Manage mid-semester room changes or emergency rescheduling due to maintenance.
*   **Reporting:** Generate reports on room utilization, peak-time usage, and overall scheduling efficiency.

### 3. Dean (Department Head / Academic Planner)
The Dean acts as the primary academic planner for their specific department.
*   **Schedule Creation:** Create the initial draft schedule for their department, mapping subjects, instructors, sections, times, and days.
*   **Room Requests:** Specify preferred rooms or building requirements for their departmental courses.
*   **Instructor Load Management:** Ensure that instructors are not over-scheduled and that their teaching hours align with department policies before submitting.
*   **Submission:** Submit the drafted departmental schedule to the Registrar as a "Proposed" schedule for room allocation.

### 4. Instructor
The Instructor is the end-user who utilizes the assigned resources to deliver education.
*   **Schedule Viewing:** Access a personalized dashboard showing their assigned courses, rooms, and time slots.
*   **Availability Submission:** Submit "Preferred Teaching Times" or personal constraints (e.g., research blocks) for consideration during the scheduling phase.
*   **Change Requests:** Formally request a room or time change if the assigned resource does not meet the course's pedagogical needs.
*   **Room Reporting:** Report issues with room equipment (e.g., broken projector) directly through the system.

---

## High-Level Workflow
1.  **Preparation:** Admin sets up the semester dates and ensures the room database is up to date.
2.  **Input & Academic Planning:** Deans draft their department's schedule (subjects, instructors, times, etc.) and submit them as "Proposed" schedules. Instructors may submit availability.
3.  **Plotting:** The Registrar reviews the proposed schedules and "plots" them into specific rooms on a global matrix, resolving any conflicts.
4.  **Finalization:** Registrar publishes the final approved schedules.
5.  **Operation:** Instructors view their final assignments; the system manages any emergency changes during the semester.
