import { ArrowRightIcon, ListMusicIcon } from 'lucide-react';
import type { JobSummary, Provider } from '../../../shared/types';
import { ProviderMark } from '@/components/provider-mark';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type JobStage = 'progress' | 'review' | 'paused' | 'complete';

export const stageLabels: Record<JobStage, string> = { progress: 'In progress', review: 'Needs review', paused: 'Paused', complete: 'Complete' };
const stageClasses: Record<JobStage, string> = {
  complete: 'bg-success-muted text-success',
  review: 'bg-brand-muted text-foreground',
  paused: 'bg-warning-muted text-warning',
  progress: 'bg-secondary text-secondary-foreground',
};

export function jobStage(job: Pick<JobSummary, 'phase' | 'state'>): JobStage {
  if (job.phase === 'complete') return 'complete';
  if (job.state === 'paused') return 'paused';
  if (job.phase === 'review') return 'review';
  return 'progress';
}

export function JobStatusBadge({ job }: { job: Pick<JobSummary, 'phase' | 'state' | 'message'> }) {
  const stage = jobStage(job);
  const badge = <Badge variant="secondary" className={cn(stageClasses[stage])}>{stageLabels[stage]}</Badge>;
  if (stage !== 'paused' || !job.message) return badge;
  return <Tooltip><TooltipTrigger render={<span className="inline-flex" />}>{badge}</TooltipTrigger><TooltipContent>{job.message}</TooltipContent></Tooltip>;
}

export const sourceName = (job: JobSummary) => job.sourcePlaylistName || job.name;
export const viewTransferHref = (id: string) => `/?job=${encodeURIComponent(id)}`;
export const directionLabel = (source: Provider, destination: Provider) =>
  `${source === 'spotify' ? 'Spotify' : 'YouTube'} to ${destination === 'spotify' ? 'Spotify' : 'YouTube'}`;

export function Direction({ source, destination, className }: { source: Provider; destination: Provider; className?: string }) {
  return <span role="img" aria-label={directionLabel(source, destination)} className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}>
    <ProviderMark provider={source} className="size-6 text-xs" />
    <ArrowRightIcon className="size-3.5" aria-hidden="true" />
    <ProviderMark provider={destination} className="size-6 text-xs" />
  </span>;
}

export function Cover({ src, className }: { src?: string; className?: string }) {
  return <span className={cn('flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground', className)}>
    {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover" /> : <ListMusicIcon className="size-4" aria-hidden="true" />}
  </span>;
}

/** "inserted of selected added" counts, e.g. "42 of 50 added · 60 total". */
export function TrackCounts({ job }: { job: Pick<JobSummary, 'inserted' | 'selectedCount' | 'totalCount'> }) {
  return <span className="tabular-nums">{job.inserted} of {job.selectedCount} added<span className="text-muted-foreground"> · {job.totalCount} total</span></span>;
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(value: string, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (Math.abs(seconds) < 60) return 'just now';
  const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
  return formatter.format(Math.round(seconds / size), unit);
}

const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** Relative date with the absolute timestamp available on hover. */
export function RelativeDate({ value, className }: { value: string; className?: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <time dateTime={value} title={absolute.format(date)} className={className}>{relativeTime(value)}</time>;
}
