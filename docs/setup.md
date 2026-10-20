# Playlist Bridge setup

The project has migrated from a local Express process and filesystem SQLite to **TanStack Start on Cloudflare Workers**, **Clerk**, and **Drizzle/D1**.

Follow [the deployment and local setup guide](deployment.md). It covers local environment files, Clerk setup, provider registrations, exact callback URLs, encryption keys, D1 migrations, Cloudflare Free deployment and resumable operation.

For current provider access requirements and quotas, see [API feasibility](research/api-feasibility.md). For optional official Cloudflare/Clerk MCP connections, see [MCP setup](mcp.md). The original local `.data` database is not uploaded automatically; reconnect providers in the new application.
