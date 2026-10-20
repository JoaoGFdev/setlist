import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { JobItem, JobSummary, Preferences } from '../../shared/types';
import type { AppEnv } from '../server/env';
import { dispatchApi, dispatchOAuth } from '../server/handler';
import { Store } from '../server/store';

type TestMigration = { name: string; queries: string[] };
const testEnv = env as typeof env & { DB: D1Database; TEST_MIGRATIONS: TestMigration[] };
const encryptionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(11)));
const appEnv: AppEnv = {
  DB: testEnv.DB,
  APP_URL: 'http://127.0.0.1:5173',
  TOKEN_ENCRYPTION_KEY: encryptionKey,
  SPOTIFY_CLIENT_ID: 'spotify-client-test',
  GOOGLE_CLIENT_ID: 'google-client-test',
  GOOGLE_CLIENT_SECRET: 'google-secret-test',
};

async function migrate() {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
}

function store(userId: string) {
  return new Store(testEnv.DB, userId, encryptionKey);
}

function request(path: string, options: { method?: string; origin?: string; cookie?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.origin !== undefined) headers.set('Origin', options.origin);
  if (options.cookie !== undefined) headers.set('Cookie', options.cookie);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`http://127.0.0.1:5173${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function job(id: string): JobSummary {
  const now = new Date().toISOString();
  return {
    id,
    source: 'spotify',
    destination: 'youtube',
    sourceAccount: 'spotify-account-a',
    destinationAccount: 'youtube-account-a',
    sourcePlaylistId: 'source-playlist',
    name: 'Private job A',
    phase: 'review',
    state: 'idle',
    sourcePosition: 1,
    sourceDone: true,
    matchPosition: 1,
    discoveryMatches: 0,
    createAttempted: false,
    reconcilePosition: 0,
    reconcileChecked: 0,
    inserted: 0,
    totalCount: 1,
    matchedCount: 1,
    selectedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe('HTTP dispatch security and tenant contract', () => {
  beforeAll(migrate);

  it('disconnect clears transfer data and keeps each library disabled until explicitly reconnected', async () => {
    const userId = 'clerk-disconnect-user';
    const workspace = store(userId);
    await workspace.set('connection-disabled:youtube', { disabled: true });
    await workspace.set('job:disconnected-transfer', job('disconnected-transfer'));
    await workspace.saveCredentials('spotify', { access_token: 'test-token', expiresAt: Date.now() + 60_000, account: { id: 'spotify-account', name: 'Listener' } });
    const disconnected = await dispatchApi(request('/api/accounts/spotify/disconnect', { method: 'POST', origin: appEnv.APP_URL }), appEnv, userId);
    expect(disconnected.status).toBe(200);
    expect(await workspace.get('job:disconnected-transfer')).toBeUndefined();
    expect(await workspace.credentials('spotify')).toBeUndefined();
    expect(await workspace.get('connection-disabled:spotify')).toEqual({ disabled: true });
    expect(await workspace.get('connection-disabled:youtube')).toEqual({ disabled: true });
    const connected = await dispatchApi(request('/api/accounts/spotify/connect', { method: 'POST', origin: appEnv.APP_URL }), appEnv, userId);
    expect(connected.status).toBe(200);
    expect(await workspace.get('connection-disabled:spotify')).toBeUndefined();
    expect(await workspace.get('connection-disabled:youtube')).toEqual({ disabled: true });
  });

  it('keeps hidden-playlist preferences through disconnect while deleting transfer history', async () => {
    const userId = `disconnect-prefs-${crypto.randomUUID()}`;
    const workspace = store(userId);
    const hidden = await dispatchApi(request('/api/playlists/spotify/hidden', { method: 'POST', origin: appEnv.APP_URL, body: { playlistId: 'p1', name: 'Keep hidden', hidden: true } }), appEnv, userId);
    expect(hidden.status).toBe(200);
    await workspace.set('job:old', job('old'));
    await workspace.set('expected:old', { ids: ['a'] });
    const disconnected = await dispatchApi(request('/api/accounts/spotify/disconnect', { method: 'POST', origin: appEnv.APP_URL }), appEnv, userId);
    expect(disconnected.status).toBe(200);
    expect(await workspace.get('job:old')).toBeUndefined();
    expect(await workspace.get('expected:old')).toBeUndefined();
    const prefs = await (await dispatchApi(request('/api/preferences'), appEnv, userId)).json() as Preferences;
    expect(prefs.hiddenPlaylists.map((entry) => entry.id)).toEqual(['p1']);
  });

  it('hides and unhides playlists idempotently, newest first, scoped to the user', async () => {
    const userId = `prefs-user-${crypto.randomUUID()}`;
    const hide = async (provider: string, body: unknown, user = userId) =>
      dispatchApi(request(`/api/playlists/${provider}/hidden`, { method: 'POST', origin: appEnv.APP_URL, body }), appEnv, user);
    const empty = await dispatchApi(request('/api/preferences'), appEnv, userId);
    expect(await empty.json()).toEqual({ hiddenPlaylists: [] });

    const first = await hide('spotify', { playlistId: 'p1', name: '  Old name  ', image: 'https://img.example/1.jpg', hidden: true });
    expect(first.status).toBe(200);
    const firstPrefs = await first.json() as Preferences;
    expect(firstPrefs.hiddenPlaylists).toMatchObject([{ provider: 'spotify', id: 'p1', name: 'Old name', image: 'https://img.example/1.jpg' }]);
    const originalHiddenAt = firstPrefs.hiddenPlaylists[0].hiddenAt;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const again = await (await hide('spotify', { playlistId: 'p1', name: 'New name', hidden: true })).json() as Preferences;
    expect(again.hiddenPlaylists).toHaveLength(1);
    expect(again.hiddenPlaylists[0]).toMatchObject({ name: 'New name', hiddenAt: originalHiddenAt });
    expect(again.hiddenPlaylists[0].image).toBeUndefined();

    const second = await (await hide('youtube', { playlistId: 'p1', name: 'Same id other provider', hidden: true })).json() as Preferences;
    expect(second.hiddenPlaylists.map((entry) => entry.provider)).toEqual(['youtube', 'spotify']);

    const other = await dispatchApi(request('/api/preferences'), appEnv, `${userId}-other`);
    expect(await other.json()).toEqual({ hiddenPlaylists: [] });

    const unhidden = await (await hide('spotify', { playlistId: 'p1', name: 'x', hidden: false })).json() as Preferences;
    expect(unhidden.hiddenPlaylists.map((entry) => entry.provider)).toEqual(['youtube']);
    const noop = await (await hide('spotify', { playlistId: 'never-hidden', name: 'x', hidden: false })).json() as Preferences;
    expect(noop.hiddenPlaylists).toHaveLength(1);
    const persisted = await dispatchApi(request('/api/preferences'), appEnv, userId);
    expect(await persisted.json()).toEqual(noop);
    expect(await store(userId).get<{ expiresAt?: number }>('preferences')).not.toHaveProperty('expiresAt');
  });

  it('validates hidden-playlist input and the entry cap', async () => {
    const userId = `prefs-invalid-${crypto.randomUUID()}`;
    const hide = async (provider: string, body: unknown) =>
      dispatchApi(request(`/api/playlists/${provider}/hidden`, { method: 'POST', origin: appEnv.APP_URL, body }), appEnv, userId);
    const valid = { playlistId: 'p1', name: 'Name', hidden: true };
    expect((await hide('deezer', valid)).status).toBe(400);
    expect((await hide('spotify', { ...valid, playlistId: '' })).status).toBe(400);
    expect((await hide('spotify', { ...valid, playlistId: 'x'.repeat(201) })).status).toBe(400);
    expect((await hide('spotify', { ...valid, name: '   ' })).status).toBe(400);
    expect((await hide('spotify', { ...valid, name: 'x'.repeat(301) })).status).toBe(400);
    expect((await hide('spotify', { ...valid, hidden: 'yes' })).status).toBe(400);
    expect((await hide('spotify', { ...valid, image: 'http://img.example/a.jpg' })).status).toBe(400);
    expect((await hide('spotify', { ...valid, image: 'javascript:alert(1)' })).status).toBe(400);
    expect((await hide('spotify', { ...valid, image: 'not a url' })).status).toBe(400);
    expect((await hide('spotify', { ...valid, image: `https://img.example/${'a'.repeat(2000)}` })).status).toBe(400);
    expect((await dispatchApi(request('/api/playlists/spotify/hidden', { method: 'POST', body: valid }), appEnv, userId)).status).toBe(403);
    expect(await (await dispatchApi(request('/api/preferences'), appEnv, userId)).json()).toEqual({ hiddenPlaylists: [] });

    await store(userId).set('preferences', { hiddenPlaylists: Array.from({ length: 1000 }, (_, index) => ({ provider: 'spotify', id: `p${index}`, name: 'n', hiddenAt: new Date(index).toISOString() })) });
    const capped = await hide('spotify', { playlistId: 'extra', name: 'Extra', hidden: true });
    expect(capped.status).toBe(409);
    expect(await capped.json()).toMatchObject({ error: expect.stringContaining('1000') });
    expect((await hide('spotify', { playlistId: 'p5', name: 'Renamed', hidden: true })).status).toBe(200);
    expect((await hide('spotify', { playlistId: 'p5', name: 'Renamed', hidden: false })).status).toBe(200);
  });

  it('deletes one job with its items and approved list, 404s unknown ids, and is tenant scoped', async () => {
    const userId = `delete-job-${crypto.randomUUID()}`;
    const mine = store(userId);
    const stranger = store(`${userId}-stranger`);
    const item: JobItem = { source: { id: 't', title: 'T', artist: 'A', url: 'https://x.example/t' }, candidates: [], selected: null, searched: true };
    for (const id of ['keep', 'drop']) {
      await mine.set(`job:${id}`, job(id));
      await mine.set(`item:${id}:00000000`, item);
      await mine.set(`item:${id}:00000001`, item);
      await mine.set(`expected:${id}`, { ids: ['t'] });
    }
    await stranger.set('job:drop', job('drop'));
    const post = (path: string, user = userId) => dispatchApi(request(path, { method: 'POST', origin: appEnv.APP_URL, body: {} }), appEnv, user);

    const deleted = await post('/api/jobs/drop/delete');
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });
    expect(await mine.get('job:drop')).toBeUndefined();
    expect(await mine.list('item:drop:')).toEqual([]);
    expect(await mine.get('expected:drop')).toBeUndefined();
    expect(await mine.get('job:keep')).toBeDefined();
    expect(await mine.list('item:keep:')).toHaveLength(2);
    expect(await mine.get('expected:keep')).toBeDefined();
    expect(await stranger.get('job:drop')).toBeDefined();

    expect((await post('/api/jobs/drop/delete')).status).toBe(404);
    expect((await post('/api/jobs/never-existed/delete')).status).toBe(404);
    expect((await dispatchApi(request('/api/jobs/keep/delete', { method: 'POST', body: {} }), appEnv, userId)).status).toBe(403);

    const lease = await mine.acquireLease('workspace', 5_000);
    const busy = await post('/api/jobs/keep/delete');
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ error: expect.stringContaining('Another operation is active') });
    await mine.releaseLease('workspace', lease!);
    expect(await mine.get('job:keep')).toBeDefined();
  });

  it('clears all transfer history but keeps preferences, credentials and disabled-connection markers', async () => {
    const userId = `clear-jobs-${crypto.randomUUID()}`;
    const mine = store(userId);
    const stranger = store(`${userId}-stranger`);
    await mine.saveCredentials('spotify', { access_token: 't', expiresAt: Date.now() + 60_000, account: { id: 'a', name: 'A' } });
    await mine.set('connection-disabled:youtube', { disabled: true });
    await mine.set('preferences', { hiddenPlaylists: [{ provider: 'spotify', id: 'p1', name: 'Hidden', hiddenAt: new Date().toISOString() }] });
    for (const id of ['one', 'two']) {
      await mine.set(`job:${id}`, job(id));
      await mine.set(`item:${id}:00000000`, { searched: true });
      await mine.set(`expected:${id}`, { ids: ['t'] });
    }
    await stranger.set('job:one', job('one'));

    const cleared = await dispatchApi(request('/api/jobs/clear', { method: 'POST', origin: appEnv.APP_URL, body: {} }), appEnv, userId);
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ ok: true });
    expect(await (await dispatchApi(request('/api/jobs'), appEnv, userId)).json()).toEqual([]);
    expect(await mine.list('item:')).toEqual([]);
    expect(await mine.list('expected:')).toEqual([]);
    expect(await mine.credentials('spotify')).toBeDefined();
    expect(await mine.get('connection-disabled:youtube')).toEqual({ disabled: true });
    expect((await (await dispatchApi(request('/api/preferences'), appEnv, userId)).json() as Preferences).hiddenPlaylists).toHaveLength(1);
    expect(await stranger.get('job:one')).toBeDefined();
  });

  it('returns only the authenticated user’s accounts and jobs, including for a guessed job ID', async () => {
    const userA = `http-user-a-${crypto.randomUUID()}`;
    const userB = `http-user-b-${crypto.randomUUID()}`;
    const alice = store(userA);
    const bob = store(userB);
    await alice.saveCredentials('spotify', {
      access_token: 'spotify-a', expiresAt: Date.now() + 60_000,
      account: { id: 'spotify-account-a', name: 'Alice Spotify' },
    });
    await alice.saveCredentials('youtube', {
      access_token: 'youtube-a', expiresAt: Date.now() + 60_000,
      account: { id: 'youtube-account-a', name: 'Alice YouTube' },
    });
    await bob.saveCredentials('youtube', {
      access_token: 'youtube-b', expiresAt: Date.now() + 60_000,
      account: { id: 'youtube-account-b', name: 'Bob YouTube' },
    });

    const jobId = crypto.randomUUID();
    await alice.set(`job:${jobId}`, job(jobId));
    const item: JobItem = {
      source: { id: 'source-track', title: 'Private track', artist: 'Alice', url: 'https://open.spotify.com/track/source-track' },
      candidates: [], selected: null, searched: true,
    };
    await alice.set('item:'.concat(jobId, ':00000000'), item);

    const statusA = await dispatchApi(request('/api/status'), appEnv, userA);
    expect(statusA.status).toBe(200);
    expect((await statusA.json() as { accounts: Record<string, { id: string } | null> }).accounts).toEqual({
      spotify: { id: 'spotify-account-a', name: 'Alice Spotify' },
      youtube: { id: 'youtube-account-a', name: 'Alice YouTube' },
    });
    const statusB = await dispatchApi(request('/api/status'), appEnv, userB);
    expect((await statusB.json() as { accounts: Record<string, { id: string } | null> }).accounts).toEqual({
      spotify: null,
      youtube: { id: 'youtube-account-b', name: 'Bob YouTube' },
    });

    const ownJob = await dispatchApi(request(`/api/jobs/${jobId}`), appEnv, userA);
    expect(ownJob.status).toBe(200);
    const ownData = await ownJob.json() as { name: string; items: JobItem[] };
    expect(ownData.name).toBe('Private job A');
    expect(ownData.items).toHaveLength(1);
    expect(ownData.items[0].source.title).toBe('Private track');

    const guessedJob = await dispatchApi(request(`/api/jobs/${jobId}`), appEnv, userB);
    expect(guessedJob.status).toBe(404);
    expect(await guessedJob.json()).toMatchObject({ error: 'Transfer not found.' });
    const jobsB = await dispatchApi(request('/api/jobs'), appEnv, userB);
    expect(await jobsB.json()).toEqual([]);
  });

  it('fails missing identity and missing or mismatched origins before touching D1 or encryption config', async () => {
    const invalidEnv = { ...appEnv, DB: {} as D1Database, TOKEN_ENCRYPTION_KEY: 'not-base64' };
    const body = { source: 'spotify', playlistId: 'not-reached', name: 'Not reached' };

    const noIdentity = await dispatchApi(request('/api/jobs', { method: 'POST', body }), invalidEnv, '');
    expect(noIdentity.status).toBe(401);
    expect(await noIdentity.json()).toMatchObject({ error: 'Authentication is required.' });

    const noOrigin = await dispatchApi(request('/api/jobs', { method: 'POST', body }), invalidEnv, 'authed-user');
    expect(noOrigin.status).toBe(403);
    const crossOrigin = await dispatchApi(request('/api/jobs', { method: 'POST', body, origin: 'https://attacker.example' }), invalidEnv, 'authed-user');
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.json()).toMatchObject({ error: 'A same-origin request is required.' });

    const unauthenticatedOAuth = await dispatchOAuth(request('/auth/spotify'), invalidEnv, '');
    expect(unauthenticatedOAuth.status).toBe(401);
  });

  it('binds OAuth state to its user and browser cookie, then consumes it on provider denial', async () => {
    const userA = `oauth-user-a-${crypto.randomUUID()}`;
    const userB = `oauth-user-b-${crypto.randomUUID()}`;
    const fetchMock = vi.fn(async () => { throw new Error('Provider fetch must not occur in this test'); });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const start = await dispatchOAuth(request('/auth/spotify'), appEnv, userA);
      expect(start.status).toBe(302);
      const authUrl = new URL(start.headers.get('Location')!);
      const state = authUrl.searchParams.get('state')!;
      const setCookie = start.headers.get('Set-Cookie')!;
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/auth/spotify/callback');
      const cookie = setCookie.split(';', 1)[0];
      const pendingKey = `oauth:${state}`;
      const pending = await store(userA).get<{ userId: string; provider: string; browser: string }>(pendingKey);
      expect(pending).toMatchObject({ userId: userA, provider: 'spotify' });
      expect(cookie).toBe(`bridge_oauth_spotify=${pending!.browser}`);

      const denialUrl = `/auth/spotify/callback?state=${encodeURIComponent(state)}&error=access_denied`;
      const wrongUser = await dispatchOAuth(request(denialUrl, { cookie }), appEnv, userB);
      expect(wrongUser.status).toBe(302);
      expect(await store(userA).get(pendingKey)).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();

      const wrongCookie = await dispatchOAuth(request(denialUrl, { cookie: 'bridge_oauth_spotify=wrong-cookie' }), appEnv, userA);
      expect(wrongCookie.status).toBe(302);
      expect(await store(userA).get(pendingKey)).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();

      const providerDenied = await dispatchOAuth(request(denialUrl, { cookie }), appEnv, userA);
      expect(providerDenied.status).toBe(302);
      expect(await store(userA).get(pendingKey)).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();

      const replay = await dispatchOAuth(request(denialUrl, { cookie }), appEnv, userA);
      expect(replay.status).toBe(302);
      expect(replay.headers.get('Location')).toContain('Connection%20attempt%20expired');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
