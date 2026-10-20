import { useReverification, useUser } from '@clerk/tanstack-react-start';
import { MusicIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDataActions } from '@/hooks/use-data-actions';
import { userKey } from '@/lib/query-client';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { FullJob, JobSummary, Playlist, Provider, Status } from '../../../shared/types';
import { providerScopes } from '../../../shared/provider-scopes';
import { CreateTransferDialog } from './create-transfer-dialog';
import { playlistLink } from './job-links';
import { PlaylistRow } from './playlist-row';
import { ProviderMark } from '@/components/provider-mark';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ItemGroup } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { api, otherProvider, playlistPage, providerNames } from '@/lib/api';

function PlaylistSkeletons() {
  return <div role="status" aria-label="Loading playlists" className="flex flex-col gap-1">
    {[0, 1, 2, 3].map(row => <div key={row} className="flex items-center gap-2.5 px-3 py-2.5">
      <Skeleton className="size-8 rounded-sm" />
      <div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/4" /></div>
      <Skeleton className="h-7 w-20" />
    </div>)}
  </div>;
}

export function LibraryPanel({ userId, provider, status, jobs, hiddenIds, onToggleHidden, onCreated, onConnected, onOpenJob }: {
  userId: string;
  provider: Provider;
  status: Status;
  jobs: JobSummary[];
  hiddenIds: ReadonlySet<string>;
  onToggleHidden: (playlist: Playlist, provider: Provider, hidden: boolean) => void;
  onCreated: (job: FullJob) => void;
  onConnected: () => void;
  onOpenJob: (id: string) => void;
}) {
  const { disconnect: disconnectAccount } = useDataActions();
  const { user } = useUser();
  const clerkProvider = provider === 'youtube' ? 'google' : 'spotify';
  const authorize = useReverification(async () => {
    if (!user) throw new Error('Sign in before connecting a music account.');
    const options = { additionalScopes: [...providerScopes[provider]], redirectUrl: `${window.location.origin}/sso-callback` };
    const existing = user.externalAccounts.find(item => (item.provider === clerkProvider || item.provider === `oauth_${clerkProvider}`));
    return existing ? existing.reauthorize(options) : user.createExternalAccount({ ...options, strategy: provider === 'youtube' ? 'oauth_google' : 'oauth_spotify' });
  });
  const account = status.accounts[provider];
  const destination = otherProvider(provider);
  const queryKey = [...userKey(userId), 'playlists', provider, account?.id];
  const library = useInfiniteQuery({
    queryKey,
    enabled: Boolean(account),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => playlistPage(`/playlists/${provider}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: page => page.nextCursor,
  });
  const playlists = library.data?.pages.flatMap(page => page.items) ?? [];
  const cursor = library.hasNextPage;
  const loading = library.isFetching && !library.isFetchingNextPage;
  const loadError = library.error?.message;
  const moreBusy = library.isFetchingNextPage;
  const refresh = () => { void library.refetch(); };
  const [filter, setFilter] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [chosen, setChosen] = useState<Playlist | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  async function loadMore() {
    if (cursor && !moreBusy) await library.fetchNextPage();
  }
  async function disconnect() {
    setConfirmDisconnect(false);
    setBusy(true);
    try { await disconnectAccount(provider); }
    catch (cause) { toast.error((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true);
    try {
      await api(`/accounts/${provider}/connect`, {});
      const external = await authorize();
      const redirect = external?.verification?.externalVerificationRedirectURL;
      if (redirect) { window.location.assign(redirect.href); return; }
      if (external) { await user?.reload(); onConnected(); }
    } catch (cause) { toast.error((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function create(name: string) {
    if (!chosen) return;
    setBusy(true);
    try { onCreated(await api<FullJob>('/jobs', { source: provider, playlistId: chosen.id, name })); setChosen(null); }
    catch (cause) { toast.error((cause as Error).message); }
    finally { setBusy(false); }
  }

  const hiddenCount = useMemo(() => playlists.filter(playlist => hiddenIds.has(playlist.id)).length, [playlists, hiddenIds]);
  const visible = useMemo(() => {
    const term = filter.toLowerCase();
    return playlists.filter(playlist => (showHidden || !hiddenIds.has(playlist.id)) && playlist.name.toLowerCase().includes(term));
  }, [playlists, filter, showHidden, hiddenIds]);
  const connectionError = status.connectionErrors?.[provider];
  const switchId = `${provider}-show-hidden`;

  function disabledReason(playlist: Playlist) {
    if (!playlist.transferable) return provider === 'spotify'
      ? 'Spotify only shares tracks from playlists you own or collaborate on. Ask the owner to add you as a collaborator, or copy the songs into your own Spotify playlist.'
      : 'This playlist’s tracks are unavailable for transfer.';
    return status.accounts[destination] ? null : `Connect ${providerNames[destination]} to transfer this playlist.`;
  }

  function emptyMessage() {
    if (!playlists.length) return 'No playlists found in this account.';
    if (filter) return 'No playlists match your search.';
    return 'Every playlist here is hidden. Turn on “Show hidden” to see them.';
  }

  return <section aria-label={`${providerNames[provider]} library`}>
    <Card>
      <CardHeader>
        <CardTitle><h2 className="flex items-center gap-2.5"><ProviderMark provider={provider} />{providerNames[provider]}</h2></CardTitle>
        <CardDescription className="truncate">{account ? account.name : 'Connect your music library'}</CardDescription>
        <CardAction>
          {account ? <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={busy} />}>Disconnect</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {providerNames[provider]}?</AlertDialogTitle>
                <AlertDialogDescription>This also deletes your saved transfer history. Your playlists on {providerNames[provider]} are not touched.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void disconnect()}>Disconnect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
            : status.configured[provider]
              ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void connect()}>
                {busy ? <Spinner data-icon="inline-start" /> : null}{busy ? 'Connecting…' : 'Connect'}
              </Button>
              : <Button variant="outline" size="sm" disabled>Unavailable</Button>}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {connectionError ? <Alert variant="destructive"><AlertDescription>{connectionError}</AlertDescription></Alert> : null}
        {!account ? <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MusicIcon /></EmptyMedia>
            <EmptyTitle>{provider === 'spotify' ? 'Start with the songs you love' : 'Put a picture to your playlist'}</EmptyTitle>
            <EmptyDescription>{provider === 'spotify' ? 'Connect your Spotify account through Clerk to load your playlists.' : 'Connect your Google account through Clerk to browse YouTube playlists and create music video collections.'}</EmptyDescription>
          </EmptyHeader>
        </Empty> : <>
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="min-w-40 flex-1">
              <InputGroupAddon><SearchIcon /></InputGroupAddon>
              <InputGroupInput type="search" aria-label={`Search ${providerNames[provider]} playlists`} placeholder="Find a playlist" value={filter} onChange={event => setFilter(event.target.value)} />
            </InputGroup>
            <Button variant="outline" disabled={loading} onClick={() => refresh()}>
              {loading ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}{loading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          {hiddenCount ? <Field orientation="horizontal" className="w-fit items-center">
            <Switch id={switchId} size="sm" checked={showHidden} onCheckedChange={setShowHidden} />
            <FieldLabel htmlFor={switchId} className="font-normal text-muted-foreground">Show hidden ({hiddenCount})</FieldLabel>
          </Field> : null}
          {loadError ? <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
            <AlertAction><Button variant="outline" size="xs" onClick={() => refresh()}>Retry</Button></AlertAction>
          </Alert> : null}
          {loading && !playlists.length ? <PlaylistSkeletons /> : null}
          {!loading && !loadError && !visible.length ? <Empty className="border py-8"><EmptyHeader><EmptyDescription>{emptyMessage()}</EmptyDescription></EmptyHeader></Empty> : null}
          {visible.length ? <ItemGroup className="max-h-96 gap-0 overflow-y-auto">
            {visible.map(playlist => <PlaylistRow key={playlist.id} playlist={playlist} provider={provider} disabledReason={disabledReason(playlist)} busy={busy}
              hidden={hiddenIds.has(playlist.id)} link={playlistLink(jobs, provider, playlist)} onOpenJob={onOpenJob}
              onTransfer={() => setChosen(playlist)} onToggleHidden={hidden => onToggleHidden(playlist, provider, hidden)} />)}
          </ItemGroup> : null}
          {cursor ? <Button variant="outline" className="self-center" disabled={moreBusy} onClick={() => void loadMore()}>
            {moreBusy ? <Spinner data-icon="inline-start" /> : null}{moreBusy ? 'Loading…' : 'Load more playlists'}
          </Button> : null}
        </>}
      </CardContent>
    </Card>
    <CreateTransferDialog playlist={chosen} destination={destination} busy={busy} onCancel={() => setChosen(null)} onCreate={name => void create(name)} />
  </section>;
}
