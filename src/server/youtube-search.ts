import { Innertube } from 'youtubei.js/cf-worker';
import type { Track } from '../../shared/types';

const TIMEOUT_MS = 8_000;

export class YouTubeSearchError extends Error {
  constructor(message: string, public status = 502, public reason?: string, public retryAt?: number) {
    super(message);
    this.name = 'YouTubeSearchError';
  }
}

// Keep the mapping independent of the parser classes so malformed or changed
// responses cannot introduce invalid IDs into a playlist write.
export function youtubeTracks(results: readonly unknown[]): Track[] {
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (!result || typeof result !== 'object') continue;
    const item = result as { type?: string; video_id?: unknown; title?: { toString(): string }; author?: { name?: unknown }; thumbnails?: { url?: unknown }[]; duration?: { seconds?: unknown } };
    if (item.type !== 'Video' || typeof item.video_id !== 'string' || !/^[\w-]{11}$/.test(item.video_id) || seen.has(item.video_id)) continue;
    const title = item.title?.toString().trim() || '';
    const artist = typeof item.author?.name === 'string' ? item.author.name : '';
    if (!title || !artist) continue;
    const image = item.thumbnails?.slice().reverse().find(thumb => typeof thumb.url === 'string' && /^https:\/\//.test(thumb.url))?.url;
    const seconds = item.duration?.seconds;
    seen.add(item.video_id);
    tracks.push({ id: item.video_id, title, artist, url: `https://www.youtube.com/watch?v=${item.video_id}`,
      image: typeof image === 'string' ? image : undefined,
      duration: typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined });
    if (tracks.length === 10) break;
  }
  return tracks;
}

export async function searchYouTube(query: string): Promise<Track[]> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const boundedFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, { ...init, signal });
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : NaN;
      const date = header ? Date.parse(header) : NaN;
      const delay = Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? date - Date.now() : 30_000;
      throw new YouTubeSearchError('Rate limit reached. Progress is saved. Waiting before retrying automatically.', 429, 'rateLimitExceeded', Date.now() + Math.max(1_000, delay));
    }
    return response;
  };
  try {
    const client = await Innertube.create({ retrieve_player: false, retrieve_innertube_config: false, generate_session_locally: true, enable_session_cache: false, fetch: boundedFetch });
    const response = await client.search(query, { type: 'video' });
    return youtubeTracks(response.results);
  } catch (error) {
    if (error instanceof YouTubeSearchError) throw error;
    throw new YouTubeSearchError('YouTube search is temporarily unavailable. Progress is saved; try again.');
  }
}
