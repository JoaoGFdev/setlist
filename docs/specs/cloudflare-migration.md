# TanStack Start / Cloudflare migration

Status: implementation spec, 2026-10-20. User requested TanStack Start, Cloudflare Free, Clerk authentication, Drizzle with a simple database, and Luna agents assigned GitHub issues. This supersedes the local-only architecture in the original setup guide.

## Outcome

Deploy one TanStack Start application to Cloudflare Workers, with static assets served by Workers, a D1 database accessed through Drizzle, and Clerk sign-in. Preserve Spotify ↔ regular YouTube playlist browsing, reviewable video matches, private destination playlists, and recoverable transfers. No paid queues, durable background service, external database, or transfer-service subscription is required. Cloudflare/Clerk/provider limits still apply; Free's CPU allowance is an operational constraint to measure, not a promise of unlimited traffic.

Clerk identifies the application user. Spotify and Google OAuth remain separate account connections with playlist scopes. Never assume signing into Clerk grants access to either music account.

## Runtime and authentication

- Use current `@tanstack/react-start`, Router, React, and the Cloudflare Vite plugin; deploy to **Workers**, not Pages. Remove Express, `node:sqlite`, Node filesystem storage, and the old SPA entry from the runtime.
- `src/start.ts` configures Clerk request middleware and restores TanStack's server-function CSRF middleware. `ClerkProvider` wraps configured app routes; a public setup/signed-out screen is safe without credentials. Missing Clerk configuration never enables API access.
- Every `/api/*` and `/auth/*` server handler authenticates with Clerk on the server. Unauthenticated API requests return 401. Every database lookup/mutation includes the authenticated `userId`; no client-supplied owner ID is trusted.
- Mutations require an exact same-origin `Origin` matching configured `APP_URL`; reject cross-site requests. Provider OAuth callbacks are GET routes, validate one-time state, its expiry, the original Clerk user and an HttpOnly SameSite=Lax browser cookie. Use Spotify PKCE. The callback must not work under another signed-in user.
- Require HTTPS for deployed `APP_URL`; allow explicit loopback HTTP for development. Callback URLs derive from `APP_URL`, never an untrusted Host header. No keys/tokens appear in JSON responses, logs, URLs, or browser storage.
- Secrets are Worker bindings (`CLERK_SECRET_KEY`, provider secrets, `TOKEN_ENCRYPTION_KEY`); the Clerk publishable key is public. Document local `.dev.vars` / `.env` handling and exact callback registration.

## Simple database: three tables

1. `connected_accounts`: composite primary key `(user_id, provider)`, encrypted credentials JSON, updated timestamp. Encrypt access/refresh tokens with Web Crypto AES-GCM and a persistent base64 32-byte Worker secret. No generated per-isolate key.
2. `app_documents`: composite primary key `(user_id, key)`, JSON value and updated timestamp. Store job metadata (`job:<uuid>`), individual tracks (`item:<uuid>:<zero-padded-position>`), short-lived OAuth state (`oauth:<state>`), and expiring query caches. Store each track separately so large playlists do not become one oversized D1 row or rewrite every track on each step.
3. `operation_leases`: composite primary key `(user_id, name)`, random lease token and expiry. Atomic acquire-if-absent-or-expired and release-only-if-token-matches. Use the per-user `workspace` lease around all provider connection changes, transfer steps, match edits/searches, and approval/resume operations. This serializes concurrent tabs/isolates for one user without blocking other users.

Clerk is the user system of record; no duplicated users table or Clerk webhook is required. Commit Drizzle schema and an initial SQL migration. Local D1 migrations must be executable without a Cloudflare account. No automatic upload/import of the old local `.data` tokens; users reconnect on the hosted app.

## Module contracts and agent ownership

### Persistence agent

Own `src/db/**`, `src/server/store.ts`, `drizzle/**`, `drizzle.config.ts`, persistence/crypto tests. Export:

```ts
interface Credentials {
  access_token: string; refresh_token?: string; expiresAt: number;
  account: { id: string; name: string };
}
class Store {
  constructor(db: D1Database, userId: string, encryptionKey: string);
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  setMany(entries: Array<{ key: string; value: unknown }>): Promise<void>;
  delete(key: string): Promise<void>;
  list<T>(prefix: string): Promise<T[]>; // ordered by key ascending
  credentials(provider: Provider): Promise<Credentials | undefined>;
  saveCredentials(provider: Provider, value: Credentials): Promise<void>;
  deleteCredentials(provider: Provider): Promise<void>;
  acquireLease(name: string, ttlMs?: number): Promise<string | null>;
  releaseLease(name: string, token: string): Promise<void>;
}
```

All methods are user-scoped. Batch `setMany` into SQLite-compatible parameter counts. Expired cache/state entries are ignored/cleaned, and prefix SQL matches must be escaped. Lease acquisition must be a single conditional write, not a read-then-write. Tests must exercise actual SQL/Drizzle integration plus encryption and two-user/lease isolation.

### Transfer/API agent

Own `src/server/providers.ts`, `src/server/transfers.ts`, `src/server/handler.ts`, `src/server/matching.ts`, related tests and `shared/types.ts`. Keep `Store` contract above. Export:

```ts
dispatchApi(request: Request, env: AppEnv, userId: string): Promise<Response>;
dispatchOAuth(request: Request, env: AppEnv, userId: string): Promise<Response>;
```

Framework routes provide a verified user ID and environment. Handlers must still enforce origin checks, validate request bodies, and scope all work through `new Store(env.DB, userId, env.TOKEN_ENCRYPTION_KEY)`. `AppEnv` is owned by the foundation agent in `src/server/env.ts` with `DB`, `APP_URL`, `TOKEN_ENCRYPTION_KEY`, optional `SPOTIFY_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLERK_SECRET_KEY`, and Clerk publishable key(s). Agree additions through the orchestrator.

Provider settings come from request bindings, never global mutable credentials or `process.env`. Use Web APIs. Bound remote request timeouts. Avoid module-global maps/sets, fire-and-forget promises, timers, long loops, and `waitUntil` for transfer completion.

### Framework/UI agent

Own package/lockfile, Vite/TypeScript/Wrangler config, `src/routes/**`, router/start entries, `src/server/env.ts`, Clerk auth bridge, `src/components/**`, client CSS, `.env.example`, `.dev.vars.example`, `.gitignore`; remove old `src/main.tsx`, root `index.html`, and legacy `server/**` once replacements exist. Own installation and build integration. Use the dedicated Clerk TanStack SDK, not a generic client-only auth gate.

Preserve the interface with signed-out/sign-in controls and UserButton. Do not access `window`, `location`, or `history` during SSR. Service setup explains deployed callback URLs. Local-only wording must be replaced. Keep responsive layout and accessible match review.

## API contract

- `GET /api/status`: existing `Status` fields, only this user's accounts, configured callbacks.
- `GET /api/playlists/:provider?cursor=...`: `{ items: Playlist[], nextCursor?: string }`. One provider page per request. UI supports loading additional pages.
- `GET /api/jobs`: job summaries only, newest first, no bulk track JSON.
- `GET /api/jobs/:id`: full job including items for review/details. API reads must not expose another user's job, even by guessed UUID.
- `POST /api/jobs {source, playlistId, name}`: validate source playlist ownership/access with one metadata call; save a new job in `loading` phase; return full job (initial items empty). Do not begin background work.
- `POST /api/jobs/:id/step`: execute one small durable step under the workspace lease; return job summary. Source loading fetches one page and appends item documents; matching handles one track; destination discovery/reconciliation fetches one page; insertion adds at most one selected track. Handle provider tokens/metadata within the per-request budgets.
- `POST /api/jobs/:id/select {index,candidateId}`, `/search {index,query}`, `/approve`, `/resume`: preserve existing intent; edits only during review; create no remote playlist before approval; resume clears a paused condition. Return full job for review edits/approval/resume. `/approve` changes phase and lets client step rather than launching a loop.
- `POST /api/accounts/:provider/disconnect`: remove only this user's stored account grant while holding the workspace lease. Remote revocation remains a documented provider-settings action.
- `GET /auth/:provider`, `GET /auth/:provider/callback`: authenticated provider connection flow, user-bound state/cookie/PKCE, encrypted credentials.

Shared types: extend `Job.phase` with `loading`; expose durable cursors/counters as needed. `JobSummary` is `Omit<Job, 'items'>` with `totalCount`, `matchedCount`, `selectedCount` counters; a full `Job` includes those counters and `items`. Keep original source/destination account IDs and order/duplicate preservation. Foundation consumes these exported types; domain agent owns their final definitions.

## Transfer recovery invariants

- The client drives step requests sequentially only after Create/Resume/Approve and while that job remains active in the open UI. Closing the browser is safe: a future Resume continues persisted work. No unattended completion is promised.
- Persist small metadata updates and only the changed item. Stop on quota/rate/auth/network failures with an actionable message; do not silently skip failed API calls. Unavailable source items can be explicitly skipped.
- Destination playlist creation uses a unique `[bridge:<jobId>]` marker. Paginate destination discovery; on an ambiguous creation failure, reset/repeat discovery before ever attempting another create.
- After a resume or ambiguous insertion, reconcile the destination's ordered prefix against approved selections before appending. Paginate reconciliation across steps. Preserve duplicate positions; never deduplicate tracks by ID. If externally edited, pause without writes.
- Workspace leases are persisted in D1, have bounded expiry and token-checked release. An expired invocation cannot overwrite checkpoints after losing its lease; a lease must outlive bounded provider requests or be renewed/verified before committing.
- No account grants may move across users. Reconnecting another provider account does not silently redirect an existing job.

## Verification and delivery

1. Typecheck and production Workers build; Wrangler dry-run output must contain no Express/filesystem/`node:sqlite` runtime dependency.
2. Apply committed D1 migration locally; test Drizzle persistence, two-user isolation, encryption, and racing/expired leases against an actual SQLite/D1-compatible engine.
3. Meaningful transfer tests: bounded progression, quota checkpoint, ambiguous create/insert recovery, ordered duplicates, account changes, owner scoping, review edit restrictions.
4. HTTP smoke checks: signed-out public page renders; unauthenticated API/callback requests fail closed; origin mismatches are rejected; missing Clerk configuration cannot bypass authentication.
5. Document free-tier budgets, request-driven transfer behavior, D1 creation/migrations, Worker secrets, Clerk setup and production domain requirements, and exact callback URLs. Never claim deployment/live OAuth checks without configured accounts.
6. Create GitHub issues linked to this spec and record each Luna agent's assigned issue. Push source and create a reviewable PR if implementation is verified. Do not deploy or create a paid resource just to complete validation.

## MCP use

See [platform research](../research/cloudflare-start-clerk.md). Official Cloudflare documentation MCP is usable without account access; account-management Cloudflare and Clerk MCP require user OAuth and are not currently connected. Check official TanStack CLI support before asserting no MCP exists. Commit project-scoped example config/documentation rather than silently changing global agent settings. Continue using first-party docs when an authenticated MCP is unavailable.
