<img src="assets/icon.svg" width="64" height="64" alt="">

# Playlist Bridge

A web app to browse Spotify and YouTube playlists and copy them between accounts. Review music-video matches, create private playlists, and resume transfers after API quota or connection interruptions. No transfer-service subscription or app-imposed song cap.

Built with **TanStack Start**, **Clerk**, **Drizzle**, and **Cloudflare Workers + D1**. Designed for personal traffic on Cloudflare Free, with small request-driven transfer steps rather than a long-running server process. Provider and hosting quotas still apply.

Requires Node.js 24+, a Clerk app, a Spotify Premium account, and your own Spotify/Google OAuth app registrations. Production Clerk authentication requires a domain you own.

```sh
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
# Configure Clerk/provider keys and a persistent encryption secret.
npx wrangler d1 migrations apply DB --local
npm run dev
```

Open **http://127.0.0.1:5173**. See [deployment and setup](docs/deployment.md) for local bindings, exact callbacks, D1 migrations, Worker secrets and production deployment.

Clerk identifies each user; Spotify and YouTube grants are separate provider connections. Server-side handlers scope account grants, jobs, items and caches by the verified Clerk user ID. OAuth tokens are encrypted at rest with Web Crypto. D1 stores three simple tables for connections, documents and operation leases.

The open browser requests one bounded step at a time. Closing it stops further requests; resume later from saved progress. Source playlists remain unchanged and approved destinations are private. Large playlists can span multiple days due to YouTube quotas.

```sh
npm test
npm run build
npm run dry-run
```

Delivery: [migration spec](docs/specs/cloudflare-migration.md), [Luna issue assignments](docs/orchestration.md), [MCP support](docs/mcp.md).

Research: [existing services](docs/research/playlist-transfer-services.md), [provider APIs](docs/research/api-feasibility.md), [Cloudflare/Start/Clerk](docs/research/cloudflare-start-clerk.md).
