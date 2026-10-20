# Personal playlist-transfer API feasibility

Verified against primary documentation on 2026-10-19. This is planning research; no credentials or live account access have been tested.

## Finding

A personal Spotify ↔ regular YouTube playlist app is technically feasible, subject to platform access and quotas. Self-hosting removes the transfer-service subscription, but does not remove these platform requirements. Start with Spotify → YouTube, with reviewable video matches and resumable transfers.

## Spotify access

- Development Mode requires the app owner to maintain Spotify Premium. New limits are one client ID per developer and five users per app. This is an actual subscription requirement if the owner does not already have Premium.
- Playlist content can only be read for playlists the authenticated user owns or collaborates on. Other playlists can expose metadata without items. Consequently, a saved/followed playlist is not automatically a transferable source.
- Use `GET /me/playlists`, `GET /playlists/{id}/items`, `POST /me/playlists`, and `POST /playlists/{id}/items`; older tutorials use deprecated `/tracks` and user-specific creation routes. Handle the `tracks` → `items` and nested `track` → `item` response changes.
- Search now defaults to five results, with a maximum of ten per request. Do not depend on removed popularity fields for ranking.

Source: [Spotify February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

`GET /me/playlists` lists owned and followed playlists, supports pagination, and documents `playlist-read-private`. The UI should distinguish listing a playlist from permission to read its contents. [Current user's playlists](https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists).

## YouTube daily capacity

Current documentation, updated October 15, 2026, gives projects separate buckets: **100 `search.list` calls/day**, **100 video uploads/day**, and **10,000 units/day for other methods**. Search costs one call in its own bucket; do not use the older claim that search consumes 100 of the shared units. Quotas reset at midnight Pacific Time. Additional search-result pages also consume calls. [Overview](https://developers.google.com/youtube/data/getting-started), [quota calculator](https://developers.google.com/youtube/data/determine_quota_cost).

Creating a playlist costs 50 shared units; adding each existing video costs another 50. Playlist and item listing normally cost one. [Create playlist](https://developers.google.com/youtube/data/reference/rest/v3/playlists/insert), [add playlist item](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/insert), [quota calculator](https://developers.google.com/youtube/data/determine_quota_cost).

**Planning inference:** with one search per previously unmatched song, the default ceiling is roughly 100 new song matches/day. Inserting 100 matched videos into one new playlist costs 5,050 shared units, plus reads. With known video IDs, fewer than 199 insertions fit after playlist creation and reads. A large playlist can finish over multiple days, so persist progress and resume after quota reset. Extra match searches and retries reduce effective throughput. Inspect the project's actual Console quota before promising capacity.

`playlists.list(mine=true)` retrieves playlists **owned** by the authenticated user; this does not promise the complete collection of playlists saved in the YouTube UI. Each page can contain up to 50. [List playlists](https://developers.google.com/youtube/data/reference/rest/v3/playlists/list).

## Google authorization

YouTube playlist writes require user OAuth authorization; the documented general scopes include `youtube` and `youtube.force-ssl`. Request only the scope needed by the selected implementation. [Playlist creation authorization](https://developers.google.com/youtube/data/reference/rest/v3/playlists/insert).

External OAuth projects left in **Testing** issue refresh tokens that expire after seven days when requesting YouTube access; the exception applies only to basic identity scopes. Implement reconnect handling. For durable personal use, configure the production project's consent screen and publishing status appropriately, then authorize again; publishing does not make tokens irrevocable. [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

Google documents a personal-use verification exception for fewer than 100 users. Users can proceed through the unverified-app warning; the app must still meet Google policies and account/organization restrictions. Publishing status and verification are different settings. [When verification is not needed](https://support.google.com/cloud/answer/13464323?hl=en).

## Prerequisites before implementation can be validated

1. Confirm the owner's Spotify Premium status and ability to create a Development Mode app.
2. Register Spotify and Google OAuth applications and exact callback URLs; enable YouTube Data API v3 and add authorized/test accounts as needed.
3. Test one owned Spotify playlist and one YouTube channel with a tiny private destination playlist.
4. Confirm actual quota allocations and playlist visibility with those accounts.
5. Design manual match correction, quota-aware pause/resume, unavailable-item reporting, and duplicate-safe recovery before large transfers.

No API method guarantees that a song's first search result is its official music video. Matching confidence and user correction remain product requirements, especially for live versions, covers, remasters, and videos with intros.
