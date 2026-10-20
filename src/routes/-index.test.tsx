import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ userId: null as string | null }));
const clerkAuthorize = vi.hoisted(() => vi.fn(async () => ({ verification: {} })));

vi.mock('@clerk/tanstack-react-start', async () => {
  const ReactModule = await import('react');
  return {
    useAuth: () => ({ isLoaded: true, userId: authState.userId }),
    useUser: () => ({ user: { externalAccounts: [{ provider: 'spotify', reauthorize: clerkAuthorize }, { provider: 'google', reauthorize: clerkAuthorize }], reload: async () => {}, createExternalAccount: clerkAuthorize } }),
    useReverification: (action: unknown) => action,
    SignInButton: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    UserButton: () => ReactModule.createElement('span', { 'aria-label': 'Signed in user' }, 'User'),
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
}));

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock, Toaster: () => null }));

import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query-client';
import { HistoryPage } from '@/components/pages/history-page';
import { App } from '@/components/workspace/workspace-page';

const status = {
  accounts: { spotify: { id: 'sp-user', name: 'Spotify listener' }, youtube: { id: 'yt-user', name: 'YouTube listener' } },
  configured: { spotify: true, youtube: true },
  callbacks: { spotify: 'http://127.0.0.1:5173/auth/spotify/callback', youtube: 'http://127.0.0.1:5173/auth/youtube/callback' },
};
const playlist = { id: 'playlist-1', name: 'Night drive', description: '', count: 1, url: 'https://open.spotify.com/playlist/playlist-1', transferable: true };
const item = { source: { id: 'track-1', title: 'Midnight City', artist: 'M83', url: 'https://open.spotify.com/track/track-1' }, candidates: [], selected: null, searched: false };
function fullJob(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, source: 'spotify', destination: 'youtube', sourceAccount: 'sp-user', destinationAccount: 'yt-user', sourcePlaylistId: 'playlist-1',
    name: id === 'job-1' ? 'Night drive' : 'Saved transfer', phase: 'matching', state: 'running', sourcePosition: 1, sourceDone: true,
    matchPosition: 0, createAttempted: false, reconcilePosition: 0, reconcileChecked: 0, inserted: 0,
    totalCount: 1, matchedCount: 0, selectedCount: 0, createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
    items: [item], ...overrides,
  };
}
const summary = (job: ReturnType<typeof fullJob>, overrides: Record<string, unknown> = {}) => {
  const { items: _items, ...metadata } = job;
  return { ...metadata, ...overrides };
};
function json(value: unknown, statusCode = 200) {
  return new Response(JSON.stringify(value), { status: statusCode, headers: { 'Content-Type': 'application/json' } });
}
const requestPath = (input: RequestInfo | URL) => String(input);
const method = (init?: RequestInit) => init?.method || 'GET';

let queryClient = createQueryClient();
const renderApp = () => render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);

describe('authenticated workspace UI', () => {
  beforeEach(() => { queryClient = createQueryClient(); authState.userId = null; clerkAuthorize.mockClear(); toastMock.success.mockClear(); toastMock.error.mockClear(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

  it('reuses workspace, transfer and playlist data after leaving and returning', async () => {
    authState.userId = 'clerk-user-1';
    const job = fullJob('job-1', { phase: 'review', state: 'idle' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === '/api/status') return json(status);
      if (path === '/api/jobs') return json([summary(job)]);
      if (path === '/api/jobs/job-1') return json(job);
      if (path === '/api/preferences') return json({ hiddenPlaylists: [] });
      if (path.startsWith('/api/playlists/')) return json({ items: [playlist] });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderApp();
    await screen.findByRole('heading', { name: 'Night drive' });
    await within(screen.getByRole('region', { name: 'Spotify library' })).findByText('Night drive');
    const requests = fetchMock.mock.calls.length;
    view.rerender(<QueryClientProvider client={queryClient}><HistoryPage /></QueryClientProvider>);
    await screen.findByRole('tab', { name: 'All 1' });
    view.rerender(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    await screen.findByRole('heading', { name: 'Night drive' });
    await within(screen.getByRole('region', { name: 'Spotify library' })).findByText('Night drive');
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it('requests playlist consent through an already linked Clerk account', async () => {
    authState.userId = 'clerk-user-1';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === '/api/status') return json({ ...status, accounts: { spotify: null, youtube: null } });
      if (path === '/api/jobs') return json([]);
      if (path === '/api/accounts/spotify/connect') return json({ ok: true });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    const spotify = await screen.findByRole('region', { name: 'Spotify library' });
    await userEvent.setup().click(within(spotify).getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(clerkAuthorize).toHaveBeenCalledOnce());
    expect(clerkAuthorize).toHaveBeenCalledWith({ additionalScopes: ['playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-private', 'playlist-modify-public'], redirectUrl: `${window.location.origin}/sso-callback` });
    expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === '/api/accounts/spotify/connect')).toBe(true);
  });

  it('still offers each provider\'s Connect button when account status cannot load', async () => {
    authState.userId = 'clerk-user-1';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === '/api/status') return json({ error: 'Sign in to use your transfer workspace.' }, 401);
      if (path === '/api/jobs') return json({ error: 'Sign in to use your transfer workspace.' }, 401);
      throw new Error(`Unexpected request: ${path}`);
    }));
    renderApp();
    expect((await screen.findByRole('alert')).textContent).toContain('Sign in to use your transfer workspace.');
    for (const name of ['Spotify library', 'YouTube library']) {
      const library = await screen.findByRole('region', { name });
      expect(within(library).getByRole('button', { name: 'Connect' })).toBeTruthy();
    }
  });

  it('does not read private APIs while signed out, then loads the workspace after sign-in', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === '/api/status') return json(status);
      if (path === '/api/jobs') return json([]);
      if (path === '/api/playlists/spotify' || path === '/api/playlists/youtube') return json({ items: [playlist] });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const view = renderApp();
    await screen.findByText('Sign in to your private workspace');
    expect(fetchMock).not.toHaveBeenCalled();

    authState.userId = 'clerk-user-1';
    view.rerender(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
    expect(await screen.findByText('Spotify listener')).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === '/api/status')).toBe(true));
    expect(fetchMock.mock.calls.filter(([input]) => requestPath(input).startsWith('/api/playlists/'))).toHaveLength(2);
  });

  it('creates a transfer and sends sequential steps, reading full items only when review starts', async () => {
    const created = fullJob('job-created', { name: 'Night drive', phase: 'loading', state: 'running', items: [] });
    const reviewed = fullJob('job-created', { name: 'Night drive', phase: 'review', state: 'idle', matchedCount: 1, selectedCount: 1, items: [{ ...item, candidates: [{ id: 'yt-track', title: 'Midnight City', artist: 'M83', url: 'https://youtube.com/watch?v=yt-track', score: 98 }], searched: true, selected: { id: 'yt-track', title: 'Midnight City', artist: 'M83', url: 'https://youtube.com/watch?v=yt-track', score: 98 } }] });
    let stepCount = 0;
    const stepTimes: number[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input); const requestMethod = method(init);
      if (path === '/api/status') return json(status);
      if (path === '/api/jobs' && requestMethod === 'GET') return json([]);
      if (path === '/api/playlists/spotify' || path === '/api/playlists/youtube') return json({ items: [playlist] });
      if (path === '/api/jobs' && requestMethod === 'POST') return json(created, 201);
      if (path === '/api/jobs/job-created/step' && requestMethod === 'POST') {
        stepTimes.push(Date.now());
        stepCount++;
        return json(stepCount === 1 ? summary(created, { phase: 'matching', totalCount: 1 }) : summary(created, { phase: 'review', state: 'idle', matchedCount: 1, selectedCount: 1 }));
      }
      if (path === '/api/jobs/job-created' && requestMethod === 'GET') return json(reviewed);
      throw new Error(`Unexpected request: ${requestMethod} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    authState.userId = 'clerk-user-1';
    const user = userEvent.setup();
    renderApp();
    await screen.findAllByText('Night drive');
    await user.click(within(screen.getByRole('region', { name: 'Spotify library' })).getByRole('button', { name: /transfer/i }));
    await user.click(screen.getByRole('button', { name: 'Find matches' }));
    expect(await screen.findByText('Matches are suggestions. Open a result to check it, choose another candidate, or skip the track.', {}, { timeout: 4_000 })).toBeTruthy();
    expect(stepCount).toBe(2);
    expect(stepTimes[1] - stepTimes[0]).toBeGreaterThanOrEqual(1_500);
    expect(fetchMock.mock.calls.filter(([input, init]) => requestPath(input) === '/api/jobs/job-created' && method(init) === 'GET')).toHaveLength(1);
  });

  it('stops an active step loop when the user switches to another transfer', async () => {
    const jobOne = fullJob('job-1');
    const jobTwo = fullJob('job-2', { name: 'Saved transfer', state: 'paused', message: 'Waiting to resume.' });
    let finishStep!: (response: Response) => void;
    const pendingStep = new Promise<Response>(resolve => { finishStep = resolve; });
    let stepCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input); const requestMethod = method(init);
      if (path === '/api/status') return json(status);
      if (path === '/api/jobs' && requestMethod === 'GET') return json([summary(jobOne), summary(jobTwo)]);
      if (path === '/api/playlists/spotify' || path === '/api/playlists/youtube') return json({ items: [] });
      if (path === '/api/jobs/job-1' && requestMethod === 'GET') return json(jobOne);
      if (path === '/api/jobs/job-2' && requestMethod === 'GET') return json(jobTwo);
      if (path === '/api/jobs/job-1/resume' && requestMethod === 'POST') return json(jobOne);
      if (path === '/api/jobs/job-1/step' && requestMethod === 'POST') { stepCount++; return pendingStep; }
      throw new Error(`Unexpected request: ${requestMethod} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    authState.userId = 'clerk-user-1';
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Night drive' });
    // A running transfer picks up again on its own when opened.
    await waitFor(() => expect(stepCount).toBe(1));
    const picker = screen.getByRole('combobox', { name: 'Transfer history' });
    await user.click(picker);
    await user.click(await screen.findByRole('option', { name: /Saved transfer/ }));
    expect(await screen.findByRole('heading', { name: 'Saved transfer' })).toBeTruthy();
    finishStep(json(summary(jobOne, { matchedCount: 1 })));
    await waitFor(() => expect(stepCount).toBe(1));
    expect(picker.textContent).toContain('Saved transfer');
  });

  it('waits for an active step to checkpoint before pausing and stops further steps', async () => {
    const jobOne = fullJob('job-1');
    const jobTwo = fullJob('job-2', { name: 'Saved transfer', state: 'paused', message: 'Waiting to resume.' });
    let finishStep!: (response: Response) => void;
    const pendingStep = new Promise<Response>(resolve => { finishStep = resolve; });
    let stepCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input); const requestMethod = method(init);
      if (path === '/api/status') return json(status);
      if (path === '/api/jobs' && requestMethod === 'GET') return json([summary(jobOne), summary(jobTwo)]);
      if (path === '/api/playlists/spotify' || path === '/api/playlists/youtube') return json({ items: [] });
      if (path === '/api/jobs/job-1' && requestMethod === 'GET') return json(jobOne);
      if (path === '/api/jobs/job-2' && requestMethod === 'GET') return json(jobTwo);
      if (path === '/api/jobs/job-1/pause') return json({ ...jobOne, state: 'paused', message: 'Transfer paused. Progress is saved.' });
      if (path === '/api/jobs/job-1/resume' && requestMethod === 'POST') return json(jobOne);
      if (path === '/api/jobs/job-1/step' && requestMethod === 'POST') { stepCount++; return pendingStep; }
      throw new Error(`Unexpected request: ${requestMethod} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    authState.userId = 'clerk-user-1';
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Night drive' });
    // A running transfer picks up again on its own when opened.
    await waitFor(() => expect(stepCount).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Pause transfer' }));
    expect(screen.getByRole('button', { name: 'Pausing…' }).hasAttribute('disabled')).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => requestPath(input).endsWith('/pause'))).toBe(false);
    finishStep(json(summary(jobOne, { matchedCount: 1 })));
    expect(await screen.findByRole('button', { name: 'Resume transfer' })).toBeTruthy();
    expect(stepCount).toBe(1);
    expect(fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/pause'))).toHaveLength(1);
  });

  describe('library list', () => {
    const second = { ...playlist, id: 'playlist-2', name: 'Morning run', url: 'https://open.spotify.com/playlist/playlist-2' };
    const hiddenEntry = { provider: 'spotify', id: 'playlist-1', name: 'Night drive', hiddenAt: '2026-10-20T00:00:00.000Z' };

    function libraryMock(options: { jobs?: unknown[]; spotify?: unknown[]; youtube?: unknown[]; hiddenResponse?: unknown; fullJobs?: Record<string, unknown> } = {}) {
      return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = requestPath(input); const requestMethod = method(init);
        if (path === '/api/status') return json(status);
        if (path === '/api/jobs' && requestMethod === 'GET') return json(options.jobs ?? []);
        if (path === '/api/preferences') return json({ hiddenPlaylists: [] });
        if (path === '/api/playlists/spotify') return json({ items: options.spotify ?? [playlist, second] });
        if (path === '/api/playlists/youtube') return json({ items: options.youtube ?? [] });
        if (path === '/api/playlists/spotify/hidden' && requestMethod === 'POST') return json(options.hiddenResponse ?? { hiddenPlaylists: [hiddenEntry] });
        const full = Object.entries(options.fullJobs ?? {}).find(([id]) => path === `/api/jobs/${id}`);
        if (full && requestMethod === 'GET') return json(full[1]);
        throw new Error(`Unexpected request: ${requestMethod} ${path}`);
      });
    }

    it('retains loaded playlist pages and refreshes only the chosen library', async () => {
      authState.userId = 'clerk-user-1';
      const base = libraryMock();
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (requestPath(input) === '/api/playlists/spotify') return json({ items: [playlist], nextCursor: 'page2' });
        if (requestPath(input) === '/api/playlists/spotify?cursor=page2') return json({ items: [second] });
        return base(input, init);
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      const view = renderApp();
      const spotify = await screen.findByRole('region', { name: 'Spotify library' });
      await within(spotify).findByText('Night drive');
      await user.click(within(spotify).getByRole('button', { name: 'Load more playlists' }));
      await within(spotify).findByText('Morning run');
      const count = fetchMock.mock.calls.length;
      view.unmount();
      renderApp();
      const restored = await screen.findByRole('region', { name: 'Spotify library' });
      await within(restored).findByText('Morning run');
      expect(fetchMock).toHaveBeenCalledTimes(count);
      await user.click(within(restored).getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(count + 2));
      expect(fetchMock.mock.calls.slice(count).map(([input]) => requestPath(input))).toEqual(['/api/playlists/spotify', '/api/playlists/spotify?cursor=page2']);
    });

    it('loads a separate cache when the signed-in user changes', async () => {
      authState.userId = 'clerk-user-1';
      const fetchMock = libraryMock();
      vi.stubGlobal('fetch', fetchMock);
      const view = renderApp();
      await within(await screen.findByRole('region', { name: 'Spotify library' })).findByText('Night drive');
      authState.userId = 'clerk-user-2';
      view.rerender(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
      await within(await screen.findByRole('region', { name: 'Spotify library' })).findByText('Night drive');
      expect(fetchMock.mock.calls.filter(([input]) => requestPath(input) === '/api/status')).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([input]) => requestPath(input) === '/api/playlists/spotify')).toHaveLength(2);
    });

    it('hides a playlist, offers undo, and reveals it again with Show hidden', async () => {
      const fetchMock = libraryMock();
      vi.stubGlobal('fetch', fetchMock);
      authState.userId = 'clerk-user-1';
      const user = userEvent.setup();
      renderApp();
      const spotify = await screen.findByRole('region', { name: 'Spotify library' });
      await within(spotify).findByText('Night drive');
      await user.click(within(spotify).getByRole('button', { name: 'More actions for Night drive' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Hide from list' }));

      await waitFor(() => expect(within(spotify).queryByText('Night drive')).toBeNull());
      expect(within(spotify).getByText('Morning run')).toBeTruthy();
      const post = fetchMock.mock.calls.find(([input, init]) => requestPath(input) === '/api/playlists/spotify/hidden' && method(init) === 'POST');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ playlistId: 'playlist-1', name: 'Night drive', hidden: true });
      const undo = toastMock.success.mock.calls[0]?.[1]?.action as { label: string; onClick: () => void };
      expect(undo.label).toBe('Undo');

      await user.click(within(spotify).getByRole('switch', { name: 'Show hidden (1)' }));
      expect(await within(spotify).findByText('Night drive')).toBeTruthy();
      expect(within(spotify).getByText('Hidden')).toBeTruthy();

      undo.onClick();
      await waitFor(() => expect(fetchMock.mock.calls.filter(([input, init]) => requestPath(input) === '/api/playlists/spotify/hidden' && method(init) === 'POST')).toHaveLength(2));
    });

    it('keeps every playlist visible when preferences are unavailable', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const path = requestPath(input);
        if (path === '/api/status') return json(status);
        if (path === '/api/jobs') return json([]);
        if (path === '/api/preferences') return json({ error: 'Not found' }, 404);
        if (path === '/api/playlists/spotify') return json({ items: [playlist] });
        if (path === '/api/playlists/youtube') return json({ items: [] });
        throw new Error(`Unexpected request: ${path}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      authState.userId = 'clerk-user-1';
      renderApp();
      const spotify = await screen.findByRole('region', { name: 'Spotify library' });
      expect(await within(spotify).findByText('Night drive')).toBeTruthy();
      expect(within(spotify).queryByRole('switch')).toBeNull();
    });

    it('marks linked playlists and opens the linked transfer from the badge', async () => {
      const jobOne = fullJob('job-1', { sourcePlaylistId: 'other-playlist' });
      const jobTwo = fullJob('job-2', { phase: 'complete', state: 'idle', destinationId: 'yt-created', destinationUrl: 'https://music.youtube.com/playlist?list=yt-created', inserted: 1 });
      const created = { ...playlist, id: 'yt-created', name: 'Night drive (Setlist)', url: 'https://www.youtube.com/playlist?list=yt-created' };
      vi.stubGlobal('fetch', libraryMock({ jobs: [summary(jobOne), summary(jobTwo)], spotify: [playlist, second], youtube: [created], fullJobs: { 'job-1': jobOne, 'job-2': jobTwo } }));
      authState.userId = 'clerk-user-1';
      const user = userEvent.setup();
      renderApp();
      await screen.findByRole('heading', { name: 'Night drive' });
      const spotify = screen.getByRole('region', { name: 'Spotify library' });
      const badge = await within(spotify).findByRole('button', { name: /Linked → YouTube/ });
      expect(within(spotify).getAllByRole('button', { name: /Linked/ })).toHaveLength(1);
      expect(within(screen.getByRole('region', { name: 'YouTube library' })).getByRole('button', { name: /Created by Setlist/ })).toBeTruthy();
      await user.click(badge);
      expect(await screen.findByRole('heading', { name: 'Saved transfer' })).toBeTruthy();
    });

    it('shows In progress for an unfinished transfer of a playlist', async () => {
      const job = fullJob('job-1');
      vi.stubGlobal('fetch', libraryMock({ jobs: [summary(job)], fullJobs: { 'job-1': job } }));
      authState.userId = 'clerk-user-1';
      renderApp();
      const spotify = await screen.findByRole('region', { name: 'Spotify library' });
      expect(await within(spotify).findByRole('button', { name: /In progress/ })).toBeTruthy();
    });

    it('removes a transfer from history after confirmation and opens the next one', async () => {
      const jobOne = fullJob('job-1');
      const jobTwo = fullJob('job-2', { state: 'paused', message: 'Waiting to resume.' });
      const base = libraryMock({ jobs: [summary(jobOne), summary(jobTwo)], fullJobs: { 'job-1': jobOne, 'job-2': jobTwo } });
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        requestPath(input) === '/api/jobs/job-1/delete' && method(init) === 'POST' ? json({ ok: true }) : base(input, init));
      vi.stubGlobal('fetch', fetchMock);
      authState.userId = 'clerk-user-1';
      const user = userEvent.setup();
      renderApp();
      await screen.findByRole('heading', { name: 'Night drive' });
      await user.click(screen.getByRole('button', { name: 'Remove from history' }));
      expect(await screen.findByText(/doesn’t delete any playlist on Spotify or YouTube/)).toBeTruthy();
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove from history' }));
      expect(await screen.findByRole('heading', { name: 'Saved transfer' })).toBeTruthy();
      expect(fetchMock.mock.calls.some(([input, init]) => requestPath(input) === '/api/jobs/job-1/delete' && method(init) === 'POST')).toBe(true);
    });

    it('opens the transfer named by the ?job= search param', async () => {
      const jobOne = fullJob('job-1');
      const jobTwo = fullJob('job-2', { state: 'paused', message: 'Waiting to resume.' });
      vi.stubGlobal('fetch', libraryMock({ jobs: [summary(jobOne), summary(jobTwo)], fullJobs: { 'job-1': jobOne, 'job-2': jobTwo } }));
      window.history.replaceState(null, '', '/?job=job-2');
      authState.userId = 'clerk-user-1';
      renderApp();
      expect(await screen.findByRole('heading', { name: 'Saved transfer' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Night drive' })).toBeNull();
    });
  });
});
