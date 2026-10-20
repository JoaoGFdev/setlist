import 'dotenv/config';
import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Store } from './store.ts';
import { Providers, ServiceError, settings, configured, readResponse } from './providers.ts';
import { Transfers } from './transfers.ts';
import type { Job, Provider } from '../shared/types.ts';

const port = Number(process.env.PORT || 3000);
const appUrl = new URL(process.env.APP_URL || `http://127.0.0.1:${port}`);
if (appUrl.hostname !== '127.0.0.1' || appUrl.protocol !== 'http:' || appUrl.port !== String(port)) throw new Error('APP_URL must be http://127.0.0.1:PORT. This app is designed for local use.');
const origin = appUrl.origin;
const store = new Store(resolve('.data'));
const providers = new Providers(store);
const transfers = new Transfers(store, providers);
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.headers.host !== appUrl.host) { res.status(403).json({ error: 'Open this app using its configured 127.0.0.1 address.' }); return; }
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site' && !req.path.endsWith('/callback')) {
      res.status(403).json({ error: 'Cross-site requests are blocked.' }); return;
    }
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin) { res.status(403).json({ error: 'A same-origin request is required.' }); return; }
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
const providerSchema = z.enum(['spotify', 'youtube']);
const callback = (p: Provider) => `${origin}/auth/${p}/callback`;

app.get('/api/status', (_req, res) => res.json({
  accounts: { spotify: store.credentials('spotify')?.account || null, youtube: store.credentials('youtube')?.account || null },
  configured: { spotify: configured('spotify'), youtube: configured('youtube') },
  callbacks: { spotify: callback('spotify'), youtube: callback('youtube') },
}));
app.get('/auth/:provider', (req, res) => {
  const provider = providerSchema.parse(req.params.provider);
  if (store.list<Job>('job:').some(j => j.state === 'running')) throw new ServiceError('Wait for the current operation to finish before changing connected accounts.', 409);
  if (!configured(provider)) throw new ServiceError('Add the OAuth client credentials to .env and restart the app.');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  // Only the current browser's latest connection attempt is accepted; entries expire after ten minutes.
  const cookie = randomBytes(32).toString('base64url');
  store.set(`oauth:${state}`, { provider, verifier, cookie, expiresAt: Date.now() + 600_000 });
  res.cookie(`bridge_oauth_${provider}`, cookie, { httpOnly: true, sameSite: 'lax', maxAge: 600_000, path: `/auth/${provider}/callback` });
  const config = settings[provider];
  const url = new URL(config.auth);
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: callback(provider), scope: config.scope, state }).toString();
  if (provider === 'spotify') { url.searchParams.set('code_challenge_method', 'S256'); url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); }
  else { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); }
  res.redirect(url.href);
});
app.get('/auth/:provider/callback', async (req, res) => {
  const provider = providerSchema.parse(req.params.provider);
  try {
    const state = z.string().min(1).parse(req.query.state);
    const pending = store.get<{ provider: Provider; verifier: string; cookie: string; expiresAt: number }>(`oauth:${state}`);
    const browserCookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`bridge_oauth_${provider}=`))?.split('=')[1];
    if (!pending || pending.provider !== provider || pending.expiresAt < Date.now() || !browserCookie || browserCookie.length !== pending.cookie.length || !timingSafeEqual(Buffer.from(browserCookie), Buffer.from(pending.cookie))) throw new ServiceError('Connection attempt expired. Try connecting again.');
    store.delete(`oauth:${state}`);
    res.clearCookie(`bridge_oauth_${provider}`, { path: `/auth/${provider}/callback` });
    if (req.query.error) throw new ServiceError('Connection was declined. You can try again when ready.');
    const code = z.string().min(1).parse(req.query.code);
    const config = settings[provider];
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callback(provider), client_id: config.clientId });
    if (provider === 'spotify') form.set('code_verifier', pending.verifier);
    else form.set('client_secret', config.clientSecret);
    const tokens = await readResponse(await fetch(config.token, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) }));
    const profile = await readResponse(await fetch(provider === 'spotify' ? 'https://api.spotify.com/v1/me' : 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(30_000) }));
    const account = provider === 'spotify' ? { id: profile.id, name: profile.display_name || profile.id } : { id: profile.items?.[0]?.id, name: profile.items?.[0]?.snippet?.title };
    if (!account.id) throw new ServiceError('This Google account needs a YouTube channel. Create one on YouTube, then reconnect.');
    if (store.list<Job>('job:').some(j => j.state === 'running')) throw new ServiceError('A transfer is running. Wait until it finishes, then connect again.');
    store.saveCredentials(provider, { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000, account });
    res.redirect('/');
  } catch (error) {
    res.redirect(`/?connectionError=${encodeURIComponent(error instanceof Error ? error.message : 'Connection failed. Try again.')}`);
  }
});
app.post('/api/accounts/:provider/disconnect', (req, res) => {
  const provider = providerSchema.parse(req.params.provider);
  if (store.list<Job>('job:').some(j => j.state === 'running')) throw new ServiceError('Wait for the current operation to finish before disconnecting.', 409);
  store.delete(`account:${provider}`);
  res.json({ ok: true });
});
app.get('/api/playlists/:provider', async (req, res) => res.json(await providers.playlists(providerSchema.parse(req.params.provider))));
app.get('/api/jobs', (_req, res) => res.json(store.list<Job>('job:').sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.get('/api/jobs/:id', (req, res) => res.json(transfers.get(req.params.id)));
app.post('/api/jobs', async (req, res) => {
  const input = z.object({ source: providerSchema, playlistId: z.string().min(1).max(200), name: z.string().trim().min(1).max(150) }).parse(req.body);
  res.status(201).json(await transfers.create(input.source, input.playlistId, input.name));
});
app.post('/api/jobs/:id/select', (req, res) => {
  const input = z.object({ index: z.number().int().nonnegative(), candidateId: z.string().max(200).nullable() }).parse(req.body);
  res.json(transfers.select(req.params.id, input.index, input.candidateId));
});
app.post('/api/jobs/:id/search', async (req, res) => {
  const input = z.object({ index: z.number().int().nonnegative(), query: z.string().trim().min(1).max(200) }).parse(req.body);
  res.json(await transfers.search(req.params.id, input.index, input.query));
});
app.post('/api/jobs/:id/approve', (req, res) => res.json(transfers.approve(req.params.id)));
app.post('/api/jobs/:id/resume', (req, res) => { transfers.start(req.params.id); res.json(transfers.get(req.params.id)); });

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) { res.status(400).json({ error: 'Check the submitted values and try again.' }); return; }
  res.status(err instanceof ServiceError ? err.status : 500).json({ error: err instanceof Error ? err.message : 'An unexpected error occurred.' });
});
app.listen(port, '127.0.0.1', () => console.log(`Playlist Bridge is running at ${origin}`));
