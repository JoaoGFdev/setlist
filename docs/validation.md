# Cloudflare migration validation

Verified 2026-10-20 with Node.js 24.22.0, the committed package lock, Wrangler 4.151.3, and compatibility date 2026-10-19 (supported by the installed local Workers runtime).

## Automated checks

`npm test` passes **22 tests**:

- **9 D1/HTTP tests** run inside the local Workers runtime against the committed generated Drizzle migration. They verify tenant-scoped documents/accounts/jobs, encrypted credentials with user/provider authenticated data, ciphertext tampering and row-swap rejection, prefix ordering, expiration and batched writes, lease contention/expiry, atomic stale-writer fencing, HTTP auth/Origin validation, and user/cookie-bound one-time OAuth state.
- **3 UI fixture tests** use mocked Clerk and API responses to verify sign-in-triggered loading, bounded-step progression without full-job reads after every step, and job-switch cancellation/handoff. These are fixture tests, not real Clerk login.
- **10 domain tests** verify one-page/source and one-item/matching progression, quota pauses, positional duplicates, ambiguous insertion recovery, checkpoint write failure, approval/edit restrictions, paginated marker discovery and later-page duplicate rejection, summary records, account identity and OAuth binding.

`npm run build` passes both Vite client/Workers SSR builds and TypeScript checking. The production client bundle contains no `cloudflare:workers` import. Runtime source has no Express, `node:sqlite`, or Node filesystem storage dependency.

`wrangler d1 migrations apply DB --local` successfully applies the generated migration. A second Drizzle schema generation reports no schema changes. SQL snapshots and the migration journal are tracked for future migrations.

`wrangler deploy --dry-run` passes using the generated Workers configuration. Reported upload size is approximately **2,314 KiB raw / 486 KiB gzip**; bindings are D1, static assets and configured application origin. This did not deploy or provision remote resources.

## Runtime/browser checks

The real local TanStack Start application at `http://127.0.0.1:5173` returns HTTP 200 for its public setup page. With Clerk unconfigured, `/api/status` and provider callbacks return HTTP 503 JSON rather than exposing data or bypassing authentication.

The T3 collaborative browser loaded and hydrated the app, opened Account setup, displayed both provider callback instructions, and showed no horizontal overflow at a verified 390×844 viewport. The unconfigured/signed-out screen made no private `/api/` requests. The signed-in workflow is covered by fixture tests because live Clerk keys were not supplied.

An independent Luna review identified lease check/write atomicity and incomplete cross-page marker detection. Both findings were corrected and re-reviewed; see [the review record](reviews/transfer-review.md).

## Not yet verified

No real Clerk, Spotify or Google account was connected. Live OAuth/token refresh, actual account playlist visibility, production DNS, remote D1, Cloudflare deployment and production CPU usage still require the owner's domain, account registrations and secrets. Free-plan limits and provider quotas remain operational constraints; local build/dry-run success does not prove production traffic will stay within those limits.

Cloudflare's public documentation MCP was successfully initialized and queried. Cloudflare account MCP and Clerk MCP were not authorized; their official URLs and connection instructions are in [MCP setup](mcp.md).
