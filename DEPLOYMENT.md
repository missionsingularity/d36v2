# Deployment status

Existing Vercel project: `s-ac7e/d36v2`  
Production URL: https://d36v2-4fg7.vercel.app  
GitHub: https://github.com/missionsingularity/d36v2

The current checkout cannot update deployment configuration or deploy: Vercel CLI is not installed locally and network-backed `npx` access is blocked. The local `.git` metadata is read-only, and the connected GitHub integration previously denied branch/commit access with HTTP 403. No force push or replacement project was attempted.

The existing development server is at `http://localhost:3000`; a production-mode `next start` server was also started at `http://127.0.0.1:3211` in the prior recovery session. Prior route checks showed `/` redirecting to `/search` and `/search` returning 200. Recheck those running processes before relying on their current state.

Local required checks in this recovery run: typecheck passed, lint passed, 26 unit tests passed, and fixture/hash validation passed. Production build is pending. No current production deployment ID, HTTP response, or deployed commit is asserted by this document.

Environment variable names were checked without printing secret values. Gemini and public Supabase settings exist locally; the Supabase service role value is empty. Do not commit `.env.local` or privileged credentials.
