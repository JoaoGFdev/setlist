import { ArrowLeftRightIcon } from 'lucide-react';
import { ProviderMark } from '@/components/provider-mark';

export function PageHeader() {
  return <header className="flex items-center justify-between gap-6">
    <div className="flex flex-col gap-1.5">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Your playlists, on both sides.</h1>
      <p className="max-w-xl text-muted-foreground">Move playlists between Spotify and YouTube, with a say in every match.</p>
    </div>
    <div aria-hidden="true" className="hidden shrink-0 items-center gap-3 text-muted-foreground sm:flex">
      <ProviderMark provider="spotify" className="size-10 text-lg" />
      <ArrowLeftRightIcon />
      <ProviderMark provider="youtube" className="size-10 text-lg" />
    </div>
  </header>;
}
