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
