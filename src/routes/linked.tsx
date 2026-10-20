import { createFileRoute } from '@tanstack/react-router';
import { LinkedPlaylists } from '@/components/pages/linked-playlists';
import { PageHeader } from '@/components/pages/page-header';
import { RequireSignIn } from '@/components/pages/require-sign-in';

export const Route = createFileRoute('/linked')({
  head: () => ({ meta: [{ title: 'Linked playlists — Setlist' }] }),
  component: LinkedPage,
});

const header = <PageHeader title="Linked playlists" description="See which playlists already have a counterpart on the other service." />;

export function LinkedPage() {
  return <RequireSignIn header={header}>{() => <>{header}<LinkedPlaylists /></>}</RequireSignIn>;
}
