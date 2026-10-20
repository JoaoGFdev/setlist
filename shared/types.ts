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
  name: string;
  phase: JobPhase;
  state: JobState;
  message?: string;
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
