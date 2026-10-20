import { Link } from '@tanstack/react-router';
import { EyeIcon, EyeOffIcon, MonitorIcon, MoonIcon, SunIcon, Trash2Icon, UnplugIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { HiddenPlaylist, Preferences, Provider, Status } from '../../../shared/types';
import { useDataActions } from '@/hooks/use-data-actions';
import { useResource } from '@/hooks/use-resource';
import { ClearHistoryDialog } from '@/components/pages/clear-history-dialog';
import { ConfirmDialog } from '@/components/pages/confirm-dialog';
import { Cover, RelativeDate } from '@/components/pages/job-display';
import { RetryAlert } from '@/components/pages/retry-alert';
import { ProviderMark } from '@/components/provider-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { providerNames, providers } from '@/lib/api';

export function ConnectedAccounts() {
  const { disconnect } = useDataActions();
  const query = useResource<Status>('/status');
  const status = query.data;
  const error = query.error?.message;
  const load = () => { void query.refetch(); };
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);

  return <Card>
    <CardHeader>
      <CardTitle>Connected accounts</CardTitle>
      <CardDescription>The Spotify and YouTube libraries Setlist can read and add playlists to.</CardDescription>
    </CardHeader>
    <CardContent>
      {error ? <RetryAlert title="Could not load your accounts" message={error} onRetry={load} />
        : !status ? <div role="status" aria-label="Loading accounts" className="flex flex-col gap-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        : <ItemGroup className="gap-2">
          {providers.map(provider => {
            const account = status.accounts[provider];
            const problem = status.connectionErrors?.[provider];
            return <Item key={provider} variant="outline" role="listitem">
              <ItemMedia><ProviderMark provider={provider} /></ItemMedia>
              <ItemContent>
                <ItemTitle>{providerNames[provider]}</ItemTitle>
                <ItemDescription>{account ? account.name : 'Not connected'}</ItemDescription>
                {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
              </ItemContent>
              <ItemActions>
                {account
                  ? <Button variant="outline" size="sm" aria-label={`Disconnect ${providerNames[provider]}`} onClick={() => setDisconnecting(provider)}><UnplugIcon data-icon="inline-start" />Disconnect</Button>
                  : <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/" />}>Connect in workspace</Button>}
              </ItemActions>
            </Item>;
          })}
        </ItemGroup>}
    </CardContent>
    <ConfirmDialog open={disconnecting !== null} onOpenChange={open => { if (!open) setDisconnecting(null); }}
      title={`Disconnect ${disconnecting ? providerNames[disconnecting] : ''}?`} confirmLabel="Disconnect" icon={<UnplugIcon data-icon="inline-start" />}
      description="Setlist will forget this account's saved credentials and also delete your saved transfer history. Playlists on Spotify and YouTube are not changed."
      onConfirm={async () => {
        if (!disconnecting) return;
        await disconnect(disconnecting);
        toast.success(`${providerNames[disconnecting]} disconnected`);
      }} />
  </Card>;
}

const hiddenKey = (playlist: Pick<HiddenPlaylist, 'provider' | 'id'>) => `${playlist.provider}:${playlist.id}`;

export function HiddenPlaylists() {
  const { setPlaylistHidden } = useDataActions();
  const query = useResource<Preferences>('/preferences');
  const hidden = query.data?.hiddenPlaylists ?? (query.error && 'status' in query.error && query.error.status === 404 ? [] : null);
  const error = hidden ? null : query.error?.message;
  const load = () => { void query.refetch(); };
  const [busy, setBusy] = useState<string | null>(null);

  async function show(playlists: HiddenPlaylist[], label: string) {
    setBusy(playlists.length === 1 ? hiddenKey(playlists[0]) : 'all');
    try {
      for (const playlist of playlists) { await setPlaylistHidden(playlist, false); }
      toast.success(`${label} will show in the workspace again`);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return <Card>
    <CardHeader>
      <CardTitle>Hidden playlists</CardTitle>
      <CardDescription>Playlists you hid from the workspace menu. Hiding never changes the playlist on Spotify or YouTube.</CardDescription>
    </CardHeader>
    <CardContent>
      {error ? <RetryAlert title="Could not load hidden playlists" message={error} onRetry={load} />
        : !hidden ? <div role="status" aria-label="Loading hidden playlists" className="flex flex-col gap-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        : !hidden.length ? <Empty className="border py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><EyeOffIcon /></EmptyMedia>
            <EmptyTitle>Nothing hidden</EmptyTitle>
            <EmptyDescription>Hide playlists from the workspace menu to keep your library tidy.</EmptyDescription>
          </EmptyHeader>
        </Empty>
        : <ItemGroup className="gap-2">
          {hidden.map(playlist => <Item key={hiddenKey(playlist)} variant="outline" role="listitem" size="sm">
            <ItemMedia variant="image"><Cover src={playlist.image} /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full"><span className="truncate">{playlist.name}</span><Badge variant="secondary">{providerNames[playlist.provider]}</Badge></ItemTitle>
              <ItemDescription>Hidden <RelativeDate value={playlist.hiddenAt} /></ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" size="sm" disabled={busy !== null} aria-label={`Show ${playlist.name} again`} onClick={() => show([playlist], `“${playlist.name}”`)}>
                <EyeIcon data-icon="inline-start" />Show again
              </Button>
            </ItemActions>
          </Item>)}
        </ItemGroup>}
    </CardContent>
    {hidden && hidden.length > 1 ? <CardFooter className="justify-end">
      <Button variant="outline" disabled={busy !== null} onClick={() => show(hidden, 'All playlists')}>Show all</Button>
    </CardFooter> : null}
  </Card>;
}

const themes = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
] as const;

export function Appearance() {
  const { theme = 'system', setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <Card>
    <CardHeader>
      <CardTitle>Appearance</CardTitle>
      <CardDescription>Choose how Setlist looks. System follows your device setting.</CardDescription>
    </CardHeader>
    <CardContent>
      {mounted
        ? <ToggleGroup variant="outline" spacing={0} aria-label="Theme" value={[theme]} onValueChange={value => { if (value[0]) setTheme(String(value[0])); }}>
          {themes.map(item => <ToggleGroupItem key={item.value} value={item.value}><item.icon data-icon="inline-start" />{item.label}</ToggleGroupItem>)}
        </ToggleGroup>
        : <Skeleton className="h-8 w-60" />}
    </CardContent>
  </Card>;
}

export function YourData() {
  const [clearing, setClearing] = useState(false);
  return <Card>
    <CardHeader>
      <CardTitle>Your data</CardTitle>
      <CardDescription>Transfers are kept temporarily so you can resume or review them. They are deleted automatically no later than 30 days after a transfer is started, and immediately when you disconnect a music account.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>Clearing history removes saved transfers from Setlist only. Your playlists on Spotify and YouTube are never changed.</p>
      <p>Read the <Link to="/privacy-policy" className="text-foreground underline underline-offset-4">Privacy Policy</Link> and <Link to="/terms-of-service" className="text-foreground underline underline-offset-4">Terms of Service</Link>.</p>
    </CardContent>
    <CardFooter>
      <Button variant="destructive" onClick={() => setClearing(true)}><Trash2Icon data-icon="inline-start" />Clear transfer history</Button>
    </CardFooter>
    <ClearHistoryDialog open={clearing} onOpenChange={setClearing} onCleared={() => undefined} />
  </Card>;
}
