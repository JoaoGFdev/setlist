import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, ChevronDownIcon, MusicIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import type { Candidate, JobItem, Provider, Track } from '../../../shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

/** Matches below this score are flagged so they get a second look during review. */
const LOW_CONFIDENCE = 60;

function artworkUrl(track: Track, provider: Provider) {
  if (track.image) return track.image;
  // Items saved before artwork was recorded can still show YouTube's predictable thumbnail.
  return provider === 'youtube' && track.id && !track.unavailable && !track.id.startsWith('unavailable-') ? `https://i.ytimg.com/vi/${encodeURIComponent(track.id)}/mqdefault.jpg` : undefined;
}

function Artwork({ track, provider, className }: { track: Track | null; provider: Provider; className?: string }) {
  const src = track ? artworkUrl(track, provider) : undefined;
  const [failed, setFailed] = useState<string | null>(null);
  return <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground', provider === 'youtube' ? 'aspect-video w-18' : 'size-10', className)}>
    {src && failed !== src
      ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(src)} />
      : <MusicIcon aria-hidden="true" className="size-4" />}
  </div>;
}

function TrackText({ track, fallback, className }: { track: Track | null; fallback: string; className?: string }) {
  if (!track) return <p className={cn('min-w-0 text-sm text-muted-foreground', className)}>{fallback}</p>;
  return <div className={cn('flex min-w-0 flex-col', className)}>
    {track.url
      ? <a href={track.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-sm font-medium hover:underline [&_svg]:size-3.5 [&_svg]:shrink-0"><span className="truncate">{track.title}</span><ArrowUpRightIcon aria-hidden="true" className="text-muted-foreground" /></a>
      : <strong className="truncate text-sm font-medium">{track.title}</strong>}
    <span className="truncate text-sm text-muted-foreground">{track.artist || 'Unavailable item'}</span>
  </div>;
}

function CandidateOption({ candidate, provider, selected, busy, onSelect }: { candidate: Candidate; provider: Provider; selected: boolean; busy: boolean; onSelect: () => void }) {
  return <li>
    <button type="button" aria-pressed={selected} disabled={busy} onClick={onSelect}
      className={cn('flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50', selected ? 'border-primary bg-muted' : 'border-transparent')}>
      <Artwork track={candidate} provider={provider} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{candidate.title}</span>
        <span className="truncate text-sm text-muted-foreground">{candidate.artist}</span>
      </span>
      <span className={cn('shrink-0 text-xs tabular-nums', candidate.score < LOW_CONFIDENCE ? 'text-warning' : 'text-muted-foreground')}>{candidate.score}/100</span>
      <span className="flex size-5 shrink-0 items-center justify-center">{selected ? <CheckIcon aria-hidden="true" className="size-4 text-primary" /> : null}</span>
    </button>
  </li>;
}

function MatchEditor({ index, item, destination, busy, onSelect, onSearch }: {
  index: number;
  item: JobItem;
  destination: Provider;
  busy: boolean;
  onSelect: (candidateId: string | null) => void;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(`${item.source.artist} ${item.source.title}`);
  return <div className="flex flex-col gap-4 border-t bg-muted/40 px-3 py-4 sm:pl-12">
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p id={`candidates-${index}`} className="text-sm font-medium">Choose a match</p>
        <Button variant={item.selected ? 'ghost' : 'secondary'} size="sm" disabled={busy || !item.selected} onClick={() => onSelect(null)}>{item.selected ? 'Skip this track' : 'Skipped'}</Button>
      </div>
      {item.candidates.length
        ? <ul aria-labelledby={`candidates-${index}`} className="flex flex-col gap-1">
          {item.candidates.map(candidate => <CandidateOption key={candidate.id} candidate={candidate} provider={destination} selected={item.selected?.id === candidate.id} busy={busy} onSelect={() => onSelect(candidate.id)} />)}
        </ul>
        : <p className="text-sm text-muted-foreground">No candidates found. Try a different search below.</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); onSearch(query); }}>
      <Field>
        <FieldLabel htmlFor={`search-${index}`}>Search for another version</FieldLabel>
        <InputGroup>
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput id={`search-${index}`} value={query} maxLength={200} required onChange={event => setQuery(event.target.value)} />
          <InputGroupAddon align="inline-end"><InputGroupButton type="submit" variant="secondary" disabled={busy}>Search</InputGroupButton></InputGroupAddon>
        </InputGroup>
        <FieldDescription>Scores rank suggestions; they do not guarantee the recording or official video.</FieldDescription>
      </Field>
    </form>
  </div>;
}

export function MatchRow({ index, item, source, destination, reviewing, expanded, busy, onToggle, onSelect, onSearch }: {
  index: number;
  item: JobItem;
  source: Provider;
  destination: Provider;
  reviewing: boolean;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onSelect: (candidateId: string | null) => void;
  onSearch: (query: string) => void;
}) {
  const lowConfidence = reviewing && item.selected !== null && item.selected.score < LOW_CONFIDENCE;
  const status = !item.searched ? 'Waiting for search' : item.source.unavailable ? 'Unavailable · skipped' : 'Skipped';
  return <li className={cn('[contain-intrinsic-size:auto_4rem] [content-visibility:auto]', expanded && 'bg-muted/20')}>
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[1.5rem_minmax(0,1fr)_1rem_minmax(0,1fr)_auto]">
      <span className="text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <Artwork track={item.source} provider={source} />
        <TrackText track={item.source} fallback="Unavailable item" />
      </div>
      <ArrowRightIcon aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
      <div className={cn('col-span-2 col-start-2 row-start-2 flex min-w-0 items-center gap-3 sm:col-span-1 sm:col-start-auto sm:row-start-auto', !item.selected && 'opacity-60')}>
        <Artwork track={item.selected} provider={destination} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <TrackText track={item.selected} fallback={status} />
          {lowConfidence ? <Badge variant="secondary" className="bg-warning-muted text-warning">Low confidence · {item.selected?.score}/100</Badge> : null}
        </div>
      </div>
      <div className="col-start-3 row-start-1 flex justify-end sm:col-start-auto sm:row-start-auto">
        {reviewing
          ? <Button variant="outline" size="sm" disabled={busy || item.source.unavailable} aria-expanded={expanded} aria-label={`${expanded ? 'Close review' : 'Review'} for ${item.source.title}`} onClick={onToggle}>
            {expanded ? 'Done' : 'Review'}<ChevronDownIcon data-icon="inline-end" className={cn('transition-transform', expanded && 'rotate-180')} />
          </Button>
          : null}
      </div>
    </div>
    {expanded && reviewing ? <MatchEditor index={index} item={item} destination={destination} busy={busy} onSelect={onSelect} onSearch={onSearch} /> : null}
  </li>;
}
