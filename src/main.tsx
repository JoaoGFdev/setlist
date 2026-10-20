import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Job, Playlist, Provider, Status } from '../shared/types';
import './styles.css';

const names: Record<Provider, string> = { spotify: 'Spotify', youtube: 'YouTube' };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not complete the request. Try again.');
  return data;
}
function Mark({ provider }: { provider: Provider }) {
  return <span aria-hidden="true" className={`service-mark ${provider}`}>{provider === 'spotify' ? '≋' : '▶'}</span>;
}
function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(new URLSearchParams(location.search).get('connectionError'));
  const [setup, setSetup] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([api<Status>('/status'), api<Job[]>('/jobs')]).then(([s, j]) => {
      if (live) { setStatus(s); setJobs(j); setActiveId(j[0]?.id || null); }
    }).catch(e => { if (live) setError(e.message); });
    if (location.search) history.replaceState(null, '', '/');
    return () => { live = false; };
  }, [refresh]);
  const active = jobs.find(j => j.id === activeId);
  const running = jobs.some(j => j.state === 'running');
  useEffect(() => {
    if (!running) return;
    let live = true;
    const interval = setInterval(() => {
      api<Job[]>('/jobs').then(j => { if (live) setJobs(j); }).catch(e => { if (live) setError(e.message); });
    }, 1500);
    return () => { live = false; clearInterval(interval); };
  }, [running]);
  const updateJob = (job: Job) => { setJobs(previous => [job, ...previous.filter(j => j.id !== job.id)]); setActiveId(job.id); };
  return <>
    <header className="topbar"><a href="/" className="wordmark"><span className="bridge-symbol" aria-hidden="true">⌒</span> Playlist Bridge</a><span className="local-badge"><span/> Running on your computer</span><button className="text-button" onClick={() => setSetup(!setup)} aria-expanded={setup}>Account setup</button></header>
    <main>
      <section className="intro"><div><h1>Your playlists.<br/>On both sides.</h1><p>Bring the soundtrack with you. Move playlists between Spotify and YouTube, with a say in every match.</p></div><div className="bridge-art" aria-hidden="true"><Mark provider="spotify"/><span className="bridge-line">↔</span><Mark provider="youtube"/></div></section>
      {error ? <div role="alert" className="notice error"><span>{error}</span><button className="text-button" onClick={() => setError(null)}>Dismiss</button></div> : null}
      {setup ? <Setup status={status}/> : null}
      {!status ? <p role="status" className="loading">Loading your workspace…</p> : <>
        {!status.configured.spotify || !status.configured.youtube ? <div className="notice"><div><strong>A one-time setup, then it’s your bridge.</strong><p>Register your own Spotify and Google apps to connect your accounts. There’s no transfer subscription.</p></div><button className="secondary" onClick={() => setSetup(true)}>View setup steps</button></div> : null}
        <div className="libraries">{(['spotify', 'youtube'] as Provider[]).map(provider => <Library key={provider} provider={provider} status={status} onError={setError} onSetup={() => setSetup(true)} onCreated={updateJob} onDisconnect={() => setRefresh(r => r + 1)}/>)}</div>
      </>}
      <section className="transfer-section" aria-labelledby="transfer-heading"><div className="section-heading"><div><h2 id="transfer-heading">Transfer workspace</h2><p>Match first. Review the results. Create a private playlist.</p></div>{jobs.length ? <label className="history-label">Transfer<select value={activeId || ''} onChange={e => setActiveId(e.target.value)}>{jobs.map(j => <option key={j.id} value={j.id}>{j.name} · {j.phase}</option>)}</select></label> : null}</div>
        {active ? <Transfer key={active.id} job={active} onUpdate={updateJob} onError={setError}/> : <div className="empty-workspace"><span aria-hidden="true">↔</span><h3>A new home for your favorites</h3><p>Connect both accounts, then choose a playlist above.<br/>You’ll review the songs here before anything is created.</p></div>}
      </section>
      <footer><span>Personal use. No transfer subscription. No app-imposed song cap.</span><span>Platform quotas still apply; saved transfers can be resumed.</span></footer>
    </main>
  </>;
}
function Setup({ status }: { status: Status | null }) {
  return <section className="setup-panel" aria-labelledby="setup-heading"><h2 id="setup-heading">Connect using your own app credentials</h2><p>Follow the full instructions in <code>docs/setup.md</code>. Keep client secrets in your local <code>.env</code> file.</p><div className="setup-columns"><div><h3>Spotify</h3><ol><li>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard</a> and create an app.</li><li>Add this exact redirect URI:<code className="callback">{status?.callbacks.spotify || 'http://127.0.0.1:3000/auth/spotify/callback'}</code></li><li>Set <code>SPOTIFY_CLIENT_ID</code> in <code>.env</code>. Add your Spotify user to the app’s allowlist.</li></ol><p className="small">The app owner needs Spotify Premium.</p></div><div><h3>YouTube</h3><ol><li>Create a <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud project</a> and enable YouTube Data API v3.</li><li>Configure consent, add yourself as a test user, and create a web OAuth client with this redirect URI:<code className="callback">{status?.callbacks.youtube || 'http://127.0.0.1:3000/auth/youtube/callback'}</code></li><li>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env</code>.</li></ol></div></div><p>Restart the app after changing credentials. In Google’s Testing mode, expect to reconnect about every seven days.</p></section>;
}
function Library({ provider, status, onError, onSetup, onCreated, onDisconnect }: { provider: Provider; status: Status; onError: (s: string) => void; onSetup: () => void; onCreated: (j: Job) => void; onDisconnect: () => void }) {
  const account = status.accounts[provider];
  const destination: Provider = provider === 'spotify' ? 'youtube' : 'spotify';
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<Playlist | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!account) { setPlaylists([]); return; }
    let live = true;
    setLoading(true); setLoadError(null);
    api<Playlist[]>(`/playlists/${provider}`).then(p => { if (live) setPlaylists(p); }).catch(e => { if (live) setLoadError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [account?.id, provider, reload]);
  async function disconnect() {
    setBusy(true);
    try { await api(`/accounts/${provider}/disconnect`, {}); onDisconnect(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    try { onCreated(await api<Job>('/jobs', { source: provider, playlistId: chosen.id, name })); setChosen(null); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  const filtered = playlists.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));
  return <section className={`library ${provider}`} aria-label={`${names[provider]} library`}><div className="library-header"><div className="service-name"><Mark provider={provider}/><div><h2>{names[provider]}</h2><p>{account ? account.name : 'Connect your music library'}</p></div></div>{account ? <button disabled={busy} className="text-button" onClick={disconnect}>Disconnect</button> : status.configured[provider] ? <a className="connect" href={`/auth/${provider}`}>Connect</a> : <button className="connect" onClick={onSetup}>Set up</button>}</div>
    {!account ? <div className="library-empty"><span className="record" aria-hidden="true">♪</span><h3>{provider === 'spotify' ? 'Start with the songs you love' : 'Put a picture to your playlist'}</h3><p>{provider === 'spotify' ? 'Your saved playlists will appear here once you connect Spotify.' : 'Connect YouTube to browse your playlists and create collections of music videos.'}</p></div> : <>
      <div className="library-tools"><label><span className="sr-only">Search {names[provider]} playlists</span><input type="search" placeholder="Find a playlist" value={filter} onChange={e => setFilter(e.target.value)}/></label><button className="text-button" disabled={loading} onClick={() => setReload(r => r + 1)}>{loading ? 'Loading…' : 'Refresh'}</button></div>
      {loadError ? <div role="alert" className="inline-error">{loadError} <button className="text-button" onClick={() => setReload(r => r + 1)}>Retry</button></div> : null}
      {!loading && !loadError && !filtered.length ? <p className="no-results">{playlists.length ? 'No playlists match your search.' : 'No playlists found in this account.'}</p> : null}
      <ul className="playlist-list">{filtered.map(p => <li key={p.id}><div className="cover">{p.image ? <img src={p.image} alt="" loading="lazy"/> : <span aria-hidden="true">♫</span>}</div><div className="playlist-info"><a href={p.url} target="_blank" rel="noreferrer">{p.name}</a><p>{p.count.toLocaleString()} tracks{!p.transferable ? ' · Contents unavailable via Spotify API' : ''}</p></div><button className="transfer-button" disabled={!p.transferable || !status.accounts[destination] || busy} title={!status.accounts[destination] ? `Connect ${names[destination]} first` : !p.transferable ? 'Spotify only exposes contents for owned or collaborative playlists' : `Transfer to ${names[destination]}`} onClick={() => { setChosen(p); setName(p.name); }}>Transfer <span aria-hidden="true">↗</span></button></li>)}</ul>
    </>}
    {chosen ? <form className="transfer-form" onSubmit={create}><h3>Copy to {names[destination]}</h3><label>New playlist name<input autoFocus value={name} onChange={e => setName(e.target.value)} required maxLength={150}/></label><p>First we’ll find matches for you to review. Your source playlist stays intact.</p><div className="actions"><button type="button" className="text-button" disabled={busy} onClick={() => setChosen(null)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Reading playlist…' : 'Find matches'}</button></div></form> : null}
  </section>;
}
function Transfer({ job, onUpdate, onError }: { job: Job; onUpdate: (j: Job) => void; onError: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const selected = job.items.filter(i => i.selected).length;
  const matched = job.items.filter(i => i.searched).length;
  const low = job.items.filter(i => i.selected && i.selected.score < 75).length;
  const pages = Math.ceil(job.items.length / 25);
  async function action(path: string, data: unknown = {}) {
    setBusy(true);
    try { onUpdate(await api<Job>(`/jobs/${job.id}/${path}`, data)); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="transfer-detail"><div className="transfer-top"><div><div className="direction"><span className={`dot ${job.source}`}/>{names[job.source]}<span aria-hidden="true">→</span><span className={`dot ${job.destination}`}/>{names[job.destination]}</div><h3>{job.name}</h3><p>{job.phase === 'matching' ? `${matched} of ${job.items.length} tracks checked` : job.phase === 'transferring' ? `${job.inserted} of ${selected} tracks added` : job.phase === 'complete' ? `${job.inserted} tracks transferred` : `${selected} selected · ${job.items.length - selected} skipped${low ? ` · ${low} matches to check closely` : ''}`}</p></div><div className="actions">
      {job.state === 'paused' ? <button className="primary" disabled={busy} onClick={() => action('resume')}>Resume transfer</button> : job.phase === 'review' ? <button className="primary" disabled={busy || selected === 0} onClick={() => action('approve')}>{busy ? 'Saving…' : 'Create private playlist'}</button> : job.phase === 'complete' && job.destinationUrl ? <a href={job.destinationUrl} className="primary" target="_blank" rel="noreferrer">Open playlist</a> : <span role="status" className="working">{job.phase === 'matching' ? 'Finding matches…' : 'Adding tracks…'}</span>}
    </div></div>
    {job.state === 'running' ? <progress aria-label="Transfer progress" value={job.phase === 'matching' ? matched : job.inserted} max={job.phase === 'matching' ? job.items.length : selected || 1}/> : null}
    {job.message ? <p role="status" className="paused-message">{job.message}</p> : null}
    {job.phase === 'review' ? <p className="review-note">{job.destination === 'youtube' ? 'Official music videos are preferred, but matches are suggestions. Open the video to check it, choose another result, or skip the track.' : 'YouTube titles can be ambiguous. Check the song and artist before creating your Spotify playlist.'}</p> : null}
    <ol className="match-list" start={page * 25 + 1}>{job.items.slice(page * 25, page * 25 + 25).map((item, offset) => {
      const index = page * 25 + offset;
      const editable = job.phase === 'review' && !busy;
      return <li key={index}><div className="match-main"><span className="track-number">{index + 1}</span><div className="source-track">{item.source.url ? <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title}</a> : <strong>{item.source.title}</strong>}<p>{item.source.artist || 'Unavailable item'}</p></div><span aria-hidden="true" className="match-arrow">→</span><div className="destination-track">{item.selected ? <><a href={item.selected.url} target="_blank" rel="noreferrer">{item.selected.title} ↗</a><p>{item.selected.artist}</p></> : <span className="muted">{!item.searched ? 'Waiting for search' : item.source.unavailable ? 'Unavailable · skipped' : 'Skipped'}</span>}</div>{job.phase === 'review' ? <button className="text-button" disabled={!editable || item.source.unavailable} aria-expanded={expanded === index} onClick={() => { setExpanded(expanded === index ? null : index); setQuery(`${item.source.artist} ${item.source.title}`); }}>{expanded === index ? 'Close' : 'Review'}</button> : null}</div>
        {expanded === index && job.phase === 'review' ? <div className="match-editor"><label>Choose a match<select aria-label={`Match for ${item.source.title}`} disabled={busy} value={item.selected?.id || ''} onChange={e => action('select', { index, candidateId: e.target.value || null })}><option value="">Skip this track</option>{item.candidates.map(c => <option key={c.id} value={c.id}>{c.title} — {c.artist} (score {c.score}/100)</option>)}</select></label><form onSubmit={e => { e.preventDefault(); void action('search', { index, query }); }}><label>Search for another version<input value={query} maxLength={200} required onChange={e => setQuery(e.target.value)}/></label><button className="secondary" disabled={busy}>Search</button></form><p className="small">Scores rank the suggestions; they do not guarantee the recording or official video. Each new YouTube search uses daily quota.</p></div> : null}
      </li>;
    })}</ol>
    {pages > 1 ? <nav className="pagination" aria-label="Track pages"><button className="secondary" disabled={page === 0} onClick={() => { setPage(p => p - 1); setExpanded(null); }}>Previous</button><span>Page {page + 1} of {pages}</span><button className="secondary" disabled={page + 1 === pages} onClick={() => { setPage(p => p + 1); setExpanded(null); }}>Next</button></nav> : null}
    {job.destinationUrl && job.phase !== 'complete' ? <a className="partial-playlist" href={job.destinationUrl} target="_blank" rel="noreferrer">Open the playlist in progress</a> : null}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
