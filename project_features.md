# RORMS (Registrar Office Room Management System) Core Features

This document outlines the core functional capabilities and high-level systems of the RORMS platform.

## 1. Authentication & Security
- **Secure Login**: Managed via Firebase Authentication.
- **Email Verification Portal**: Enforces a secure onboarding process; users cannot access the main dashboard until their email is officially verified.
- **Role-Based Access Control (RBAC)**: System enforces permissions based on predefined semantic roles (Admin, Registrar, Dean, Program Head, Instructor).

## 2. Dashboard & Summary Analytics
- **Key Metrics Dashboard**: At-a-glance metrics for Total Rooms, Daily Utilization, Peak Hours, and Total Campus Capacity.
- **Animated Summary Cards**: Dynamic, CSS-art driven visual animations used across management pages (Buildings, Departments, Members) to display system state interactively (e.g., animated characters, 3D campus maps, and animated department rooms).
- **Real-Time Analytics**: Visual charts tracking room utilization percentages over time and booking volumes across different departments.
- **System Activity Feeds**: Live feeds for Recent Activity (auditing user actions) and System Alerts (maintenance notices).
- **Leaderboards**: Tracking the most frequently requested rooms and their average daily usage.

## 3. Building & Room Management
- **Building Directory**: Manage campus facilities, tracking total floor counts and aggregated capacities.
- **Room Configuration**: Setup individual rooms or multiple rooms at once with precise attributes including Type, Floor, Capacity, and Specific Amenities (e.g., WiFi, Projectors).
- **Schedule Constraints**: Granular control over a room's operational hours, available days, and minimum/maximum booking durations.
- **Live Status Tracking**: Automated tracking of room states (Available, Occupied, Maintenance).

## 4. Advanced Reservation System
- **Smart "Find a Room" Engine**: Users can search for rooms using advanced filters (Capacity, Specific Date/Time, Duration, Required Amenities, and Building).
- **Conflict Detection Engine**: Deep schedule validation that automatically prevents double-booking by checking against both existing reservations and regular academic class schedules.
- **Smart Time boundaries**: The system intelligently restricts time pickers based on the specific room's operating hours and enforces block boundaries.
- **Lead Time Enforcement**: Prevents last-minute same-day bookings by enforcing configurable grace periods.

## 5. Reservation Approval Workflow
- **My Reservations**: A dedicated portal for users to track, view, and cancel their personal pending or upcoming requests.
- **Manage Reservations**: A central queue for Registrars and Admins to review incoming reservation requests across the campus.
- **Approval System**: One-click workflows to Approve or Decline requests based on system-validated availability.

## 6. Department & Member Administration
- **Department Management**: Create and manage academic departments (e.g., CITE, CEA, CMA).
- **Faculty Roster**: View and manage the list of all faculty and staff assigned to the system.
- **Onboarding & Invitations**: Deans can send invitations to bring new instructors into their specific departments.

## 7. Academic Department Scheduling
- **Academic Calendar Management**: Create and manage academic school years, configuring precise start and end months for both 1st and 2nd semesters with built-in chronological overlap prevention.
- **Semester Scheduling Phases**: Track and control the life-cycle of department scheduling using progressive phases (Drafting, Plotting, Revision, Final, Ended) for each semester.
- **Room Plotting & Validation**: Registrars review departmental drafted schedules and officially plot/assign them to specific rooms across the campus while validating for overlaps.
- **Class Timetables**: Map recurring, semester-long class schedules to specific rooms, instructors, and days of the week.
- **Automated Availability Syncing**: Regular class schedules are automatically treated as "Busy" blocks in the Reservation System to prevent ad-hoc events from disrupting classes.

## 8. Reporting & Auditing
- **Usage Reports**: Generate comprehensive tables detailing reservation history, requesters, departments, and purposes.
- **Data Review**: Tools for administrative record-keeping and reviewing past usage metrics.

## 9. Notification & Profile Management
- **In-App Notification Center**: A dedicated right-sidebar tracking real-time updates for booking approvals, rejections, cancellations, and system notices.
- **Notification Lifecycle**: Ability to mark notifications as read, delete individual alerts, or clear all.
- **Profile Customization**: Users can upload and crop custom profile pictures natively within the sidebar.
