import { ArrowUpRightIcon, EyeIcon, EyeOffIcon, ExternalLinkIcon, HistoryIcon, MoreHorizontalIcon, MusicIcon } from 'lucide-react';
import type { Playlist, Provider } from '../../../shared/types';
import type { PlaylistLink } from './job-links';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { providerNames } from '@/lib/api';

function linkLabel(link: PlaylistLink) {
  if (link.kind === 'created') return 'Created by Setlist';
  if (link.kind === 'in-progress') return 'In progress';
  return `Linked → ${providerNames[link.job.destination]}`;
}

export function PlaylistRow({ playlist, provider, disabledReason, busy, hidden, link, onTransfer, onToggleHidden, onOpenJob }: {
  playlist: Playlist;
  provider: Provider;
  disabledReason: string | null;
  busy: boolean;
  hidden: boolean;
  link: PlaylistLink | null;
  onTransfer: () => void;
  onToggleHidden: (hidden: boolean) => void;
  onOpenJob: (id: string) => void;
}) {
  const reasonId = `${provider}-playlist-${playlist.id}-reason`;
  return <Item role="listitem" size="sm" className="flex-nowrap">
    <ItemMedia variant="image" className="bg-muted text-muted-foreground">
      {playlist.image ? <img src={playlist.image} alt="" loading="lazy" /> : <MusicIcon aria-hidden="true" />}
    </ItemMedia>
    <ItemContent className="min-w-0">
      <ItemTitle className="max-w-full">
        <a href={playlist.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{playlist.name}</a>
      </ItemTitle>
      <ItemDescription className="line-clamp-none">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tabular-nums">{playlist.count.toLocaleString()} tracks</span>
        {hidden ? <Badge variant="secondary" className="text-muted-foreground">Hidden</Badge> : null}
        {link ? <Badge variant="secondary" className="bg-brand-2-muted text-brand-2 hover:bg-brand-2-muted/80" render={<button type="button" onClick={() => onOpenJob(link.job.id)} aria-label={`${linkLabel(link)}. View transfer`} />}>{linkLabel(link)}</Badge> : null}
        </span>
      </ItemDescription>
      {disabledReason ? <ItemDescription id={reasonId} className="line-clamp-none text-xs">{disabledReason}</ItemDescription> : null}
    </ItemContent>
    <ItemActions>
      <Button variant="outline" size="sm" disabled={Boolean(disabledReason) || busy} aria-describedby={disabledReason ? reasonId : undefined} onClick={onTransfer}>
        Transfer<ArrowUpRightIcon data-icon="inline-end" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${playlist.name}`} />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<a href={playlist.url} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon />Open in {providerNames[provider]}
            </DropdownMenuItem>
            {link ? <DropdownMenuItem onClick={() => onOpenJob(link.job.id)}><HistoryIcon />View transfer</DropdownMenuItem> : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onToggleHidden(!hidden)}>
              {hidden ? <EyeIcon /> : <EyeOffIcon />}{hidden ? 'Show in list' : 'Hide from list'}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ItemActions>
  </Item>;
}
