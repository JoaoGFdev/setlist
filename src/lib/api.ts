import type { HiddenPlaylist, Page, Playlist, Preferences, Provider } from '../../shared/types';

export const providerNames: Record<Provider, string> = { spotify: 'Spotify', youtube: 'YouTube' };
export const providers: Provider[] = ['spotify', 'youtube'];
export const otherProvider = (provider: Provider): Provider => provider === 'spotify' ? 'youtube' : 'spotify';

export type ApiError = Error & { status?: number };

/** GET when `body` is omitted, otherwise a same-origin JSON POST. Errors carry the server message and HTTP status. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'Could not complete the request. Try again.') as ApiError;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

let playlistPageQueue: Promise<void> = Promise.resolve();

/** Playlist pages share the server workspace lease, so requests are serialized and briefly retried on 409. */
export function playlistPage(path: string): Promise<Page<Playlist>> {
  const request = playlistPageQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await api<Page<Playlist>>(path); }
      catch (cause) {
        if ((cause as ApiError).status !== 409 || attempt >= 2) throw cause;
        await new Promise(resolve => setTimeout(resolve, [200, 500][attempt]));
      }
    }
  });
  playlistPageQueue = request.then(() => undefined, () => undefined);
  return request;
}

export const getPreferences = () => api<Preferences>('/preferences');

/** Hides or restores a playlist. Returns the updated preferences. */
export const setPlaylistHidden = (playlist: Pick<HiddenPlaylist, 'provider' | 'id' | 'name' | 'image'>, hidden: boolean) =>
  api<Preferences>(`/playlists/${playlist.provider}/hidden`, { playlistId: playlist.id, name: playlist.name, image: playlist.image, hidden });

/** Removes a saved transfer from history. Never touches the playlists on Spotify or YouTube. */
export const deleteJob = (id: string) => api<{ ok: true }>(`/jobs/${encodeURIComponent(id)}/delete`, {});

/** Removes every saved transfer. Preferences and connected accounts are kept. */
export const clearHistory = () => api<{ ok: true }>('/jobs/clear', {});
