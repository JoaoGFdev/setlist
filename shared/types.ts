export type Provider = 'spotify' | 'youtube';
export interface Playlist { id: string; name: string; description: string; count: number; image?: string; url: string; transferable: boolean }
export interface Track { id: string; title: string; artist: string; url: string; duration?: number; unavailable?: boolean }
export interface Candidate extends Track { score: number }
export interface JobItem { source: Track; candidates: Candidate[]; selected: Candidate | null; searched: boolean }
export interface Job {
  id: string; source: Provider; destination: Provider; sourceAccount: string; destinationAccount: string;
  name: string; items: JobItem[]; phase: 'matching' | 'review' | 'transferring' | 'complete';
  state: 'idle' | 'running' | 'paused'; message?: string; destinationId?: string;
  destinationUrl?: string; inserted: number; createdAt: string; updatedAt: string;
}
export interface Account { id: string; name: string }
export interface Status { accounts: Record<Provider, Account | null>; configured: Record<Provider, boolean>; callbacks: Record<Provider, string> }
