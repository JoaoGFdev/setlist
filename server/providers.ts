import type { Candidate, Playlist, Provider, Track } from '../shared/types.ts';
import { Store } from './store.ts';
import { rank, splitVideoTitle } from './matching.ts';

export class ServiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const settings = {
  spotify: { clientId: process.env.SPOTIFY_CLIENT_ID || '', clientSecret: '', token: 'https://accounts.spotify.com/api/token', auth: 'https://accounts.spotify.com/authorize', scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public' },
  youtube: { clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '', token: 'https://oauth2.googleapis.com/token', auth: 'https://accounts.google.com/o/oauth2/v2/auth', scope: 'https://www.googleapis.com/auth/youtube.force-ssl' },
};
export const configured = (p: Provider) => Boolean(settings[p].clientId && (p === 'spotify' || settings[p].clientSecret));

// Provider payloads are validated/normalized at the adapter boundary, not passed to the browser.
type Payload = Record<string, any>;
export async function readResponse(response: Response): Promise<Payload> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new ServiceError('YouTube daily quota reached. Progress is saved. Resume after the quota resets at midnight Pacific time.', 429);
    if (response.status === 429) throw new ServiceError(`Rate limit reached. Progress is saved. Retry after ${response.headers.get('retry-after') || 'a few'} seconds.`, 429);
    if (response.status === 401 || body.error === 'invalid_grant') throw new ServiceError('Account authorization expired. Reconnect the account, then resume your transfer.', 401);
    throw new ServiceError(typeof body.error?.message === 'string' ? body.error.message : (typeof body.error_description === 'string' ? body.error_description : `The music service returned HTTP ${response.status}.`), response.status);
  }
  return body;
}
export class Providers {
  refreshing = new Map<Provider, Promise<string>>();
  constructor(public store: Store) {}
  async token(provider: Provider): Promise<string> {
    const credentials = this.store.credentials(provider);
    if (!credentials) throw new ServiceError(`Connect ${provider === 'spotify' ? 'Spotify' : 'YouTube'} first.`, 401);
    if (credentials.expiresAt > Date.now() + 60_000) return credentials.access_token;
    if (!credentials.refresh_token) throw new ServiceError('Reconnect this account to refresh authorization.', 401);
    const pending = this.refreshing.get(provider);
    if (pending) return pending;
    const promise = (async () => {
      const config = settings[provider];
      const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refresh_token!, client_id: config.clientId });
      if (config.clientSecret) form.set('client_secret', config.clientSecret);
      const tokens = await readResponse(await fetch(config.token, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) }));
      this.store.saveCredentials(provider, { ...credentials, access_token: tokens.access_token, refresh_token: tokens.refresh_token || credentials.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
      return tokens.access_token as string;
    })().finally(() => this.refreshing.delete(provider));
    this.refreshing.set(provider, promise);
    return promise;
  }
  async api(provider: Provider, path: string, init: RequestInit = {}): Promise<Payload> {
    const token = await this.token(provider);
    const base = provider === 'spotify' ? 'https://api.spotify.com/v1/' : 'https://www.googleapis.com/youtube/v3/';
    return readResponse(await fetch(new URL(path, base), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) }));
  }
  async pages(provider: Provider, path: string): Promise<Payload[]> {
    const results: Payload[] = [];
    let next: string | undefined = path;
    while (next) {
      const body = await this.api(provider, next);
      results.push(...body.items || []);
      if (provider === 'spotify') next = body.next || undefined;
      else {
        const url = new URL(path, 'https://www.googleapis.com/youtube/v3/');
        if (body.nextPageToken) url.searchParams.set('pageToken', body.nextPageToken);
        next = body.nextPageToken ? url.href : undefined;
      }
    }
    return results;
  }
  async playlists(provider: Provider): Promise<Playlist[]> {
    const me = this.store.credentials(provider)?.account.id;
    const items = await this.pages(provider, provider === 'spotify' ? 'me/playlists?limit=50' : 'playlists?part=snippet,contentDetails&mine=true&maxResults=50');
    return items.filter(Boolean).map(p => provider === 'spotify' ? {
      id: p.id, name: p.name, description: p.description || '', count: p.items?.total ?? p.tracks?.total ?? 0, image: p.images?.[0]?.url,
      url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`, transferable: p.owner?.id === me || p.collaborative === true,
    } : { id: p.id, name: p.snippet.title, description: p.snippet.description || '', count: p.contentDetails.itemCount, image: p.snippet.thumbnails?.medium?.url, url: `https://www.youtube.com/playlist?list=${p.id}`, transferable: true });
  }
  spotifyTrack(t: Payload): Track {
    return { id: t.id, title: t.name, artist: (t.artists || []).map((a: Payload) => a.name).join(', '), duration: t.duration_ms, url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}` };
  }
  async tracks(provider: Provider, playlistId: string): Promise<Track[]> {
    const items = await this.pages(provider, provider === 'spotify' ? `playlists/${encodeURIComponent(playlistId)}/items?limit=50` : `playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`);
    return items.map((item, index) => {
      if (provider === 'spotify') {
        const t = item.item ?? item.track;
        if (!t?.id || t.is_local || t.type !== 'track') return { id: `unavailable-${index}`, title: t?.name || 'Unavailable track', artist: '', url: '', unavailable: true };
        return this.spotifyTrack(t);
      }
      const id = item.contentDetails?.videoId;
      const title = item.snippet.title;
      const unavailable = !id || ['Private video', 'Deleted video'].includes(title);
      return { id: id || `unavailable-${index}`, ...splitVideoTitle(title, item.snippet.videoOwnerChannelTitle || ''), url: id ? `https://www.youtube.com/watch?v=${id}` : '', unavailable };
    });
  }
  async search(destination: Provider, source: Track, customQuery?: string): Promise<Candidate[]> {
    const query = customQuery || `${source.artist} ${source.title}${destination === 'youtube' ? ' official music video' : ''}`;
    const key = `search:${destination}:${query.toLowerCase()}`;
    const cached = this.store.get<{ at: number; tracks: Track[] }>(key);
    let tracks: Track[];
    if (cached && Date.now() - cached.at < 7 * 86400_000) tracks = cached.tracks;
    else {
      if (destination === 'spotify') {
        const data = await this.api(destination, `search?type=track&limit=5&q=${encodeURIComponent(query)}`);
        tracks = (data.tracks?.items || []).map((t: Payload) => this.spotifyTrack(t));
      } else {
        const data = await this.api(destination, `search?part=snippet&type=video&videoCategoryId=10&maxResults=5&q=${encodeURIComponent(query)}`);
        tracks = (data.items || []).map((t: Payload) => ({ id: t.id.videoId, title: t.snippet.title, artist: t.snippet.channelTitle, url: `https://www.youtube.com/watch?v=${t.id.videoId}` }));
      }
      this.store.set(key, { at: Date.now(), tracks });
    }
    return rank(source, tracks, destination);
  }
  async createPlaylist(provider: Provider, name: string, marker: string): Promise<{ id: string; url: string }> {
    // Find a previous successful creation if its response or local checkpoint was lost.
    const existing = (await this.playlists(provider)).filter(p => p.description.includes(marker));
    if (existing.length > 1) throw new ServiceError('Multiple destination playlists have this transfer marker. Resolve the duplicates before resuming.');
    if (existing[0]) return existing[0];
    const description = `Transferred with Playlist Bridge. ${marker}`;
    const data = provider === 'spotify'
      ? await this.api(provider, 'me/playlists', { method: 'POST', body: JSON.stringify({ name, description, public: false }) })
      : await this.api(provider, 'playlists?part=snippet,status', { method: 'POST', body: JSON.stringify({ snippet: { title: name, description }, status: { privacyStatus: 'private' } }) });
    return { id: data.id, url: provider === 'spotify' ? `https://open.spotify.com/playlist/${data.id}` : `https://www.youtube.com/playlist?list=${data.id}` };
  }
  async insert(provider: Provider, playlist: string, track: string) {
    if (provider === 'spotify') await this.api(provider, `playlists/${encodeURIComponent(playlist)}/items`, { method: 'POST', body: JSON.stringify({ uris: [`spotify:track:${track}`] }) });
    else await this.api(provider, 'playlistItems?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { playlistId: playlist, resourceId: { kind: 'youtube#video', videoId: track } } }) });
  }
}
