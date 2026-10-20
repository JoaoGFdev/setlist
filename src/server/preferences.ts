import type { HiddenPlaylist, Preferences, Provider } from '../../shared/types';
import type { Store } from './store';
import { ServiceError } from './providers';

const LEASE = 'workspace';
const LEASE_TTL = 60_000;
// Stored without expiresAt: preferences are not workspace data and survive retention purges and disconnects.
const PREFERENCES_KEY = 'preferences';
export const MAX_HIDDEN_PLAYLISTS = 1000;

const newestFirst = (a: HiddenPlaylist, b: HiddenPlaylist) => b.hiddenAt.localeCompare(a.hiddenAt);

export async function getPreferences(store: Store): Promise<Preferences> {
  const saved = await store.get<Partial<Preferences>>(PREFERENCES_KEY);
  const hidden = Array.isArray(saved?.hiddenPlaylists) ? saved.hiddenPlaylists : [];
  return { hiddenPlaylists: [...hidden].sort(newestFirst) };
}

export interface HiddenPlaylistInput { playlistId: string; name: string; image?: string; hidden: boolean }

export async function setPlaylistHidden(store: Store, provider: Provider, input: HiddenPlaylistInput): Promise<Preferences> {
  const token = await store.acquireLease(LEASE, LEASE_TTL);
  if (!token) throw new ServiceError('Another operation is active. Wait a moment, then retry.', 409);
  try {
    const { hiddenPlaylists } = await getPreferences(store);
    const existing = hiddenPlaylists.find((entry) => entry.provider === provider && entry.id === input.playlistId);
    if (!input.hidden && !existing) return { hiddenPlaylists };
    let next: HiddenPlaylist[];
    if (!input.hidden) next = hiddenPlaylists.filter((entry) => entry !== existing);
    else if (existing) {
      // Hiding again keeps the original hiddenAt but refreshes the display details.
      next = hiddenPlaylists.map((entry) => entry === existing ? { ...existing, name: input.name, image: input.image } : entry);
    } else {
      if (hiddenPlaylists.length >= MAX_HIDDEN_PLAYLISTS) throw new ServiceError(`You can hide up to ${MAX_HIDDEN_PLAYLISTS} playlists. Unhide some before hiding more.`, 409);
      next = [...hiddenPlaylists, { provider, id: input.playlistId, name: input.name, image: input.image, hiddenAt: new Date().toISOString() }];
    }
    const result: Preferences = { hiddenPlaylists: [...next].sort(newestFirst) };
    await store.assertLease(LEASE, token);
    await store.set(PREFERENCES_KEY, result);
    return result;
  } finally { await store.releaseLease(LEASE, token); }
}
