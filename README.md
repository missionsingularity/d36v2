# Singularity — Assam Pension & Public Grievances

Singularity is a directly accessible, fictional departmental workspace prototype based on the supplied D-36 casebook. It follows **Search, Context, Act** and does not require login, passwords, OTP or an authentication session. Every fixture, persona, source file and saved action is synthetic. The prototype is not an official Government of Assam service.

## Run the Next.js application

Requirements: Node.js 22.6 or later.

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. The production commands are `npm run build` and `npm start`.

The legacy Python training server is retained only for its SQLite workflow regression tests. It does not serve the frontend and is not required by Next.js or Vercel. Vercel serves this repository as a Next.js App Router project from the repository root.

## Online and offline storage

The workspace opens with bundled fixture records when offline or when no Supabase project is configured. Conversations, draft revisions, tasks, meeting records, comments and persona selection save in browser storage and remain available after refresh on that browser.

To share fictional workspace edits between browsers, apply `supabase/migrations/202611240002_public_demo_workspace.sql` to a dedicated demonstration Supabase project, then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`). The migration grants anonymous read, insert and update access only to `public.demo_workspace_records`; it does not grant access to case, pension, officer, source or audit tables. The on-screen sync indicator reports whether the last synchronization succeeded. Edits remain local if the cloud migration is unavailable.

All visitors to a configured demo project share those saved demonstration edits. Persona selection is only for the prototype display; it is not an identity or authorization boundary. Never place real government or personal records in this public demo workspace.

Optional server-side response wording can use `GEMINI_API_KEY` and `GEMINI_MODEL`. The application retrieves and cites the bundled synthetic records locally first. If the model service is absent, the deterministic evidence-grounded response still works.

## Casebook and documents

The 186 pension fixtures, 15 officers, 9 offices, grievances, 47 audit events, clarification records and 18 source passages are kept under `Singularity_D36V2_Implementation/Singularity_D36V2_Implementation/`. The readable source files are served from `public/demo-sources/` and visibly identify themselves as simulated training records. Original source files are not edited. A working copy is saved as a new local revision and can be exported as DOCX, PDF, XLSX or PPTX.

## Database setup

The migrations in `supabase/migrations/` describe the optional departmental schema and the isolated public demonstration-state table. Apply the public demo table migration before expecting online sync. The local application remains usable without either migration. `npm run db:check` validates supplied fixture counts and source hashes without credentials or network writes. The privileged `npm run db:import` command is only for an explicitly configured database and must use a server-side service-role key that is never placed in a `NEXT_PUBLIC_` variable.

## Checks

```powershell
npm run db:check
npm run typecheck
npm run test
npm run lint
npm run build
```

## Deployment status

The existing Vercel project and production URL must be preserved. This workspace currently has no Vercel project credentials, no confirmed Supabase project settings, and no GitHub push permission. Do not claim deployment or cross-browser cloud persistence until the existing project is configured, the migration is applied, and the deployed URL is verified.
