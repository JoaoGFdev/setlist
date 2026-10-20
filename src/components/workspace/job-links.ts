import type { JobSummary, Playlist, Provider } from '../../../shared/types';

export type PlaylistLink =
  | { kind: 'linked' | 'in-progress'; job: JobSummary }
  | { kind: 'created'; job: JobSummary };

const newest = (jobs: JobSummary[]) => [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

/** How a library playlist relates to saved transfers: a transfer source, a playlist Setlist created, or neither. */
export function playlistLink(jobs: JobSummary[], provider: Provider, playlist: Pick<Playlist, 'id'>): PlaylistLink | null {
  const asSource = jobs.filter(job => job.source === provider && job.sourcePlaylistId === playlist.id);
  const completed = newest(asSource.filter(job => job.phase === 'complete'));
  if (completed) return { kind: 'linked', job: completed };
  const unfinished = newest(asSource);
  if (unfinished) return { kind: 'in-progress', job: unfinished };
  const created = newest(jobs.filter(job => job.destination === provider && job.destinationId === playlist.id));
  return created ? { kind: 'created', job: created } : null;
}
