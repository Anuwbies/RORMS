# Repository Guidelines (AGENTS.md)

This document provides essential guidelines and standards for developers and AI agents (like Gemini CLI) working on the **RORMS** repository.

## 🤖 Agent-Specific Instructions
- **Context First**: Always consult `FIRESTORE_COLLECTIONS.md` for database schema and `SYSTEM_ROLES.md` for business logic before implementing features.
- **Surgical Edits**: When modifying React components, keep changes localized to the requested functionality.
- **Verification**: After UI changes, ensure the project still builds using `npm run build` in the `frontend/` directory.

## 📂 Project Structure & Modules
- **Frontend**: Located in `frontend/`. 
  - `src/components/`: Reusable UI components.
  - `src/pages/`: Page-level components and layouts.
  - `src/firebase.ts`: Firebase initialization and shared service logic.
- **Configuration**: `tsconfig.json`, `vite.config.ts`, and `tailwind.config.ts` (if applicable) are in the `frontend/` root.

## 🛠 Build & Development
- **Setup**: Run `npm install` inside the `frontend/` directory.
- **Local Dev**: Use `npm run dev` for the Vite development server.
- **Production Check**: Always run `npm run build` to verify type safety and build integrity before finalizing changes.

## 🎨 Coding Style & Naming
- **React**: Use functional components with TypeScript interfaces for props.
- **Naming**:
  - Components: `PascalCase.tsx` (e.g., `RoomList.tsx`).
  - Hooks: `camelCase.ts` (e.g., `useAuth.ts`).
  - Utils/Services: `camelCase.ts`.
- **CSS**: Exclusively use **Tailwind CSS v4** utility classes. Avoid custom CSS files or inline styles unless absolutely necessary for dynamic calculations.
- **Indentation**: 2-space indentation.

## 🧪 Testing & Validation
- **Current State**: No automated test suite is currently configured.
- **Manual Validation**: Verify all UI changes across responsive breakpoints (Mobile/Desktop) using the dev server.
- **Future-Proofing**: When adding complex logic, consider co-locating tests as `ComponentName.test.tsx`.

## 🔒 Security & Best Practices
- **Environment Variables**: Never hardcode Firebase API keys or secrets. Use `.env` files (not tracked by Git).
- **Type Safety**: Avoid the `any` type. Define strict interfaces for Firestore documents and API responses.
- **Firebase**: Ensure all Firestore queries align with the security rules and indexed fields.

## 📝 Commit Practices
- **Style**: Use conventional, present-tense messages (e.g., `feat: add instructor dashboard`, `fix: resolve overlap in schedule logic`).
- **Scope**: Keep commits atomic and focused on a single logical change.

---
*Refer to README.md for the high-level project overview.*
