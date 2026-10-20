import type { Candidate, Page, Playlist, Provider, Track } from '../../shared/types';
import type { Credentials, Store } from './store';
import type { AppEnv } from './env';
import { rank, splitVideoTitle } from './matching';

type Json = Record<string, unknown>;
const timeout = 8_000;
const SPOTIFY = 'https://api.spotify.com/v1/';
const YOUTUBE = 'https://www.googleapis.com/youtube/v3/';
const configs = {
  spotify: { auth: 'https://accounts.spotify.com/authorize', token: 'https://accounts.spotify.com/api/token', scope: 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public' },
  youtube: { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/youtube.force-ssl' },
} as const;

export class ServiceError extends Error {
  constructor(message: string, public status = 400, public reason?: string) { super(message); this.name = 'ServiceError'; }
}
function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a[index] || 0) ^ (b[index] || 0);
  return diff === 0;
}
export function validOAuthBinding(
  pending: { provider: Provider; browser: string; userId: string; expiresAt: number } | undefined,
  provider: Provider,
  browser: string | undefined,
  userId: string,
  now = Date.now(),
): boolean {
  return Boolean(pending && pending.provider === provider && pending.userId === userId && pending.expiresAt > now
    && browser && constantTimeEqual(browser, pending.browser));
}
const record = (value: unknown): Json => value && typeof value === 'object' ? value as Json : {};
const str = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const num = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function providerConfig(provider: Provider, env: AppEnv) {
  return provider === 'spotify'
    ? { ...configs.spotify, clientId: env.SPOTIFY_CLIENT_ID || '', clientSecret: '' }
    : { ...configs.youtube, clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' };
}
export function providerConfigured(provider: Provider, env: AppEnv) {
  const config = providerConfig(provider, env);
  return Boolean(config.clientId && (provider === 'spotify' || config.clientSecret));
}
export const callbackUrl = (provider: Provider, env: AppEnv) => new URL(`/auth/${provider}/callback`, env.APP_URL).href;

async function readResponse(response: Response): Promise<Json> {
  const body = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    const error = record(body.error);
    const first = Array.isArray(error.errors) ? record(error.errors[0]) : {};
    const reason = str(first.reason);
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new ServiceError('YouTube daily quota reached. Progress is saved. Resume after the quota resets at midnight Pacific time.', 429);
    if (response.status === 429) throw new ServiceError(`Rate limit reached. Progress is saved. Retry after ${response.headers.get('retry-after') || 'a few'} seconds.`, 429);
    if (response.status === 401 || body.error === 'invalid_grant') throw new ServiceError('Account authorization expired. Reconnect the account, then resume your transfer.', 401);
    throw new ServiceError(typeof error.message === 'string' ? error.message : `The music service returned HTTP ${response.status}.`, response.status, reason);
  }
  return body;
}

export class Providers {
  constructor(readonly store: Store, readonly env: AppEnv) {}
  async token(provider: Provider): Promise<string> {
    const credentials = await this.store.credentials(provider);
    if (!credentials) throw new ServiceError(`Connect ${provider === 'spotify' ? 'Spotify' : 'YouTube'} first.`, 401);
    if (credentials.expiresAt > Date.now() + 60_000) return credentials.access_token;
    if (!credentials.refresh_token) throw new ServiceError('Reconnect this account to refresh authorization.', 401);
    const config = providerConfig(provider, this.env);
    const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refresh_token, client_id: config.clientId });
    if (config.clientSecret) form.set('client_secret', config.clientSecret);
    const tokens = await readResponse(await fetch(config.token, { method: 'POST', body: form, signal: AbortSignal.timeout(timeout) }));
    const access = str(tokens.access_token);
    if (!access) throw new ServiceError('The music service did not return an access token.', 502);
    await this.store.saveCredentials(provider, {
      ...credentials,
      access_token: access,
      refresh_token: str(tokens.refresh_token, credentials.refresh_token),
      expiresAt: Date.now() + num(tokens.expires_in, 3600) * 1000,
    });
    return access;
  }
  async api(provider: Provider, path: string, init: RequestInit = {}): Promise<Json> {
    const base = provider === 'spotify' ? SPOTIFY : YOUTUBE;
    const url = /^https:\/\//i.test(path) ? new URL(path) : new URL(path, base);
    if (url.origin !== new URL(base).origin) throw new ServiceError('Invalid provider page cursor.');
    const token = await this.token(provider);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return readResponse(await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeout) }));
  }
  credentials(provider: Provider) { return this.store.credentials(provider); }
  playlistFrom(provider: Provider, value: Json): Playlist {
    if (provider === 'spotify') {
      const images = Array.isArray(value.images) ? value.images : [];
      const image = record(images[0]);
      const external = record(value.external_urls);
      const tracks = record(value.items || value.tracks);
      const owner = record(value.owner);
      return { id: str(value.id), name: str(value.name), description: str(value.description), count: num(tracks.total), image: str(image.url) || undefined,
        url: str(external.spotify, `https://open.spotify.com/playlist/${str(value.id)}`), transferable: Boolean(value._transferable) };
    }
    const snippet = record(value.snippet); const details = record(value.contentDetails);
    const thumbs = record(snippet.thumbnails); const thumb = record(thumbs.medium);
    const id = str(value.id);
    return { id, name: str(snippet.title), description: str(snippet.description), count: num(details.itemCount), image: str(thumb.url) || undefined,
      url: `https://www.youtube.com/playlist?list=${id}`, transferable: true };
  }
  async playlists(provider: Provider, cursor?: string): Promise<Page<Playlist>> {
    let path: string;
    if (provider === 'spotify') {
      path = cursor || 'me/playlists?limit=50';
      if (cursor && new URL(cursor).origin !== new URL(SPOTIFY).origin) throw new ServiceError('Invalid Spotify page cursor.');
    } else {
      const query = new URLSearchParams({ part: 'snippet,contentDetails', mine: 'true', maxResults: '50' });
      if (cursor) query.set('pageToken', cursor);
      path = `playlists?${query}`;
    }
    const body = await this.api(provider, path);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const ownId = (await this.credentials(provider))?.account.id;
    const items = rawItems.map((entry) => {
      const raw = record(entry);
      if (provider === 'spotify') {
        const owner = record(raw.owner);
        const tracks = record(raw.tracks);
        return this.playlistFrom(provider, { ...raw, tracks: { ...tracks, total: num(tracks.total, num(record(raw.items).total)) }, _transferable: str(owner.id) === ownId || raw.collaborative === true });
      }
      return this.playlistFrom(provider, raw);
    });
    const nextCursor = provider === 'spotify' ? str(body.next) || undefined : str(body.nextPageToken) || undefined;
    return { items, nextCursor };
  }
  async playlist(provider: Provider, id: string): Promise<Playlist> {
    const body = await this.api(provider, provider === 'spotify'
      ? `playlists/${encodeURIComponent(id)}?fields=id,name,description,images,external_urls,owner,collaborative,items.total`
      : `playlists?part=snippet,contentDetails&id=${encodeURIComponent(id)}`);
    const value = provider === 'spotify' ? body : record(Array.isArray(body.items) ? body.items[0] : undefined);
    if (!value || !str(record(value).id)) throw new ServiceError('This playlist is unavailable.', 404);
    if (provider === 'spotify') {
      const owner = record(record(value).owner);
      return this.playlistFrom(provider, { ...record(value), _transferable: str(owner.id) === (await this.credentials(provider))?.account.id || record(value).collaborative === true });
    }
    const channelId = str(record(record(value).snippet).channelId);
    const ownChannelId = (await this.credentials(provider))?.account.id;
    if (!ownChannelId || channelId !== ownChannelId) throw new ServiceError('Choose a playlist owned by the connected YouTube channel.', 403);
    return this.playlistFrom(provider, record(value));
  }
  spotifyTrack(input: Json): Track {
    const artists = Array.isArray(input.artists) ? input.artists : [];
    const external = record(input.external_urls);
    const id = str(input.id);
    return { id, title: str(input.name), artist: artists.map((artist) => str(record(artist).name)).filter(Boolean).join(', '), duration: num(input.duration_ms) || undefined,
      url: str(external.spotify, `https://open.spotify.com/track/${id}`) };
  }
  async sourcePage(provider: Provider, playlistId: string, cursor?: string): Promise<Page<Track>> {
    let path: string;
    if (provider === 'spotify') {
      path = cursor || `playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
      if (cursor && new URL(cursor).origin !== new URL(SPOTIFY).origin) throw new ServiceError('Invalid Spotify track cursor.');
    } else {
      const query = new URLSearchParams({ part: 'snippet,contentDetails', playlistId, maxResults: '50' });
      if (cursor) query.set('pageToken', cursor);
      path = `playlistItems?${query}`;
    }
    const body = await this.api(provider, path);
    const raw = Array.isArray(body.items) ? body.items : [];
    const tracks = raw.map((entry, index) => {
      const item = record(entry);
      if (provider === 'spotify') {
        const t = record(item.item || item.track);
        if (!str(t.id) || t.is_local || t.type !== 'track') return { id: `unavailable-${index}`, title: str(t.name, 'Unavailable track'), artist: '', url: '', unavailable: true };
        return this.spotifyTrack(t);
      }
      const content = record(item.contentDetails); const snippet = record(item.snippet);
      const id = str(content.videoId); const title = str(snippet.title, 'Unavailable video');
      const unavailable = !id || ['Private video', 'Deleted video'].includes(title);
      return { id: id || `unavailable-${index}`, ...splitVideoTitle(title, str(snippet.videoOwnerChannelTitle)), url: id ? `https://www.youtube.com/watch?v=${id}` : '', unavailable };
    });
    return { items: tracks, nextCursor: provider === 'spotify' ? str(body.next) || undefined : str(body.nextPageToken) || undefined };
  }
  async destinationPage(provider: Provider, playlistId: string, cursor?: string): Promise<Page<Track>> {
    let path: string;
    if (provider === 'spotify') {
      path = cursor || `playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
      if (cursor && new URL(cursor).origin !== new URL(SPOTIFY).origin) throw new ServiceError('Invalid Spotify track cursor.');
    } else {
      const query = new URLSearchParams({ part: 'snippet,contentDetails', playlistId, maxResults: '50' });
      if (cursor) query.set('pageToken', cursor);
      path = `playlistItems?${query}`;
    }
    let body: Json;
    for (let attempt = 0; ; attempt++) {
      try { body = await this.api(provider, path); break; }
      catch (error) {
        // A newly created YouTube playlist can briefly be unavailable to playlistItems.list.
        // Retry only this read; never replay a potentially successful provider write.
        if (provider !== 'youtube' || !(error instanceof ServiceError)
          || error.status !== 404 || error.reason !== 'playlistNotFound' || attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, [250, 750][attempt]));
      }
    }
    const raw = Array.isArray(body.items) ? body.items : [];
    const items = raw.map((entry) => {
      const item = record(entry);
      if (provider === 'spotify') return this.spotifyTrack(record(item.item || item.track));
      const content = record(item.contentDetails); const id = str(content.videoId);
      return { id, title: str(record(item.snippet).title), artist: '', url: id ? `https://www.youtube.com/watch?v=${id}` : '' };
    });
    return { items, nextCursor: provider === 'spotify' ? str(body.next) || undefined : str(body.nextPageToken) || undefined };
  }
  async search(destination: Provider, source: Track, customQuery?: string): Promise<Candidate[]> {
    const query = customQuery || `${source.artist} ${source.title}${destination === 'youtube' ? ' official music video' : ''}`;
    const cacheKey = `search:${destination}:${query.toLowerCase()}`;
    const cached = await this.store.get<{ at: number; expiresAt: number; tracks: Track[] }>(cacheKey);
    let tracks: Track[];
    if (cached && Date.now() - cached.at < 7 * 86_400_000) tracks = cached.tracks;
    else if (destination === 'spotify') {
      const data = await this.api(destination, `search?type=track&limit=5&q=${encodeURIComponent(query)}`);
      tracks = (Array.isArray(record(data.tracks).items) ? record(data.tracks).items as unknown[] : []).map((entry) => this.spotifyTrack(record(entry)));
      const at = Date.now();
      await this.store.set(cacheKey, { at, expiresAt: at + 7 * 86_400_000, tracks });
    } else {
      const data = await this.api(destination, `search?part=snippet&type=video&videoCategoryId=10&maxResults=5&q=${encodeURIComponent(query)}`);
      tracks = (Array.isArray(data.items) ? data.items : []).map((entry) => {
        const item = record(entry); const id = str(record(item.id).videoId); const snippet = record(item.snippet);
        return { id, title: str(snippet.title), artist: str(snippet.channelTitle), url: `https://www.youtube.com/watch?v=${id}` };
      });
      const at = Date.now();
      await this.store.set(cacheKey, { at, expiresAt: at + 7 * 86_400_000, tracks });
    }
    return rank(source, tracks, destination);
  }
  async createPlaylist(provider: Provider, name: string, marker: string): Promise<{ id: string; url: string }> {
    const description = `Transferred with Playlist Bridge. ${marker}`;
    const created = provider === 'spotify'
      ? await this.api(provider, 'me/playlists', { method: 'POST', body: JSON.stringify({ name, description, public: false }) })
      : await this.api(provider, 'playlists?part=snippet,status', { method: 'POST', body: JSON.stringify({ snippet: { title: name, description }, status: { privacyStatus: 'private' } }) });
    const id = str(created.id);
    if (!id) throw new ServiceError('The music service did not confirm playlist creation. Resume to check for it before creating again.', 502);
    return { id, url: provider === 'spotify' ? `https://open.spotify.com/playlist/${id}` : `https://www.youtube.com/playlist?list=${id}` };
  }
  async discoverMarkedPlaylist(provider: Provider, marker: string, cursor?: string): Promise<Page<{ id: string; url: string }>> {
    const path = provider === 'spotify'
      ? cursor || 'me/playlists?limit=50'
      : `playlists?part=snippet,status&mine=true&maxResults=50${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ''}`;
    if (provider === 'spotify' && cursor && new URL(cursor).origin !== new URL(SPOTIFY).origin) throw new ServiceError('Invalid Spotify page cursor.');
    const body = await this.api(provider, path);
    const entries = Array.isArray(body.items) ? body.items : [];
    const ownId = (await this.credentials(provider))?.account.id;
    const found = entries.map((value) => record(value))
      .filter((value) => provider !== 'spotify' || str(record(value.owner).id) === ownId)
      .map((value) => this.playlistFrom(provider, value))
      .filter((playlist) => playlist.description.includes(marker)).map((playlist) => ({ id: playlist.id, url: playlist.url }));
    return { items: found, nextCursor: provider === 'spotify' ? str(body.next) || undefined : str(body.nextPageToken) || undefined };
  }
  async insert(provider: Provider, playlistId: string, trackId: string): Promise<void> {
    if (provider === 'spotify') await this.api(provider, `playlists/${encodeURIComponent(playlistId)}/items`, { method: 'POST', body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }) });
    else await this.api(provider, 'playlistItems?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: trackId } } }) });
  }
}

export { readResponse };
