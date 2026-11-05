export type Provider = 'spotify' | 'youtube';

export interface Playlist {
  id: string;
  name: string;
  description: string;
  count: number;
  image?: string;
  url: string;
  transferable: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration?: number;
  /** Album art or video thumbnail. Absent on items saved before artwork was recorded. */
  image?: string;
  unavailable?: boolean;
}

export interface Candidate extends Track { score: number }
export interface JobItem {
  source: Track;
  candidates: Candidate[];
  selected: Candidate | null;
  searched: boolean;
}

export type JobPhase = 'loading' | 'matching' | 'review' | 'transferring' | 'complete';
export type JobState = 'idle' | 'running' | 'paused';

/** Durable job metadata. Track records are stored separately as item:<id>:<position>. */
export interface JobMetadata {
  id: string;
  source: Provider;
  destination: Provider;
  sourceAccount: string;
  destinationAccount: string;
  sourcePlaylistId: string;
  /** Source playlist details captured when the job was created. Absent on jobs created before they were recorded. */
  sourcePlaylistName?: string;
  sourcePlaylistUrl?: string;
  sourcePlaylistImage?: string;
  name: string;
  phase: JobPhase;
  state: JobState;
  message?: string;
  nextStepAt?: number;
  rateLimitAttempts?: number;
  waitReason?: 'daily-quota' | 'rate-limit';
  /** Matching-step attempts/cache hits recorded since instrumentation was enabled. */
  searchRequests?: number;
  searchCacheHits?: number;
  sourceCursor?: string;
  sourcePosition: number;
  sourceDone: boolean;
  matchPosition: number;
  destinationId?: string;
  destinationUrl?: string;
  discoveryCursor?: string;
  discoveryCandidateId?: string;
  discoveryCandidateUrl?: string;
  discoveryMatches: number;
  createAttempted: boolean;
  reconcileCursor?: string;
  reconcilePosition: number;
  reconcileChecked: number;
  inserted: number;
  totalCount: number;
  matchedCount: number;
  selectedCount: number;
  createdAt: string;
  updatedAt: string;
}

export type Job = JobMetadata & { items: JobItem[] };
export type JobSummary = Omit<Job, 'items'>;
export type FullJob = Job;

export interface Account { id: string; name: string }
export interface Status {
  accounts: Record<Provider, Account | null>;
  connectionErrors?: Record<Provider, string | null>;
  configured: Record<Provider, boolean>;
  callbacks: Record<Provider, string>;
}

export interface Page<T> { items: T[]; nextCursor?: string }

/** A playlist the user chose to keep out of their library lists. Display details are captured when hidden. */
export interface HiddenPlaylist {
  provider: Provider;
  id: string;
  name: string;
  image?: string;
  hiddenAt: string;
}

export interface Preferences { hiddenPlaylists: HiddenPlaylist[] }
