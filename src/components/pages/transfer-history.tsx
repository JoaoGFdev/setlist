import { Link } from '@tanstack/react-router';
import { ExternalLinkIcon, EyeIcon, HistoryIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { JobSummary } from '../../../shared/types';
import { useDataActions } from '@/hooks/use-data-actions';
import { ClearHistoryDialog } from '@/components/pages/clear-history-dialog';
import { ConfirmDialog } from '@/components/pages/confirm-dialog';
import { Cover, Direction, JobStatusBadge, RelativeDate, TrackCounts, jobStage, sourceName, stageLabels, type JobStage } from '@/components/pages/job-display';
import { PageHeader } from '@/components/page-header';
import { RetryAlert } from '@/components/pages/retry-alert';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useJobs } from '@/hooks/use-jobs';

export const historyTitle = 'Transfer history';
export const historyDescription = 'Every playlist transfer saved in Setlist, newest first.';

type Tab = 'all' | JobStage;
const tabs: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'progress', label: stageLabels.progress },
  { value: 'review', label: stageLabels.review },
  { value: 'paused', label: stageLabels.paused },
  { value: 'complete', label: stageLabels.complete },
];

function RowActions({ job, onRemove }: { job: JobSummary; onRemove: (job: JobSummary) => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuGroup>
        <DropdownMenuItem render={<Link to="/" search={{ job: job.id }} />}><EyeIcon />View transfer</DropdownMenuItem>
        {job.destinationUrl ? <DropdownMenuItem render={<a href={job.destinationUrl} target="_blank" rel="noreferrer" />}><ExternalLinkIcon />Open destination playlist</DropdownMenuItem> : null}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem variant="destructive" onClick={() => onRemove(job)}><Trash2Icon />Remove from history</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function HistoryTable({ jobs, onRemove }: { jobs: JobSummary[]; onRemove: (job: JobSummary) => void }) {
  return <div className="rounded-xl border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Transfer</TableHead>
          <TableHead className="hidden md:table-cell">Direction</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Tracks</TableHead>
          <TableHead className="hidden md:table-cell">Created</TableHead>
          <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map(job => <TableRow key={job.id}>
          <TableCell className="max-w-[16rem] whitespace-normal">
            <div className="flex items-center gap-3">
              <Cover src={job.sourcePlaylistImage} className="hidden size-9 sm:flex" />
              <div className="flex min-w-0 flex-col">
                <Link to="/" search={{ job: job.id }} className="truncate font-medium underline-offset-4 hover:underline">{job.name}</Link>
                <span className="truncate text-xs text-muted-foreground">{sourceName(job)}</span>
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell"><Direction source={job.source} destination={job.destination} /></TableCell>
          <TableCell><JobStatusBadge job={job} /></TableCell>
          <TableCell className="hidden sm:table-cell"><TrackCounts job={job} /></TableCell>
          <TableCell className="hidden md:table-cell text-muted-foreground"><RelativeDate value={job.createdAt} /></TableCell>
          <TableCell className="text-right"><RowActions job={job} onRemove={onRemove} /></TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  </div>;
}

export function TransferHistory() {
  const { deleteJob } = useDataActions();
  const { jobs, loading, error, refresh, removeLocal } = useJobs();
  const [tab, setTab] = useState<Tab>('all');
  const [pending, setPending] = useState<JobSummary | null>(null);
  const [clearing, setClearing] = useState(false);
  const counts = useMemo(() => {
    const result: Record<Tab, number> = { all: jobs.length, progress: 0, review: 0, paused: 0, complete: 0 };
    for (const job of jobs) result[jobStage(job)]++;
    return result;
  }, [jobs]);
  const visible = tab === 'all' ? jobs : jobs.filter(job => jobStage(job) === tab);

  return <>
    <PageHeader title={historyTitle} description={historyDescription}
      actions={<Button variant="destructive" disabled={!jobs.length} onClick={() => setClearing(true)}><Trash2Icon data-icon="inline-start" />Clear history</Button>} />
    {error ? <RetryAlert title="Could not load transfer history" message={error} onRetry={refresh} />
      : loading ? <div role="status" aria-label="Loading transfer history" className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-14 w-full" />)}
      </div>
      : !jobs.length ? <Empty className="border py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia>
          <EmptyTitle>No transfers yet</EmptyTitle>
          <EmptyDescription>Transfers you start in the workspace are saved here so you can resume or revisit them.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button variant="brand" nativeButton={false} render={<Link to="/" />}>Start a transfer</Button></EmptyContent>
      </Empty>
      : <div className="flex flex-col gap-4">
        <Tabs value={tab} onValueChange={value => setTab(value as Tab)}>
          <TabsList className="max-w-full overflow-x-auto">
            {tabs.map(item => <TabsTrigger key={item.value} value={item.value} className="px-2.5">
              {item.label}{' '}<span className="text-xs tabular-nums text-muted-foreground">{counts[item.value]}</span>
            </TabsTrigger>)}
          </TabsList>
        </Tabs>
        {visible.length ? <HistoryTable jobs={visible} onRemove={setPending} />
          : <Empty className="border py-10"><EmptyHeader><EmptyTitle>No {tabs.find(item => item.value === tab)?.label.toLowerCase()} transfers</EmptyTitle><EmptyDescription>Nothing in this state right now.</EmptyDescription></EmptyHeader></Empty>}
      </div>}
    <ConfirmDialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null); }} title="Remove from history?"
      confirmLabel="Remove" icon={<Trash2Icon data-icon="inline-start" />}
      description={<>This removes “{pending?.name}” from Setlist, so it can no longer be resumed. The playlists on Spotify and YouTube are not changed.</>}
      onConfirm={async () => {
        if (!pending) return;
        await deleteJob(pending.id);
        removeLocal([pending.id]);
        toast.success('Removed from history');
      }} />
    <ClearHistoryDialog open={clearing} onOpenChange={setClearing} onCleared={() => removeLocal('all')} />
  </>;
}
