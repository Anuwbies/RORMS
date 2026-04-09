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
  - `department`: string (User's assigned department) | **Default: ""**
  - `role`: string (User's system role) | **Default: "member"**
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


