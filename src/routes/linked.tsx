import { createFileRoute } from '@tanstack/react-router';
import { LinkedPage } from '@/components/pages/linked-page';

export const Route = createFileRoute('/linked')({
  head: () => ({ meta: [{ title: 'Linked playlists — Setlist' }] }),
  component: LinkedPage,
});
