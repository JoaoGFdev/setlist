# Port provider OAuth and transfers to bounded, recoverable Worker requests

Read `docs/specs/cloudflare-migration.md` for API, Store, environment and recovery contracts.

Owned files: `src/server/{providers,transfers,handler,matching}.ts`, `shared/types.ts`, related domain tests. Do not edit framework/config/store-owned files. Preserve current matching and provider behavior while replacing process globals and background loops.

Acceptance:
- Authenticated-user scoped HTTP dispatchers and separate provider OAuth connections, with one-time state/cookie/PKCE binding.
- One-page library/source loading; one-item matching/insertion; paginated marker discovery and ordered destination reconciliation.
- Persist metadata separately from individual track documents; summaries avoid bulk item payloads.
- D1 workspace leases protect mutations across tabs/isolates, with bounded requests and safe checkpoint ownership.
- Preserve manual match review, private destinations, duplicates, quota errors, source/destination account identity and ambiguous-write recovery.
- Tests verify bounded stepping, quota checkpoints, ambiguous create/insert handling, duplicate order, cross-user access and review restrictions.

Assigned implementation: Luna transfer/API agent. Dependencies: #1 and Store contract in #3. Other agents share this checkout; do not revert others or make Git commits.
