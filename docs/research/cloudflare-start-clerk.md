# Cloudflare Workers + TanStack Start + Clerk research

Research checked 2026-10-20 against current first-party docs. This repo is currently a React/Vite frontend plus Express and local `node:sqlite`, with a resumeable transfer workflow and no auth ([package.json](../../package.json), [setup](../setup.md)).

## Recommended target shape

TanStack Start is now documented as stable. Use the current Vite integration for Cloudflare Workers: `@tanstack/react-start`, `@tanstack/react-router`, `vite`, `@vitejs/plugin-react`, plus dev dependencies `@cloudflare/vite-plugin` and `wrangler`. The official hosting guide configures the Cloudflare Vite plugin for the `ssr` environment, then `tanstackStart()` and React; `wrangler.jsonc` uses `main: "@tanstack/react-start/server-entry"`, a current compatibility date, and `nodejs_compat`. Replace the Express `start` process with Vite dev/preview and Wrangler deploy scripts. Follow the [TanStack Cloudflare hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) and its [Cloudflare example](https://github.com/TanStack/router/tree/main/examples/react/start-cloudflare-workers).

```ts
// vite.config.ts, following the current official guide
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
  ],
})
```

For persistence, use `drizzle-orm` with the D1 binding driver and `drizzle-kit` for schema/migrations. Wrangler should declare a D1 binding (for example `DB`) and a migrations directory. In server-only functions/routes, obtain the request's Cloudflare binding and construct `drizzle(env.DB)`; do not create a process-global D1 connection. Drizzle's [D1 connector guide](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1) shows the binding and `drizzle(env.DB)` pattern. For local development/migrations use Wrangler's local D1 and committed SQL migrations; the Drizzle guide also documents `drizzle-kit` with the D1 HTTP API for remote schema operations. Keep database access in server-only modules because Start is isomorphic by default ([execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)).

## Clerk integration

Use the dedicated `@clerk/tanstack-react-start` package. The [Clerk quickstart](https://clerk.com/docs/tanstack-react-start/getting-started/quickstart) currently puts `clerkMiddleware()` in `src/start.ts`, adds `<ClerkProvider>` to the app, and protects routes/server functions explicitly with `await auth()`. Middleware alone does not make routes private. One important trap: defining `src/start.ts` disables TanStack's default CSRF middleware, so Clerk's documented setup restores it explicitly:

```ts
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, clerkMiddleware()],
}))
```

Keep Clerk's secret key in a Worker secret, and only expose the publishable key in `VITE_CLERK_PUBLISHABLE_KEY`. The Clerk backend foundation explicitly supports Node.js/V8 isolates including Cloudflare Workers ([runtime compatibility](https://clerk.com/docs/guides/development/sdk-development/backend-only)); the TanStack-specific middleware and auth helpers are documented in the [SDK reference](https://clerk.com/docs/reference/tanstack-react-start/overview). For public app routes and provider OAuth callbacks, protect each privileged server function/route at the server boundary and scope stored data by Clerk `userId`.

## Free plan and resumable transfers

The free plan can host the request/response app, but it is a poor fit for doing an entire playlist transfer in one Worker invocation. Current Workers limits list 100,000 requests/day, 10 ms CPU per HTTP request, 50 outbound subrequests per invocation, six concurrent outbound connections, and 128 MB memory. Cloudflare notes SSR/auth work commonly uses 10–20 ms CPU, already around/over Free's CPU allowance. HTTP wall time itself is unlimited while a client stays connected, but disconnected requests can be canceled; `waitUntil()` only extends background work by up to 30 seconds. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Preserve the app's current persisted checkpoints and make each user-triggered resume request do a small bounded chunk of work, then return progress. Never rely on an in-memory loop, timer, open browser connection, or `waitUntil()` to finish a playlist. Each Spotify/YouTube API request consumes an external subrequest, so batches must remain comfortably below 50 per request; persist after each unit/page so failures and quota waits can resume safely. A task that must continue unattended needs a durable background execution design, and the simplest free-plan approach is user-driven resume requests.

D1 Free limits are 10 databases/account, 500 MB/database, 5 GB/account, 7-day Time Travel, and 50 D1 queries per Worker invocation (also covered by the 50 subrequest limit). D1 requests fail after the account's daily row read/write limits are reached (since Sep 1, 2026); the limits page currently lists those constraints and the [enforcement notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/) describes the fail-until-midnight-UTC behavior. Index user/job/track lookup keys and batch small writes. Sources: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 free-tier enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

## MCP availability

- **Cloudflare:** official remote MCP server `https://mcp.cloudflare.com/mcp` provides Cloudflare API tools; Cloudflare also lists `https://docs.mcp.cloudflare.com/mcp` as its documentation/reference server. Sources: [Cloudflare MCP repo](https://github.com/cloudflare/mcp), [Cloudflare's MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/).
- **Clerk:** official account and SDK-guidance MCP at `https://mcp.clerk.com/mcp`; browser OAuth sign-in is required. Source: [Clerk MCP guide](https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server).
- **TanStack:** the current official CLI docs explicitly say `tanstack mcp` has been removed and will not return. The CLI still provides agent-friendly local JSON commands (`tanstack search-docs ... --json`, `tanstack doc ... --json`, `tanstack libraries --json`); these are CLI introspection, not an MCP server. TanStack also serves docs as Markdown. Do not configure the recent community MCP implementation as an official TanStack endpoint. Sources: [official MCP migration notice](https://tanstack.com/cli/latest/docs/mcp-migration), [CLI reference](https://tanstack.com/cli/latest/docs/cli-reference), [official CLI repository](https://github.com/TanStack/cli).
- **Drizzle:** no official Drizzle MCP endpoint found; its official docs provide the D1 connector and examples cited above.

## Clerk production domain and free hosting

Cloudflare Free can host a hobby app at its assigned `*.workers.dev` hostname; Cloudflare describes workers.dev as for personal/hobby projects, while recommending a custom domain or route for production. For a Clerk production instance, Clerk's deployment guide requires a domain the owner controls and DNS access, and its environment guide says production instances require an associated production domain. Clerk's errors reference also states provider domains such as `*.workers.dev` are unsupported for production instances. So a public Workers Free deployment can use Clerk development credentials for a demo, but the documented production-auth setup needs a separately owned domain (which can be attached to the Worker on Cloudflare Free if the user already owns/obtains a domain). Sources: [Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production), [Clerk environments](https://clerk.com/docs/guides/development/managing-environments), [Clerk provider-domain error](https://clerk.com/docs/guides/development/errors/backend-api), [Cloudflare workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Cloudflare custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Source-sensitive notes

TanStack's Cloudflare hosting page is the primary source for the presently documented Vite plugin configuration; do not apply older `@cloudflare/vite-plugin` / Pages instructions from stale tutorials. Cloudflare limits and Clerk package requirements change over time, so recheck the linked pages during implementation and lock the package versions the repository actually installs.
