# Existing Spotify ↔ YouTube playlist transfer services

Researched 2026-10-19 from first-party product and support pages. Features and prices below are published claims; transfers were not tested with connected accounts.

## Verdict

The requested product already exists. Soundiiz is the closest verified match: its web app connects Spotify and YouTube, lets users browse their collections and choose playlists, and transfers in both directions. The user subsequently chose to build a personal app to avoid transfer-service subscriptions and app-imposed free-tier limits. Platform API access requirements and quotas still apply; see [API feasibility](api-feasibility.md).

## Services

- **Soundiiz (web):** Both [Spotify → YouTube](https://soundiiz.com/tutorial/spotify-to-youtube) and [YouTube → Spotify](https://soundiiz.com/tutorial/youtube-to-spotify) are documented. Connect the two accounts, choose playlists, review, and transfer. Its [plans page](https://soundiiz.com/pricing) advertises browsing collections in one interface. Free permits unlimited playlists one at a time, up to 200 selected tracks per transfer; Premium removes that limit and adds batch transfers.
- **TuneMyMusic (web):** Official [Spotify → YouTube](https://www.tunemymusic.com/transfer/spotify-to-youtube) and [YouTube → Spotify](https://www.tunemymusic.com/transfer/youtube-to-spotify) flows connect both accounts, let users select playlists, create the destination playlists, and report missing matches. [Plans](https://www.tunemymusic.com/plans) advertise 500 songs free, unlimited transfers on Premium. Paid prices depend on billing cadence; see the linked plans page.
- **FreeYourMusic (installed app):** Its [Spotify → YouTube guide](https://freeyourmusic.com/transfer-spotify-to-youtube) explicitly says it finds a video for each song, saves a YouTube playlist, preserves playlist names/order, and offers match confidence and rematching. It requires an installed app rather than being a web equivalent. [Pricing](https://freeyourmusic.com/pricing) displayed 300 free songs (600 after email signup). Paid plans are offered; see the linked pricing page for local checkout details.

## Video matching caveat

Choose **YouTube**, rather than **YouTube Music**, in Soundiiz for the user's video-oriented goal. Soundiiz [documents the difference](https://support.soundiiz.com/hc/en-us/articles/360011904480-Differences-between-YouTube-and-YouTube-Music-on-Soundiiz): YouTube matching uses popular videos, while YouTube Music matching aims for audio-only videos. Neither this explanation nor the reviewed competitors promises that every result is the official music video. A song may match audio, a live performance, or another version, so reviewing a sample transfer is necessary to assess that requirement.

A potential differentiated product would prioritize official clips and make ambiguous video selection easy to review, but this is a product opportunity inference, not a verified absence of competitors.
