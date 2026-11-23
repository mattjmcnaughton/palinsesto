import { useState } from 'react';
import { Cover } from '../components/Cover';
import { currentWeek, entryFor, laneName } from '../domain/candidates';
import { artistNames, fmtClock, fmtDur, genreName, SERVICE_NAMES, SERVICE_ORDER, year } from '../domain/format';
import type { ServiceId } from '../domain/types';
import { findMatch } from '../services/mock';
import { useStore } from '../state/store';
import { VERDICTS } from './LogBookView';

const CABLE = ['var(--g-jazz)', 'var(--g-ambient)', 'var(--g-electronic)', 'var(--g-rock)'];
const ROW = 56;

export function LibraryView({ albumId }: { albumId?: string }) {
  const { s, dispatch, toast } = useStore();
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<Partial<Record<ServiceId, 'search' | 'miss'>>>({});
  const all = Object.values(s.albums).sort((a, b) => artistNames(s, a).localeCompare(artistNames(s, b)) || a.released.localeCompare(b.released));
  const list = q ? all.filter(a => `${artistNames(s, a)} ${a.title} ${a.label ?? ''} ${genreName(a.genre)}`.toLowerCase().includes(q.toLowerCase())) : all;
  const a = (albumId && s.albums[albumId]) || all[0];
  const wk = currentWeek(s);
  const onLog = wk.entries.some(e => e.albumId === a.id);
  const logs = s.weeks.flatMap(w => w.entries.filter(e => e.albumId === a.id).map(e => ({ w, e })));

  const patch = async (service: ServiceId) => {
    setPending(p => ({ ...p, [service]: 'search' }));
    const link = await findMatch(service, a, s.artists[a.artistIds[0]]?.name ?? '');
    if (link) {
      dispatch({ type: 'link', albumId: a.id, link }, `Patched ${a.title} to ${SERVICE_NAMES[service]}.`);
      setPending(p => ({ ...p, [service]: undefined }));
    } else setPending(p => ({ ...p, [service]: 'miss' }));
  };

  const H = SERVICE_ORDER.length * ROW, mid = H / 2;

  return (
    <main className="v-lib">
      <section className="pane">
        <div className="ph"><h2>Library</h2><span>{all.length} albums in your catalog</span></div>
        <div className="filter"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by artist, title, label or genre" aria-label="Filter library" /></div>
        {list.map(x => (
          <a key={x.id} className="row" href={`#/library/${x.id}`} aria-selected={x.id === a.id}>
            <Cover album={x} className="thumb" />
            <span className="t">{artistNames(s, x)}<em>{x.title}</em></span>
            <span className="y">{year(x.released)}</span>
            <span className="d">{fmtDur(x.seconds)}</span>
          </a>
        ))}
        {!list.length && <p className="lane-empty">Nothing in your catalog matches “{q}”.</p>}
      </section>

      <section className="pane">
        <div className="rec" key={a.id}>
          <div className="rec-top">
            <Cover album={a} className="art big" />
            <div>
              <h1>{a.title}</h1>
              <p className="by">{a.artistIds.map(id => s.artists[id]?.name).join(', ')}</p>
              <dl className="kv">
                <dt>Catalog ID</dt><dd className="mono">{a.id}</dd>
                <dt>Released</dt><dd>{a.released}</dd>
                {a.label && <><dt>Label</dt><dd>{a.label}</dd></>}
                <dt>Length</dt><dd>{fmtClock(a.seconds)}, {a.tracks} tracks</dd>
                <dt>Genre</dt><dd>{genreName(a.genre)}</dd>
                {a.upc && <><dt>UPC</dt><dd className="mono">{a.upc}</dd></>}
              </dl>
              <div className="rec-acts">
                {onLog ? <span className="dim">On this week's log</span>
                  : <button className="btn primary" disabled={wk.closed} onClick={() => dispatch({ type: 'add', entry: entryFor(s, a.id) }, `Added ${a.title} to week ${wk.number}.`)}>Add to week {wk.number}</button>}
              </div>
            </div>
          </div>

          <div className="bay-h">Outputs<span>This record lives in your catalog. Outputs are the services where it plays.</span></div>
          <div className="bay" style={{ height: H + 16 }}>
            <div className="src"><div><div>Catalog</div><div className="mono dim">{a.id}</div></div><span className="jack on" /></div>
            <svg className="cables" viewBox={`0 0 120 ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {SERVICE_ORDER.map((svc, i) => a.links.some(l => l.service === svc) &&
                <path key={svc} d={`M0 ${mid} C 60 ${mid}, 60 ${i * ROW + ROW / 2}, 120 ${i * ROW + ROW / 2}`} stroke={CABLE[i]} strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" />)}
            </svg>
            <div>
              {SERVICE_ORDER.map((svc, i) => {
                const link = a.links.find(l => l.service === svc), st = pending[svc], connected = s.connections[svc];
                return (
                  <div key={svc} className="o">
                    <span className={'jack' + (link ? ' on' : '')} style={link ? { background: CABLE[i], borderColor: CABLE[i] } : undefined} />
                    <div>
                      <div className="lbl">Out {i + 1} {SERVICE_NAMES[svc]}</div>
                      <div className="sub">{link ? <span className="mono" title={link.ref}>{link.ref}</span>
                        : st === 'search' ? `Searching ${SERVICE_NAMES[svc]} by UPC, then artist and title`
                        : st === 'miss' ? `No match on ${SERVICE_NAMES[svc]}. It may not be stocked there.`
                        : connected ? 'Not patched' : 'Service not connected'}</div>
                    </div>
                    {link ? <button className="btn" onClick={() => dispatch({ type: 'unlink', albumId: a.id, service: svc }, `Unpatched ${SERVICE_NAMES[svc]}.`)}>Unpatch</button>
                      : <button className="btn" disabled={st === 'search'} onClick={() => connected ? patch(svc) : toast(`Connect ${SERVICE_NAMES[svc]} in Settings first.`)}>{st === 'miss' ? 'Try again' : 'Patch'}</button>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rec-grid">
            <div>
              <h3 className="sub-h">On logs</h3>
              {logs.length ? logs.map(({ w, e }) => (
                <div key={w.id} className="ra">
                  <span><a className="link" href={w.closed ? '#/book' : '#/log'}>Week {w.number}</a> as {laneName(e.lane)}</span>
                  <span>{e.verdict ? VERDICTS.find(v => v[0] === e.verdict)![1] : w.closed ? 'Unrated' : 'This week'}</span>
                </div>
              )) : <p className="dim">Not aired yet.</p>}
            </div>
            <div>
              <h3 className="sub-h">Your notes</h3>
              <textarea key={a.id} className="notes-in" defaultValue={a.note ?? ''} placeholder="What to listen for, where it fits" rows={4}
                onBlur={e => { if (e.target.value !== (a.note ?? '')) dispatch({ type: 'albumNote', albumId: a.id, note: e.target.value }); }} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
