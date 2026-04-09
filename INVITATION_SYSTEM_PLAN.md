# Secure Role-Based Invitation System Plan

This document outlines the implementation of a secure invitation system for RORMS, ensuring that new members are assigned specific roles and only invited emails can register.

## 1. Data Model (`invitations` collection)
We will track pending invites in a dedicated Firestore collection.

- **Document ID**: Unique Token (e.g., auto-generated ID or secure hash)
- **Fields**:
  - `email`: string (The invited email address)
  - `role`: string (Admin, Registrar, Dean, or Instructor)
  - `status`: string (`"pending"`, `"accepted"`, or `"expired"`)
  - `invitedBy`: string (UID of the inviter)
  - `createdAt`: timestamp (Creation date)
  - `expiresAt`: timestamp (Expiration date, typically 7 days after creation)

---

## 2. Phase 1: Invitation Process (`MembersPage.tsx`)
When an Admin or Registrar clicks **"Send Invitation"**:
1.  **Generate Token**: Create a unique document in the `invitations` collection.
2.  **Payload**: Save the email, assigned role, and expiration timestamp.
3.  **Trigger Email**: Use the **Firebase "Trigger Email" Extension** (or a Cloud Function) to send an email via an SMTP provider (SendGrid/Mailgun).
4.  **Invite Link**: The email will contain a button pointing to:  
    `https://rorms-app.web.app/signup?token=UNIQUE_INVITE_TOKEN`

---

## 3. Phase 2: Signup Landing (`SignupPage.tsx`)
When a user visits the signup page with a token:
1.  **Validate Token**: Fetch the invitation document from Firestore using the token.
2.  **Verify Status**: Ensure the status is `"pending"` and the `expiresAt` date has not passed.
3.  **Lock UI**: 
    - Auto-fill the **Email field** with the invited email.
    - Set the **Email field to disabled** (read-only).
    - Store the **Role** in a hidden state to be used during account creation.
4.  **Error State**: If the token is invalid or expired, display an error message and block the registration form.

---

## 4. Phase 3: Registration Completion
When the user clicks **"Create Account"**:
1.  **Auth Creation**: Call `createUserWithEmailAndPassword`.
2.  **Profile Creation**: Create the user document in the `users` collection using the `role` and `email` strictly from the invitation data.
3.  **Status Update**: Mark the invitation document status as `"accepted"`.

---

## 5. Phase 4: Security Rules
Configure Firestore rules to prevent unauthorized signups and role tampering:
- **Invitations**: Only users with the `Admin` or `Registrar` role can write to the `invitations` collection.
- **Users**: A new user document can only be created if the email matches a valid, pending token in the `invitations` collection.
