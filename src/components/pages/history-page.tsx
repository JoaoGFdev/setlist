import { PageHeader } from '@/components/page-header';
import { RequireSignIn } from '@/components/pages/require-sign-in';
import { TransferHistory, historyDescription, historyTitle } from '@/components/pages/transfer-history';


export function HistoryPage() {
  return <RequireSignIn header={<PageHeader title={historyTitle} description={historyDescription} />}>{() => <TransferHistory />}</RequireSignIn>;
}
