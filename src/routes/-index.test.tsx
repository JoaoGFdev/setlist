import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@clerk/tanstack-react-start', async () => {
  const ReactModule = await import('react');
  return {
    useAuth: () => ({ isLoaded: true, userId: authState.userId }),
    SignInButton: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
    UserButton: () => ReactModule.createElement('span', { 'aria-label': 'Signed in user' }, 'User'),
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));

import { App } from './index';

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

describe('authenticated workspace UI', () => {
  beforeEach(() => { authState.userId = null; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
    const view = render(<App />);
    await screen.findByText('Sign in to your private workspace');
    expect(fetchMock).not.toHaveBeenCalled();

    authState.userId = 'clerk-user-1';
    view.rerender(<App />);
    expect(await screen.findByText('Spotify listener')).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === '/api/status')).toBe(true));
    expect(fetchMock.mock.calls.filter(([input]) => requestPath(input).startsWith('/api/playlists/'))).toHaveLength(2);
  });

  it('creates a transfer and sends sequential steps, reading full items only when review starts', async () => {
    const created = fullJob('job-created', { name: 'Night drive', phase: 'loading', state: 'running', items: [] });
    const reviewed = fullJob('job-created', { name: 'Night drive', phase: 'review', state: 'idle', matchedCount: 1, selectedCount: 1, items: [{ ...item, candidates: [{ id: 'yt-track', title: 'Midnight City', artist: 'M83', url: 'https://youtube.com/watch?v=yt-track', score: 98 }], searched: true, selected: { id: 'yt-track', title: 'Midnight City', artist: 'M83', url: 'https://youtube.com/watch?v=yt-track', score: 98 } }] });
    let stepCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input); const requestMethod = method(init);
      if (path === '/api/status') return json(status);
      if (path === '/api/jobs' && requestMethod === 'GET') return json([]);
      if (path === '/api/playlists/spotify' || path === '/api/playlists/youtube') return json({ items: [playlist] });
      if (path === '/api/jobs' && requestMethod === 'POST') return json(created, 201);
      if (path === '/api/jobs/job-created/step' && requestMethod === 'POST') {
        stepCount++;
        return json(stepCount === 1 ? summary(created, { phase: 'matching', totalCount: 1 }) : summary(created, { phase: 'review', state: 'idle', matchedCount: 1, selectedCount: 1 }));
      }
      if (path === '/api/jobs/job-created' && requestMethod === 'GET') return json(reviewed);
      throw new Error(`Unexpected request: ${requestMethod} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    authState.userId = 'clerk-user-1';
    const user = userEvent.setup();
    render(<App />);
    await screen.findAllByText('Night drive');
    await user.click(within(screen.getByRole('region', { name: 'Spotify library' })).getByRole('button', { name: /transfer/i }));
    await user.click(screen.getByRole('button', { name: 'Find matches' }));
    expect(await screen.findByText('Matches are suggestions. Open a result to check it, choose another candidate, or skip the track.')).toBeTruthy();
    expect(stepCount).toBe(2);
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
    render(<App />);
    await screen.findByRole('heading', { name: 'Night drive' });
    await user.click(screen.getByRole('button', { name: 'Continue transfer' }));
    await waitFor(() => expect(stepCount).toBe(1));
    const picker = screen.getByRole('combobox', { name: 'Transfer' });
    await user.selectOptions(picker, 'job-2');
    expect(await screen.findByRole('heading', { name: 'Saved transfer' })).toBeTruthy();
    finishStep(json(summary(jobOne, { matchedCount: 1 })));
    await waitFor(() => expect(stepCount).toBe(1));
    expect(within(picker).getByRole('option', { name: /Saved transfer/ })).toBeTruthy();
  });
});
