# MCP support and setup

Checked 2026-10-20. None of these account-management integrations was preconnected to this agent session. Searching the available plugin directory returned no matching installed/available Cloudflare, Clerk or TanStack plugins. That does not imply the providers lack remote MCP services.

## Cloudflare

- Documentation: **https://docs.mcp.cloudflare.com/mcp**. No account sign-in required. We successfully initialized Streamable HTTP protocol version 2025-03-26, listed the server's tools, and called `search_cloudflare_documentation` to verify the TanStack Workers configuration and limits. This is a tested documentation connection, not access to your Cloudflare account.
- Account/API: **https://mcp.cloudflare.com/mcp**. Requires your Cloudflare OAuth authorization before managing resources. We did not connect an account, create D1 remotely, or deploy a Worker.

Sources: [Cloudflare's official MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/), [official server repository](https://github.com/cloudflare/mcp).

## Clerk

Official endpoint: **https://mcp.clerk.com/mcp**, using Streamable HTTP. It offers SDK snippets and account/application tools after browser OAuth sign-in to your selected Clerk workspace. No account connection was made here. The MCP does not return instance secret keys; obtain those through Clerk's secure dashboard/CLI flow and store them as Worker secrets.

Source: [Clerk MCP guide](https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server).

## TanStack

The official TanStack CLI previously exposed MCP, but its current migration documentation says that command was removed. Do not configure a stale `tanstack mcp` command or claim the AI MCP integration library is a docs MCP server. The implementation uses official TanStack docs and installed SDK types; CLI JSON introspection is an alternative where supported.

See the exact official-source links in [platform research](research/cloudflare-start-clerk.md).

## Configure your client

The committed [`.mcp.json.example`](../.mcp.json.example) contains the three verified provider URLs. Copy the entries to the project-scoped MCP settings supported by your client (the `mcpServers` JSON shape is accepted by several clients; other clients use a different schema). Enable only the servers you need. Account servers will open their own OAuth sign-in and permission review. Configuration alone does not mean a server is connected; verify tool listing and account identity after authorization.

We intentionally did not change global agent settings, start account authorization on your behalf, or put secrets in configuration. The documentation server can be used immediately; Cloudflare/Clerk account tools require your connection. First-party web docs remain available while account MCPs are disconnected.
