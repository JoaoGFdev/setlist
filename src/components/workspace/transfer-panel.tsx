import { ArrowRightIcon, ExternalLinkIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { FullJob, JobPhase, Provider } from '../../../shared/types';
import { MatchRow } from './match-row';
import { useDataActions } from '@/hooks/use-data-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ItemGroup } from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { api, providerNames } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const phaseLabels: Record<JobPhase, string> = { loading: 'Loading tracks', matching: 'Matching', review: 'Ready for review', transferring: 'Adding tracks', complete: 'Complete' };

function Direction({ provider }: { provider: Provider }) {
  return <Badge variant="outline">
    <span aria-hidden="true" className={cn('size-1.5 rounded-full', provider === 'spotify' ? 'bg-spotify' : 'bg-youtube')} />{providerNames[provider]}
  </Badge>;
}

export function TransferPanel({ job, armed, onStart, onUpdate, onDeleted }: {
  job: FullJob;
  armed: boolean;
  onStart: (job: FullJob) => void;
  onUpdate: (job: FullJob) => void;
  onDeleted: (id: string) => void;
}) {
  const { deleteJob } = useDataActions();
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const selected = job.selectedCount;
  const matched = job.matchedCount;
  const pages = Math.ceil(job.items.length / PAGE_SIZE);
  const active = job.state === 'running' && job.phase !== 'review' && job.phase !== 'complete';
  const reviewing = job.phase === 'review';

  async function action(path: string, data: unknown = {}, start = false) {
    setBusy(true);
    try { const next = await api<FullJob>(`/jobs/${job.id}/${path}`, data); onUpdate(next); if (start) onStart(next); }
    catch (cause) { toast.error((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setConfirmRemove(false);
    setBusy(true);
    try { await deleteJob(job.id); toast.success('Removed from history'); onDeleted(job.id); }
    catch (cause) { toast.error((cause as Error).message); setBusy(false); }
  }
  function goto(next: number) { setPage(next); setExpanded(null); }

  const status = job.phase === 'loading' ? `${job.totalCount} tracks loaded`
    : job.phase === 'matching' ? `${matched} of ${job.totalCount} tracks checked`
      : job.phase === 'transferring' ? `${job.inserted} of ${selected} tracks added`
        : job.phase === 'complete' ? `${job.inserted} tracks transferred`
          : `${selected} selected · ${job.totalCount - selected} skipped`;
  const progressMax = job.phase === 'transferring' ? selected : job.totalCount;
  const progressValue = job.phase === 'loading' ? job.totalCount : job.phase === 'matching' ? matched : job.inserted;
  const phaseBadge = job.state === 'paused' ? { label: 'Paused', className: 'bg-warning-muted text-warning' }
    : job.phase === 'complete' ? { label: phaseLabels.complete, className: 'bg-success-muted text-success' }
      : { label: phaseLabels[job.phase], className: '' };

  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Direction provider={job.source} /><span aria-hidden="true" className="text-muted-foreground [&_svg]:size-3.5"><ArrowRightIcon /></span><Direction provider={job.destination} />
        <Badge variant="secondary" className={phaseBadge.className}>{phaseBadge.label}</Badge>
      </div>
      <CardTitle><h3 className="font-heading text-xl font-semibold tracking-tight">{job.name}</h3></CardTitle>
      <CardDescription className="tabular-nums">{status}</CardDescription>
      <CardAction className="flex items-center gap-2">
        {job.state === 'paused'
          ? <Button disabled={busy} onClick={() => void action('resume', {}, true)}>Resume transfer</Button>
          : reviewing
            ? <Button disabled={busy || selected === 0} onClick={() => void action('approve', {}, true)}>{busy ? <Spinner data-icon="inline-start" /> : null}{busy ? 'Saving…' : 'Create private playlist'}</Button>
            : job.phase === 'complete' && job.destinationUrl
              ? <a href={job.destinationUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>Open playlist<ExternalLinkIcon data-icon="inline-end" /></a>
              : active && !armed
                ? <Button disabled={busy} onClick={() => void action('resume', {}, true)}>Continue transfer</Button>
                : active
                  ? <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{job.phase === 'loading' ? 'Loading tracks…' : job.phase === 'matching' ? 'Finding matches…' : 'Adding tracks…'}</span>
                  : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Transfer actions" />}><MoreHorizontalIcon /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmRemove(true)}><Trash2Icon />Remove from history</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {active && armed ? <Progress aria-label="Transfer progress" value={Math.round(100 * progressValue / Math.max(progressMax, 1))} /> : null}
      {job.message ? <Alert role="status"><AlertDescription>{job.message}</AlertDescription></Alert> : null}
      {reviewing ? <p className="text-sm text-muted-foreground">Matches are suggestions. Open a result to check it, choose another candidate, or skip the track.</p> : null}
      {job.items.length ? <ItemGroup className="gap-0">
        {job.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item, offset) => {
          const index = page * PAGE_SIZE + offset;
          return <MatchRow key={index} index={index} item={item} reviewing={reviewing} expanded={expanded === index} busy={busy}
            onToggle={() => setExpanded(expanded === index ? null : index)}
            onSelect={candidateId => void action('select', { index, candidateId })}
            onSearch={query => void action('search', { index, query })} />;
        })}
      </ItemGroup> : null}
      {pages > 1 ? <nav aria-label="Track pages" className="flex items-center justify-center gap-4">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => goto(page - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground tabular-nums">Page {page + 1} of {pages}</span>
        <Button variant="outline" size="sm" disabled={page + 1 === pages} onClick={() => goto(page + 1)}>Next</Button>
      </nav> : null}
      {job.destinationUrl && job.phase !== 'complete' ? <a className="w-fit text-sm underline underline-offset-4" href={job.destinationUrl} target="_blank" rel="noreferrer">Open the playlist in progress</a> : null}
    </CardContent>
    <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{job.name}” from history?</AlertDialogTitle>
          <AlertDialogDescription>This only removes the saved transfer from Setlist. It doesn’t delete any playlist on {providerNames[job.source]} or {providerNames[job.destination]}.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void remove()}>Remove from history</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
