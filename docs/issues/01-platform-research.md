# Platform research and migration contract

Implement the accepted platform research and architecture in [the migration spec](../specs/cloudflare-migration.md).

Acceptance:
- Current primary-source guidance for TanStack Start on Workers, Clerk, Drizzle/D1, and Cloudflare Free limits.
- Official MCP endpoints and connection status; distinguish removed TanStack CLI MCP from current support.
- Document Clerk production custom-domain requirements and personal provider API restrictions.
- Define module boundaries, API contracts, tenant isolation and durable short-step transfer behavior.

Owner: Luna platform research agent; orchestrator owns architecture and integration contracts. Research is recorded in `docs/research/cloudflare-start-clerk.md`.
