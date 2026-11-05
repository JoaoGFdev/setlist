import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchYouTube, youtubeTracks, YouTubeSearchError } from './youtube-search';

describe('YouTube discovery in Workers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps only distinct valid videos, with milliseconds and canonical URLs', () => {
    const video = { type: 'Video', video_id: 'abcdefghijk', title: { toString: () => 'Artist - Song' }, author: { name: 'Artist' }, thumbnails: [{ url: 'https://img.example/thumb' }], duration: { seconds: 123 } };
    expect(youtubeTracks([video, video, { ...video, video_id: 'invalid' }, { ...video, type: 'Playlist' }])).toEqual([{
      id: 'abcdefghijk', title: 'Artist - Song', artist: 'Artist', url: 'https://www.youtube.com/watch?v=abcdefghijk', image: 'https://img.example/thumb', duration: 123000,
    }]);
  });

  it('parses a successful InnerTube response into a usable playlist video', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
        { itemSectionRenderer: { contents: [{ videoRenderer: {
          videoId: 'abcdefghijk', title: { runs: [{ text: 'Artist - Song' }] },
          ownerText: { runs: [{ text: 'Artist', navigationEndpoint: { browseEndpoint: { browseId: 'UCartist' } } }] },
          thumbnail: { thumbnails: [{ url: 'https://img.example/thumb', width: 120, height: 90 }] },
          lengthText: { simpleText: '2:03' },
        } }] } },
      ] } } } },
    })));
    const results = await searchYouTube('artist song');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'abcdefghijk', title: 'Artist - Song', artist: 'Artist',
      url: 'https://www.youtube.com/watch?v=abcdefghijk', duration: 123000 });
  });

  it('runs the real client without credentials and preserves rate-limit cooldown', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      return new Response('', { status: 429, headers: { 'retry-after': '45' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const before = Date.now();
    await expect(searchYouTube('artist song')).rejects.toMatchObject({ status: 429, reason: 'rateLimitExceeded', retryAt: expect.any(Number) });
    try { await searchYouTube('artist song'); } catch (error) {
      expect(error).toBeInstanceOf(YouTubeSearchError);
      expect((error as YouTubeSearchError).retryAt).toBeGreaterThanOrEqual(before + 45_000);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
