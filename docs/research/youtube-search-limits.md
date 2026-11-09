# YouTube search limits and alternatives

Checked 2026-10-20 against primary sources. These are published defaults, not a verified reading of Setlist's Google Cloud quota allocation or remaining balance.

## Official YouTube Data API

- Current default: **100 `search.list` requests per project per day**, in its own Search Queries bucket; each request costs one unit. The separate general bucket supplies 10,000 units/day for other endpoints. Additional result pages consume additional requests. Daily quotas reset at midnight Pacific Time. Older explanations describing search as 100 units from the general 10,000-unit bucket are outdated relative to the current documentation. [Google quota calculator](https://developers.google.com/youtube/data/determine_quota_cost), [search.list reference](https://developers.google.com/youtube/v3/docs/search/list).
- The supported way to increase this allocation is the YouTube API Services audit and quota extension request. Approval requires compliance review; the documentation does not promise a particular allocation or turnaround time. [Quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- Known video IDs can be fetched with `videos.list` for one general-quota unit per request, including multiple comma-separated IDs. Thus saved matches or user-pasted YouTube URLs can avoid a fresh search; they do not themselves discover the matching song. [videos.list](https://developers.google.com/youtube/v3/docs/videos/list).

## Paid search alternatives

These providers publish YouTube search scraping APIs, independent of the Google Cloud search bucket. They are commercial third-party services, not official YouTube quota extensions; matching quality and operational behavior need testing.

| Provider | Published monthly plan | Published throughput |
| --- | --- | --- |
| SearchApi | $40 for 10,000 searches; $100 for 35,000; $250 for 100,000 | Consult plan/account limits |
| SerpApi | $75 for 5,000 searches; $150 for 15,000; $275 for 30,000 | Respectively 1,000, 3,000, and 6,000 searches/hour |

Sources: [SearchApi YouTube endpoint](https://www.searchapi.io/docs/youtube), [SearchApi pricing](https://www.searchapi.io/pricing), [SerpApi YouTube endpoint](https://serpapi.com/youtube-search-api), [SerpApi pricing](https://serpapi.com/pricing). Monthly allowances and hourly throughput are different limits; 10,000/month is roughly 333/day averaged over 30 days, not a daily entitlement.

## Unofficial YouTube Music / InnerTube

`YouTube.js` targets YouTube's internal InnerTube API. `ytmusicapi` emulates YouTube Music browser requests, supports searching, and explicitly says it is not endorsed by Google. Its FAQ confirms rate limits exist without giving a numeric allowance. These cannot be described as unlimited or as a guaranteed higher-quota production API. [YouTube.js](https://github.com/LuanRT/YouTube.js), [ytmusicapi documentation](https://ytmusicapi.readthedocs.io/en/stable/), [rate-limit FAQ](https://ytmusicapi.readthedocs.io/en/stable/faq.html#is-there-a-rate-limit).

## Implications for Setlist

The parent inspection found one official search request per cache miss, ten candidates per response, and a seven-day query cache scoped to each user. Under the default allocation, that means approximately 100 uncached song queries/day across the Google project; retries or custom queries can reduce the number of distinct songs. A shared cache could reduce repeated discovery across users, subject to the existing application and data policies.

Prefer requesting a larger official search quota and reducing duplicate lookups. A paid provider is an option when a predictable purchased search allowance is needed. Changing discovery does not remove YouTube playlist-writing limits: `playlistItems.insert` costs 50 units from the general bucket, so a default 10,000-unit bucket supports fewer than 200 inserted tracks/day once playlist creation and other operations are included. [Google quota calculator](https://developers.google.com/youtube/data/determine_quota_cost).
