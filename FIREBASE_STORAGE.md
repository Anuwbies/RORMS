# Firebase Storage Structure

## `users/`
Storage for user-related assets.

### `users/{uid}/profile_picture`
Stores the profile picture for a specific user.

- **Path**: `users/{uid}/profile_picture`
- **Access Control**: 
  - **Current**: Publicly accessible (Read/Write allowed for everyone).
  - **Intended**: 
    - **Read**: Authenticated users.
    - **Write/Delete**: Only the owner of the `uid`.
- **Naming Convention**: Typically named `profile_picture` with the appropriate file extension (e.g., `.png`, `.jpg`).
- **Linked Firestore Field**: `users/{uid}.profilePicture` (Stores the download URL).

## `departments/`
Storage for department-related assets.

### `departments/{deptId}/logo`
Stores the logo for a specific department.

- **Path**: `departments/{deptId}/logo_{timestamp}`
- **Access Control**: 
  - **Read**: Authenticated users.
  - **Write/Delete**: Admins and the assigned Dean of the department.
- **Naming Convention**: `logo_` followed by a timestamp to avoid caching issues.
- **Linked Firestore Field**: `departments/{deptId}.logo` (Stores the download URL).
