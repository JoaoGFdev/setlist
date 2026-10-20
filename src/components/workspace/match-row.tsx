import { ArrowRightIcon, ArrowUpRightIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import type { JobItem } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SKIP = '__skip__';

function MatchEditor({ index, item, busy, onSelect, onSearch }: {
  index: number;
  item: JobItem;
  busy: boolean;
  onSelect: (candidateId: string | null) => void;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(`${item.source.artist} ${item.source.title}`);
  const options = [
    { value: SKIP, label: 'Skip this track' },
    ...item.candidates.map(candidate => ({ value: candidate.id, label: `${candidate.title} — ${candidate.artist} (score ${candidate.score}/100)` })),
  ];
  return <div className="mt-1 mb-3 flex flex-col gap-4 rounded-lg bg-muted/50 p-3 sm:ml-9">
    <Field>
      <FieldLabel htmlFor={`match-${index}`}>Choose a match</FieldLabel>
      <Select items={options} value={item.selected?.id ?? SKIP} disabled={busy} onValueChange={value => onSelect(value === SKIP ? null : String(value))}>
        <SelectTrigger id={`match-${index}`} className="w-full" aria-label={`Match for ${item.source.title}`}><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="w-auto max-w-[calc(100vw-2rem)]">
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
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

export function MatchRow({ index, item, reviewing, expanded, busy, onToggle, onSelect, onSearch }: {
  index: number;
  item: JobItem;
  reviewing: boolean;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onSelect: (candidateId: string | null) => void;
  onSearch: (query: string) => void;
}) {
  return <div role="listitem">
    <Item size="sm" className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr_auto_1fr_auto]">
      <span className="order-1 w-6 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <ItemContent className="order-2 min-w-0">
        <ItemTitle className="max-w-full">
          {item.source.url ? <a href={item.source.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{item.source.title}</a> : <strong className="truncate font-medium">{item.source.title}</strong>}
        </ItemTitle>
        <ItemDescription className="line-clamp-1">{item.source.artist || 'Unavailable item'}</ItemDescription>
      </ItemContent>
      {reviewing ? <Button variant="ghost" size="sm" className="order-3 sm:order-5" disabled={busy || item.source.unavailable} aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Close' : 'Review'}</Button> : <span className="order-3 sm:order-5" />}
      <ArrowRightIcon aria-hidden="true" className="order-3 hidden text-muted-foreground sm:block" />
      <ItemContent className="order-4 col-span-2 col-start-2 min-w-0 sm:col-span-1 sm:col-start-auto">
        {item.selected
          ? <>
            <ItemTitle className="max-w-full"><a href={item.selected.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline [&_svg]:size-3.5 [&_svg]:shrink-0"><span className="truncate">{item.selected.title}</span><ArrowUpRightIcon aria-hidden="true" /></a></ItemTitle>
            <ItemDescription className="line-clamp-1">{item.selected.artist}</ItemDescription>
          </>
          : <ItemDescription>{!item.searched ? 'Waiting for search' : item.source.unavailable ? 'Unavailable · skipped' : 'Skipped'}</ItemDescription>}
      </ItemContent>
    </Item>
    {expanded && reviewing ? <MatchEditor index={index} item={item} busy={busy} onSelect={onSelect} onSearch={onSearch} /> : null}
  </div>;
}
