import { QueryClient } from '@tanstack/react-query';

// Fresh navigation reads stay local; inactive pages remain available for 30 minutes.
// Infinity still permits explicit invalidation after mutations (unlike 'static').
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  } } });
}

export const userKey = (userId: string | null | undefined) => ['user', userId] as const;
export const resourceKey = (userId: string | null | undefined, path: string) => [...userKey(userId), path] as const;
