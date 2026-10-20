# MCP support and setup

Checked 2026-10-20. The project now has active MCP configuration in [`.codex/config.toml`](../.codex/config.toml) for Codex and [`.mcp.json`](../.mcp.json) for compatible clients. Both Cloudflare and Clerk browser OAuth flows completed successfully on the owner's computer. OAuth credentials are managed by Codex outside this repository; the committed configuration contains only public endpoints and scope names.

## Cloudflare

- Documentation: **https://docs.mcp.cloudflare.com/mcp**. No account sign-in required. We successfully initialized Streamable HTTP protocol version 2025-03-26, listed the server's tools, and called `search_cloudflare_documentation` to verify the TanStack Workers configuration and limits. This is a tested documentation connection, not access to your Cloudflare account.
- Account/API: **https://mcp.cloudflare.com/mcp**. OAuth login completed successfully. The authorization request was limited to account identity, Workers scripts/bindings/routes, D1 and DNS/zone access needed for this project, plus offline refresh. No remote D1 or Worker was created by this configuration step.

Sources: [Cloudflare's official MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/), [official server repository](https://github.com/cloudflare/mcp).

## Clerk

Official endpoint: **https://mcp.clerk.com/mcp**, using Streamable HTTP. Its browser OAuth login completed successfully. It offers SDK snippets and account/application tools in the authorized workspace. The MCP does not return instance secret keys; obtain those through Clerk's secure dashboard/CLI flow and store them as Worker secrets.

Source: [Clerk MCP guide](https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server).

## TanStack

The official TanStack CLI previously exposed MCP, but its current migration documentation says that command was removed. Do not configure a stale `tanstack mcp` command or claim the AI MCP integration library is a docs MCP server. The implementation uses official TanStack docs and installed SDK types; CLI JSON introspection is an alternative where supported.

See the exact official-source links in [platform research](research/cloudflare-start-clerk.md).

## Configure your client

Codex reads the committed project-scoped `.codex/config.toml` in trusted projects. Reload/start a Codex session in this repository so it discovers the new servers; if Codex asks whether to trust the project, review its normal trust prompt. The running conversation's tool catalog does not automatically change when configuration files are written. Other MCP-compatible clients can use `.mcp.json` or adapt the provided example to their own schema; OAuth credentials are not automatically shared across different clients.

To reconnect with this installed CLI, use explicit endpoint overrides: its `mcp` management subcommands did not load the project configuration during setup. These commands leave global server configuration unchanged and store login credentials through Codex's normal credential store:

```sh
codex -c 'mcp_servers.cloudflare.url="https://mcp.cloudflare.com/mcp"' mcp login cloudflare --scopes 'offline_access,user:read,account:read,workers-scripts.read,workers-scripts.write,workers-scripts.bind,workers-routes.read,workers-routes.write,d1.metadata_read,d1.read,d1.write,zone.read,dns.read,dns.write'
codex -c 'mcp_servers.clerk.url="https://mcp.clerk.com/mcp"' mcp login clerk
```

The documentation server needs no OAuth. These MCP logins do not configure the deployed application's Clerk keys, provider OAuth secrets, domain, or D1 binding; those remain separate deployment settings.
