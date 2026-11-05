# Deploy on Cloudflare Free

For Cloudflare Workers Builds, set `PNPM_VERSION=12.14.0` under **Settings > Build > Build Variables and Secrets** so dependency installation matches local development. Keep this value aligned with `packageManager` in `package.json`.

In that same build settings section, set `VITE_CLERK_PUBLISHABLE_KEY` to the production Clerk publishable key. Vite embeds this public value during `pnpm build`; adding it only under the Worker's runtime **Variables & Secrets** does not configure the browser bundle. Keep `CLERK_SECRET_KEY` in Worker secrets and `CLERK_PUBLISHABLE_KEY` in the Worker runtime configuration.

After changing build variables, trigger a fresh build and deployment from `main`. Redeploying an existing artifact preserves its old embedded values. If the site displays “Sign-in unavailable”, confirm the build received `VITE_CLERK_PUBLISHABLE_KEY` before investigating Clerk sign-in or provider connections.

Target: one TanStack Start Worker, static assets, one D1 database accessed with Drizzle, and Clerk authentication. No paid queue, VM, external database, or transfer subscription is required. This guide prepares your own Cloudflare/Clerk/provider accounts; creating the source code does not create those resources or connect your accounts automatically.

The owner has a domain and will supply it later. Replace the example hostname throughout with that domain; never register the literal example callbacks. A stable domain keeps Clerk and provider redirects consistent across deployments.

## Before deploying

You need a Cloudflare account on the Free plan, a Clerk app, your existing Spotify Premium account and Spotify developer app, and a Google Cloud project with YouTube Data API v3 enabled. Use the default **Workers Free** plan; do not enable a paid plan to follow this guide. Attach the owned domain to the Worker for production.

Clerk requires a customer-owned domain for a **production** instance. A provider domain such as `workers.dev` cannot serve as Clerk's production domain. You can use a Clerk development instance with a `workers.dev` deployment for an initial test, subject to development-instance limitations. See [Clerk production deployment guidance](https://clerk.com/docs/guides/development/deployment/production) and the exact sources in [platform research](research/cloudflare-start-clerk.md).

Clerk sign-in is separate from connecting Spotify/YouTube. The app never treats a Google social sign-in to Clerk as permission to manage YouTube playlists.

## Local development

1. Install the supported Node.js version from `package.json` and pnpm 12.14.0 (pinned in `packageManager`), then run `pnpm install`.
2. Copy `.env.example` to `.env.local`. Vite and Cloudflare both load this file for local development. Only `VITE_` variables are exposed to the browser; keep server secrets unprefixed. Keep `.env.local` out of Git. Do not create `.dev.vars`, because it takes precedence and prevents Cloudflare from loading dotenv files.
3. Add Clerk's publishable key and local secret key. Generate a 32-byte base64 encryption key, for example with `openssl rand -base64 32`, and place it in `TOKEN_ENCRYPTION_KEY` in `.env.local`. Do not paste keys into chat.
4. Set `APP_URL=http://127.0.0.1:5173` (or the exact local address/port configured by the app). Add Spotify and Google OAuth client settings to `.env.local`.
5. Apply the committed migration to the local D1 binding:

   ```sh
   npx wrangler d1 migrations apply DB --local
   ```

6. Run `pnpm dev` and open its local URL. Sign in with Clerk, then connect each provider from the app.

Local D1 is separate from remote D1. Applying local migrations does not upload or import your old `.data/bridge.sqlite`; hosted users reconnect their providers. Your original `.data` directory is not deployed.

## Provision D1

Sign into Cloudflare's CLI using `npx wrangler login`, then create one database:

```sh
npx wrangler d1 create playlist-bridge
```

Copy the returned database ID into the `DB` binding in `wrangler.jsonc`, retaining the committed migration directory. Database IDs are identifiers, not API secrets. Apply migrations to that binding remotely:

```sh
npx wrangler d1 migrations apply DB --remote
```

Drizzle's schema and generated SQL are committed to the repository. Use migrations rather than manually editing deployed tables. The schema has three tables: connected accounts, per-user documents for jobs/items/OAuth state/cache, and per-user operation leases. Clerk remains the identity system of record.

## Configure Clerk and provider apps

In Clerk, create/configure your app and its production instance using the owned domain. Complete the DNS verification Clerk requests. Set the appropriate production publishable and secret keys for the deployed environment. Build the client with its public publishable key; secret keys belong only in Worker secrets. If you use Clerk's dashboard to restrict registration, make sure your own user can sign in.

Set the Worker's `APP_URL` to the final origin, for example `https://playlists.example.com`, and register these exact provider callbacks:

- Spotify: `https://playlists.example.com/auth/spotify/callback`
- Google web OAuth client: `https://playlists.example.com/auth/youtube/callback`

Spotify uses PKCE and needs `SPOTIFY_CLIENT_ID`. Keep the developer app owner on Premium and add the connected user to the Development Mode allowlist. New personal apps are limited to five users, and source track access is limited to owned/collaborative playlists.

Enable YouTube Data API v3 on the Google project and configure consent/test users or production publishing as appropriate. Use a **Web application** OAuth client with the exact callback. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The connected Google account needs a YouTube channel. Google Testing tokens for YouTube scopes expire after seven days; reconnect when prompted. Clerk publishing and Google's OAuth publishing are separate settings.

## Set Worker secrets and deploy

Set private values using interactive secret prompts, not command-line arguments:

```sh
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Set public/nonsecret bindings (`APP_URL`, provider client IDs, Clerk publishable key) using the committed configuration or your deployment environment. Never commit actual secret keys or local token data. Use the same `TOKEN_ENCRYPTION_KEY` across deployments; changing it without re-encryption makes existing grants unreadable and requires reconnecting. Back up the key in your password manager.

Build and inspect a deployment before publishing:

```sh
pnpm build
npx wrangler deploy --dry-run
```

Then deploy with `pnpm exec wrangler deploy` (or the repository's equivalent `pnpm deploy` script). The Cloudflare Vite plugin emits deployment configuration and asset paths; use its generated configuration rather than uploading the old SPA `dist` as a Pages project. Attach the owned domain to the Worker and confirm `APP_URL`, Clerk and both provider callbacks match it.

Do not commit a Cloudflare API token into GitHub Actions. If setting up CI later, use the repository's private secret store and narrowly scoped deployment credentials. This migration does not require automatic deployment or a paid resource.

## Free-plan operation

Workers Free has a limited daily request budget and a 10 ms CPU allowance per HTTP request. SSR/authentication work can approach that allowance; a local build/dry-run does not validate production CPU usage. Start with personal traffic and inspect deployed metrics. No `cpu_ms` setting can turn a Free Worker into a higher-paid allowance.

Transfer work uses **short browser-driven requests**. Source loading, video matching, destination discovery/reconciliation, and track insertion checkpoint progress in D1. Closing the tab stops the client from requesting more steps; resume later. No in-memory background process or `waitUntil()` completes an entire playlist unattended.

D1 Free currently includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Track documents are stored separately; metadata and per-user indexes keep steps small. Account grants and every job/state/cache lookup are scoped by the verified Clerk user ID. Quota errors are a pause condition rather than a reason to create a paid resource. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

YouTube discovery uses the unofficial YouTube.js library without Google credentials or YouTube Data API search quota. It has no documented throughput guarantee and can fail or be throttled; failures preserve progress for retry. Creating and filling playlists still uses the authenticated official YouTube Data API and its daily quota. Large transfers can require multiple days. See [unofficial discovery research](research/unofficial-youtube.md).

## First live verification

After deployment, verify one small owned playlist before a large transfer:

1. Signed-out API requests return 401; signing in exposes only that user's connected accounts and jobs.
2. Spotify and YouTube callbacks return to the same signed-in user.
3. Both libraries load and additional pages can be requested.
4. Match a few tracks, replace/skip a result, and approve a new private destination.
5. Close/reopen and resume; verify song order and duplicates, and that the source is unchanged.
6. Check Worker CPU/errors, D1 row usage and provider quotas.

Live verification and the final domain URL cannot be claimed before the actual accounts, secrets, DNS and remote resources are configured. [MCP configuration](mcp.md) can help with account setup after you authorize the official Cloudflare and Clerk servers.


## Invite-only access and daily transfer capacity

Production Setlist Clerk access mode was set to `restricted` (Invite-only) and read back on 2026-11-05. This is enforced by Clerk, including its hosted Account Portal; hiding a sign-up link is not the access control. Existing users retain access. Invite new users from Clerk Dashboard → Invitations and let them accept the Clerk-hosted invitation. When recreating an instance, set Access mode to Invite-only before publishing it. See [Clerk access modes](https://clerk.com/docs/guides/secure/restricting-access).

The capacity target is **1,000 tracks inserted into YouTube per day**, across all invited users, not 1,000 playlists. Code cannot raise Google's project allocation. As verified against [Google's quota calculator](https://developers.google.com/youtube/data/determine_quota_cost) on 2026-11-05:

- Each playlist item insert costs 50 general units. 1,000 inserts require 50,000 units before playlist creation and reads; request at least 60,000 general units/day, adjusting for the number of playlists.
- Request additional general units through the [YouTube quota extension/audit process](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits). Approval and throughput are not guaranteed. Confirm the actual allocations in the production Google Cloud project after approval.

Matching uses unofficial YouTube.js discovery for each uncached YouTube query; this does not call the official search endpoint. No Google credentials are required for discovery, but an authorized YouTube connection is required to create and fill the playlist. The library and upstream service do not promise a safe request rate; shared Worker egress, throttling, or upstream changes can interrupt discovery. A successful build or local mock test does not prove deployed Workers compatibility or sustained throughput. Verify a small live transfer and monitor errors before relying on it. Matching uses one discovery search per uncached query. New query results are retained per user for 29 days without sliding expiration. The new discovery cache uses a separate namespace, so old official-search entries are not reused. No cache or quota benefit is assumed for completely new songs. Profile metadata is reused for one hour only when the freshly retrieved Clerk provider token has the same SHA-256 fingerprint. Tokens themselves are not stored in the profile document. Changing authorization invalidates reuse; disconnecting clears workspace documents.

The transfer UI counts processed source tracks, which include cached and unavailable tracks. Its separate matching search/cache counters start when this instrumentation is deployed and exclude manual review searches, other jobs, profile calls, and other users. They count discovery attempts and cache hits, not Google Cloud quota totals. Failed network search attempts count, but a crash before the checkpoint can prevent recording one. Google Cloud request metrics also depend on the selected time window and reporting delay.

Temporary provider 429/rate-limit responses honor Retry-After and bounded backoff. Explicit daily-quota errors pause with a separate label and preserve progress. A generic 429 does not establish daily quota exhaustion. The screenshots alone do not establish the exact production error or reconcile the 89 searches with 101 processed tracks. Matching remains serialized; writes retain their existing pacing and reconciliation safeguards. Keep the workspace open for automatic progress.

Official playlist writes remain sequential: each `playlistItems.insert` adds one video and costs 50 units, while reads and playlist creation add to the total. The official [insert reference](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert) does not describe a multi-video insert or a quota discount for batching. Sequential writes preserve order and allow reconciliation after an uncertain response.

Validation on 2026-11-05: production build and typecheck passed; the local workerd suite exercises real YouTube.js initialization, successful response parsing, canonical video mapping, unauthenticated requests and 429 cooldowns. A small live search from the development machine returned valid tracks. Deployed Cloudflare egress and sustained throughput have not been tested; no authenticated remote playlist writes were performed during these checks.
