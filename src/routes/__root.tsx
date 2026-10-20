import { ClerkProvider } from '@clerk/tanstack-react-start';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import iconUrl from '../../assets/icon.svg?url';
import { AppShell } from '@/components/app-shell';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import '../styles.css';

function Document({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><HeadContent /></head><body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>{children}<Toaster richColors closeButton /></TooltipProvider>
    </ThemeProvider>
    <Scripts />
  </body></html>;
}

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }, { name: 'theme-color', content: '#16131f' }, { title: 'Setlist' }], links: [{ rel: 'icon', type: 'image/svg+xml', href: iconUrl }] }),
  component: Root,
});

function Root() {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const page = <Document><AppShell><Outlet /></AppShell></Document>;
  return key ? <ClerkProvider publishableKey={key}>{page}</ClerkProvider> : page;
}
