import type { JobSummary } from '../../shared/types';
import { useResource } from './use-resource';

/** Shared with the workspace and linked playlists; navigation reuses the same data. */
export function useJobs() {
  const query = useResource<JobSummary[]>('/jobs');
  const removeLocal = (ids: string[] | 'all') => query.setData(current => ids === 'all' ? [] : (current ?? []).filter(job => !ids.includes(job.id)));
  return { jobs: query.data ?? [], loading: query.isPending, error: query.error?.message ?? null, refresh: () => { void query.refetch(); }, removeLocal };
}
