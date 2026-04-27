# Firestore Collections

## `users`
Stores user profile information and system roles.

- **Document ID**: Firebase Auth `uid`
- **Fields**:
  - `email`: string (User's email address) | **Default: from Auth**
  - `fullName`: string (User's full name) | **Default: from Auth (or empty string)**
  - `isVerify`: boolean (Whether the user's email is verified) | **Default: from Auth**
  - `createdAt`: timestamp (Date the profile was created) | **Default: serverTimestamp()**
  - `updatedAt`: timestamp (Date the profile was last updated) | **Default: serverTimestamp()**
  - `profilePicture`: string (URL to the user's profile picture) | **Default: from Auth (or empty string)**
  - `isActive`: boolean (Whether the account is active) | **Default: true**

## `invitations`
Tracks secure, role-based invites for new members.

- **Document ID**: Unique Token (e.g., auto-generated ID)
- **Fields**:
  - `email`: string (The invited email address)
  - `role`: string (Admin, Registrar, Dean, or Instructor)
  - `status`: string (`"pending"`, `"accepted"`, or `"expired"`) | **Default: "pending"**
  - `invitedBy`: string (UID of the user who sent the invite)
  - `createdAt`: timestamp (Date the invite was created) | **Default: serverTimestamp()**
  - `expiresAt`: timestamp (Expiration date)

## `departments`
Manages university departments, assigned deans, and resource metadata.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `name`: string (Full name of the department, e.g., "College of Information Technology")
  - `code`: string (Short department code, e.g., "CITE")
  - `dean`: string (UID of the assigned Dean)
  - `logo`: string (URL to the department logo)
  - `createdAt`: timestamp (Date the department was created) | **Default: serverTimestamp()**
  - `updatedAt`: timestamp (Date the department was last updated) | **Default: serverTimestamp()**

## `mail`
Trigger collection for the Firebase "Trigger Email" extension.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `to`: string (Recipient email address)
  - `message`: object (Email content)
    - `subject`: string (Email subject line)
    - `html`: string (HTML body of the email)
  - `delivery`: object (Managed by the extension)
    - `state`: string (`"PENDING"`, `"SUCCESS"`, `"ERROR"`)
    - `attempts`: number
    - `startTime`: timestamp
    - `endTime`: timestamp
    - `error`: string (if state is `"ERROR"`)

## `buildings`
Manages campus buildings and infrastructure metadata.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `name`: string (Full name of the building, e.g., "Administration Building")
  - `code`: string (Short building code, e.g., "ADM")
  - `createdAt`: timestamp | **Default: serverTimestamp()**
  - `updatedAt`: timestamp | **Default: serverTimestamp()**

## `rooms`
Centralized inventory of all campus rooms and their real-time status.

- **Document ID**: Auto-generated ID
- **Fields**:
  - `buildingId`: string (Reference to the parent building document ID)
  - `name`: string (Room name, e.g., "Registrar Receiving")
  - `code`: string (Full room code, e.g., "ADM-101")
  - `type`: string (Lecture Room, Laboratory, Office, Meeting Room, or Studio)
  - `floor`: number (The specific floor where the room is located)
  - `capacity`: number (Room seating/standing capacity)
  - `status`: string (`"Available"`, `"Occupied"`, `"Reserved"`, or `"Maintenance"`)
  - `image`: string (URL to the room's photo)
  - `description`: string (Detailed description of the room)
  - `amenities`: array (Flat array of strings, e.g., `["WiFi", "Projector"]`)
  - `availableDays`: array (Days of the week the room is available, e.g., `["Monday", "Tuesday"]`)
  - `startTime`: string (Daily availability start time, e.g., "08:00")
  - `endTime`: string (Daily availability end time, e.g., "17:00")
  - `minBookingMins`: number (Minimum allowed booking duration in minutes)
  - `maxBookingMins`: number (Maximum allowed booking duration in minutes)
  - `createdAt`: timestamp | **Default: serverTimestamp()**
  - `updatedAt`: timestamp | **Default: serverTimestamp()**

## `memberships`
Tracks the association between users and departments.

- **Document ID**: Auto-generated ID (or a composite like `userId_departmentCode`)
- **Fields**:
  - `userId`: string (Reference to the user's UID)
  - `departmentCode`: string (Reference to the department's unique code)
  - `role`: string (User's role within this department: Admin, Registrar, Dean, or Instructor)
  - `joinedAt`: timestamp | **Default: serverTimestamp()**


