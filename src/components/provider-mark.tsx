import { siSpotify, siYoutube } from 'simple-icons';
import type { Provider } from '../../shared/types';
import { cn } from '@/lib/utils';

const logos: Record<Provider, { title: string; path: string }> = { spotify: siSpotify, youtube: siYoutube };

/** Provider logo from Simple Icons, drawn in `currentColor` so it follows the surrounding text color and size. */
export function ProviderIcon({ provider, className }: { provider: Provider; className?: string }) {
  return <svg role="img" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={cn('size-4 shrink-0', className)}>
    <path d={logos[provider].path} />
  </svg>;
}

/** Round provider badge. Provider colors identify a service and are not used for anything else. */
export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full',
    provider === 'spotify' ? 'bg-spotify-muted text-spotify' : 'bg-youtube-muted text-youtube', className)}>
    <ProviderIcon provider={provider} className="size-[55%]" />
  </span>;
}
