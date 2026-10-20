import { SignInButton, UserButton, useAuth } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';
import { ArrowLeftRightIcon, HistoryIcon, Link2Icon, SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import iconUrl from '../../assets/icon.svg?url';
import { providerScopes } from '../../shared/provider-scopes';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: 'Workspace', icon: ArrowLeftRightIcon },
  { to: '/linked', label: 'Linked', icon: Link2Icon },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export const clerkConfigured = () => Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

/** Header, primary navigation and footer shared by every page. */
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh flex-col">
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
          <img src={iconUrl} alt="" className="size-7" /> Setlist
        </Link>
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {nav.map(item => <Link key={item.to} to={item.to} activeOptions={{ exact: item.to === '/' }}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground')}>
            <item.icon data-icon="inline-start" /><span className="hidden sm:inline">{item.label}</span>
          </Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {clerkConfigured() ? <AuthControls /> : <span className="text-xs text-muted-foreground">Sign-in unavailable</span>}
        </div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Personal use. No transfer subscription. No app-imposed song cap.</span>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline">Platform quotas apply; active work advances one request at a time.</span>
          <Separator orientation="vertical" className="hidden h-4 md:block" />
          <Link to="/privacy-policy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms-of-service" className="hover:text-foreground">Terms</Link>
        </div>
      </div>
    </footer>
  </div>;
}

function AuthControls() {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <Spinner aria-label="Loading sign-in" />;
  return userId
    ? <UserButton userProfileProps={{ additionalOAuthScopes: { google: [...providerScopes.youtube], spotify: [...providerScopes.spotify] } }} />
    : <SignInButton mode="modal"><Button size="sm">Sign in</Button></SignInButton>;
}
