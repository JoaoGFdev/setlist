# Run Playlist Bridge locally

This is a single-user app bound to your computer's loopback address. It uses your own Spotify and Google OAuth registrations, with no transfer-service subscription or app-imposed track cap. Platform quotas still apply. No cloud database, hosting account, or YouTube Premium subscription is required.

## Install and start

Use Node.js 24 or newer. In this repository:

```sh
npm install
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:3000**. Use that exact host, rather than `localhost`, so the OAuth redirects match. Add the credentials described below to `.env`, then restart the server. Never paste client secrets into chat or commit `.env`.

For a production build on your own computer:

```sh
npm run build
npm start
```

The server still binds only to `127.0.0.1`. Public/multi-user hosting is outside this version's scope.

## Spotify registration

1. Sign into the [developer dashboard](https://developer.spotify.com/dashboard) with your Premium account and create an app using Web API access.
2. Add the redirect URI **http://127.0.0.1:3000/auth/spotify/callback** exactly.
3. Copy the app's client ID into `SPOTIFY_CLIENT_ID` in `.env`. Spotify uses authorization code with PKCE, so this app does not require a Spotify client secret.
4. In the app's user/access management, add the Spotify account you will connect to the allowlist. Development Mode supports up to five users; this app itself is single-user.
5. Restart Playlist Bridge and click **Connect** on Spotify. Grant playlist read/write access.

Spotify requires the **developer app owner** to retain Premium. Private/collaborative playlist read permissions and playlist modification permissions are requested. The library can list followed playlists, but only playlists you own or collaborate on can be read for transfer with a new Development Mode app. [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [2026 API migration](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow).

## Google / YouTube registration

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** in the API library.
3. Configure the Google Auth Platform consent screen (branding, audience and data access). For personal testing, use an External audience in Testing and add your own Google account as a test user. Add the scope `https://www.googleapis.com/auth/youtube.force-ssl` to data access; it allows playlist reads and writes and Google's consent wording also covers broader video management capabilities. This app only uses playlist, channel and search operations.
4. Create an OAuth client with application type **Web application**. Set authorized JavaScript origin to **http://127.0.0.1:3000** and authorized redirect URI to **http://127.0.0.1:3000/auth/youtube/callback**.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
6. Restart Playlist Bridge and connect YouTube. Choose the account/channel that owns your playlists. The Google account needs a YouTube channel; create one on YouTube if necessary.

This uses **regular YouTube video playlists**. The API lists playlists owned by the authorized channel; it does not expose every playlist you have saved in the YouTube interface, Watch Later, or history. [Playlist listing](https://developers.google.com/youtube/data/reference/rest/v3/playlists/list).

With Google's consent screen left in **Testing**, refresh tokens for YouTube scopes expire after seven days. Reconnect when the app prompts you. For longer-lived personal authorization, consider changing the publishing status to Production and authorizing again. Google documents a personal-use verification exception for fewer than 100 users; an unverified-app warning and account/organization restrictions may still apply. Publishing status is separate from verification. [Token expiration](https://developers.google.com/identity/protocols/oauth2#expiration), [verification exceptions](https://support.google.com/cloud/answer/13464323?hl=en).

If you change the port, update `PORT` and `APP_URL` together and register the new exact redirect URIs with both providers.

## Transfer a playlist

1. Connect both accounts and choose **Transfer** next to a playlist.
2. Name the destination and choose **Find matches**. This reads the source and searches the destination. Nothing is created yet.
3. Review the matches. For YouTube, the search and ranking favor official music videos, but no API guarantees an official clip. Open the result, choose another candidate, search again, or skip the track. YouTube-to-Spotify artist/title extraction is approximate, so review those results as well. Unavailable/local/non-music items are shown as skipped.
4. Choose **Create private playlist** to approve the selections. A new private playlist is created and tracks are inserted in source order. Duplicate songs are preserved. The source is unchanged.
5. If quota, connectivity, or authorization interrupts processing, progress is saved. Fix the issue and choose **Resume transfer**. Matching resumes where it stopped; insertion reconciles the destination's ordered prefix before adding tracks. If the app restarts, previously running work becomes paused until resumed.

Resume manually while the app is running; this version does not schedule next-day work automatically. For a large playlist, matching may take several days before all selections are ready for review. Adding the approved tracks can then span further days.

## Quotas and cost

Current default YouTube quotas are **100 searches/day** and **10,000 units/day for other operations**. Playlist creation costs 50 units; each video insertion costs 50. Roughly 100 previously unseen songs can be matched per day with one search each. Repeated queries are cached for seven days to reduce searches. Your Console's actual quotas are authoritative and may differ. Quotas reset at midnight Pacific time; request more from Google if needed. [Quota documentation](https://developers.google.com/youtube/data/determine_quota_cost).

There is no arbitrary free-tier track limit in this app. Owning the code does not bypass Spotify access rules or Google's API quota. Your existing Spotify Premium is the subscription prerequisite; this project does not add a transfer-service subscription. It does not download or re-upload audio or video.

## Data and recovery

OAuth access/refresh tokens are encrypted using AES-256-GCM in `.data/bridge.sqlite`. The encryption key is generated in `.data/key`; directory and key permissions restrict local access. This protects against casually reading the database alone, not compromise of your computer or a backup containing both files. Playlist metadata, candidate selections and job progress are stored locally too. `.env`, `.data`, and build output are excluded from Git.

Keep `.data` intact to preserve transfer recovery. The new destination playlist description includes a `[bridge:…]` marker so a successful creation can be found if the response is lost. Keep that marker and avoid editing an in-progress destination playlist. If its sequence changes, the app stops rather than guessing how to merge. Destination deletion/unavailable videos may require manual repair. Resume uses the same source/destination accounts used to create the transfer; reconnecting another account does not silently redirect writes.

Disconnect removes local authorization; revoke the app in Spotify/Google account settings to invalidate its grant remotely. To clear all local history and credentials, stop the app and remove `.data`; existing remote playlists remain. Search cache entries expire after seven days. Job history persists until you clear it; do not treat stored provider metadata as a permanent archive.

## Validation

```sh
npm test
npm run build
```

Automated tests cover ordered duplicate-safe recovery, quota checkpoints, restart/account changes, encrypted credential storage, current Spotify pagination, matching, and recovery of destination creation. Live OAuth and transfers require your registered apps and must be checked with a small playlist first.
