# Luna migration work

Repository: https://github.com/JoaoGFdev/setlist (private).

The parent agent coordinates the spec, issues, file ownership, review, Git operations and final verification. Implementation is delegated to GPT-6-Luna agents using the same shared checkout on `feat/tanstack-cloudflare`; agents do not commit or revert each other's changes.

| GitHub issue | Responsibility | Assigned agent |
| --- | --- | --- |
| [#1](https://github.com/JoaoGFdev/setlist/issues/1) | Official platform/MCP research and migration contract | Luna platform research; parent specifies contracts |
| [#2](https://github.com/JoaoGFdev/setlist/issues/2) | TanStack Start, Cloudflare build, Clerk, UI | Luna Start/Clerk |
| [#3](https://github.com/JoaoGFdev/setlist/issues/3) | Drizzle D1 schema, encrypted credentials, leases | Luna Drizzle/D1 |
| [#4](https://github.com/JoaoGFdev/setlist/issues/4) | Provider OAuth, bounded transfer API and recovery | Luna Transfer/API |
| [#5](https://github.com/JoaoGFdev/setlist/issues/5) | Integration checks, deployment/MCP guide and delivery | Parent orchestrator with Luna follow-up reviews |

All agents read [the migration spec](specs/cloudflare-migration.md) and their issue before implementation. The framework agent alone changes dependencies and lockfiles; persistence and domain agents report dependency/interface needs through the parent. Research agents cite primary sources. Code ownership is listed in the spec.

The owner confirmed an owned domain is available and will provide it later. Domain configuration, remote Cloudflare/Clerk resource provisioning, secrets and live provider OAuth remain separate from code verification; no production URL is invented.
