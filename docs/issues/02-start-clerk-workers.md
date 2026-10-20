# Migrate the app shell to TanStack Start, Clerk and Cloudflare Workers

Read and implement `docs/specs/cloudflare-migration.md`, particularly runtime/authentication, framework/UI ownership and API contracts.

Owned files: package/lockfile, Vite/TypeScript/Wrangler configs, router/start entries, `src/routes/**`, `src/server/env.ts`, Clerk auth adapter, `src/components/**`, frontend CSS and environment examples. Remove legacy SPA/Express runtime entry once replaced. Do not edit persistence or domain-engine modules.

Acceptance:
- Actual TanStack Start file routes with Cloudflare Vite plugin; Worker build and deploy/dry-run scripts.
- Clerk sign-in/user controls and explicit server-side protection for API and OAuth handlers; fail closed without keys.
- Restore server-function CSRF middleware and dispatch authenticated HTTP routes to `dispatchApi`/`dispatchOAuth`.
- Migrate existing responsive playlist/review UI; SSR-safe browser access; page-aware playlist loading.
- Client-driven sequential `/step` requests and explicit resume after closing browser; no background in-memory jobs.
- `npm run build` and typecheck pass after integration; preserve compatibility with the shared contracts.

Assigned implementation: Luna framework agent. Dependencies: research/spec #1, persistence #3 and engine #4 module contracts. Other agents work in the same checkout; do not revert their changes or make Git commits.
