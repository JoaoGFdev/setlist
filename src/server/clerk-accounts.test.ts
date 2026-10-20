import assert from 'node:assert/strict';
import test from 'node:test';
import { providerScopes } from '../../shared/provider-scopes';
import { clerkProviderToken } from './clerk-accounts';
import { Providers } from './providers';
import type { Store } from './store';
import type { AppEnv } from './app-env';

test('a linked Clerk account with playlist scopes loads the Spotify library without separate credentials', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith('https://api.clerk.com/')) {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-clerk-secret');
      return Response.json([{ token: 'test-provider-token', scopes: [...providerScopes.spotify] }]);
    }
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-provider-token');
    if (url.endsWith('/me')) return Response.json({ id: 'spotify-owner', display_name: 'Listener' });
    return Response.json({ items: [{ id: 'playlist', name: 'Favorites', owner: { id: 'spotify-owner' }, tracks: { total: 2 } }] });
  });
  const store = { userId: 'user_test', credentials: async () => undefined, get: async () => undefined } as unknown as Store;
  const providers = new Providers(store, { CLERK_SECRET_KEY: 'test-clerk-secret' } as AppEnv);
  assert.deepEqual((await providers.credentials('spotify'))?.account, { id: 'spotify-owner', name: 'Listener' });
  const result = await providers.playlists('spotify');
  assert.equal(result.items[0].name, 'Favorites');
  assert.equal(result.items[0].transferable, true);
  assert.equal(requests.filter(url => url.startsWith('https://api.clerk.com/')).length, 1);
});

test('sign-in scopes alone do not authorize playlist access', async () => {
  const request = (async () => Response.json([{ token: 'test-token', scopes: ['openid', 'email', 'profile'] }])) as typeof fetch;
  assert.equal(await clerkProviderToken('user_test', 'youtube', 'test-secret', request), undefined);
});

test('Google playlist access uses the Google connection and accepts the broader YouTube scope', async () => {
  const request = (async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://api.clerk.com/v1/users/user_test/oauth_access_tokens/oauth_google');
    return Response.json([{ token: 'test-token', scopes: ['https://www.googleapis.com/auth/youtube'] }]);
  }) as typeof fetch;
  assert.equal(await clerkProviderToken('user_test', 'youtube', 'test-secret', request), 'test-token');
});

test('disconnecting a music library prevents Clerk from automatically reconnecting it', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not request a token after disconnect'); });
  const store = { userId: 'user_test', credentials: async () => undefined, get: async () => ({ disabled: true }) } as unknown as Store;
  const providers = new Providers(store, { CLERK_SECRET_KEY: 'test-secret' } as AppEnv);
  assert.equal(await providers.credentials('spotify'), undefined);
  assert.equal(request.mock.callCount(), 0);
});

test('missing Clerk connection is handled without treating it as a service failure', async () => {
  const request = (async () => new Response(null, { status: 404 })) as typeof fetch;
  assert.equal(await clerkProviderToken('user_test', 'spotify', 'test-secret', request), undefined);
});

test('accepts paginated Clerk token responses', async () => {
  const request = (async () => Response.json({ data: [{ token: 'test-token', scopes: [...providerScopes.spotify] }], total_count: 1 })) as typeof fetch;
  assert.equal(await clerkProviderToken('user_test', 'spotify', 'test-secret', request), 'test-token');
});
