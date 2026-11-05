import { ArrowRightIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { FullJob, JobPhase, Provider } from '../../../shared/types';
import { MatchRow } from './match-row';
import { useDataActions } from '@/hooks/use-data-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, providerNames } from '@/lib/api';
import { cn } from '@/lib/utils';

export const phaseLabels: Record<JobPhase, string> = { loading: 'Loading tracks', matching: 'Matching', review: 'Ready for review', transferring: 'Adding tracks', complete: 'Complete' };

function Direction({ provider }: { provider: Provider }) {
  return <Badge variant="outline">
    <span aria-hidden="true" className={cn('size-1.5 rounded-full', provider === 'spotify' ? 'bg-spotify' : 'bg-youtube')} />{providerNames[provider]}
  </Badge>;
}

export function TransferPanel({ job, armed, pausing, onPause, onStart, onUpdate, onDeleted }: {
  job: FullJob;
  armed: boolean;
  pausing: boolean;
  onPause: (job: FullJob) => Promise<void>;
  onStart: (job: FullJob) => void;
  onUpdate: (job: FullJob) => void;
  onDeleted: (id: string) => void;
}) {
  const { deleteJob } = useDataActions();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const selected = job.selectedCount;
  const matched = job.matchedCount;
  const active = job.state === 'running' && job.phase !== 'review' && job.phase !== 'complete';
  const reviewing = job.phase === 'review';
  const autoContinued = useRef(false);

  // Steps are driven from the browser, so a running transfer opened after a reload or
  // navigation would otherwise sit idle. Pick it back up once; the button remains as a fallback.
  useEffect(() => {
    if (armed || pausing) { autoContinued.current = true; return; }
    if (!active || autoContinued.current) return;
    autoContinued.current = true;
    void action('resume', {}, true);
  });

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

  const status = job.phase === 'loading' ? `${job.totalCount} tracks loaded`
    : job.phase === 'matching' ? `${matched} of ${job.totalCount} tracks checked`
      : job.phase === 'transferring' ? `${job.inserted} of ${selected} tracks added`
        : job.phase === 'complete' ? `${job.inserted} tracks transferred`
          : `${selected} selected · ${job.totalCount - selected} skipped`;
  const progressMax = job.phase === 'transferring' ? selected : job.totalCount;
  const progressValue = job.phase === 'loading' ? job.totalCount : job.phase === 'matching' ? matched : job.inserted;
  const phaseBadge = job.state === 'running' && job.nextStepAt && job.nextStepAt > Date.now() ? { label: 'Waiting for rate limit', className: 'bg-warning-muted text-warning' }
    : job.state === 'paused' ? { label: job.waitReason === 'daily-quota' ? 'Daily quota reached' : 'Paused', className: 'bg-warning-muted text-warning' }
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
              : active && !armed && !busy
                ? <Button onClick={() => void action('resume', {}, true)}>Continue transfer</Button>
                : active
                  ? <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />{job.phase === 'loading' ? 'Loading tracks…' : job.phase === 'matching' ? 'Finding matches…' : 'Adding tracks…'}</span>
                  : null}
        {active ? <Button variant="outline" disabled={busy || pausing} onClick={() => void onPause(job)}>{pausing ? 'Pausing…' : 'Pause transfer'}</Button> : null}
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Remove from history" disabled={busy} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmRemove(true)} />}><Trash2Icon /></TooltipTrigger>
          <TooltipContent>Remove from history</TooltipContent>
        </Tooltip>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      {job.searchRequests !== undefined ? <p className="text-xs text-muted-foreground">Matching activity recorded: {job.searchRequests} search requests · {job.searchCacheHits ?? 0} cached results. Track progress also includes unavailable tracks; these are not project-wide API totals.</p> : null}
      {active ? <Progress aria-label="Transfer progress" value={Math.round(100 * progressValue / Math.max(progressMax, 1))} /> : null}
      {job.message ? <Alert role="status"><AlertDescription>{job.message}{job.state === 'running' && job.nextStepAt ? ` Next attempt after ${new Date(job.nextStepAt).toLocaleTimeString()}.` : ''}</AlertDescription></Alert>
        : active && !armed && !busy ? <Alert role="status"><AlertDescription>This transfer stopped when it was last left open. Choose Continue transfer to pick up where it left off.</AlertDescription></Alert> : null}
      {reviewing ? <p className="text-sm text-muted-foreground">Matches are suggestions. Open a result to check it, choose another candidate, or skip the track.</p> : null}
      {job.items.length ? <div className="overflow-hidden rounded-lg border">
        <div aria-hidden="true" className="hidden grid-cols-[1.5rem_minmax(0,1fr)_1rem_minmax(0,1fr)_auto] gap-x-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span className="text-right">#</span><span>{providerNames[job.source]}</span><span /><span>{providerNames[job.destination]}</span><span />
        </div>
        <ol aria-label="Tracks" className="divide-y">
          {job.items.map((item, index) => <MatchRow key={index} index={index} item={item} source={job.source} destination={job.destination} reviewing={reviewing} expanded={expanded === index} busy={busy}
            onToggle={() => setExpanded(expanded === index ? null : index)}
            onSelect={candidateId => void action('select', { index, candidateId })}
            onSearch={query => void action('search', { index, query })} />)}
        </ol>
      </div> : null}
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
