import { useCallback, useEffect, useState } from 'react';
import type { JobSummary } from '../../shared/types';
import { api } from '@/lib/api';

/** Loads the saved transfers (newest first) and exposes loading, error and reload state. */
export function useJobs() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<JobSummary[]>('/jobs')
      .then(result => { if (!cancelled) setJobs(result); })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  const refresh = useCallback(() => setVersion(value => value + 1), []);
  const removeLocal = useCallback((ids: string[] | 'all') => setJobs(current => ids === 'all' ? [] : current.filter(job => !ids.includes(job.id))), []);
  return { jobs, loading, error, refresh, removeLocal };
}
