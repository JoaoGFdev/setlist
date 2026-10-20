import { LinkedPlaylists } from '@/components/pages/linked-playlists';
import { PageHeader } from '@/components/page-header';
import { RequireSignIn } from '@/components/pages/require-sign-in';


const header = <PageHeader title="Linked playlists" description="See which playlists already have a counterpart on the other service." />;

export function LinkedPage() {
  return <RequireSignIn header={header}>{() => <>{header}<LinkedPlaylists /></>}</RequireSignIn>;
}
