import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { RequireSignIn } from '@/components/pages/require-sign-in';
import { TransferHistory, historyDescription, historyTitle } from '@/components/pages/transfer-history';

export const Route = createFileRoute('/history')({
  head: () => ({ meta: [{ title: 'Transfer history — Setlist' }] }),
  component: HistoryPage,
});

export function HistoryPage() {
  return <RequireSignIn header={<PageHeader title={historyTitle} description={historyDescription} />}>{() => <TransferHistory />}</RequireSignIn>;
}
