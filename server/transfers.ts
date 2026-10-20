import { randomUUID } from 'node:crypto';
import type { Candidate, Job, Provider } from '../shared/types.ts';
import { Providers, ServiceError } from './providers.ts';
import { Store } from './store.ts';

export class Transfers {
  active = new Set<string>();
  constructor(public store: Store, public providers: Providers) {
    for (const job of store.list<Job>('job:')) if (job.state === 'running') {
      job.state = 'paused'; job.message = 'The app restarted. Resume to continue from saved progress.'; this.save(job);
    }
  }
  save(job: Job) { job.updatedAt = new Date().toISOString(); this.store.set(`job:${job.id}`, job); }
  get(id: string) {
    const job = this.store.get<Job>(`job:${id}`);
    if (!job) throw new ServiceError('Transfer not found.', 404);
    return job;
  }
  accounts(job: Job) {
    if (this.store.credentials(job.source)?.account.id !== job.sourceAccount || this.store.credentials(job.destination)?.account.id !== job.destinationAccount) throw new ServiceError('Reconnect the original accounts for this transfer.');
  }
  async create(source: Provider, playlistId: string, name: string) {
    const destination = source === 'spotify' ? 'youtube' : 'spotify';
    const sourceAccount = this.store.credentials(source)?.account.id;
    const destinationAccount = this.store.credentials(destination)?.account.id;
    if (!sourceAccount || !destinationAccount) throw new ServiceError('Connect both accounts before starting a transfer.');
    const playlists = await this.providers.playlists(source);
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist?.transferable) throw new ServiceError('This playlist is unavailable for transfer. Spotify only exposes tracks for playlists you own or collaborate on.');
    const tracks = await this.providers.tracks(source, playlistId);
    if (!tracks.length) throw new ServiceError('This playlist has no accessible tracks.');
    const job: Job = { id: randomUUID(), source, destination, sourceAccount, destinationAccount, name: name || playlist.name,
      items: tracks.map(t => ({ source: t, candidates: [], selected: null, searched: Boolean(t.unavailable) })),
      phase: 'matching', state: 'idle', inserted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.save(job);
    this.start(job.id);
    return this.get(job.id);
  }
  start(id: string) {
    if (this.active.has(id)) throw new ServiceError('This transfer is already running.', 409);
    const job = this.get(id);
    if (job.phase === 'complete') return;
    this.accounts(job);
    if (job.phase === 'review') throw new ServiceError('Review the matches and choose Create playlist.');
    job.state = 'running'; job.message = undefined; this.save(job);
    this.active.add(id);
    void this.run(job).catch(error => {
      job.state = 'paused'; job.message = error instanceof Error ? error.message : 'Transfer paused. Retry to continue.'; this.save(job);
    }).finally(() => this.active.delete(id));
  }
  async run(job: Job) {
    if (job.phase === 'matching') {
      for (const item of job.items) {
        if (item.searched) continue;
        this.accounts(job);
        item.candidates = await this.providers.search(job.destination, item.source);
        item.selected = item.candidates[0] || null;
        item.searched = true;
        this.save(job);
      }
      job.phase = 'review'; job.state = 'idle'; this.save(job);
      return;
    }
    this.accounts(job);
    const expected = job.items.flatMap(item => item.selected ? [item.selected.id] : []);
    if (!job.destinationId) {
      const playlist = await this.providers.createPlaylist(job.destination, job.name, `[bridge:${job.id}]`);
      job.destinationId = playlist.id; job.destinationUrl = playlist.url; this.save(job);
    }
    const actual = await this.providers.tracks(job.destination, job.destinationId);
    const offset = reconcile(expected, actual.map(t => t.id));
    job.inserted = offset; this.save(job);
    for (let i = offset; i < expected.length; i++) {
      this.accounts(job);
      await this.providers.insert(job.destination, job.destinationId, expected[i]);
      job.inserted = i + 1; this.save(job);
    }
    job.phase = 'complete'; job.state = 'idle'; this.save(job);
  }
  editable(id: string) {
    const job = this.get(id);
    if (this.active.has(id) || job.phase !== 'review' || job.destinationId) throw new ServiceError('Matches can only be changed during review.', 409);
    this.accounts(job);
    return job;
  }
  select(id: string, index: number, candidateId: string | null) {
    const job = this.editable(id);
    const item = job.items[index];
    if (!item) throw new ServiceError('Track not found.', 404);
    const candidate = candidateId === null ? null : item.candidates.find(c => c.id === candidateId);
    if (candidate === undefined) throw new ServiceError('Choose a candidate from the search results.');
    item.selected = candidate; this.save(job);
    return job;
  }
  async search(id: string, index: number, query: string) {
    const job = this.editable(id);
    const item = job.items[index];
    if (!item || item.source.unavailable) throw new ServiceError('This track is unavailable.');
    const results = await this.providers.search(job.destination, item.source, query);
    // Read again after the network request; a transfer may have started in the meantime.
    const latest = this.editable(id);
    const current = latest.items[index];
    const unique = new Map<string, Candidate>(current.candidates.map(c => [c.id, c]));
    results.forEach(c => unique.set(c.id, c));
    current.candidates = [...unique.values()].sort((a, b) => b.score - a.score);
    this.save(latest);
    return latest;
  }
  approve(id: string) {
    const job = this.editable(id);
    if (!job.items.some(item => item.selected)) throw new ServiceError('Choose at least one track to transfer.');
    job.phase = 'transferring'; this.save(job); this.start(id);
    return this.get(id);
  }
}
export function reconcile(expected: string[], actual: string[]) {
  if (actual.length > expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new ServiceError('The destination playlist changed outside this app. Restore its original transferred order before resuming; no tracks were added.');
  }
  return actual.length;
}
