import { SignInButton, useAuth } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeftRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/workspace/page-header';
import { Workspace } from '@/components/workspace/workspace';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

export const Route = createFileRoute('/')({ component: App });

export function App() {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setConnectionError(params.get('connectionError'));
    if (params.has('connectionError')) window.history.replaceState(null, '', '/');
  }, []);

  const publishableConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  return <div className="flex flex-col gap-8">
    <PageHeader />
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
      <EmptyDescription>Your connected music accounts and transfer reviews belong to your Clerk account.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><SignInButton mode="modal"><Button variant="brand">Sign in to continue</Button></SignInButton></EmptyContent>
  </Empty>;
  return <Workspace userId={userId} />;
}
