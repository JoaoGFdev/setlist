import { SignInButton, UserButton, useAuth } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import iconUrl from '../../assets/icon.svg?url';
import type { FullJob, JobSummary, Page, Playlist, Provider, Status } from '../../shared/types';

const names: Record<Provider, string> = { spotify: 'Spotify', youtube: 'YouTube' };
const providers: Provider[] = ['spotify', 'youtube'];
let playlistPageQueue: Promise<void> = Promise.resolve();

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'Could not complete the request. Try again.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

function playlistPage(path: string): Promise<Page<Playlist>> {
  const request = playlistPageQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await api<Page<Playlist>>(path); }
      catch (cause) {
        if ((cause as Error & { status?: number }).status !== 409 || attempt >= 2) throw cause;
        await new Promise(resolve => setTimeout(resolve, [200, 500][attempt]));
      }
    }
  });
  playlistPageQueue = request.then(() => undefined, () => undefined);
  return request;
}

function Mark({ provider }: { provider: Provider }) {
  return <span aria-hidden="true" className={`service-mark ${provider}`}>{provider === 'spotify' ? '≋' : '▶'}</span>;
}

export const Route = createFileRoute('/')({ component: App });

export function App() {
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setError(params.get('connectionError'));
    if (params.has('connectionError')) window.history.replaceState(null, '', '/');
  }, []);

  const publishableConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  return <>
    <header className="topbar"><a href="/" className="wordmark"><img className="brand-logo" src={iconUrl} alt="" /> Setlist</a>
      <span className="local-badge"><span /> Private, request-driven transfers</span>
      <div className="topbar-actions"><button className="text-button" onClick={() => setSetup(value => !value)} aria-expanded={setup}>Account setup</button>
        {publishableConfigured ? <AuthControls /> : <span className="small">Sign-in setup required</span>}
      </div>
    </header>
    <main>
      <section className="intro"><div><h1>Your playlists.<br />On both sides.</h1><p>Bring the soundtrack with you. Move playlists between Spotify and YouTube, with a say in every match.</p></div><div className="bridge-art" aria-hidden="true"><Mark provider="spotify" /><span className="bridge-line">↔</span><Mark provider="youtube" /></div></section>
      {error ? <div role="alert" className="notice error"><span>{error}</span><button className="text-button" onClick={() => setError(null)}>Dismiss</button></div> : null}
      {setup ? <Setup status={null} /> : null}
      {!publishableConfigured ? <div className="notice"><div><strong>Set up secure sign-in to use your workspace.</strong><p>Configure Clerk keys in your Worker and publishable key in the Vite environment. Provider credentials remain separate.</p></div><button className="secondary" onClick={() => setSetup(true)}>View setup steps</button></div> : null}
      {publishableConfigured ? <AuthSession onError={setError} onSetup={() => setSetup(true)} /> : null}
      <footer><span>Personal use. No transfer subscription. No app-imposed song cap.</span><span className="footer-links"><span>Platform quotas apply; active work advances one request at a time.</span><a href="/privacy-policy">Privacy</a><a href="/terms-of-service">Terms</a></span></footer>
    </main>
  </>;
}

function AuthControls() {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <span className="small">Loading sign-in…</span>;
  return userId ? <UserButton /> : <SignInButton mode="modal"><button className="connect">Sign in</button></SignInButton>;
}

function AuthSession({ onError, onSetup }: { onError: (message: string | null) => void; onSetup: () => void }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status" className="loading">Checking sign-in…</p>;
  if (!userId) return <div className="empty-workspace sign-in-prompt"><span aria-hidden="true">↔</span><h3>Sign in to your private workspace</h3><p>Your connected music accounts and transfer reviews belong to your Clerk account.</p><SignInButton mode="modal"><button className="primary">Sign in to continue</button></SignInButton></div>;
  return <Workspace userId={userId} onError={onError} onSetup={onSetup} />;
}

function Workspace({ userId, onError, onSetup }: { userId: string; onError: (message: string | null) => void; onSetup: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<FullJob | null>(null);
  const [armed, setArmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const runToken = useRef(0);

  useEffect(() => {
    runToken.current++;
    setArmed(false);
    setStatus(null); setJobs([]); setActiveId(null); setActiveJob(null);
    if (!userId) return;
    let live = true;
    Promise.all([api<Status>('/status'), api<JobSummary[]>('/jobs')]).then(async ([nextStatus, nextJobs]) => {
      const first = nextJobs[0];
      const full = first ? await api<FullJob>(`/jobs/${first.id}`) : null;
      if (!live) return;
      setStatus(nextStatus); setJobs(nextJobs); setActiveId(first?.id ?? null); setActiveJob(full);
    }).catch((cause: unknown) => { if (live) onError((cause as Error).message); });
    return () => { live = false; };
  }, [userId, refresh]);

  useEffect(() => () => { runToken.current++; }, []);

  async function runJob(initial: FullJob) {
    const token = ++runToken.current;
    setActiveId(initial.id); setActiveJob(initial); setArmed(true);
    let job = initial;
    try {
      while (token === runToken.current && job.state === 'running' && job.phase !== 'review' && job.phase !== 'complete') {
        const summary = await api<JobSummary>(`/jobs/${job.id}/step`, {});
        if (token !== runToken.current) return;
        setJobs(current => [summary, ...current.filter(item => item.id !== summary.id)]);
        job = { ...job, ...summary };
        setActiveJob(job);
        if (summary.state !== 'running' || summary.phase === 'review' || summary.phase === 'complete') {
          job = await api<FullJob>(`/jobs/${job.id}`);
          if (token !== runToken.current) return;
          setActiveJob(job);
          break;
        }
      }
    } catch (cause) {
      if (token === runToken.current) {
        onError((cause as Error).message);
        try { const latest = await api<FullJob>(`/jobs/${job.id}`); if (token === runToken.current) setActiveJob(latest); } catch { /* The original request error is more useful here. */ }
      }
    }
    finally { if (token === runToken.current) setArmed(false); }
  }

  async function openJob(id: string) {
    runToken.current++; setArmed(false); setActiveId(id);
    try { setActiveJob(await api<FullJob>(`/jobs/${id}`)); }
    catch (cause) { onError((cause as Error).message); }
  }

  function updateJob(job: FullJob) {
    setActiveJob(job);
    setJobs(current => [job, ...current.filter(item => item.id !== job.id)]);
    setActiveId(job.id);
  }

  if (!status) return <p role="status" className="loading">Loading your workspace…</p>;
  return <>
    {!status.configured.spotify || !status.configured.youtube ? <div className="notice"><div><strong>Connect your own music accounts.</strong><p>Spotify and Google OAuth are separate from signing in to Setlist.</p></div><button className="secondary" onClick={onSetup}>View setup steps</button></div> : null}
    <div className="libraries">{providers.map(provider => <Library key={provider} provider={provider} status={status} onError={onError} onSetup={onSetup} onCreated={job => { updateJob(job); void runJob(job); }} onDisconnect={() => setRefresh(value => value + 1)} />)}</div>
    <section className="transfer-section" aria-labelledby="transfer-heading"><div className="section-heading"><div><h2 id="transfer-heading">Transfer workspace</h2><p>Match first. Review the results. Create a private playlist.</p></div>{jobs.length ? <label className="history-label">Transfer<select value={activeId || ''} onChange={event => void openJob(event.target.value)}>{jobs.map(job => <option key={job.id} value={job.id}>{job.name} · {job.phase}</option>)}</select></label> : null}</div>
      {activeJob ? <Transfer key={activeJob.id} job={activeJob} armed={armed} onStart={runJob} onUpdate={updateJob} onError={onError} /> : <div className="empty-workspace"><span aria-hidden="true">↔</span><h3>A new home for your favorites</h3><p>Connect both accounts, then choose a playlist above.<br />You’ll review the songs here before anything is created.</p></div>}
    </section>
  </>;
}

function Setup({ status }: { status: Status | null }) {
  const base = import.meta.env.VITE_APP_URL || 'https://your-domain.example';
  return <section className="setup-panel" aria-labelledby="setup-heading"><h2 id="setup-heading">Configure sign-in and provider access</h2>
    <p>Set Worker secrets for Clerk, Spotify, Google, and token encryption. Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> when building the app. Local development reads values from <code>.env.local</code>.</p>
    <div className="setup-columns"><div><h3>Clerk</h3><p>Set <code>CLERK_SECRET_KEY</code> and the public key. Clerk production sign-in needs a domain you control.</p></div><div><h3>Spotify</h3><p>Register this callback in your Spotify app:</p><code className="callback">{status?.callbacks.spotify || `${base}/auth/spotify/callback`}</code><p>Set <code>SPOTIFY_CLIENT_ID</code>.</p></div><div><h3>YouTube</h3><p>Enable YouTube Data API v3 and register this callback:</p><code className="callback">{status?.callbacks.youtube || `${base}/auth/youtube/callback`}</code><p>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.</p></div><div><h3>Worker settings</h3><p>Configure <code>APP_URL</code>, <code>TOKEN_ENCRYPTION_KEY</code>, and the D1 binding. Never put secrets in browser storage.</p></div></div>
  </section>;
}

function Library({ provider, status, onError, onSetup, onCreated, onDisconnect }: { provider: Provider; status: Status; onError: (message: string) => void; onSetup: () => void; onCreated: (job: FullJob) => void; onDisconnect: () => void }) {
  const account = status.accounts[provider];
  const destination: Provider = provider === 'spotify' ? 'youtube' : 'spotify';
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<Playlist | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    if (!account) { setPlaylists([]); setCursor(undefined); return; }
    let live = true;
    setLoading(true); setLoadError(null); setPlaylists([]); setCursor(undefined);
    playlistPage(`/playlists/${provider}`).then(page => { if (live) { setPlaylists(page.items); setCursor(page.nextCursor); } }).catch(cause => { if (live) setLoadError((cause as Error).message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [account?.id, provider, reload]);

  async function loadMore() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    try { const page = await playlistPage(`/playlists/${provider}?cursor=${encodeURIComponent(cursor)}`); setPlaylists(current => [...current, ...page.items]); setCursor(page.nextCursor); }
    catch (cause) { setLoadError((cause as Error).message); }
    finally { setMoreBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm(`Disconnect ${names[provider]}? This also deletes your saved transfer history.`)) return;
    setBusy(true);
    try { await api(`/accounts/${provider}/disconnect`, {}); onDisconnect(); }
    catch (cause) { onError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!chosen) return;
    setBusy(true);
    try { onCreated(await api<FullJob>('/jobs', { source: provider, playlistId: chosen.id, name })); setChosen(null); }
    catch (cause) { onError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const filtered = playlists.filter(playlist => playlist.name.toLowerCase().includes(filter.toLowerCase()));
  return <section className={`library ${provider}`} aria-label={`${names[provider]} library`}><div className="library-header"><div className="service-name"><Mark provider={provider} /><div><h2>{names[provider]}</h2><p>{account ? account.name : 'Connect your music library'}</p></div></div>{account ? <button disabled={busy} className="text-button" onClick={disconnect}>Disconnect</button> : status.configured[provider] ? <a className="connect" href={`/auth/${provider}`}>Connect</a> : <button className="connect" onClick={onSetup}>Set up</button>}</div>
    {!account ? <div className="library-empty"><span className="record" aria-hidden="true">♪</span><h3>{provider === 'spotify' ? 'Start with the songs you love' : 'Put a picture to your playlist'}</h3><p>{provider === 'spotify' ? 'Your saved playlists will appear once you connect Spotify.' : 'Connect YouTube to browse playlists and create music video collections.'}</p></div> : <>
      <div className="library-tools"><label><span className="sr-only">Search {names[provider]} playlists</span><input type="search" placeholder="Find a playlist" value={filter} onChange={event => setFilter(event.target.value)} /></label><button className="text-button" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? 'Loading…' : 'Refresh'}</button></div>
      {loadError ? <div role="alert" className="inline-error">{loadError} <button className="text-button" onClick={() => setReload(value => value + 1)}>Retry</button></div> : null}
      {!loading && !loadError && !filtered.length ? <p className="no-results">{playlists.length ? 'No playlists match your search.' : 'No playlists found in this account.'}</p> : null}
      <ul className="playlist-list">{filtered.map(playlist => {
        const disabledReason = !playlist.transferable
          ? provider === 'spotify'
            ? 'Spotify only shares tracks from playlists you own or collaborate on. Ask the owner to add you as a collaborator, or copy the songs into your own Spotify playlist.'
            : 'This playlist’s tracks are unavailable for transfer.'
          : !status.accounts[destination] ? `Connect ${names[destination]} to transfer this playlist.` : null;
        const reasonId = `${provider}-playlist-${playlist.id}-reason`;
        return <li key={playlist.id}>
          <div className="cover">{playlist.image ? <img src={playlist.image} alt="" loading="lazy" /> : <span aria-hidden="true">♫</span>}</div>
          <div className="playlist-info">
            <a href={playlist.url} target="_blank" rel="noreferrer">{playlist.name}</a>
            <p>{playlist.count.toLocaleString()} tracks</p>
            {disabledReason ? <p id={reasonId}>{disabledReason}</p> : null}
          </div>
          <button className="transfer-button" disabled={Boolean(disabledReason) || busy} aria-describedby={disabledReason ? reasonId : undefined} title={disabledReason || `Transfer to ${names[destination]}`} onClick={() => { setChosen(playlist); setName(playlist.name); }}>Transfer <span aria-hidden="true">↗</span></button>
        </li>;
      })}</ul>
      {cursor ? <div className="load-more"><button className="secondary" disabled={moreBusy} onClick={() => void loadMore()}>{moreBusy ? 'Loading…' : 'Load more playlists'}</button></div> : null}
    </>}
    {chosen ? <form className="transfer-form" onSubmit={create}><h3>Copy to {names[destination]}</h3><label>New playlist name<input autoFocus value={name} onChange={event => setName(event.target.value)} required maxLength={150} /></label><p>We’ll find matches for review before anything is created.</p><div className="actions"><button type="button" className="text-button" disabled={busy} onClick={() => setChosen(null)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Starting…' : 'Find matches'}</button></div></form> : null}
  </section>;
}

function Transfer({ job, armed, onStart, onUpdate, onError }: { job: FullJob; armed: boolean; onStart: (job: FullJob) => void; onUpdate: (job: FullJob) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const selected = job.selectedCount;
  const matched = job.matchedCount;
  const pages = Math.ceil(job.items.length / 25);
  async function action(path: string, data: unknown = {}, start = false) {
    setBusy(true);
    try { const next = await api<FullJob>(`/jobs/${job.id}/${path}`, data); onUpdate(next); if (start) onStart(next); }
    catch (cause) { onError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const active = job.state === 'running' && job.phase !== 'review' && job.phase !== 'complete';
  return <div className="transfer-detail"><div className="transfer-top"><div><div className="direction"><span className={`dot ${job.source}`} />{names[job.source]}<span aria-hidden="true">→</span><span className={`dot ${job.destination}`} />{names[job.destination]}</div><h3>{job.name}</h3><p>{job.phase === 'loading' ? `${job.totalCount} tracks loaded` : job.phase === 'matching' ? `${matched} of ${job.totalCount} tracks checked` : job.phase === 'transferring' ? `${job.inserted} of ${selected} tracks added` : job.phase === 'complete' ? `${job.inserted} tracks transferred` : `${selected} selected · ${job.totalCount - selected} skipped`}</p></div><div className="actions">
      {job.state === 'paused' ? <button className="primary" disabled={busy} onClick={() => void action('resume', {}, true)}>Resume transfer</button> : job.phase === 'review' ? <button className="primary" disabled={busy || selected === 0} onClick={() => void action('approve', {}, true)}>{busy ? 'Saving…' : 'Create private playlist'}</button> : job.phase === 'complete' && job.destinationUrl ? <a href={job.destinationUrl} className="primary" target="_blank" rel="noreferrer">Open playlist</a> : active && !armed ? <button className="primary" disabled={busy} onClick={() => void action('resume', {}, true)}>Continue transfer</button> : active ? <span role="status" className="working">{job.phase === 'loading' ? 'Loading tracks…' : job.phase === 'matching' ? 'Finding matches…' : 'Adding tracks…'}</span> : null}
    </div></div>
    {active && armed ? <progress aria-label="Transfer progress" value={job.phase === 'loading' ? job.totalCount : job.phase === 'matching' ? matched : job.inserted} max={job.phase === 'loading' ? Math.max(job.totalCount, 1) : job.phase === 'matching' ? Math.max(job.totalCount, 1) : Math.max(selected, 1)} /> : null}
    {job.message ? <p role="status" className="paused-message">{job.message}</p> : null}
    {job.phase === 'review' ? <p className="review-note">Matches are suggestions. Open a result to check it, choose another candidate, or skip the track.</p> : null}
    <ol className="match-list" start={page * 25 + 1}>{job.items.slice(page * 25, page * 25 + 25).map((item, offset) => {
      const index = page * 25 + offset;
      return <li key={index}><div className="match-main"><span className="track-number">{index + 1}</span><div className="source-track">{item.source.url ? <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title}</a> : <strong>{item.source.title}</strong>}<p>{item.source.artist || 'Unavailable item'}</p></div><span aria-hidden="true" className="match-arrow">→</span><div className="destination-track">{item.selected ? <><a href={item.selected.url} target="_blank" rel="noreferrer">{item.selected.title} ↗</a><p>{item.selected.artist}</p></> : <span className="muted">{!item.searched ? 'Waiting for search' : item.source.unavailable ? 'Unavailable · skipped' : 'Skipped'}</span>}</div>{job.phase === 'review' ? <button className="text-button" disabled={busy || item.source.unavailable} aria-expanded={expanded === index} onClick={() => { setExpanded(expanded === index ? null : index); setQuery(`${item.source.artist} ${item.source.title}`); }}>{expanded === index ? 'Close' : 'Review'}</button> : null}</div>
        {expanded === index && job.phase === 'review' ? <div className="match-editor"><label>Choose a match<select aria-label={`Match for ${item.source.title}`} disabled={busy} value={item.selected?.id || ''} onChange={event => void action('select', { index, candidateId: event.target.value || null })}><option value="">Skip this track</option>{item.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title} — {candidate.artist} (score {candidate.score}/100)</option>)}</select></label><form onSubmit={event => { event.preventDefault(); void action('search', { index, query }); }}><label>Search for another version<input value={query} maxLength={200} required onChange={event => setQuery(event.target.value)} /></label><button className="secondary" disabled={busy}>Search</button></form><p className="small">Scores rank suggestions; they do not guarantee the recording or official video.</p></div> : null}
      </li>;
    })}</ol>
    {pages > 1 ? <nav className="pagination" aria-label="Track pages"><button className="secondary" disabled={page === 0} onClick={() => { setPage(value => value - 1); setExpanded(null); }}>Previous</button><span>Page {page + 1} of {pages}</span><button className="secondary" disabled={page + 1 === pages} onClick={() => { setPage(value => value + 1); setExpanded(null); }}>Next</button></nav> : null}
    {job.destinationUrl && job.phase !== 'complete' ? <a className="partial-playlist" href={job.destinationUrl} target="_blank" rel="noreferrer">Open the playlist in progress</a> : null}
  </div>;
}
