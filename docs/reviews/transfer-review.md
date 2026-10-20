# Transfer review

Snapshot reviewed 2026-10-20; round-two verification after the fixes. Scope: `src/server/transfers.ts`, `providers.ts`, `handler.ts`, `store.ts`, and related tests, against `docs/specs/cloudflare-migration.md`.

1. **Resolved — stale checkpoint write after lease loss.** Store now binds acquired leases to the Store instance and applies the lease token and expiry as an `EXISTS` predicate in the same SQL statement for fenced document writes ([`store.ts:76`](../../src/server/store.ts#L76), [`store.ts:266`](../../src/server/store.ts#L266)). The SQLite-backed regression test expires an old token, acquires a replacement, and confirms the stale Store cannot overwrite either the job or item checkpoint ([`store.test.ts:106`](../../src/db/store.test.ts#L106)). This closes the prior check-then-write race for these document mutations.

2. **Resolved — duplicate marker on a later page.** Discovery now persists the candidate and aggregate match count while walking every listing page, accepting a candidate or permitting another create only after the scan completes ([`transfers.ts:249`](../../src/server/transfers.ts#L249)). The regression test supplies one marker match per page and confirms the second page pauses the job before create or insert ([`transfers.test.ts:224`](../../src/server/transfers.test.ts#L224)).

The existing transfer tests also cover insert-response-loss recovery, matching checkpoint failure, quota pause, and ambiguous-create pagination. No residual actionable issue found in this round for the two findings above. This was a read-only code/test inspection; tests were not rerun.
