# Role Tab Access Matrix (ROLE_TAB_ACCESS.md)

This document defines the navigation tab access and page visibility permissions for each system role in the **Room and Schedule Management System (RORMS)**.

---

## 👥 Roles Overview

The system defines 5 core roles:
1. **Admin** – System-wide administrative management without personal schedule or department tabs.
2. **Registrar** – Campus-wide scheduling authority and room allocator.
3. **Dean** – Department-level academic lead and schedule planner.
4. **Program Head** – Academic track coordinator supporting departmental scheduling.
5. **Instructor** – Faculty member managing personal teaching schedules and classroom bookings.

---

## 📋 Comprehensive Access Matrix

| Tab / Navigation Item | Page Component | Admin | Registrar | Dean | Program Head | Instructor |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Dashboard** | `DashboardPage.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Academic Calendar** | `AcademicCalendarPage.tsx` | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Reservations** | `ManageReservationsPage.tsx` | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Buildings & Rooms** | `BuildingsRoomsPage.tsx` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Department Schedules** | `DepartmentSchedulesPage.tsx` | ✅ | ✅ | ❌ | ❌ | ❌ |
| **My Schedule** | `MySchedulePage.tsx` | ❌ | ❌ | ✅ | ✅ | ✅ |
| **My Reservations** | `MyReservationsPage.tsx` | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Reserve a Room** | `ReserveRoomPage.tsx` | ✅ | ❌ | ✅ | ✅ | ✅ |
| **My Department** | `MyDepartmentPage.tsx` | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Departments** | `DepartmentsPage.tsx` | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Members** | `MembersPage.tsx` | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Reports** | `ReportsPage.tsx` | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🎯 Role-by-Role Tab Breakdown

### 1. Admin (Administrative Access)
The **Admin** has access to these 10 administrative navigation tabs:
- 📊 **Dashboard** (`DashboardPage.tsx`)
- 📅 **Academic Calendar** (`AcademicCalendarPage.tsx`)
- 🏢 **Buildings & Rooms** (`BuildingsRoomsPage.tsx`)
- 🏛️ **Departments** (`DepartmentsPage.tsx`)
- 👥 **Members** (`MembersPage.tsx`)
- 📑 **Manage Reservations** (`ManageReservationsPage.tsx`)
- 🗓️ **Department Schedules** (`DepartmentSchedulesPage.tsx`)
- 📈 **Reports** (`ReportsPage.tsx`)
- 🚪 **My Reservations** (`MyReservationsPage.tsx`)
- 🏷️ **Reserve a Room** (`ReserveRoomPage.tsx`)

---

### 2. Registrar
The **Registrar** manages global scheduling, campus room inventories, and booking reviews:
- 📊 **Dashboard** (`DashboardPage.tsx`)
- 📅 **Academic Calendar** (`AcademicCalendarPage.tsx`)
- 📑 **Manage Reservations** (`ManageReservationsPage.tsx`)
- 🏢 **Buildings & Rooms** (`BuildingsRoomsPage.tsx`)
- 🗓️ **Department Schedules** (`DepartmentSchedulesPage.tsx`)

---

### 3. Dean
The **Dean** oversees departmental faculty, schedules, and room allocations:
- 📊 **Dashboard** (`DashboardPage.tsx`)
- 🕒 **My Schedule** (`MySchedulePage.tsx`)
- 🚪 **My Reservations** (`MyReservationsPage.tsx`)
- 🏷️ **Reserve a Room** (`ReserveRoomPage.tsx`)
- 🏢 **Buildings & Rooms** (`BuildingsRoomsPage.tsx`)
- 👥 **My Department** (`MyDepartmentPage.tsx`)

---

### 4. Program Head
The **Program Head** coordinates course sections, program instructors, and bookings:
- 📊 **Dashboard** (`DashboardPage.tsx`)
- 🕒 **My Schedule** (`MySchedulePage.tsx`)
- 🚪 **My Reservations** (`MyReservationsPage.tsx`)
- 🏷️ **Reserve a Room** (`ReserveRoomPage.tsx`)
- 🏢 **Buildings & Rooms** (`BuildingsRoomsPage.tsx`)
- 👥 **My Department** (`MyDepartmentPage.tsx`)

---

### 5. Instructor
The **Instructor** manages personal teaching loads, classroom requests, and department roster views:
- 📊 **Dashboard** (`DashboardPage.tsx`)
- 🕒 **My Schedule** (`MySchedulePage.tsx`)
- 🚪 **My Reservations** (`MyReservationsPage.tsx`)
- 🏷️ **Reserve a Room** (`ReserveRoomPage.tsx`)
- 🏢 **Buildings & Rooms** (`BuildingsRoomsPage.tsx`)
- 👥 **My Department** (`MyDepartmentPage.tsx`)

---

## 🛠️ Implementation Guidance

When filtering navigation items in `LeftSidebarController.tsx` or checking tab permissions:
```ts
export const ROLE_ALLOWED_TABS: Record<string, string[]> = {
  'Admin': [
    'dashboard', 'reports', 'academicCalendar', 'manageReservations',
    'myReservations', 'reserveRoom', 'buildingsRooms', 'departments', 'members',
    'departmentSchedules'
  ],
  'Registrar': [
    'dashboard', 'academicCalendar', 'manageReservations', 'buildingsRooms', 'departmentSchedules'
  ],
  'Dean': [
    'dashboard', 'mySchedule', 'myReservations', 'reserveRoom', 'buildingsRooms', 'myDepartment'
  ],
  'Program Head': [
    'dashboard', 'mySchedule', 'myReservations', 'reserveRoom', 'buildingsRooms', 'myDepartment'
  ],
  'Instructor': [
    'dashboard', 'mySchedule', 'myReservations', 'reserveRoom', 'buildingsRooms', 'myDepartment'
  ],
}
```
