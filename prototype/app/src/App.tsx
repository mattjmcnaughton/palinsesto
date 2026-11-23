import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentWeek, entryFor, weekSeconds } from './domain/candidates';
import { artistNames, fmtClock, fmtDur, shortDate, SERVICE_NAMES, SERVICE_ORDER, weekRange } from './domain/format';
import type { State } from './domain/types';
import { createSpotifyPlaylist } from './services/mock';
import { load, reducer, save, StoreCtx, type Action, type Store } from './state/store';
import { LibraryView } from './views/LibraryView';
import { LogBookView } from './views/LogBookView';
import { LogView } from './views/LogView';
import { SettingsView } from './views/SettingsView';

interface Toast { id: number; msg: string; undo: boolean }

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const [view = 'log', arg] = hash.replace(/^#\/?/, '').split('/');
  return { view, arg: arg ? decodeURIComponent(arg) : undefined };
}

export default function App() {
  const [s, setS] = useState<State>(load);
  const ref = useRef(s);
  const past = useRef<State[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sending, setSending] = useState(false);
  const { view, arg } = useRoute();

  useEffect(() => save(s), [s]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const dispatch = useCallback((a: Action, msg?: string, undoable = true) => {
    const prev = ref.current, next = reducer(prev, a);
    if (next === prev) return;
    if (undoable) { past.current.push(prev); if (past.current.length > 40) past.current.shift(); }
    ref.current = next;
    setS(next);
    if (msg) setToast({ id: Date.now(), msg, undo: undoable });
  }, []);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    ref.current = prev;
    setS(prev);
    setToast(null);
  };
  const store: Store = useMemo(() => ({ s, dispatch, toast: (msg: string) => setToast({ id: Date.now(), msg, undo: false }) }), [s, dispatch]);

  const wk = currentWeek(s);
  const total = weekSeconds(s, wk);
  const sentIds = wk.sent?.albumIds.join();
  const onAir = !!wk.sent && sentIds === wk.entries.map(e => e.albumId).join();

  const send = async () => {
    if (!s.connections.spotify) return store.toast('Connect Spotify in Settings to send the log.');
    if (!wk.entries.length) return store.toast('Nothing to send. The log is empty.');
    const linked = wk.entries.map(e => s.albums[e.albumId]).filter(a => a?.links.some(l => l.service === 'spotify'));
    const missing = wk.entries.length - linked.length;
    setSending(true);
    const res = await createSpotifyPlaylist(`Rotation, week ${wk.number} (${weekRange(wk.startsOn)})`, linked.map(a => a.links.find(l => l.service === 'spotify')!.ref));
    setSending(false);
    dispatch({ type: 'sent', weekId: wk.id, sent: { at: new Date().toISOString(), service: 'spotify', playlistRef: res.ref, albumIds: wk.entries.map(e => e.albumId) } },
      `On air. Week ${wk.number} is a Spotify playlist, ${linked.length} albums, ${fmtClock(total)}.` + (missing ? ` ${missing} with no Spotify link left out.` : ''), false);
  };

  // Command line: find an album in the catalog and add it.
  const [q, setQ] = useState('');
  const [hit, setHit] = useState(0);
  const cmd = useRef<HTMLInputElement>(null);
  const matches = q.trim()
    ? Object.values(s.albums).filter(a => !wk.entries.some(e => e.albumId === a.id) && `${artistNames(s, a)} ${a.title}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 7)
    : [];
  const addFromCmd = (id: string) => {
    dispatch({ type: 'add', entry: entryFor(s, id) }, `Added ${s.albums[id].title}.`);
    setQ(''); setHit(0);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).matches('input, textarea')) { e.preventDefault(); cmd.current?.focus(); }
      if ((e.key === 'z') && (e.metaKey || e.ctrlKey) && !(e.target as HTMLElement).matches('input, textarea')) { e.preventDefault(); undo(); }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  });

  const nav = [['log', 'Log'], ['book', 'Log book'], ['library', 'Library'], ['settings', 'Settings']];

  return (
    <StoreCtx.Provider value={store}>
      <div className="app">
        <header>
          <a className="mark" href="#/log"><span className={'lamp' + (onAir ? ' air' : '')} title={onAir ? 'On air' : 'Off air'} />Rotation</a>
          <span className="week">Week {wk.number}, from {shortDate(wk.startsOn)}</span>
          <nav>{nav.map(([v, l]) => <a key={v} href={`#/${v}`} aria-current={view === v ? 'page' : undefined}>{l}</a>)}</nav>
          <div className="outs">
            {SERVICE_ORDER.filter(x => x !== 'bandcamp').map((svc, i) => <a key={svc} href="#/settings"><span className={'lamp' + (s.connections[svc] ? ' on' : '')} />Out {i + 1} {SERVICE_NAMES[svc]}</a>)}
            <span className="dim">Synced {s.signals.syncedAt.slice(11, 16)}</span>
          </div>
        </header>

        {view === 'book' ? <LogBookView /> : view === 'library' ? <LibraryView albumId={arg} /> : view === 'settings' ? <SettingsView /> : <LogView key={wk.id} />}

        <footer>
          <label className="cmd">
            <span>&gt;</span>
            <input ref={cmd} value={q} placeholder="Find an album in your library and press Enter to add" autoComplete="off" aria-label="Find an album"
              onChange={e => { setQ(e.target.value); setHit(0); }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHit(h => Math.min(matches.length - 1, h + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHit(h => Math.max(0, h - 1)); }
                else if (e.key === 'Enter' && matches[hit]) addFromCmd(matches[hit].id);
                else if (e.key === 'Escape') { setQ(''); cmd.current?.blur(); }
              }} />
          </label>
          <div className="keys"><span><kbd>J</kbd><kbd>K</kbd>move</span><span><kbd>A</kbd>add</span><span><kbd>S</kbd>skip</span><span><kbd>X</kbd>pull</span><span><kbd>/</kbd>find</span></div>
          <span className="send-state">{wk.sent ? (onAir ? `On air since ${shortDate(wk.sent.at.slice(0, 10))}` : 'Log changed since it was sent') : ''}</span>
          <button className="btn primary send" onClick={send} disabled={sending || wk.closed}>
            {sending ? 'Sending to Spotify' : wk.sent && !onAir ? 'Update the Spotify playlist' : onAir ? 'Sent to Spotify' : 'Send to Spotify'}
          </button>
          {q.trim() && (
            <div className="results" role="listbox">
              {matches.length ? matches.map((a, i) => (
                <button key={a.id} className="row" aria-selected={i === hit} onMouseDown={e => { e.preventDefault(); addFromCmd(a.id); }}>
                  <span className="t">{artistNames(s, a)}<em>{a.title}</em></span><span className="d">{fmtDur(a.seconds)}</span>
                </button>
              )) : <p>No album in your library matches “{q}”. Search Spotify from First plays to import one.</p>}
            </div>
          )}
        </footer>

        {toast && (
          <div className="toast" key={toast.id} role="status">
            <span>{toast.msg}</span>
            {toast.undo && past.current.length > 0 && <button onClick={undo}>Undo</button>}
          </div>
        )}
      </div>
    </StoreCtx.Provider>
  );
}
