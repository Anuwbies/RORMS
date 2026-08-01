# RORMS - Final Project Vision & Goals

This document outlines the desired final state of the **Room and Schedule Management System (RORMS)** capstone project. It serves as the "North Star" for all development efforts.

## 1. Executive Summary
RORMS is a centralized, web-based platform built to streamline academic scheduling and optimize campus resource utilization. The final system will provide a robust scheduling engine that eliminates double-bookings, enforces role-based access control (RBAC), and manages real-time room availability across the entire campus.

## 2. Core Objectives
- **Zero Scheduling Conflicts:** The system must proactively prevent double-booking of rooms, instructors, and overlapping time slots.
- **Intuitive Role-Based Dashboards:** Distinct user experiences for Administrators, Registrars, Deans, and Instructors to ensure they only see and interact with data relevant to their responsibilities.
- **Real-Time Data Sync:** Leverage Firebase Firestore to ensure all scheduling changes and room statuses reflect instantly across all clients.
- **Modern, Responsive UI:** A premium, aesthetically pleasing interface built with React and Tailwind CSS v4, usable on both desktop and mobile devices.

## 3. Final Feature Requirements

### 3.1. Authentication & Onboarding
- **Secure Invitations:** A role-based invitation system where Admins can invite staff via email links (triggering the `invitations` collection).
- **Profile Management:** Users complete their profile (Name, Avatar) upon accepting an invite via Firebase Authentication.

### 3.2. Master Data Management (Admin Level)
- **Infrastructure:** Full CRUD operations for Buildings and Rooms.
- **Room Metadata:** Granular details for each room including capacity, amenities (Projector, WiFi, Lab Equipment), and availability windows.
- **Organizational Structure:** Management of University Departments and assigning Deans.

### 3.3. Core Scheduling Engine (Registrar & Dean Level)
- **Draft & Publish Workflow:** The Registrar can create a "Draft" schedule and officially publish it when finalized.
- **Conflict Detection:** The UI must visually flag scheduling collisions (same room/same time or same instructor/same time) before saving.
- **Departmental Oversight:** Deans have a dedicated view to manage their department's specific course loads and instructor assignments.

### 3.4. Reservation & Reporting (Instructor Level)
- **Personalized Schedule:** Instructors see a read-only view of their finalized teaching schedule.
- **Ad-Hoc Bookings:** Instructors can submit room reservations (e.g., for makeup classes or meetings) that undergo an approval workflow (`Pending` -> `Approved`/`Declined`).
- **Issue Reporting:** Instructors can report room maintenance issues directly from their dashboard.

## 4. Technical Deliverables
- **Frontend App:** A fully functional, production-ready Vite/React/TypeScript Single Page Application.
- **Backend Architecture:** Secure Firebase backend with strict Firestore Security Rules guaranteeing that users can only read/write data permitted by their role.
- **Automated Notifications:** Integration with the Firebase "Trigger Email" extension to notify users of reservation status changes and system invites.
- **Production Deployment:** Live on Firebase Hosting with a polished, bug-free user experience.

## 5. Success Criteria for Final Delivery
1. **End-to-End Scheduling:** The Registrar can successfully schedule a full mock semester without the system allowing any logical conflicts.
2. **Workflow Completion:** An Instructor can log in, view their schedule, request a room, and have a Registrar/Dean approve that request.
3. **Onboarding Flow:** The Admin can seamlessly onboard a new user via the email invitation system.
4. **Design Excellence:** The UI adheres to modern design principles, utilizing smooth transitions, clear typography, and a cohesive, premium color palette that "wows" the user.

---
*Note: This document is a living blueprint intended to guide the Capstone development and should be updated as project requirements evolve.*
