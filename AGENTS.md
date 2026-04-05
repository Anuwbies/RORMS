# Repository Guidelines

## Project Structure & Modules
- Root `frontend/` holds the React + Vite app; entry is `index.html`; source lives in `frontend/src/` and static assets in `frontend/public/`.
- TypeScript config files (`tsconfig*.json`) and Vite config (`vite.config.ts`) sit in `frontend/`.
- Dependency manifests: `frontend/package.json` and `frontend/package-lock.json`.

## Build, Test, and Development
- `npm install` (run in `frontend/`): install dependencies.
- `npm run dev -- --host`: start Vite dev server for local or LAN testing.
- `npm run build`: type-check (tsc build mode) and emit production assets under `frontend/dist/`.
- `npm run preview`: serve the built bundle for smoke checks.

## Coding Style & Naming
- Language: TypeScript + React; keep components in `src/` with PascalCase filenames (e.g., `MyWidget.tsx`).
- Use functional components and hooks; prefer prop interfaces over `any`.
- Formatting: follow TypeScript/Vite defaults; 2-space indent; keep imports sorted by source (npm then local).
- CSS: prefer Tailwind utility classes (tailwind v4); avoid inline styles unless necessary.

## Testing Guidelines
- No test harness is set up yet; add lightweight tests when introducing logic-heavy code (suggest Vitest + React Testing Library).
- Co-locate tests next to components (`Component.test.tsx`) or under `src/__tests__/`.
- For manual checks, run `npm run dev` and verify key flows before PRs.

## Commit & Pull Request Practices
- Write clear, present-tense messages: `Add`, `Fix`, `Improve` (e.g., `Add reservation form validation`).
- Scope commits to a single concern; include rationale in the body if behavior changes.
- PRs: describe intent, link issues/tasks, list test steps (commands run), and include screenshots/GIFs for UI changes.

## Security & Configuration Tips
- Keep secrets out of the repo; use env variables or `.npmrc` for private registry tokens.
- Lock dependencies with `package-lock.json`; avoid manual edits to `node_modules/`.
- Run `npm audit` periodically and bump packages via `npm update` when safe.
