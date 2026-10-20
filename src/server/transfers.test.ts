import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Candidate, JobSummary, JobItem, Provider, Track } from '../../shared/types';
import type { AppEnv } from './env';
import { Providers, ServiceError, validOAuthBinding } from './providers';
import { Transfers } from './transfers';
import { Store, type Credentials } from './store';

const env = { DB: {} as D1Database, APP_URL: 'https://bridge.example', TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' } satisfies AppEnv;
const accountCredentials = (id: string): Credentials => ({ access_token: `${id}-access`, refresh_token: `${id}-refresh`, expiresAt: Date.now() + 3_600_000, account: { id, name: id } });

class MemoryStore extends Store {
  data = new Map<string, unknown>();
  accounts = new Map<Provider, Credentials>();
  lease?: string;
  failNextSetMany = false;
  constructor() { super(env.DB, 'memory-user', env.TOKEN_ENCRYPTION_KEY); }
  override async get<T>(key: string) { const value = this.data.get(key); return value === undefined ? undefined : structuredClone(value) as T; }
  override async set(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  override async setMany(entries: Array<{ key: string; value: unknown }>) {
    if (this.failNextSetMany) { this.failNextSetMany = false; throw new Error('storage write failed'); }
    for (const entry of entries) this.data.set(entry.key, structuredClone(entry.value));
  }
  override async delete(key: string) { this.data.delete(key); }
  override async list<T>(prefix: string) {
    return [...this.data.entries()].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => structuredClone(value) as T);
  }
  override async credentials(provider: Provider) { const value = this.accounts.get(provider); return value && structuredClone(value); }
  override async saveCredentials(provider: Provider, value: Credentials) { this.accounts.set(provider, structuredClone(value)); }
  override async deleteCredentials(provider: Provider) { this.accounts.delete(provider); }
  override async acquireLease() { if (this.lease) return null; this.lease = crypto.randomUUID(); return this.lease; }
  override async releaseLease(_name: string, token: string) { if (this.lease === token) this.lease = undefined; }
  override async assertLease(_name: string, token: string) { if (this.lease !== token) throw new Error('lease lost'); }
}

const track = (id: string): Track => ({ id, title: `Song ${id}`, artist: 'Artist', url: `https://music.example/${id}` });
const candidate = (id: string): Candidate => ({ ...track(id), score: 90 });
function makeJob(overrides: Partial<JobSummary> = {}): JobSummary {
  const now = new Date().toISOString();
  return {
    id: 'job-test', source: 'spotify', destination: 'youtube', sourceAccount: 'spotify-account', destinationAccount: 'youtube-account',
    sourcePlaylistId: 'source', name: 'Playlist', phase: 'transferring', state: 'running', sourcePosition: 0, sourceDone: true,
    matchPosition: 0, discoveryMatches: 0, createAttempted: false, reconcilePosition: 0, reconcileChecked: 0, inserted: 0,
    totalCount: 0, matchedCount: 0, selectedCount: 0, createdAt: now, updatedAt: now, destinationId: 'destination', destinationUrl: 'https://music.example/destination',
    ...overrides,
  };
}
function setup() {
  const store = new MemoryStore();
  store.accounts.set('spotify', accountCredentials('spotify-account'));
  store.accounts.set('youtube', accountCredentials('youtube-account'));
  const providers = new Providers(store, env);
  const transfers = new Transfers(store, providers);
  return { store, providers, transfers };
}
async function putItems(store: MemoryStore, id: string, items: JobItem[]) {
  await store.setMany(items.map((item, index) => ({ key: `item:${id}:${String(index).padStart(8, '0')}`, value: item })));
}

test('a source load step fetches one page and matching advances one item per step', async () => {
  const { store, providers, transfers } = setup();
  let sourceCalls = 0;
  let searches = 0;
  class Fake extends Providers {
    override async playlist() { return { id: 'source', name: 'Source', description: '', count: 101, url: '', transferable: true }; }
  override async sourcePage() {
      sourceCalls += 1;
      return sourceCalls === 1
        ? { items: [track('a'), track('b')], nextCursor: 'next' }
        : { items: [track('c')] };
    }
    override async search(_provider: Provider, source: Track) { searches += 1; return [candidate(source.id)]; }
  }
  const service = new Fake(store, env);
  const domain = new Transfers(store, service);
  const created = await domain.create('spotify', 'source', 'Source');
  assert.equal(created.phase, 'loading');
  assert.equal(created.state, 'running');
  assert.equal(created.items.length, 0);
  let summary = await domain.step(created.id);
  assert.equal(sourceCalls, 1);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.phase, 'loading');
  summary = await domain.step(created.id);
  assert.equal(sourceCalls, 2);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.phase, 'matching');
  summary = await domain.step(created.id);
  assert.equal(searches, 1);
  assert.equal(summary.matchedCount, 1);
  assert.equal(summary.phase, 'matching');
  await domain.step(created.id);
  summary = await domain.step(created.id);
  assert.equal(searches, 3);
  assert.equal(summary.phase, 'review');
  assert.equal(summary.selectedCount, 3);
}
);

test('an insert response lost after remote success is reconciled before the next write and duplicates keep positions', async () => {
  const { store } = setup();
  const destination: string[] = [];
  let insertCalls = 0;
  let throwAfterFirstSuccess = true;
  class Fake extends Providers {
    override async destinationPage() { return { items: destination.map(track) }; }
    override async insert(_provider: Provider, _playlist: string, id: string) {
      insertCalls += 1; destination.push(id);
      if (throwAfterFirstSuccess) { throwAfterFirstSuccess = false; throw new Error('response lost after provider success'); }
    }
  }
  const transfers = new Transfers(store, new Fake(store, env));
  await store.set('job:job-test', makeJob());
  await store.set('expected:job-test', ['a', 'a']);
  await transfers.step('job-test'); // reconcile the empty destination
  await assert.rejects(transfers.step('job-test'), /response lost/);
  assert.deepEqual(destination, ['a']);
  assert.equal((await transfers.summary('job-test')).state, 'paused');
  await transfers.resume('job-test');
  const reconciled = await transfers.step('job-test');
  assert.equal(reconciled.inserted, 1);
  await transfers.step('job-test');
  assert.deepEqual(destination, ['a', 'a']);
  await transfers.step('job-test'); // reconcile the complete ordered prefix
  const complete = await transfers.step('job-test');
  assert.equal(complete.phase, 'complete');
  assert.equal(insertCalls, 2);
});

test('quota failures preserve the item cursor and pause without skipping a match', async () => {
  const { store } = setup();
  class Fake extends Providers {
  override async search(): Promise<Candidate[]> { throw new ServiceError('YouTube daily quota reached. Progress is saved.', 429); }
  }
  const transfers = new Transfers(store, new Fake(store, env));
  const job = makeJob({ phase: 'matching', state: 'running', destinationId: undefined, totalCount: 1, matchPosition: 0 });
  const item: JobItem = { source: track('a'), candidates: [], selected: null, searched: false };
  await store.set('job:job-test', job); await putItems(store, job.id, [item]);
  await assert.rejects(transfers.step(job.id), /quota/);
  const saved = await transfers.get(job.id);
  assert.equal(saved.state, 'paused');
  assert.equal(saved.matchPosition, 0);
  assert.equal(saved.items[0].searched, false);
});

test('a failed item plus metadata commit pauses from the last durable cursor', async () => {
  const { store } = setup();
  class Fake extends Providers {
    override async search(_provider: Provider, source: Track) { return [candidate(source.id)]; }
  }
  const transfers = new Transfers(store, new Fake(store, env));
  const job = makeJob({ phase: 'matching', state: 'running', destinationId: undefined, totalCount: 1, matchPosition: 0 });
  const item: JobItem = { source: track('a'), candidates: [], selected: null, searched: false };
  await store.set('job:job-test', job); await putItems(store, job.id, [item]);
  store.failNextSetMany = true;
  await assert.rejects(transfers.step(job.id), /storage write failed/);
  const saved = await transfers.get(job.id);
  assert.equal(saved.state, 'paused');
  assert.equal(saved.matchPosition, 0);
  assert.equal(saved.matchedCount, 0);
  assert.equal(saved.items[0].searched, false);
});

test('unavailable source positions advance one step without blocking later matches', async () => {
  const { store } = setup();
  let searches = 0;
  class Fake extends Providers {
    override async search(_provider: Provider, source: Track) { searches += 1; return [candidate(source.id)]; }
  }
  const transfers = new Transfers(store, new Fake(store, env));
  const job = makeJob({ phase: 'matching', state: 'running', destinationId: undefined, totalCount: 2, matchPosition: 0, matchedCount: 1 });
  await store.set('job:job-test', job);
  await putItems(store, job.id, [
    { source: { ...track('unavailable'), unavailable: true }, candidates: [], selected: null, searched: true },
    { source: track('available'), candidates: [], selected: null, searched: false },
  ]);
  await transfers.step(job.id);
  assert.equal(searches, 0);
  assert.equal((await transfers.summary(job.id)).matchPosition, 1);
  const last = await transfers.step(job.id);
  assert.equal(searches, 1);
  assert.equal(last.phase, 'review');
  assert.equal(last.matchedCount, 2);
});

test('review edits validate candidates, adjust only counters, and are rejected after approval', async () => {
  const { store } = setup();
  const transfers = new Transfers(store, new Providers(store, env));
  const chosen = candidate('a');
  const job = makeJob({ phase: 'review', state: 'idle', destinationId: undefined, totalCount: 1, selectedCount: 0 });
  await store.set('job:job-test', job);
  await putItems(store, job.id, [{ source: track('src'), candidates: [chosen], selected: null, searched: true }]);
  const selected = await transfers.select(job.id, 0, chosen.id);
  assert.equal(selected.selectedCount, 1);
  await assert.rejects(transfers.select(job.id, 0, 'foreign'), /candidate/);
  const approved = await transfers.approve(job.id);
  assert.equal(approved.phase, 'transferring');
  await assert.rejects(transfers.select(job.id, 0, null), /only be changed/);
});

test('destination discovery is paginated and an ambiguous create forces a fresh marker scan', async () => {
  const { store } = setup();
  const seen: Array<string | undefined> = [];
  let created = 0;
  class Fake extends Providers {
    override async discoverMarkedPlaylist(_provider: Provider, _marker: string, cursor?: string) {
      seen.push(cursor);
      return cursor ? { items: [] } : { items: [], nextCursor: 'page-two' };
    }
    override async createPlaylist(): Promise<{ id: string; url: string }> { created += 1; throw new Error('ambiguous create timeout'); }
  }
  const transfers = new Transfers(store, new Fake(store, env));
  await store.set('job:job-test', makeJob({ destinationId: undefined, discoveryCursor: undefined }));
  await store.set('expected:job-test', ['a', 'a']);
  await transfers.step('job-test');
  await transfers.step('job-test');
  await assert.rejects(transfers.step('job-test'), /ambiguous create/);
  await transfers.resume('job-test');
  await transfers.step('job-test');
  assert.deepEqual(seen, [undefined, 'page-two', undefined]);
  assert.equal(created, 1);
});

test('marker discovery scans later pages and pauses when the same transfer marker appears twice', async () => {
  const { store } = setup();
  const destinationPages = [
    { items: [{ id: 'dest-one', url: 'https://music.example/one' }], nextCursor: 'page-two' },
    { items: [{ id: 'dest-two', url: 'https://music.example/two' }] },
  ];
  let creates = 0;
  let inserts = 0;
  class Fake extends Providers {
    override async discoverMarkedPlaylist() { return destinationPages.shift()!; }
    override async createPlaylist(): Promise<{ id: string; url: string }> { creates += 1; return { id: 'new', url: 'https://music.example/new' }; }
    override async insert() { inserts += 1; }
  }
  const transfers = new Transfers(store, new Fake(store, env));
  await store.set('job:job-test', makeJob({ destinationId: undefined }));
  await store.set('expected:job-test', ['a']);
  await transfers.step('job-test');
  assert.equal((await transfers.summary('job-test')).discoveryCandidateId, 'dest-one');
  await assert.rejects(transfers.step('job-test'), (error: unknown) => error instanceof ServiceError && error.status === 409);
  const paused = await transfers.summary('job-test');
  assert.equal(paused.state, 'paused');
  assert.equal(paused.destinationId, undefined);
  assert.equal(creates, 0);
  assert.equal(inserts, 0);
});

test('summaries never load item documents and preserve source account identity', async () => {
  const { store, transfers } = setup();
  const job = makeJob({ phase: 'review', state: 'idle', destinationId: undefined });
  await store.set('job:job-test', job);
  await putItems(store, job.id, [{ source: track('a'), candidates: [], selected: null, searched: true }]);
  const summary = await transfers.list();
  assert.equal(summary[0].totalCount, 0);
  assert.equal('items' in summary[0], false);
  store.accounts.set('youtube', accountCredentials('different-account'));
  await assert.rejects(transfers.approve(job.id), /original accounts/);
});

test('OAuth callback binding rejects replay, a different user, provider, cookie, and expiry', () => {
  const pending = { provider: 'spotify' as const, browser: 'cookie-secret', userId: 'user-a', expiresAt: 2_000 };
  assert.equal(validOAuthBinding(pending, 'spotify', 'cookie-secret', 'user-a', 1_999), true);
  assert.equal(validOAuthBinding(pending, 'spotify', 'cookie-secret', 'user-a', 2_000), false);
  assert.equal(validOAuthBinding(pending, 'spotify', 'cookie-secret', 'user-a', 2_001), false);
  assert.equal(validOAuthBinding(pending, 'spotify', 'cookie-secret', 'user-b', 1_999), false);
  assert.equal(validOAuthBinding(pending, 'youtube', 'cookie-secret', 'user-a', 1_999), false);
  assert.equal(validOAuthBinding(pending, 'spotify', 'other-cookie', 'user-a', 1_999), false);
  assert.equal(validOAuthBinding(undefined, 'spotify', 'cookie-secret', 'user-a', 1_999), false);
});
