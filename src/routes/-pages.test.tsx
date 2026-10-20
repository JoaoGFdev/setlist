import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@/lib/query-client';
import React from 'react';
import { cleanup, render as renderUI, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@clerk/tanstack-react-start', async () => {
  const ReactModule = await import('react');
  return {
    useAuth: () => ({ isLoaded: true, userId: authState.userId }),
    SignInButton: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('span', null, children),
  };
});

vi.mock('@tanstack/react-router', async () => {
  const ReactModule = await import('react');
  return {
    createFileRoute: () => (options: unknown) => ({ options }),
    Link: ({ to, search, children, ...props }: { to: string; search?: { job?: string }; children: React.ReactNode }) => ReactModule.createElement('a', { href: search?.job ? `${to}?job=${encodeURIComponent(search.job)}` : to, ...props }, children),
  };
});

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme: vi.fn() }) }));

import { HistoryPage } from '@/components/pages/history-page';
import { LinkedPage } from '@/components/pages/linked-page';
import { SettingsPage } from '@/components/pages/settings-page';

const base = {
  source: 'spotify', destination: 'youtube', sourceAccount: 'sp', destinationAccount: 'yt', sourcePlaylistId: 'p1', sourcePlaylistName: 'Night drive',
  name: 'Night drive', phase: 'complete', state: 'idle', sourcePosition: 1, sourceDone: true, matchPosition: 0, createAttempted: true,
  reconcilePosition: 0, reconcileChecked: 0, inserted: 9, totalCount: 10, matchedCount: 9, selectedCount: 9, discoveryMatches: 0,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
};
const jobs = [
  { ...base, id: 'job-new', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z', name: 'Night drive (new)', destinationUrl: 'https://music.youtube.com/playlist?list=new' },
  { ...base, id: 'job-old' },
  { ...base, id: 'job-yt', source: 'youtube', destination: 'spotify', sourcePlaylistId: 'p2', sourcePlaylistName: 'Gym mix', name: 'Gym mix', phase: 'review', state: 'idle' },
  { ...base, id: 'job-paused', sourcePlaylistId: 'p3', sourcePlaylistName: 'Roadtrip', name: 'Roadtrip', phase: 'transferring', state: 'paused', message: 'Quota reached.' },
];

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
const requestPath = (input: RequestInfo | URL) => String(input);
const method = (init?: RequestInit) => init?.method || 'GET';
const body = (init?: RequestInit) => JSON.parse(String(init?.body));

let queryClient = createQueryClient();
const render = (page: React.ReactNode) => renderUI(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);

describe('library pages', () => {
  beforeEach(() => { queryClient = createQueryClient(); authState.userId = 'clerk-user-1'; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('groups transfers per source playlist and filters by direction', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (requestPath(input) === '/api/jobs') return json(jobs);
      throw new Error(`Unexpected request: ${requestPath(input)}`);
    }));
    const user = userEvent.setup();
    render(<LinkedPage />);
    expect(await screen.findByText('Night drive (new)')).toBeTruthy();
    expect(screen.getByText('2 transfers')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3 linked · 1 complete')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'View transfer' })[0].getAttribute('href')).toBe('/?job=job-new');

    await user.click(screen.getByRole('button', { name: 'YouTube → Spotify' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('1 linked · 0 complete')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search linked playlists' }), 'roadtrip');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('filters history by tab and removes a transfer after confirming', async () => {
    let list = [...jobs];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === '/api/jobs') return json(list);
      if (path === '/api/jobs/job-yt/delete' && method(init) === 'POST') { list = list.filter(job => job.id !== 'job-yt'); return json({ ok: true }); }
      throw new Error(`Unexpected request: ${method(init)} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await screen.findByRole('tab', { name: 'All 4' });
    expect(screen.getByRole('tab', { name: 'Needs review 1' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Paused 1' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByText('Gym mix')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Needs review 1' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Gym mix' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from history' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => requestPath(input) === '/api/jobs/job-yt/delete' && method(init) === 'POST')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Gym mix')).toBeNull());
  });

  it('clears all history from the confirmation dialog', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === '/api/jobs') return json(jobs);
      if (path === '/api/jobs/clear' && method(init) === 'POST') return json({ ok: true });
      throw new Error(`Unexpected request: ${method(init)} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await screen.findByRole('tab', { name: 'All 4' });
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/never changed or deleted/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === '/api/jobs/clear')).toBe(true));
    expect(await screen.findByText('No transfers yet')).toBeTruthy();
  });

  it('shows hidden playlists in settings and restores one', async () => {
    const status = { accounts: { spotify: { id: 'sp', name: 'Spotify listener' }, youtube: null }, connectionErrors: { spotify: null, youtube: 'Reconnect YouTube.' }, configured: { spotify: true, youtube: true }, callbacks: {} };
    const hidden = [
      { provider: 'spotify', id: 'p1', name: 'Old favourites', hiddenAt: '2026-10-01T00:00:00.000Z' },
      { provider: 'youtube', id: 'p9', name: 'Podcasts', hiddenAt: '2026-10-02T00:00:00.000Z' },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === '/api/status') return json(status);
      if (path === '/api/preferences') return json({ hiddenPlaylists: hidden });
      if (path === '/api/playlists/spotify/hidden' && method(init) === 'POST') return json({ hiddenPlaylists: [hidden[1]] });
      throw new Error(`Unexpected request: ${method(init)} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(await screen.findByText('Spotify listener')).toBeTruthy();
    expect(screen.getByText('Reconnect YouTube.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect in workspace' })).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: 'Show Old favourites again' }));
    await waitFor(() => expect(screen.queryByText('Old favourites')).toBeNull());
    const call = fetchMock.mock.calls.find(([input]) => requestPath(input) === '/api/playlists/spotify/hidden')!;
    expect(body(call[1])).toMatchObject({ playlistId: 'p1', hidden: false });
    expect(screen.getByText('Podcasts')).toBeTruthy();
  });

  it('treats a missing preferences endpoint as nothing hidden', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === '/api/status') return json({ accounts: { spotify: null, youtube: null }, configured: {}, callbacks: {} });
      if (path === '/api/preferences') return json({ error: 'Not found' }, 404);
      throw new Error(`Unexpected request: ${path}`);
    }));
    render(<SettingsPage />);
    expect(await screen.findByText('Hide playlists from the workspace menu to keep your library tidy.')).toBeTruthy();
  });
});
