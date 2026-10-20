# Add tenant-scoped Drizzle D1 persistence and Web Crypto token encryption

Read `docs/specs/cloudflare-migration.md` for the exact Store contract and schema.

Owned files: `src/db/**`, `src/server/store.ts`, `drizzle/**`, `drizzle.config.ts`, persistence/crypto tests. Do not change package files; report required dependencies/scripts to the framework agent/orchestrator.

Acceptance:
- Three simple Drizzle tables: connected accounts, app documents, operation leases; composite per-user keys and indexes.
- Committed initial migration runnable with local D1, no local filesystem database in Worker runtime.
- Async user-scoped Store contract with batched setMany, prefix listing, encrypted credentials and conditional per-user leases.
- AES-GCM uses persistent 32-byte base64 secret and authenticates ciphertext; no per-isolate random encryption key.
- Meaningful SQL-backed tests demonstrate two-user data isolation, lease racing/expiry/token ownership, credential roundtrip and ciphertext rejection.

Assigned implementation: Luna persistence agent. Dependencies: #1. Follow shared checkout ownership; do not revert others or make Git commits.
