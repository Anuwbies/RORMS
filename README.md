# RORMS - Room and Schedule Management System

## Project Overview
The **Room and Schedule Management System (RORMS)** is a centralized platform designed to streamline academic scheduling. It optimizes campus resource utilization by managing instructors, courses, time slots, and physical rooms while preventing scheduling conflicts.

## Tech Stack
- **Frontend**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (v4)
- **Backend/Database**: Firebase (Authentication & Firestore)
- **Deployment**: Firebase Hosting

## Project Structure
- `frontend/`: React + TypeScript source code.
- `AGENTS.md`: Repository guidelines and development standards.
- `FIRESTORE_COLLECTIONS.md`: Detailed schema of Firestore collections.
- `SYSTEM_ROLES.md`: Comprehensive breakdown of user roles and responsibilities.

## Core Features
- **Dynamic Scheduling**: Map instructors and courses to specific rooms and time slots.
- **Conflict Resolution**: Real-time identification of double-booked rooms or instructors.
- **Role-Based Access Control**: Specialized dashboards for Admins, Registrars, Deans, and Instructors.
- **Departmental Management**: Resource assignment and approval workflows for Department Heads.
- **Ad-hoc Adjustments**: Manage mid-semester changes and emergency rescheduling.

## System Roles
1. **System Administrator**: Manages user accounts, master data (Buildings/Rooms), and global configuration.
2. **Registrar (Primary Scheduler)**: Responsible for schedule creation, conflict resolution, and final publishing.
3. **Dean (Department Head)**: Submits departmental requirements and manages instructor load.
4. **Instructor**: Views personalized schedules, submits availability, and reports room equipment issues.

## Getting Started

### Prerequisites
- Node.js (LTS recommended)
- npm

### Installation
```powershell
cd frontend
npm install
```

### Development
```powershell
cd frontend
npm run dev
```

### Build for Production
```powershell
cd frontend
npm run build
```

## Database Schema (Firestore)
- `users`: Profile information and system roles.
- `invitations`: Secure, role-based invites for new members.
- `departments`: University departments and resource metadata.
- `mail`: Trigger collection for the Firebase "Trigger Email" extension.

## Development Guidelines
- Follow **PascalCase** for component filenames.
- Prefer functional components and hooks.
- Use **Tailwind utility classes** for styling.
- Ensure all changes are verified through `npm run build` (type-checking).

For more detailed information, please refer to the documentation files in the root directory.
