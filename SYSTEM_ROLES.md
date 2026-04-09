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

### 2. Registrar (Primary Scheduler)
The Registrar is the "power user" responsible for the actual execution of the schedule.
*   **Schedule Creation:** Perform the primary assignment of instructors and courses to specific rooms and time slots.
*   **Conflict Resolution:** Identify and resolve double-bookings of rooms or instructors.
*   **Publishing:** Finalize the "Draft" schedule and push it live for instructors and students to view.
*   **Ad-hoc Adjustments:** Manage mid-semester room changes or emergency rescheduling due to maintenance or instructor availability changes.
*   **Reporting:** Generate reports on room utilization, peak-time usage, and department-wise scheduling efficiency.

### 3. Dean (Department Head)
The Dean acts as the bridge between department-specific needs and the Registrar’s global schedule.
*   **Departmental Oversight:** Review the schedules assigned to their specific department's instructors.
*   **Requirement Submission:** Define specific room requirements for courses within their department (e.g., "All Bio-101 sections need a wet lab").
*   **Instructor Load Management:** Ensure that instructors are not over-scheduled and that their teaching hours align with department policies.
*   **Approval Workflow:** Review and approve/deny special scheduling requests or change requests submitted by instructors before they reach the Registrar.

### 4. Instructor
The Instructor is the end-user who utilizes the assigned resources to deliver education.
*   **Schedule Viewing:** Access a personalized dashboard showing their assigned courses, rooms, and time slots.
*   **Availability Submission:** Submit "Preferred Teaching Times" or personal constraints (e.g., research blocks) for consideration during the scheduling phase.
*   **Change Requests:** Formally request a room or time change if the assigned resource does not meet the course's pedagogical needs.
*   **Room Reporting:** Report issues with room equipment (e.g., broken projector) directly through the system.

---

## High-Level Workflow
1.  **Preparation:** Admin sets up the semester dates and ensures the room database is up to date.
2.  **Input:** Deans and Instructors submit their departmental needs and instructor availability.
3.  **Drafting:** The Registrar creates a draft schedule, using the system to flag overlaps or capacity mismatches.
4.  **Review:** Deans review the draft for their department and suggest minor adjustments.
5.  **Finalization:** Registrar publishes the final schedule.
6.  **Operation:** Instructors view their final assignments; the system manages any emergency changes during the semester.
