import { ClerkProvider } from '@clerk/tanstack-react-start';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import iconUrl from '../../assets/icon.svg?url';
import '../styles.css';

function Document({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }, { name: 'theme-color', content: '#163d67' }, { title: 'Playlist Bridge' }], links: [{ rel: 'icon', type: 'image/svg+xml', href: iconUrl }] }),
  component: Root,
});

function Root() {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const page = <Document><Outlet /></Document>;
  return key ? <ClerkProvider publishableKey={key}>{page}</ClerkProvider> : page;
}
