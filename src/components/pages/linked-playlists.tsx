import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, Link2Icon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { JobSummary, Provider } from '../../../shared/types';
import { Cover, Direction, JobStatusBadge, RelativeDate, TrackCounts, sourceName, viewTransferHref } from '@/components/pages/job-display';
import { RetryAlert } from '@/components/pages/retry-alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useJobs } from '@/hooks/use-jobs';
import { cn } from '@/lib/utils';

export interface LinkedPlaylist { key: string; job: JobSummary; transfers: number }
type DirectionFilter = 'all' | `${Provider}:${Provider}`;

/** One entry per source playlist; the most recently created transfer represents it. */
export function groupLinked(jobs: JobSummary[]): LinkedPlaylist[] {
  const groups = new Map<string, LinkedPlaylist>();
  for (const job of jobs) {
    const key = `${job.source}:${job.sourcePlaylistId}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { key, job, transfers: 1 });
    else {
      group.transfers++;
      if (job.createdAt > group.job.createdAt) group.job = job;
    }
  }
  return [...groups.values()].sort((a, b) => b.job.updatedAt.localeCompare(a.job.updatedAt));
}

const filters: { value: DirectionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'spotify:youtube', label: 'Spotify → YouTube' },
  { value: 'youtube:spotify', label: 'YouTube → Spotify' },
];

function ExternalName({ name, href, className }: { name: string; href?: string; className?: string }) {
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={cn('truncate underline-offset-4 hover:underline', className)}>{name}</a>
    : <span className={cn('truncate', className)}>{name}</span>;
}

function LinkedRow({ group }: { group: LinkedPlaylist }) {
  const { job } = group;
  return <Item variant="outline" role="listitem" className="sm:flex-nowrap">
    <ItemMedia variant="image"><Cover src={job.sourcePlaylistImage} /></ItemMedia>
    <ItemContent className="min-w-0 basis-40">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <ExternalName name={sourceName(job)} href={job.sourcePlaylistUrl} />
        {group.transfers > 1 ? <span className="shrink-0 text-xs font-normal text-muted-foreground">{group.transfers} transfers</span> : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <ExternalName name={job.name} href={job.destinationUrl} />
      </div>
    </ItemContent>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <Direction source={job.source} destination={job.destination} />
      <JobStatusBadge job={job} />
      <TrackCounts job={job} />
    </div>
    <ItemActions className="ml-auto">
      <RelativeDate value={job.updatedAt} className="text-xs text-muted-foreground" />
      <Button variant="outline" size="sm" nativeButton={false} render={<a href={viewTransferHref(job.id)} />}>View transfer</Button>
    </ItemActions>
  </Item>;
}

export function LinkedPlaylists() {
  const { jobs, loading, error, refresh } = useJobs();
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const groups = useMemo(() => groupLinked(jobs), [jobs]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter(({ job }) => (direction === 'all' || `${job.source}:${job.destination}` === direction)
      && (!needle || sourceName(job).toLowerCase().includes(needle) || job.name.toLowerCase().includes(needle)));
  }, [groups, query, direction]);
  const complete = visible.filter(({ job }) => job.phase === 'complete').length;

  if (error) return <RetryAlert title="Could not load linked playlists" message={error} onRetry={refresh} />;
  if (loading) return <div role="status" aria-label="Loading linked playlists" className="flex flex-col gap-2">
    {[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-[4.5rem] w-full" />)}
  </div>;
  if (!groups.length) return <Empty className="border py-12">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Link2Icon /></EmptyMedia>
      <EmptyTitle>No linked playlists yet</EmptyTitle>
      <EmptyDescription>Playlists you transfer between Spotify and YouTube show up here with their counterpart.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent><Button variant="brand" nativeButton={false} render={<Link to="/" />}>Start a transfer</Button></EmptyContent>
  </Empty>;

  return <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <InputGroup className="sm:max-w-xs">
        <InputGroupAddon><SearchIcon /></InputGroupAddon>
        <InputGroupInput type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search playlists" aria-label="Search linked playlists" />
      </InputGroup>
      <ToggleGroup variant="outline" spacing={0} aria-label="Filter by direction" value={[direction]}
        onValueChange={value => setDirection((value[0] as DirectionFilter | undefined) ?? 'all')} className="max-w-full overflow-x-auto">
        {filters.map(filter => <ToggleGroupItem key={filter.value} value={filter.value}>{filter.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
    <p role="status" className="text-sm text-muted-foreground tabular-nums">{visible.length} linked · {complete} complete</p>
    {visible.length
      ? <ItemGroup className="gap-2">{visible.map(group => <LinkedRow key={group.key} group={group} />)}</ItemGroup>
      : <Empty className="border py-10"><EmptyHeader><EmptyTitle>No matching playlists</EmptyTitle><EmptyDescription>Try a different search or direction.</EmptyDescription></EmptyHeader></Empty>}
  </div>;
}
