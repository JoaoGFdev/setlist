import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/query-client';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = createQueryClient();
  return createRouter({ routeTree, scrollRestoration: true, Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
