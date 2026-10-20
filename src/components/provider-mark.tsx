import type { Provider } from '../../shared/types';
import { cn } from '@/lib/utils';

/** Small provider badge. Provider colors identify a service and are not used for anything else. */
export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
    provider === 'spotify' ? 'bg-spotify-muted text-spotify' : 'bg-youtube-muted text-youtube', className)}>
    {provider === 'spotify' ? '≋' : '▶'}
  </span>;
}
