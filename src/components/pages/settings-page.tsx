import { PageHeader } from '@/components/page-header';
import { RequireSignIn } from '@/components/pages/require-sign-in';
import { Appearance, ConnectedAccounts, HiddenPlaylists, YourData } from '@/components/pages/settings-sections';


const header = <PageHeader title="Settings" description="Manage your accounts, hidden playlists, appearance and saved data." />;

export function SettingsPage() {
  return <RequireSignIn header={header}>{() => <>
    {header}
    <div className="flex max-w-3xl flex-col gap-6">
      <ConnectedAccounts />
      <HiddenPlaylists />
      <Appearance />
      <YourData />
    </div>
  </>}</RequireSignIn>;
}
