import type { Account, JobSummary, Provider, Status } from '../../shared/types';
import type { AppEnv } from './env';
import { Store } from './store';
import { callbackUrl, providerConfig, providerConfigured, Providers, ServiceError, readResponse, validOAuthBinding } from './providers';
import { Transfers } from './transfers';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const providers = new Set<Provider>(['spotify', 'youtube']);
const isProvider = (value: string | undefined): value is Provider => value !== undefined && providers.has(value as Provider);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const errorMessage = (error: unknown) => error instanceof ServiceError ? error.message : 'An unexpected error occurred.';
const responseStatus = (error: unknown) => error instanceof ServiceError ? error.status
  : error && typeof error === 'object' && 'status' in error && Number.isInteger(error.status) && (error.status as number) >= 400 && (error.status as number) < 600
    ? error.status as number : 500;
const b64url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const randomToken = (bytes: number) => {
  const value = new Uint8Array(bytes); crypto.getRandomValues(value); return b64url(value);
};
const utf8 = (value: string) => new TextEncoder().encode(value);

function checkOrigin(request: Request, env: AppEnv) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(env.APP_URL).origin) throw new ServiceError('A same-origin request is required.', 403);
}
function makeStore(env: AppEnv, userId: string) {
  if (!userId) throw new ServiceError('Authentication is required.', 401);
  return new Store(env.DB, userId, env.TOKEN_ENCRYPTION_KEY);
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > 32_768) throw new ServiceError('Request body is too large.', 413);
  const raw = await request.text();
  if (raw.length > 32_768) throw new ServiceError('Request body is too large.', 413);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ServiceError('Submit valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceError('Submit a JSON object.');
  return value as Record<string, unknown>;
}
function requiredString(value: unknown, name: string, max: number, trim = false): string {
  if (typeof value !== 'string') throw new ServiceError(`${name} is required.`);
  const output = trim ? value.trim() : value;
  if (!output || output.length > max) throw new ServiceError(`${name} must be between 1 and ${max} characters.`);
  return output;
}
function nonnegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ServiceError(`${name} must be a nonnegative integer.`);
  return value as number;
}

export async function dispatchApi(request: Request, env: AppEnv, userId: string): Promise<Response> {
  try {
    if (!userId) throw new ServiceError('Authentication is required.', 401);
    if (request.method !== 'GET' && request.method !== 'HEAD') checkOrigin(request, env);
    const store = makeStore(env, userId);
    const service = new Providers(store, env);
    const transfers = new Transfers(store, service);
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/api/status') {
      const [spotify, youtube] = await Promise.all([store.credentials('spotify'), store.credentials('youtube')]);
      const result: Status = {
        accounts: { spotify: spotify?.account || null, youtube: youtube?.account || null },
        configured: { spotify: providerConfigured('spotify', env), youtube: providerConfigured('youtube', env) },
        callbacks: { spotify: callbackUrl('spotify', env), youtube: callbackUrl('youtube', env) },
      };
      return json(result);
    }
    const playlistMatch = path.match(/^\/api\/playlists\/([^/]+)$/);
    if (request.method === 'GET' && playlistMatch) {
      const provider = decodeURIComponent(playlistMatch[1]);
      if (!isProvider(provider)) throw new ServiceError('Unknown music service.');
      const cursor = url.searchParams.get('cursor') || undefined;
      const lease = await store.acquireLease('workspace', 60_000);
      if (!lease) throw new ServiceError('Another operation is active. Wait a moment, then retry.', 409);
      try { return json(await service.playlists(provider, cursor)); }
      finally { await store.releaseLease('workspace', lease); }
    }
    if (request.method === 'GET' && path === '/api/jobs') return json(await transfers.list());
    const jobDetail = path.match(/^\/api\/jobs\/([^/]+)$/);
    if (request.method === 'GET' && jobDetail) return json(await transfers.get(decodeURIComponent(jobDetail[1])));
    if (request.method === 'POST' && path === '/api/jobs') {
      const input = await body(request);
      const sourceValue = typeof input.source === 'string' ? input.source : undefined;
      if (!isProvider(sourceValue)) throw new ServiceError('Choose Spotify or YouTube as the source.');
      const playlistId = requiredString(input.playlistId, 'Playlist ID', 200);
      const name = requiredString(input.name, 'Playlist name', 150, true);
      return json(await transfers.create(sourceValue, playlistId, name), 201);
    }
    const jobAction = path.match(/^\/api\/jobs\/([^/]+)\/(step|select|search|approve|resume)$/);
    if (request.method === 'POST' && jobAction) {
      const id = decodeURIComponent(jobAction[1]); const action = jobAction[2];
      if (action === 'step') return json(await transfers.step(id));
      if (action === 'approve') return json(await transfers.approve(id));
      if (action === 'resume') return json(await transfers.resume(id));
      const input = await body(request);
      const index = nonnegativeInteger(input.index, 'Track index');
      if (action === 'select') {
        const candidateId = input.candidateId;
        if (candidateId !== null && (typeof candidateId !== 'string' || candidateId.length > 200)) throw new ServiceError('Choose a valid match.');
        return json(await transfers.select(id, index, candidateId as string | null));
      }
      const query = requiredString(input.query, 'Search query', 200, true);
      return json(await transfers.search(id, index, query));
    }
    const disconnect = path.match(/^\/api\/accounts\/([^/]+)\/disconnect$/);
    if (request.method === 'POST' && disconnect) {
      const provider = decodeURIComponent(disconnect[1]);
      if (!isProvider(provider)) throw new ServiceError('Unknown music service.');
      const token = await store.acquireLease('workspace', 60_000);
      if (!token) throw new ServiceError('Another operation is active. Wait a moment, then retry.', 409);
      try { await store.assertLease('workspace', token); await store.deleteCredentials(provider); }
      finally { await store.releaseLease('workspace', token); }
      return json({ ok: true });
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    return json({ error: errorMessage(error) }, responseStatus(error));
  }
}

function cookieValue(request: Request, key: string): string | undefined {
  const cookie = request.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === key) return rest.join('=');
  }
  return undefined;
}
const cookieHeader = (provider: Provider, value: string, secure: boolean) => `bridge_oauth_${provider}=${value}; HttpOnly; SameSite=Lax; Path=/auth/${provider}/callback; Max-Age=600${secure ? '; Secure' : ''}`;
const clearCookieHeader = (provider: Provider, secure: boolean) => `bridge_oauth_${provider}=; HttpOnly; SameSite=Lax; Path=/auth/${provider}/callback; Max-Age=0${secure ? '; Secure' : ''}`;
function redirect(env: AppEnv, path: string, cookie?: string) {
  const headers = new Headers({ Location: new URL(path, env.APP_URL).href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export async function dispatchOAuth(request: Request, env: AppEnv, userId: string): Promise<Response> {
  if (!userId) return json({ error: 'Authentication is required.' }, 401);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/auth\/(spotify|youtube)(?:\/callback)?$/);
  if (!match) return json({ error: 'Not found.' }, 404);
  const provider = match[1] as Provider;
  const callback = url.pathname.endsWith('/callback');
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  let store: Store;
  try { store = makeStore(env, userId); }
  catch { return json({ error: 'Server authentication storage is not configured.' }, 503); }
  const secure = new URL(env.APP_URL).protocol === 'https:';
  if (!callback) {
    const expectedOrigin = new URL(env.APP_URL).origin;
    const requestOrigin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const fetchSite = request.headers.get('Sec-Fetch-Site');
    let refererOrigin: string | undefined;
    try { refererOrigin = referer ? new URL(referer).origin : undefined; } catch { return json({ error: 'A same-origin request is required to connect an account.' }, 403); }
    if ((requestOrigin && requestOrigin !== expectedOrigin) || fetchSite === 'cross-site'
      || (!requestOrigin && refererOrigin && refererOrigin !== expectedOrigin)) {
      return json({ error: 'A same-origin request is required to connect an account.' }, 403);
    }
    let token: string | null = null;
    try {
      token = await store.acquireLease('workspace', 60_000);
      if (!token) throw new ServiceError('Another operation is active. Wait a moment, then retry.', 409);
      if (!providerConfigured(provider, env)) throw new ServiceError('Provider OAuth is not configured.', 503);
      const state = randomToken(32); const verifier = randomToken(48); const browser = randomToken(32);
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier))));
      await store.assertLease('workspace', token);
      await store.set(`oauth:${state}`, { provider, verifier, browser, userId, expiresAt: Date.now() + 600_000 });
      const config = providerConfig(provider, env);
      const target = new URL(config.auth);
      target.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: callbackUrl(provider, env), scope: config.scope, state }).toString();
      if (provider === 'spotify') { target.searchParams.set('code_challenge_method', 'S256'); target.searchParams.set('code_challenge', challenge); }
      else { target.searchParams.set('access_type', 'offline'); target.searchParams.set('prompt', 'consent'); }
      return redirect(env, target.href, cookieHeader(provider, browser, secure));
    } catch (error) { return redirect(env, `/?connectionError=${encodeURIComponent(errorMessage(error))}`); }
    finally { if (token) await store.releaseLease('workspace', token); }
  }

  const state = url.searchParams.get('state') || '';
  const cookieName = `bridge_oauth_${provider}`;
  let clearCookie = clearCookieHeader(provider, secure);
  let lease: string | null = null;
  let pendingKey = '';
  try {
    lease = await store.acquireLease('workspace', 60_000);
    if (!lease) throw new ServiceError('Another operation is active. Wait a moment, then retry.', 409);
    if (!state || state.length > 200) throw new ServiceError('Connection attempt expired. Try connecting again.', 400);
    pendingKey = `oauth:${state}`;
    const pending = await store.get<{ provider: Provider; verifier: string; browser: string; userId: string; expiresAt: number }>(pendingKey);
    const browser = cookieValue(request, cookieName);
    if (!pending || !validOAuthBinding(pending, provider, browser, userId)) {
      throw new ServiceError('Connection attempt expired. Try connecting again.', 400);
    }
    await store.assertLease('workspace', lease);
    await store.delete(pendingKey); // one time even when the provider denies or token exchange fails
    if (url.searchParams.has('error')) throw new ServiceError('Connection was declined. You can try again when ready.', 400);
    const code = url.searchParams.get('code');
    if (!code || code.length > 2_000) throw new ServiceError('Connection response was invalid.', 400);
    if (!providerConfigured(provider, env)) throw new ServiceError('Provider OAuth is not configured.', 503);
    const config = providerConfig(provider, env);
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(provider, env), client_id: config.clientId });
    if (provider === 'spotify') form.set('code_verifier', pending.verifier);
    else form.set('client_secret', config.clientSecret);
    const tokens = await readResponse(await fetch(config.token, { method: 'POST', body: form, signal: AbortSignal.timeout(8_000) }));
    const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
    if (!accessToken) throw new ServiceError('The music service did not return an access token.', 502);
    const profileResponse = provider === 'spotify'
      ? await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) })
      : await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) });
    const profile = await readResponse(profileResponse);
    let account: Account;
    if (provider === 'spotify') {
      const id = typeof profile.id === 'string' ? profile.id : '';
      account = { id, name: typeof profile.display_name === 'string' && profile.display_name ? profile.display_name : id };
    } else {
      const channel = Array.isArray(profile.items) ? profile.items[0] as Record<string, unknown> | undefined : undefined;
      const snippet = channel?.snippet && typeof channel.snippet === 'object' ? channel.snippet as Record<string, unknown> : {};
      const id = typeof channel?.id === 'string' ? channel.id : '';
      account = { id, name: typeof snippet.title === 'string' && snippet.title ? snippet.title : id };
    }
    if (!account.id) throw new ServiceError('This Google account needs a YouTube channel. Create one on YouTube, then reconnect.');
    await store.assertLease('workspace', lease);
    await store.saveCredentials(provider, {
      access_token: accessToken,
      refresh_token: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
      expiresAt: Date.now() + (typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600) * 1000,
      account,
    });
    return redirect(env, '/?connected=' + provider, clearCookie);
  } catch (error) {
    return redirect(env, `/?connectionError=${encodeURIComponent(errorMessage(error))}`, clearCookie);
  } finally {
    if (lease) await store.releaseLease('workspace', lease);
  }
}
