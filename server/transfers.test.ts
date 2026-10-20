import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { Store } from './store.ts';
import { Providers, readResponse } from './providers.ts';
import { Transfers, reconcile } from './transfers.ts';
import { rank, splitVideoTitle } from './matching.ts';
import type { Candidate, Job, Provider, Track } from '../shared/types.ts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'playlist-bridge-test-'));
  const store = new Store(directory);
  for (const p of ['spotify', 'youtube'] as Provider[]) store.saveCredentials(p, { access_token: `${p}-private-token`, refresh_token: 'private-refresh', expiresAt: Date.now() + 100000, account: { id: p, name: p } });
  return { store, cleanup() { store.db.close(); rmSync(directory, { recursive: true, force: true }); } };
}
const track = (id: string): Track => ({ id, title: `Song ${id}`, artist: 'Artist', url: `https://example.com/${id}` });
const candidate = (id: string): Candidate => ({ ...track(id), score: 90 });
function reviewJob(): Job {
  return { id: 'test', source: 'spotify', destination: 'youtube', sourceAccount: 'spotify', destinationAccount: 'youtube', name: 'Test playlist',
    phase: 'review', state: 'idle', items: ['a', 'a', 'b'].map(id => ({ source: track(id), candidates: [candidate(id)], selected: candidate(id), searched: true })),
    inserted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
async function settled(transfers: Transfers) {
  for (let i = 0; i < 100; i++) { if (!transfers.active.size) return; await setTimeout(5); }
  throw new Error('Transfer did not settle');
}
test('reconciles duplicate tracks by position, and rejects external changes', () => {
  assert.equal(reconcile(['a', 'a', 'b'], ['a', 'a']), 2);
  assert.throws(() => reconcile(['a', 'b'], ['b']), /changed outside/);
  assert.throws(() => reconcile(['a'], ['a', 'b']), /changed outside/);
});
test('resume reconciles an insert whose response was lost, without duplicating it', async () => {
  const f = fixture();
  try {
    const destination: Track[] = [];
    let fail = true;
    let creations = 0;
    class Fake extends Providers {
      override async createPlaylist() { creations++; return { id: 'dest', url: 'https://example.com/dest' }; }
      override async tracks() { return destination; }
      override async insert(_p: Provider, _playlist: string, id: string) {
        destination.push(track(id));
        if (fail) { fail = false; throw new Error('Response lost after remote success'); }
      }
    }
    const transfers = new Transfers(f.store, new Fake(f.store));
    f.store.set('job:test', reviewJob());
    transfers.approve('test'); await settled(transfers);
    assert.equal(transfers.get('test').state, 'paused');
    assert.equal(transfers.get('test').inserted, 0);
    transfers.start('test'); await settled(transfers);
    assert.deepEqual(destination.map(t => t.id), ['a', 'a', 'b']);
    assert.equal(transfers.get('test').phase, 'complete');
    assert.equal(creations, 1);
  } finally { f.cleanup(); }
});
test('quota pause checkpoints searched matches and resumes only unsearched tracks', async () => {
  const f = fixture();
  try {
    const calls: string[] = [];
    let blocked = true;
    class Fake extends Providers {
      override async search(_p: Provider, t: Track) {
        calls.push(t.id);
        if (t.id === 'b' && blocked) throw new Error('Daily quota reached');
        return [candidate(t.id)];
      }
    }
    const job = reviewJob(); job.phase = 'matching';
    job.items = ['a', 'b'].map(id => ({ source: track(id), selected: null, candidates: [], searched: false }));
    f.store.set('job:test', job);
    const transfers = new Transfers(f.store, new Fake(f.store));
    transfers.start('test'); await settled(transfers);
    assert.equal(transfers.get('test').items[0].searched, true);
    assert.equal(transfers.get('test').state, 'paused');
    blocked = false; transfers.start('test'); await settled(transfers);
    assert.deepEqual(calls, ['a', 'b', 'b']);
    assert.equal(transfers.get('test').phase, 'review');
    assert.equal(transfers.get('test').destinationId, undefined);
  } finally { f.cleanup(); }
});
test('restarts pause active jobs; changed accounts and post-approval edits are rejected', () => {
  const f = fixture();
  try {
    const job = reviewJob(); job.state = 'running'; job.phase = 'transferring';
    f.store.set('job:test', job);
    const transfers = new Transfers(f.store, new Providers(f.store));
    assert.equal(transfers.get('test').state, 'paused');
    assert.throws(() => transfers.select('test', 0, 'a'), /only be changed/);
    f.store.saveCredentials('youtube', { access_token: 'x', expiresAt: Date.now(), account: { id: 'other', name: 'Other' } });
    assert.throws(() => transfers.start('test'), /original accounts/);
  } finally { f.cleanup(); }
});
test('tokens are encrypted in SQLite and decrypt only through the store', () => {
  const f = fixture();
  try {
    assert.equal(f.store.credentials('spotify')?.access_token, 'spotify-private-token');
    const raw = f.store.get<string>('account:spotify')!;
    assert.equal(raw.includes('private-token'), false);
    assert.equal(raw.includes('private-refresh'), false);
  } finally { f.cleanup(); }
});
test('matching prefers official videos and penalizes unrequested covers', () => {
  const source = { ...track('a'), title: 'Midnight City', artist: 'M83' };
  const ranked = rank(source, [
    { ...track('cover'), title: 'M83 Midnight City cover', artist: 'Other' },
    { ...track('official'), title: 'M83 - Midnight City (Official Video)', artist: 'M83' },
  ], 'youtube');
  assert.equal(ranked[0].id, 'official');
  assert.deepEqual(splitVideoTitle('M83 - Midnight City (Official Video)', 'M83'), { artist: 'M83', title: 'Midnight City' });
});
test('quota errors are actionable rather than silently skipping tracks', async () => {
  const response = new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 });
  await assert.rejects(readResponse(response), /Progress is saved.*midnight Pacific/);
});
test('Spotify adapter paginates new item fields and preserves unavailable positions', async () => {
  const f = fixture();
  try {
    const calls: string[] = [];
    class Fake extends Providers {
      override async api(_p: Provider, path: string) {
        calls.push(path);
        return calls.length === 1 ? { items: [{ item: { id: 'a', name: 'A', type: 'track', artists: [{ name: 'Artist' }] } }, { item: null }], next: 'https://api.spotify.com/v1/next-page' } : { items: [{ item: { id: 'b', name: 'B', type: 'track', artists: [] } }], next: null };
      }
    }
    const result = await new Fake(f.store).tracks('spotify', 'playlist');
    assert.equal(calls.length, 2);
    assert.deepEqual(result.map(t => t.id), ['a', 'unavailable-1', 'b']);
    assert.equal(result[1].unavailable, true);
  } finally { f.cleanup(); }
});
test('destination creation recovers a playlist using its durable marker', async () => {
  const f = fixture();
  try {
    let posted = false;
    class Fake extends Providers {
      override async playlists() { return [{ id: 'existing', name: 'Recovered', description: '[bridge:test]', count: 0, url: 'https://example.com', transferable: true }]; }
      override async api() { posted = true; return {}; }
    }
    const playlist = await new Fake(f.store).createPlaylist('youtube', 'Test', '[bridge:test]');
    assert.equal(playlist.id, 'existing'); assert.equal(posted, false);
  } finally { f.cleanup(); }
});
