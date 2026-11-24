# Singularity D-36 V2 — implementation instructions

Implement, test and deliver the application, not a proposal. You are working with a low reasoning budget: execute phases sequentially, use the supplied fixtures and acceptance tests, and avoid broad exploratory rewrites.

Official remote: https://github.com/missionsingularity/d36v2.git. Start by running git status, git remote -v, git branch --show-current and inspecting package.json, routes, database adapters, auth and existing design. The remote was reported empty during preparation; local files may still exist. If local project exists, modify it in place. If truly empty, scaffold Next.js App Router + TypeScript + Tailwind. Do not switch to d36 or overwrite uncommitted user work. Never force push. If remote differs, report it before changing it. Preserve existing functional code, auth, storage, deployment and env settings. Remove obsolete corporate modules/assets only after checking references and replacing functionality. Never delete databases, credentials, migrations or unrelated user files.

Read requirements/01_PRODUCT.md, 02_ENGINE.md, 03_SECURITY.md, 04_ACCEPTANCE.md, 05_SOURCES.md, the original Word casebook and fixtures/README.md. These files define the product. Use source-records and fixtures as the starting data. If a newer Figma export exists locally, inspect it and match its layout without sacrificing the requirements. Do not assume access to a Figma account or invent design URLs.

## Execution order (finish each vertical slice)
1. Audit repo, create implementation progress log; ensure git origin is d36v2. Set up persistent light desktop shell with exactly Search, Apps, People. Rename UI to Singularity and methodology to Search, Context, Act. Preserve login and remove route-remount auth loops. Run smoke test and commit/push.
2. Implement durable data adapter and migrations, import fixtures idempotently, create case/office/person/document relationships, and verify counts. Existing Supabase if configured; for local fallback use a durable local DB only; never claim Vercel /tmp is persistent. Commit/push.
3. Build Search with server-side model tool calling, evidence retrieval, typed validation, actual DB actions, citations and error states. Start with workflow 1 end-to-end including DOCX draft, task and approval. Commit/push.
4. Complete workflows 2–5 including cohort SQL, audit analysis and knowledge change. Add all corresponding Apps screens and People views. Commit/push.
5. Complete file versioning, export DOCX/PDF/XLSX/PPTX, secure downloads, approvals, tasks, app connections, reminders and related record navigation. Keep unsupported external operations explicitly unavailable. Commit/push.
6. Test all acceptance criteria and fix regressions, run lint/typecheck/tests/build, verify hosted deployment if access exists, document actual results, commit/push.

## Working rules
- During active work, checkpoint approximately every 5–7 minutes and at every completed slice. Check git diff, stage only relevant non-secret files, commit with descriptive message, push to correct branch. Do not wait until the final step. If push fails, preserve local commit and report exact error; never force push or expose secrets. Do not falsely claim push/deploy success.
- Keep PROGRESS.md updated with done, failing, next and commit hashes. Continue from it if interrupted. Prioritise five complete workflows over cosmetic breadth. Do not ask for confirmation for routine implementation decisions. If required credentials missing, implement/test local paths and list blockers; never invent credentials.
- Reuse existing dependencies and provider. Use existing Gemini server-side integration where present; no provider labels or API keys in ordinary UI. Keep model adapter replaceable. Do not build unnecessary microservices, Kubernetes, graph databases or new auth infrastructure.
- Source records are training data. Use a discreet workspace classification and clear synthetic document/export metadata. Real institutional names and published government references are permitted; no fabricated official authorisation or successful external connectivity. Only actual approved government deployment may claim official status.
- Never use hardcoded chat answer matching as the engine. Real model chooses registered tools with schemas; tools operate on actual records. Deterministic tests may stub model plans, not production execution. Validate and authorise each tool server-side; no arbitrary SQL or unrestricted API calls from model output.
- Keep all data consistent. A task created from Search appears in Work, case and assignee profile. Approval binds exact immutable version. No action success without a persisted ID or verified external response.
- Do not commit .env, tokens, passwords, personal data or generated secret material. Preserve .gitignore. Use .env.example with names only. Do not rotate configured secrets or reset admin unnecessarily.

## Finish report
List changed files, commands and test outcomes, commit hashes, deployed URL only if verified, implemented and unavailable features, and precise setup instructions. Do not claim full completion unless acceptance tests actually pass.
