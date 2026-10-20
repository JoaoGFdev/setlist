import { useAuth } from '@clerk/tanstack-react-start';
import { useQueryClient } from '@tanstack/react-query';
import type { JobSummary } from '../../shared/types';
import { api, clearHistory, deleteJob, setPlaylistHidden } from '@/lib/api';
import { resourceKey, userKey } from '@/lib/query-client';

/** Keep shared server data consistent after successful writes, without refetching it. */
export function useDataActions() {
  const { userId } = useAuth();
  const client = useQueryClient();
  function forgetJobs(ids?: string[]) {
    client.setQueryData<JobSummary[]>(resourceKey(userId, '/jobs'), current => ids ? current?.filter(job => !ids.includes(job.id)) : []);
    client.removeQueries({ predicate: query => query.queryKey[0] === 'user' && query.queryKey[1] === userId && typeof query.queryKey[2] === 'string' && query.queryKey[2].startsWith('/jobs/') && (!ids || ids.some(id => query.queryKey[2] === `/jobs/${id}`)) });
  }
  return {
    deleteJob: async (id: string) => { await deleteJob(id); forgetJobs([id]); },
    clearHistory: async () => { await clearHistory(); forgetJobs(); },
    setPlaylistHidden: async (...args: Parameters<typeof setPlaylistHidden>) => {
      const next = await setPlaylistHidden(...args);
      client.setQueryData(resourceKey(userId, '/preferences'), next);
      return next;
    },
    disconnect: async (provider: string) => {
      await api(`/accounts/${provider}/disconnect`, {});
      forgetJobs();
      client.removeQueries({ queryKey: [...userKey(userId), 'playlists', provider] });
      await client.invalidateQueries({ queryKey: resourceKey(userId, '/status') });
    },
  };
}
