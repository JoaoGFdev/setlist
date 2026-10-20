import { createFileRoute } from '@tanstack/react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export const Route = createFileRoute('/linked')({
  head: () => ({ meta: [{ title: 'Linked playlists — Setlist' }] }),
  component: Page,
});

function Page() {
  return <Empty><EmptyHeader><EmptyTitle>Linked playlists</EmptyTitle><EmptyDescription>Coming soon.</EmptyDescription></EmptyHeader></Empty>;
}
