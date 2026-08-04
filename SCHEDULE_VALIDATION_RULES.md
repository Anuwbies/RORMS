# Schedule Validation Rules

This document outlines the frontend validation checks that must be performed when a **Dean or Department Head** creates or modifies their department's schedule (e.g., in the "Add Schedule" modal). 

*Note: The Registrar's room plotting phase may have different or stricter validations (like cross-department room checks), but these rules focus strictly on the Dean's academic planning workflow to prevent internal department errors.*

## 1. Logical Time Validation
Ensuring the times entered make physical sense:
* **Chronological Order:** `startTime` must be strictly before `endTime`.
* **Allowed Durations:** The duration of the class must be exactly either **1 hour and 30 minutes (90 minutes)** or **3 hours (180 minutes)**.
* **Operating Hours:** Times must fall strictly within the standard campus operating hours of **07:30 AM to 06:00 PM (18:00)**.

## 2. Conflict & Overlap Validation (The "Double-Booking" Checks)
These checks require comparing the newly inputted schedule against all other schedules in the current draft AND the database. Overlap occurs when two schedules share at least one Day, and `(Start A < End B)` and `(End A > Start B)`.

* **Instructor Conflict:** The same `instructorId` cannot be assigned to two overlapping schedules.
* **Room Conflict:** If a `roomId` is specified, that exact room cannot be assigned to two overlapping schedules.
* **Section Conflict:** The same `classSection` (e.g., "BSIT 3-1") cannot be scheduled for two different subjects at the same time. Students cannot be in two places at once.

## 3. Duplicate Entry Validation
Preventing accidental double-entries for the same curriculum requirements:
* **Duplicate Curriculum:** A specific `classSection` should not have multiple schedules with the exact same `subjectCode` and `format`. 
  * *Example:* You cannot have two separate "Lec" schedules for "ITE 298" for "BSIT 3-1". If a class meets twice a week for lecture, it should be a single schedule entry with two days selected (e.g., "Mon" and "Thu"), or handled via the split session feature.

## 4. Parallel & Split Session Validations
For complex schedule types (like parallel classes or split sessions with different formats/instructors):
* **Secondary Field Checks:** If the schedule uses `startTime2`, `endTime2`, `instructorId2`, etc., those fields must also pass all the Logical Time and Conflict rules.
* **Cross-Session Conflicts:** If session 1 and session 2 of a split schedule occur on the same day, they cannot overlap in time.
