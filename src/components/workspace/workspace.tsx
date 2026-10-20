import { useQueryClient } from '@tanstack/react-query';
import { useDataActions } from '@/hooks/use-data-actions';
import { useResource } from '@/hooks/use-resource';
import { resourceKey, userKey } from '@/lib/query-client';
import { ArrowLeftRightIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { FullJob, JobSummary, Playlist, Preferences, Provider, Status } from '../../../shared/types';
import { LibraryPanel } from './library-panel';
import { TransferPanel } from './transfer-panel';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, providerNames, providers } from '@/lib/api';

function WorkspaceSkeleton() {
  return <div role="status" aria-label="Loading your workspace" className="grid items-start gap-6 lg:grid-cols-2">
    <Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" />
  </div>;
}

/** Shown when the account status cannot load, so each library still offers its Connect button. */
const disconnectedStatus: Status = {
  accounts: { spotify: null, youtube: null },
  connectionErrors: { spotify: null, youtube: null },
  configured: { spotify: true, youtube: true },
  callbacks: { spotify: '', youtube: '' },
};

export function Workspace({ userId }: { userId: string }) {
  const { setPlaylistHidden } = useDataActions();
  const client = useQueryClient();
  const statusQuery = useResource<Status>('/status');
  const jobsQuery = useResource<JobSummary[]>('/jobs');
  const preferencesQuery = useResource<Preferences>('/preferences');
  const status = statusQuery.data ?? (statusQuery.isError ? disconnectedStatus : null);
  const jobs = jobsQuery.data ?? [];
  const hiddenPlaylists = preferencesQuery.data?.hiddenPlaylists ?? [];
  const loadError = statusQuery.error?.message;
  const [selectedId, setActiveId] = useState<string | null>(null);
  const deepLink = useRef(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('job'));
  const activeId = (jobs.some(job => job.id === selectedId) ? selectedId : null) ?? jobs.find(job => job.id === deepLink.current)?.id ?? jobs[0]?.id ?? null;
  const activeQuery = useResource<FullJob>(`/jobs/${activeId}`, Boolean(activeId));
  const activeJob = activeQuery.data ?? null;
  const setActiveJob = (job: FullJob) => client.setQueryData(resourceKey(userId, `/jobs/${job.id}`), job);
  const setJobs = (update: JobSummary[] | ((current: JobSummary[]) => JobSummary[])) => jobsQuery.setData(current => typeof update === 'function' ? update(current ?? []) : update);
  const [armed, setArmed] = useState(false);
  const runToken = useRef(0);
  const refreshAccounts = () => { void client.invalidateQueries({ queryKey: resourceKey(userId, '/status') }); };

  useEffect(() => () => { runToken.current++; }, []);

  const hiddenIds = useMemo(() => Object.fromEntries(providers.map(provider => [provider, new Set(hiddenPlaylists.filter(item => item.provider === provider).map(item => item.id))])) as Record<Provider, Set<string>>, [hiddenPlaylists]);

  async function toggleHidden(playlist: Playlist, provider: Provider, hidden: boolean) {
    try {
      await setPlaylistHidden({ provider, id: playlist.id, name: playlist.name, image: playlist.image }, hidden);
      if (hidden) toast.success(`Hid “${playlist.name}”`, { action: { label: 'Undo', onClick: () => void toggleHidden(playlist, provider, false) } });
      else toast.success(`“${playlist.name}” is back in your list`);
    } catch (cause) { toast.error((cause as Error).message); }
  }

  async function runJob(initial: FullJob) {
    const token = ++runToken.current;
    setActiveId(initial.id); setActiveJob(initial); setArmed(true);
    let job = initial;
    try {
      while (token === runToken.current && job.state === 'running' && job.phase !== 'review' && job.phase !== 'complete') {
        const summary = await api<JobSummary>(`/jobs/${job.id}/step`, {});
        if (token !== runToken.current) {
          // A write can finish after navigation stopped the loop; revalidate that job on return.
          void client.invalidateQueries({ queryKey: resourceKey(userId, '/jobs') });
          void client.invalidateQueries({ queryKey: resourceKey(userId, `/jobs/${job.id}`) });
          return;
        }
        setJobs(current => [summary, ...current.filter(item => item.id !== summary.id)]);
        job = { ...job, ...summary };
        setActiveJob(job);
        if (summary.state !== 'running' || summary.phase === 'review' || summary.phase === 'complete') {
          job = await api<FullJob>(`/jobs/${job.id}`);
          if (token !== runToken.current) return;
          setActiveJob(job);
          break;
        }
      }
      if (token === runToken.current && job.phase === 'complete' && initial.phase !== 'complete') { void client.invalidateQueries({ queryKey: [...userKey(userId), 'playlists', job.destination] }); toast.success(`Playlist “${job.name}” created on ${providerNames[job.destination]}`); }
    } catch (cause) {
      if (token === runToken.current) {
        toast.error((cause as Error).message);
        try { const latest = await api<FullJob>(`/jobs/${job.id}`); if (token === runToken.current) setActiveJob(latest); } catch { /* The original request error is more useful here. */ }
      }
    }
    finally { if (token === runToken.current) setArmed(false); }
  }

  async function openJob(id: string) {
    runToken.current++; setArmed(false); setActiveId(id);
    try { await client.ensureQueryData({ queryKey: resourceKey(userId, `/jobs/${id}`), queryFn: () => api<FullJob>(`/jobs/${id}`), revalidateIfStale: true }); }
    catch (cause) { toast.error((cause as Error).message); }
  }

  function showJob(id: string) {
    void openJob(id);
    document.getElementById('transfer-heading')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function updateJob(job: FullJob) {
    setActiveJob(job);
    setJobs(current => [job, ...current.filter(item => item.id !== job.id)]);
    setActiveId(job.id);
  }

  function removeJob(id: string) {
    runToken.current++; setArmed(false);
    const rest = jobs.filter(job => job.id !== id);
    setJobs(rest);
    if (rest[0]) void openJob(rest[0].id);
    else { setActiveId(null); }
  }

  if (!status) return <WorkspaceSkeleton />;
  return <>
    {loadError ? <Alert variant="destructive">
      <AlertDescription>We couldn’t check your connected accounts: {loadError} Connect them below or try again.</AlertDescription>
      <AlertAction><Button variant="outline" size="xs" onClick={() => refreshAccounts()}>Retry</Button></AlertAction>
    </Alert> : null}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {providers.map(provider => <LibraryPanel key={provider} userId={userId} provider={provider} status={status} jobs={jobs} hiddenIds={hiddenIds[provider]}
        onToggleHidden={(playlist, owner, hidden) => void toggleHidden(playlist, owner, hidden)}
        onCreated={job => { updateJob(job); void runJob(job); toast.success(`Transfer created for “${job.name}”`); }}
        onConnected={refreshAccounts} onOpenJob={showJob} />)}
    </div>
    <section aria-labelledby="transfer-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="transfer-heading" className="scroll-mt-24 font-heading text-xl font-semibold tracking-tight">Transfer workspace</h2>
          <p className="text-sm text-muted-foreground">Match first. Review the results. Create a private playlist.</p>
        </div>
        {jobs.length ? <Select value={activeId} onValueChange={value => { if (value) void openJob(String(value)); }}
          items={jobs.map(job => ({ value: job.id, label: `${job.name} · ${job.phase}` }))}>
          <SelectTrigger aria-label="Transfer history" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="w-auto max-w-[calc(100vw-2rem)]">
            {jobs.map(job => <SelectItem key={job.id} value={job.id}>{job.name} · {job.phase}</SelectItem>)}
          </SelectContent>
        </Select> : null}
      </div>
      {activeId && activeQuery.isPending ? <div role="status" className="text-sm text-muted-foreground">Loading transfer…</div> : activeJob
        ? <TransferPanel key={activeJob.id} job={activeJob} armed={armed} onStart={runJob} onUpdate={updateJob} onDeleted={removeJob} />
        : <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ArrowLeftRightIcon /></EmptyMedia>
            <EmptyTitle>A new home for your favorites</EmptyTitle>
            <EmptyDescription>Connect both accounts, then choose a playlist above. You’ll review the songs here before anything is created.</EmptyDescription>
          </EmptyHeader>
        </Empty>}
    </section>
  </>;
}
