import { useAuth } from '@clerk/tanstack-react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiError } from '@/lib/api';
import { resourceKey } from '@/lib/query-client';

export function useResource<T>(path: string, enabled = true) {
  const { userId, getToken } = useAuth();
  const client = useQueryClient();
  const queryKey = resourceKey(userId, path);
  const query = useQuery({ queryKey, enabled: Boolean(userId) && enabled, queryFn: async () => {
    try { return await api<T>(path); }
    catch (cause) {
      if ((cause as ApiError).status !== 401 || !getToken) throw cause;
      await getToken({ skipCache: true });
      return api<T>(path);
    }
  } });
  const setData = (update: T | ((current: T | undefined) => T)) => client.setQueryData<T>(queryKey, update);
  return { ...query, setData };
}
