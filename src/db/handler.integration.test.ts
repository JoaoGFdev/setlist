import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { JobItem, JobSummary } from '../../shared/types';
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
