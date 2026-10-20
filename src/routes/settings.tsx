import { createFileRoute } from '@tanstack/react-router';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export const Route = createFileRoute('/settings')({
  head: () => ({ meta: [{ title: 'Settings — Setlist' }] }),
  component: Page,
});

function Page() {
  return <Empty><EmptyHeader><EmptyTitle>Settings</EmptyTitle><EmptyDescription>Coming soon.</EmptyDescription></EmptyHeader></Empty>;
}
