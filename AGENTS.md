# Repository Guidelines (AGENTS.md)

This document provides essential guidelines and standards for developers and AI agents (like Gemini CLI) working on the **RORMS** repository.

## 🤖 Agent-Specific Instructions
- **Context First**: Always consult `FIRESTORE_COLLECTIONS.md` for database schema and `SYSTEM_ROLES.md` for business logic before implementing features.
- **Surgical Edits**: When modifying React components, keep changes localized strictly to the requested functionality.
- **Preserve User Styling & Dimensions**: **NEVER** alter, reset, or overwrite styling and layout values (such as `height`, `min-height`, `max-height`, `width`, `padding`, `margin`, `gap`, font sizing, alignment, or dimensions) that the user has already set or customized, unless the user explicitly asks to modify those specific styles/dimensions.
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
- **Layout & Spacing Integrity**: Do not modify existing spacing, padding, height, width, margins, or sizing classes on components modified by the user unless explicitly instructed.
- **Indentation**: 2-space indentation.

## 🎨 Brand & Design System Color Palette

The primary brand color for RORMS is **`#62853e`** (PHINMA Olive Green). Use the following standardized color palette and variables across the application:

### Brand Color Scale
| Shade | Hex Code | Usage |
| :--- | :--- | :--- |
| **50** | `#f3f7ee` | Subtlest background tints & selection highlights |
| **100** | `#e3edda` | Active badge/pill background tints |
| **200** | `#c6dbb6` | Border accents & focus rings |
| **300** | `#a3c48b` | Soft secondary elements |
| **400** | `#7b9d4f` | Gradient secondary accent |
| **500** | **`#62853e`** | **Primary Brand Color (`var(--brand-color)`)** |
| **600** | **`#526f34`** | **Brand Hover State (`var(--brand-color-hover)`)** |
| **700** | `#41572a` | High-contrast brand text & dark badges |
| **800** | `#334322` | Deep contrast containers |
| **900** | `#29361c` | Dark theme text & headers |
| **950** | `#161f0e` | Deepest dark shade |

### UI Design Tokens & Gradients
- **Primary Brand**: **PHINMA Olive Green** — `#62853e` (`var(--brand-color)`)
- **Brand Hover**: **Dark Olive Green** — `#526f34` (`var(--brand-color-hover)`)
- **Brand Accent**: **PHINMA Flame Gold** — `#f59e0b` / `#d97706`
- **Brand Gradient**: **Olive to Leaf Green Gradient** — `linear-gradient(135deg, #62853e, #7b9d4f)`
- **Background Surface**: **Off-White Surface** — `#fcfcfc` (`var(--brand-surface)`)
- **Card Surface**: **Pure White** — `#ffffff` (`var(--card-surface)`)
- **Card Radius / Shape**: Use **`rounded-2xl`** as the maximum border-radius for main dashboard cards, large containers, and modals to maintain a consistent, modern glassmorphic aesthetic. Nested inner components should use `rounded-xl` or `rounded-lg` proportionally.

### Supporting Complementary & Functional Accent Colors
Alongside the primary PHINMA Olive Green, use these supporting colors for status feedback, surfaces, and functional contrast:

| Category | Color Name | Tailwind Tokens / Classes | Hex Code | Primary Purpose / Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Brand Accent** | **PHINMA Flame Gold** | `text-amber-500`, `bg-amber-500` | `#f59e0b` / `#d97706` | Brand emblem flame accent, star ratings, key highlights |
| **Neutral Surface** | **Off-White & Pure White** | `bg-slate-50`, `bg-white` | `#fcfcfc` / `#ffffff` | Page background, cards, modal containers |
| **Neutral Text & Border** | **Slate Navy** | `text-slate-900`, `border-slate-200` | `#0f172a` / `#e2e8f0` | Body text, section headers, borders & dividers |
| **Semantic Success** | **Emerald** | `bg-emerald-100 text-emerald-700` | `#10b981` | Active members, Available rooms, success alerts |
| **Semantic Warning** | **Amber** | `bg-amber-100 text-amber-700` | `#f59e0b` | Pending invites, Occupied rooms, warning notices |
| **Semantic Info** | **Sky / Blue** | `bg-sky-100 text-sky-700` / `bg-blue-100` | `#0284c7` | Registrar badge, info banners |
| **Semantic Danger** | **Rose** | `bg-rose-100 text-rose-700` | `#f43f5e` | Maintenance rooms, Program Head badge, remove actions |

### System Role Semantic Badge Colors
- **Admin**: Purple (`bg-purple-100 text-purple-700` / Stat: `bg-purple-500`)
- **Registrar**: Blue (`bg-blue-100 text-blue-700` / Stat: `bg-blue-500`)
- **Dean**: Amber (`bg-amber-100 text-amber-700` / Stat: `bg-amber-500`)
- **Program Head**: Rose (`bg-rose-100 text-rose-700` / Stat: `bg-rose-500`)
- **Instructor**: Emerald (`bg-emerald-100 text-emerald-700` / Stat: `bg-emerald-500`)

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