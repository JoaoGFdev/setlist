import { SignInButton, useAuth } from '@clerk/tanstack-react-start';
import { LockIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { clerkConfigured } from '@/components/app-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

/** Renders `children` with the Clerk user id once signed in. Any other state shows `header` above its own message. */
export function RequireSignIn({ header, children }: { header: ReactNode; children: (userId: string) => ReactNode }) {
  if (!clerkConfigured()) {
    return <>{header}<Alert><AlertTitle>Sign-in is temporarily unavailable</AlertTitle><AlertDescription>Please try again later.</AlertDescription></Alert></>;
  }
  return <SignedInGate header={header}>{children}</SignedInGate>;
}

function SignedInGate({ header, children }: { header: ReactNode; children: (userId: string) => ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) {
    return <>{header}<div role="status" aria-label="Checking sign-in" className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" />
    </div></>;
  }
  if (!userId) {
    return <>{header}<Empty className="border py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon"><LockIcon /></EmptyMedia>
        <EmptyTitle>Sign in to continue</EmptyTitle>
        <EmptyDescription>Setlist is invite-only. Sign in with your existing account, or accept your email invitation.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><SignInButton mode="modal"><Button variant="brand">Sign in</Button></SignInButton></EmptyContent>
    </Empty></>;
  }
  return <>{children(userId)}</>;
}
