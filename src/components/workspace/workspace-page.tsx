import { SignInButton, useAuth } from '@clerk/tanstack-react-start';
import { ArrowLeftRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProviderMark } from '@/components/provider-mark';
import { Workspace } from '@/components/workspace/workspace';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';


export function App() {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setConnectionError(params.get('connectionError'));
    if (params.has('connectionError')) window.history.replaceState(null, '', '/');
  }, []);

  const publishableConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  return <div className="flex flex-col gap-8">
    <PageHeader className="mb-0" title="Your playlists, on both sides." description="Move playlists between Spotify and YouTube, with a say in every match."
      actions={<div aria-hidden="true" className="hidden items-center gap-3 text-muted-foreground sm:flex">
        <ProviderMark provider="spotify" className="size-10" /><ArrowLeftRightIcon /><ProviderMark provider="youtube" className="size-10" />
      </div>} />
    {connectionError ? <Alert variant="destructive">
      <AlertDescription>{connectionError}</AlertDescription>
      <AlertAction><Button variant="outline" size="xs" onClick={() => setConnectionError(null)}>Dismiss</Button></AlertAction>
    </Alert> : null}
    {!publishableConfigured ? <Alert role="status"><AlertDescription>Sign-in is temporarily unavailable. Please try again later.</AlertDescription></Alert> : null}
    {publishableConfigured ? <AuthSession /> : null}
  </div>;
}

function AuthSession() {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-label="Checking sign-in" />Checking sign-in…</div>;
  if (!userId) return <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon"><ArrowLeftRightIcon /></EmptyMedia>
      <EmptyTitle>Sign in to your private workspace</EmptyTitle>
      <EmptyDescription>Setlist is invite-only. Sign in with your existing account, or accept the invitation sent to your email.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><SignInButton mode="modal"><Button variant="brand">Sign in to continue</Button></SignInButton></EmptyContent>
  </Empty>;
  return <Workspace key={userId} userId={userId} />;
}
