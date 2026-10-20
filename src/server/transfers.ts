import type { Candidate, FullJob, JobItem, JobSummary, Provider } from '../../shared/types';
import type { Store } from './store';
import { Providers, ServiceError } from './providers';

const LEASE = 'workspace';
const LEASE_TTL = 60_000;
// Leave one day for the scheduled purge so data is physically removed within 30 days.
const WORKSPACE_RETENTION_MS = 29 * 24 * 60 * 60 * 1000;
const ITEM_PREFIX = (id: string) => `item:${id}:`;
const EXPECTED_KEY = (id: string) => `expected:${id}`;
const itemKey = (id: string, position: number) => `${ITEM_PREFIX(id)}${String(position).padStart(8, '0')}`;
const timestamp = () => new Date().toISOString();

export function reconcile(expected: string[], actual: string[], offset = 0): void {
  if (offset + actual.length > expected.length || actual.some((id, index) => id !== expected[offset + index])) {
    throw new ServiceError('The destination playlist changed outside this app. Restore its original transferred order before resuming; no tracks were added.', 409);
  }
}

export class Transfers {
  constructor(readonly store: Store, readonly providers: Providers) {}

  private async withLease<T>(work: (token: string) => Promise<T>): Promise<T> {
    const token = await this.store.acquireLease(LEASE, LEASE_TTL);
    if (!token) throw new ServiceError('Another operation is active. Wait a moment, then retry.', 409);
    try { return await work(token); }
    finally { await this.store.releaseLease(LEASE, token); }
  }
  private async assertLease(token: string) { await this.store.assertLease(LEASE, token); }
  private async save(job: JobSummary, token: string) {
    await this.assertLease(token);
    job.updatedAt = timestamp();
    await this.store.set(`job:${job.id}`, { ...job, expiresAt: Date.parse(job.createdAt) + WORKSPACE_RETENTION_MS });
  }
  async get(id: string): Promise<FullJob> {
    const job = await this.store.get<JobSummary>(`job:${id}`);
    if (!job) throw new ServiceError('Transfer not found.', 404);
    const items = await this.store.list<JobItem>(ITEM_PREFIX(id));
    return { ...job, items };
  }
  async summary(id: string): Promise<JobSummary> {
    const job = await this.store.get<JobSummary>(`job:${id}`);
    if (!job) throw new ServiceError('Transfer not found.', 404);
    return job;
  }
  async list(): Promise<JobSummary[]> {
    return (await this.store.list<JobSummary>('job:')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async requiredJob(id: string): Promise<JobSummary> {
    const job = await this.store.get<JobSummary>(`job:${id}`);
    if (!job) throw new ServiceError('Transfer not found.', 404);
    return job;
  }
  private async assertAccounts(job: JobSummary) {
    const [source, destination] = await Promise.all([
      this.store.credentials(job.source), this.store.credentials(job.destination),
    ]);
    if (source?.account.id !== job.sourceAccount || destination?.account.id !== job.destinationAccount) {
      throw new ServiceError('Reconnect the original accounts for this transfer.', 409);
    }
  }
  private async editable(id: string): Promise<{ job: JobSummary; items: JobItem[] }> {
    const job = await this.requiredJob(id);
    if (job.phase !== 'review' || job.destinationId) throw new ServiceError('Matches can only be changed during review.', 409);
    await this.assertAccounts(job);
    return { job, items: await this.store.list<JobItem>(ITEM_PREFIX(id)) };
  }

  async create(source: Provider, playlistId: string, name: string): Promise<FullJob> {
    return this.withLease(async (token) => {
      const destination = source === 'spotify' ? 'youtube' : 'spotify';
      const [sourceCredentials, destinationCredentials] = await Promise.all([
        this.store.credentials(source), this.store.credentials(destination),
      ]);
      if (!sourceCredentials || !destinationCredentials) throw new ServiceError('Connect both accounts before starting a transfer.', 401);
      const playlist = await this.providers.playlist(source, playlistId);
      await this.assertLease(token);
      if (!playlist.transferable) throw new ServiceError('This playlist is unavailable for transfer. Spotify only exposes tracks for playlists you own or collaborate on.');
      const now = timestamp();
      const job: JobSummary = {
        id: crypto.randomUUID(), source, destination, sourceAccount: sourceCredentials.account.id,
        destinationAccount: destinationCredentials.account.id, sourcePlaylistId: playlist.id, name: name || playlist.name,
        phase: 'loading', state: 'running', sourcePosition: 0, sourceDone: false, matchPosition: 0,
        discoveryMatches: 0, createAttempted: false,
        reconcilePosition: 0, reconcileChecked: 0, inserted: 0,
        totalCount: 0, matchedCount: 0, selectedCount: 0, createdAt: now, updatedAt: now,
      };
      await this.save(job, token);
      return { ...job, items: [] };
    });
  }

  async step(id: string): Promise<JobSummary> {
    return this.withLease(async (token) => {
      const job = await this.requiredJob(id);
      if (job.phase === 'complete') return job;
      if (job.state !== 'running') throw new ServiceError('Resume this transfer before asking for another step.', 409);
      await this.assertAccounts(job);
      try {
        if (job.phase === 'loading') return await this.loadPage(job, token);
        if (job.phase === 'matching') return await this.matchOne(job, token);
        if (job.phase === 'transferring') return await this.transferStep(job, token);
        throw new ServiceError('This transfer is waiting for review.', 409);
      } catch (error) {
        try {
          await this.assertLease(token);
          const durable = await this.requiredJob(id);
          durable.state = 'paused';
          durable.message = error instanceof Error ? error.message : 'Transfer paused. Retry to continue.';
          await this.save(durable, token);
        } catch { /* Lease expiry means this invocation no longer owns the checkpoint. */ }
        throw error;
      }
    });
  }
  private async loadPage(job: JobSummary, token: string): Promise<JobSummary> {
    if (job.sourceDone) {
      job.phase = 'matching';
      await this.save(job, token);
      return job;
    }
    const page = await this.providers.sourcePage(job.source, job.sourcePlaylistId, job.sourceCursor);
    await this.assertLease(token);
    const entries = page.items.map((source): JobItem => ({ source, candidates: [], selected: null, searched: Boolean(source.unavailable) }));
    if (entries.length) {
      await this.assertLease(token);
      const expiresAt = Date.parse(job.createdAt) + WORKSPACE_RETENTION_MS;
      await this.store.setMany(entries.map((value, index) => ({ key: itemKey(job.id, job.sourcePosition + index), value: { ...value, expiresAt } })));
    }
    await this.assertLease(token);
    job.sourcePosition += entries.length;
    job.totalCount = job.sourcePosition;
    job.matchedCount += entries.filter((item) => item.searched).length;
    job.sourceCursor = page.nextCursor;
    job.sourceDone = !page.nextCursor;
    if (job.sourceDone) {
      if (!job.totalCount) throw new ServiceError('This playlist has no accessible tracks.');
      job.phase = 'matching';
    }
    await this.save(job, token);
    return job;
  }
  private async matchOne(job: JobSummary, token: string): Promise<JobSummary> {
    const index = job.matchPosition;
    const key = itemKey(job.id, index);
    const current = await this.store.get<JobItem>(key);
    if (!current) throw new ServiceError('A saved source track is missing. Resume after storage is available.', 500);
    if (current.searched) {
      job.matchPosition += 1;
      if (job.matchPosition >= job.totalCount) { job.phase = 'review'; job.state = 'idle'; job.message = undefined; }
      await this.save(job, token);
      return job;
    }
    const candidates = await this.providers.search(job.destination, current.source);
    await this.assertLease(token);
    const expiresAt = Date.parse(job.createdAt) + WORKSPACE_RETENTION_MS;
    const item = { ...current, candidates, selected: candidates[0] || null, searched: true, expiresAt };
    job.matchedCount += 1;
    if (item.selected) job.selectedCount += 1;
    job.matchPosition += 1;
    if (job.matchPosition >= job.totalCount) { job.phase = 'review'; job.state = 'idle'; }
    await this.assertLease(token);
    job.updatedAt = timestamp();
    await this.store.setMany([{ key, value: item }, { key: `job:${job.id}`, value: { ...job, expiresAt } }]);
    return job;
  }
  async select(id: string, index: number, candidateId: string | null): Promise<FullJob> {
    return this.withLease(async (token) => {
      const { job } = await this.editable(id);
      const key = itemKey(id, index); const item = await this.store.get<JobItem>(key);
      if (!item) throw new ServiceError('Track not found.', 404);
      const candidate = candidateId === null ? null : item.candidates.find((entry) => entry.id === candidateId);
      if (candidate === undefined) throw new ServiceError('Choose a candidate from the search results.');
      await this.assertLease(token);
      job.selectedCount += Number(Boolean(candidate)) - Number(Boolean(item.selected));
      job.updatedAt = timestamp();
      const expiresAt = Date.parse(job.createdAt) + WORKSPACE_RETENTION_MS;
      await this.store.setMany([{ key, value: { ...item, selected: candidate, expiresAt } }, { key: `job:${job.id}`, value: { ...job, expiresAt } }]);
      return this.get(id);
    });
  }
  async search(id: string, index: number, query: string): Promise<FullJob> {
    return this.withLease(async (token) => {
      const { job } = await this.editable(id);
      const key = itemKey(id, index); const item = await this.store.get<JobItem>(key);
      if (!item || item.source.unavailable) throw new ServiceError('This track is unavailable.', 404);
      const results = await this.providers.search(job.destination, item.source, query);
      await this.assertLease(token);
      const unique = new Map<string, Candidate>(item.candidates.map((candidate) => [candidate.id, candidate]));
      results.forEach((candidate) => unique.set(candidate.id, candidate));
      const candidates = [...unique.values()].sort((a, b) => b.score - a.score);
      const expiresAt = Date.parse(job.createdAt) + WORKSPACE_RETENTION_MS;
      await this.store.set(key, { ...item, candidates, searched: true, expiresAt });
      await this.save(job, token);
      return this.get(id);
    });
  }
  async approve(id: string): Promise<FullJob> {
    return this.withLease(async (token) => {
      const { job, items } = await this.editable(id);
      const expected = items.flatMap((item) => item.selected ? [item.selected.id] : []);
      if (!expected.length) throw new ServiceError('Choose at least one track to transfer.');
      job.phase = 'transferring'; job.state = 'running'; job.message = undefined;
      job.destinationId = undefined; job.destinationUrl = undefined;
      job.discoveryCursor = undefined; job.discoveryCandidateId = undefined; job.discoveryCandidateUrl = undefined;
      job.discoveryMatches = 0; job.createAttempted = false;
      job.reconcileCursor = undefined; job.reconcilePosition = 0; job.reconcileChecked = 0; job.inserted = 0;
      await this.assertLease(token);
      job.updatedAt = timestamp();
      const expiresAt = Date.parse(job.createdAt) + WORKSPACE_RETENTION_MS;
      await this.store.setMany([{ key: `job:${job.id}`, value: { ...job, expiresAt } }, { key: EXPECTED_KEY(job.id), value: { ids: expected, expiresAt } }]);
      return this.get(id);
    });
  }
  async resume(id: string): Promise<FullJob> {
    return this.withLease(async (token) => {
      const job = await this.requiredJob(id);
      if (job.phase === 'complete') return this.get(id);
      if (job.phase === 'review') throw new ServiceError('Review the matches and choose Create playlist.', 409);
      await this.assertAccounts(job);
      job.state = 'running'; job.message = undefined;
      if (job.phase === 'transferring' && job.destinationId) {
        job.reconcileCursor = undefined; job.reconcilePosition = 0; job.reconcileChecked = 0;
      } else if (job.phase === 'transferring') {
        job.discoveryCursor = undefined; job.discoveryCandidateId = undefined; job.discoveryCandidateUrl = undefined;
        job.discoveryMatches = 0;
      }
      await this.save(job, token);
      return this.get(id);
    });
  }

  private async transferStep(job: JobSummary, token: string): Promise<JobSummary> {
    const expectedData = await this.store.get<{ ids: string[] }>(EXPECTED_KEY(job.id));
    const expected = expectedData?.ids;
    if (!expected?.length) throw new ServiceError('The approved transfer list is missing. Review and approve this transfer again.', 409);
    if (!job.destinationId) return this.discoverOrCreate(job, token);
    if (job.reconcilePosition < 0) throw new ServiceError('Invalid saved reconciliation position.', 500);
    if (job.reconcileCursor !== '__done__') return this.reconcilePage(job, token);
    if (job.inserted >= expected.length) {
      job.phase = 'complete'; job.state = 'idle'; job.message = undefined;
      await this.save(job, token);
      return job;
    }
    const itemId = expected[job.inserted];
    job.reconcileCursor = undefined; job.reconcilePosition = 0; job.reconcileChecked = 0;
    await this.save(job, token);
    await this.providers.insert(job.destination, job.destinationId, itemId);
    await this.assertLease(token);
    job.inserted += 1;
    job.reconcileCursor = '__done__';
    job.reconcilePosition = job.inserted;
    job.reconcileChecked = job.inserted;
    await this.save(job, token);
    return job;
  }
  private async discoverOrCreate(job: JobSummary, token: string): Promise<JobSummary> {
    // Scan every destination page before accepting a marker; repeated ambiguous creates can surface duplicates later.
    if (job.discoveryCursor !== '__ready__') {
      const page = await this.providers.discoverMarkedPlaylist(job.destination, `[bridge:${job.id}]`, job.discoveryCursor);
      await this.assertLease(token);
      job.discoveryMatches += page.items.length;
      if (job.discoveryMatches > 1) throw new ServiceError('Multiple destination playlists have this transfer marker. Resolve the duplicates before resuming.', 409);
      if (page.items[0]) {
        job.discoveryCandidateId = page.items[0].id;
        job.discoveryCandidateUrl = page.items[0].url;
      }
      if (page.nextCursor) job.discoveryCursor = page.nextCursor;
      else if (job.discoveryMatches === 1) {
        job.destinationId = job.discoveryCandidateId;
        job.destinationUrl = job.discoveryCandidateUrl;
        job.discoveryCursor = undefined; job.createAttempted = false;
        job.discoveryMatches = 0; job.discoveryCandidateId = undefined; job.discoveryCandidateUrl = undefined;
      } else {
        job.discoveryCursor = '__ready__';
        job.createAttempted = false;
        job.message = undefined;
      }
      await this.save(job, token);
      return job;
    }
    // Checkpoint intent before the write. If the response is lost, next step scans from page one.
    job.createAttempted = true; job.discoveryCursor = undefined; job.discoveryMatches = 0;
    job.discoveryCandidateId = undefined; job.discoveryCandidateUrl = undefined;
    await this.save(job, token);
    const playlist = await this.providers.createPlaylist(job.destination, job.name, `[bridge:${job.id}]`);
    await this.assertLease(token);
    job.destinationId = playlist.id; job.destinationUrl = playlist.url; job.createAttempted = false; job.discoveryCursor = undefined;
    job.discoveryMatches = 0; job.discoveryCandidateId = undefined; job.discoveryCandidateUrl = undefined;
    await this.save(job, token);
    return job;
  }
  private async reconcilePage(job: JobSummary, token: string): Promise<JobSummary> {
    const expectedData = await this.store.get<{ ids: string[] }>(EXPECTED_KEY(job.id));
    const expected = expectedData?.ids;
    if (!expected?.length) throw new ServiceError('The approved transfer list is missing. Review and approve this transfer again.', 409);
    const page = await this.providers.destinationPage(job.destination, job.destinationId!, job.reconcileCursor);
    await this.assertLease(token);
    reconcile(expected, page.items.map((item) => item.id), job.reconcilePosition);
    job.reconcilePosition += page.items.length;
    job.reconcileChecked = job.reconcilePosition;
    if (page.nextCursor) job.reconcileCursor = page.nextCursor;
    else {
      job.reconcileCursor = '__done__';
      job.inserted = job.reconcilePosition;
    }
    await this.save(job, token);
    return job;
  }
}
