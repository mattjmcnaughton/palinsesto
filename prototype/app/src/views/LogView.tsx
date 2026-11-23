import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock } from '../components/Clock';
import { Cover } from '../components/Cover';
import { candidates, currentWeek, entryFor, LANES, laneCode, weekSeconds, type Candidate } from '../domain/candidates';
import { artistNames, fmtClock, fmtDur, GENRES, genreName, weekRange, year } from '../domain/format';
import { checks } from '../domain/policy';
import type { Album } from '../domain/types';
import { inCatalog, searchSpotify, toCatalog, type RemoteAlbum } from '../services/mock';
import { useStore } from '../state/store';

const Icon = {
  up: <svg viewBox="0 0 12 12"><path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>,
  down: <svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>,
  x: <svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" /></svg>,
};

export function LogView() {
  const { s, dispatch } = useStore();
  const wk = currentWeek(s);
  const cands = useMemo(() => candidates(s), [s]);
  const onLog = useMemo(() => new Set(wk.entries.map(e => e.albumId)), [wk]);
  const lanes = LANES.map(l => ({
    ...l,
    list: cands.filter(c => c.lane === l.id && !s.skipped.includes(c.album.id)),
    skipped: cands.filter(c => c.lane === l.id && s.skipped.includes(c.album.id)).length,
  }));
  const flat = lanes.flatMap(l => l.list.map(c => c.album.id));
  const [sel, setSel] = useState<string | null>(() => flat.find(id => !onLog.has(id)) ?? null);
  const [ghost, setGhost] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const total = weekSeconds(s, wk);
  const name = (a: Album) => artistNames(s, a);
  const startOf = (id: string) => { let t = 0; for (const e of wk.entries) { if (e.albumId === id) return t; t += s.albums[e.albumId]?.seconds ?? 0; } return t; };

  const add = (id: string) => {
    if (onLog.has(id)) return;
    const a = s.albums[id];
    dispatch({ type: 'add', entry: entryFor(s, id) }, `Added ${a.title}. It airs at ${fmtClock(total)}.`);
  };
  const pull = (id: string) => dispatch({ type: 'remove', albumId: id }, `Pulled ${s.albums[id].title} from the log.`);
  const skip = (id: string) => {
    const i = flat.indexOf(id);
    setSel(flat[i + 1] ?? flat[i - 1] ?? null);
    dispatch({ type: 'skip', albumId: id }, `Skipped ${s.albums[id].title} for this week.`);
  };
  const focusRow = (id: string) => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = sel ? flat.indexOf(sel) : -1;
      if (e.key === 'j' || e.key === 'k') {
        const next = flat[Math.max(0, Math.min(flat.length - 1, i + (e.key === 'j' ? 1 : -1)))];
        if (next) { setSel(next); setGhost(null); focusRow(next); }
      } else if (e.key === 'a' && sel) add(sel);
      else if (e.key === 'x' && sel && onLog.has(sel)) pull(sel);
      else if (e.key === 's' && sel && !onLog.has(sel)) skip(sel);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const row = (c: Candidate) => {
    const a = c.album, on = onLog.has(a.id), isSel = sel === a.id;
    return (
      <div key={a.id}>
        <button className={'row' + (on ? ' onlog' : '')} data-row={a.id} aria-selected={isSel} onClick={() => { setSel(a.id); setGhost(null); }}
          onPointerEnter={() => setGhost(a.id)}>
          <Cover album={a} className="thumb" />
          <span className="t">{name(a)}<em>{a.title}</em></span>
          <span className={'y' + (on ? ' onl' : '')}>{on ? 'On log' : year(a.released)}</span>
          <span className="d">{fmtDur(a.seconds)}</span>
        </button>
        {isSel && (
          <div className="detail">
            <Cover album={a} className="art" />
            <div>
              <p className="why">{on ? wk.entries.find(e => e.albumId === a.id)?.reason : c.reason}</p>
              <p className="meta">{a.title}, {year(a.released)}{a.label ? `, ${a.label}` : ''}. {genreName(a.genre)}, {fmtDur(a.seconds)}.</p>
              <div className="detail-acts">
                {on ? <>
                  <button className="btn" onClick={() => pull(a.id)}>Pull from log <kbd>X</kbd></button>
                  <span className="airs">Airs at {fmtClock(startOf(a.id))}</span>
                </> : <>
                  <button className="btn primary" onClick={() => add(a.id)}>Add to log <kbd>A</kbd></button>
                  <button className="btn" onClick={() => skip(a.id)}>Skip <kbd>S</kbd></button>
                </>}
                <a className="link" href={`#/library/${a.id}`}>Record</a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Program log
  const max = s.policy.maxHours * 3600, min = s.policy.minHours * 3600;
  let cum = 0, minShown = false, maxShown = false;
  const logRows = wk.entries.map((e, i) => {
    const a = s.albums[e.albumId];
    if (!a) return null;
    const st = cum; cum += a.seconds;
    const out = [];
    if (!maxShown && cum > max) { maxShown = true; out.push(<div key="max" className="rule max">{fmtClock(max)} maximum</div>); }
    out.push(
      <div key={a.id} className={'lr' + (cum > max ? ' over' : '') + (sel === a.id ? ' hl' : '') + (drag === a.id ? ' dragging' : '') + (over === i && drag ? ' drop' : '')}
        draggable onDragStart={ev => { setDrag(a.id); ev.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={ev => { if (drag) { ev.preventDefault(); setOver(i); } }}
        onDrop={ev => { ev.preventDefault(); if (drag && drag !== a.id) dispatch({ type: 'move', albumId: drag, to: i }); setDrag(null); setOver(null); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onClick={() => setSel(a.id)}>
        <span className="p">{String(i + 1).padStart(2, '0')}</span>
        <span className="in">{fmtClock(st)}</span>
        <span className="al" title={e.reason}>{name(a)}<em>{a.title}</em></span>
        <i className="dot" style={{ background: `var(--g-${a.genre})` }} title={genreName(a.genre)} />
        <span className="cat" title={e.reason}>{laneCode(e.lane)}</span>
        <span className="du">{fmtDur(a.seconds)}</span>
        <span className="act">
          <button className="ib" aria-label="Move up" disabled={i === 0} onClick={ev => { ev.stopPropagation(); dispatch({ type: 'move', albumId: a.id, to: i - 1 }); }}>{Icon.up}</button>
          <button className="ib" aria-label="Move down" disabled={i === wk.entries.length - 1} onClick={ev => { ev.stopPropagation(); dispatch({ type: 'move', albumId: a.id, to: i + 1 }); }}>{Icon.down}</button>
          <button className="ib" aria-label="Pull from log" onClick={ev => { ev.stopPropagation(); pull(a.id); }}>{Icon.x}</button>
        </span>
      </div>,
    );
    if (!minShown && cum >= min) { minShown = true; out.push(<div key="min" className="rule">{fmtClock(min)} minimum met</div>); }
    return out;
  });
  const left = max - total;

  // Meter bridge
  const ghostAlbum = ghost && !onLog.has(ghost) ? s.albums[ghost] : sel && !onLog.has(sel) ? s.albums[sel] : null;
  const items = wk.entries.map(e => s.albums[e.albumId]).filter(Boolean);
  const t = total || 1;
  const segs = (n: number, col: string) => (
    <span className="segs">{Array.from({ length: 10 }, (_, i) => <i key={i} style={i < n ? { background: col, boxShadow: 'none' } : undefined} />)}</span>
  );

  return (
    <main className="v-log">
      <section className="pane" onPointerLeave={() => setGhost(null)}>
        <div className="ph"><h2>Inputs</h2><span>{flat.length} candidates</span></div>
        {lanes.map((l, i) => (
          <section className="lane" key={l.id}>
            <div className="lane-h"><span className="no">{i + 1}</span><h3>{l.name}</h3><span className="n">{l.list.length}</span><p>{l.desc}</p></div>
            {l.list.length ? l.list.map(row) : <p className="lane-empty">{l.id === 'current' ? 'Nothing current this week.' : 'Nothing in this category right now.'}</p>}
            {l.id === 'first' && <SpotifySearch />}
            {l.skipped > 0 && <button className="restore" onClick={() => dispatch({ type: 'unskip' })}>{l.skipped} skipped this week. Bring them back</button>}
          </section>
        ))}
      </section>

      <section className="pane">
        <div className="ph"><h2>Program log</h2><span>Week {wk.number}, {weekRange(wk.startsOn)}</span><span className="r mono">{fmtClock(total)}</span></div>
        {wk.entries.length ? <>
          <div className="lr head"><span>#</span><span>In</span><span>Album</span><span /><span>Cat</span><span className="du">Dur</span><span /></div>
          {logRows}
          {!minShown && <div className="rule">{fmtClock(min - total)} to minimum</div>}
          <div className="out"><span>{left >= 0 ? `${fmtClock(left)} of air left` : `Overrun ${fmtClock(-left)}`}</span><span>Out <b>{fmtClock(total)}</b></span></div>
          <div className="close">
            {confirmClose ? <>
              <span>Close week {wk.number}? It moves to the log book for verdicts.</span>
              <button className="btn primary" onClick={() => { setConfirmClose(false); dispatch({ type: 'closeWeek' }, `Week ${wk.number} is in the log book. Week ${wk.number + 1} is on the desk.`); }}>Close week {wk.number}</button>
              <button className="btn" onClick={() => setConfirmClose(false)}>Keep working</button>
            </> : <button className="btn" onClick={() => setConfirmClose(true)}>Close week and start week {wk.number + 1}</button>}
          </div>
        </> : <p className="empty">Dead air. Add an album from the inputs to start the clock.</p>}
      </section>

      <section className="pane">
        <div className="ph"><h2>Meter bridge</h2></div>
        <Clock s={s} week={wk} ghost={ghostAlbum} selected={sel} onSelect={id => { setSel(id); }} />
        <div className="lamps">
          <span className={total >= min ? 'lit' : ''}><span className={'lamp' + (total >= min ? ' amber' : '')} />Minimum met</span>
          <span className={total > max ? 'lit' : ''}><span className={'lamp' + (total > max ? ' air' : '')} />Overrun</span>
        </div>
        <div className="sec">
          <h3>Rotation policy <a className="link" href="#/settings">Edit</a></h3>
          {checks(s, wk).map(c => (
            <div key={c.id} className={'pol' + (c.ok ? '' : ' miss')}><span className={'lamp ' + (c.ok ? 'on' : 'air')} /><span>{c.label}</span><span className="v">{c.value}</span></div>
          ))}
        </div>
        <div className="sec">
          <h3>Genres</h3>
          {GENRES.map(g => {
            const sec = items.filter(a => a.genre === g.id).reduce((x, a) => x + a.seconds, 0);
            return <div key={g.id} className="meter"><span>{g.name}</span>{segs(Math.round((sec / t) * 10), `var(--g-${g.id})`)}<span className="v">{Math.round((sec / t) * 100)}%</span></div>;
          })}
        </div>
        <div className="sec">
          <h3>Categories</h3>
          {LANES.map(l => {
            const n = wk.entries.filter(e => e.lane === l.id).length;
            return <div key={l.id} className="meter"><span>{l.name}</span>{segs(n, 'var(--text)')}<span className="v">{n}</span></div>;
          })}
        </div>
      </section>
    </main>
  );
}

/** The slot at the end of First plays: search Spotify for something new and import it. */
function SpotifySearch() {
  const { s, dispatch } = useStore();
  const wk = currentWeek(s);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ q: string; items: RemoteAlbum[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    const items = await searchSpotify(q);
    setRes({ q, items });
    setBusy(false);
  };
  const take = (ra: RemoteAlbum) => {
    const have = inCatalog(s, ra);
    if (have) return dispatch({ type: 'add', entry: entryFor(s, have.id) }, `Added ${have.title} from your catalog.`);
    const { album, artists } = toCatalog(ra, s);
    const lane = artists.every(a => !s.artists[a.id]) ? 'first' : 'manual';
    dispatch({ type: 'import', album, artists, entry: { albumId: album.id, lane, reason: `Found by searching Spotify for “${res?.q ?? q}”.` } },
      `Imported ${album.title} into your catalog and added it to the log.`);
  };

  return (
    <div className="slot">
      <form onSubmit={run}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Spotify for someone new" aria-label="Search Spotify" />
        <button className="btn" disabled={busy}>{busy ? 'Searching' : 'Search'}</button>
      </form>
      {res && (res.items.length ? (
        <div className="slot-res">
          {res.items.map(ra => {
            const have = inCatalog(s, ra), on = have && wk.entries.some(e => e.albumId === have.id);
            return (
              <div key={ra.ref} className="sr">
                <span className="t">{ra.artists.join(', ')}<em>{ra.title}</em></span>
                <span className="y">{ra.released.slice(0, 4)}</span>
                <span className="d">{fmtDur(ra.seconds)}</span>
                {on ? <span className="y onl">On log</span> : <button className="btn sm" onClick={() => take(ra)}>{have ? 'Add' : 'Import'}</button>}
              </div>
            );
          })}
          <p className="hint">Spotify returns at most 10 albums per search. Imported albums become records in your catalog.</p>
        </div>
      ) : <p className="hint">No albums on Spotify match “{res.q}”.</p>)}
    </div>
  );
}
