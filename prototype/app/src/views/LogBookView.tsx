import { useState } from 'react';
import { Cover } from '../components/Cover';
import { currentWeek, history, laneName, weekSeconds } from '../domain/candidates';
import { artistNames, fmtClock, fmtDur, fmtHM, genreName, shortDate, weekRange } from '../domain/format';
import type { Verdict, Week } from '../domain/types';
import { useStore } from '../state/store';

export const VERDICTS: [Verdict, string][] = [['heavy', 'Heavy rotation'], ['keep', 'Keep in rotation'], ['pulled', 'Pulled']];

export function LogBookView() {
  const { s, dispatch } = useStore();
  const wk = currentWeek(s);
  const closed = s.weeks.filter(w => w.closed).reverse();
  const [open, setOpen] = useState<string | null>(closed.find(w => w.entries.some(e => !e.verdict))?.id ?? closed[0]?.id ?? null);

  const strip = (w: Week) => {
    const t = weekSeconds(s, w) || 1;
    return <span className="strip">{w.entries.map(e => { const a = s.albums[e.albumId]; return a ? <i key={e.albumId} style={{ flex: a.seconds / t, background: `var(--g-${a.genre})` }} /> : null; })}</span>;
  };

  // Artist status from the latest verdict on any of their albums.
  const h = history(s);
  const groups = VERDICTS.map(([v, label]) => ({
    v, label,
    list: Object.entries(h.artistVerdict).filter(([, m]) => m.verdict === v).map(([id, m]) => ({ id, name: s.artists[id]?.name ?? id, week: m.week }))
      .sort((a, b) => b.week - a.week || a.name.localeCompare(b.name)),
  }));
  const rated = closed.flatMap(w => w.entries).filter(e => e.verdict);
  const heavy = rated.filter(e => e.verdict === 'heavy').length;
  const hours = closed.reduce((t, w) => t + weekSeconds(s, w), 0);

  return (
    <main className="v-book">
      <section className="pane">
        <div className="ph"><h2>Log book</h2><span>Every week you have programmed, newest first</span></div>
        <a className="wk draft" href="#/log">
          <span className="w">Week {wk.number}</span><span className="dim">{weekRange(wk.startsOn)}</span>
          <span className="mono">{fmtClock(weekSeconds(s, wk))}</span><span>{wk.entries.length} albums</span>{strip(wk)}
          <span className="vc"><span><span className={'lamp ' + (wk.sent ? 'air' : 'amber')} />{wk.sent ? 'On air' : 'On the desk'}</span></span><span className="chev">›</span>
        </a>
        {closed.map(w => {
          const isOpen = open === w.id, c = (v: Verdict) => w.entries.filter(e => e.verdict === v).length, un = w.entries.filter(e => !e.verdict).length;
          return (
            <div key={w.id}>
              <button className="wk" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : w.id)}>
                <span className="w">Week {w.number}</span><span className="dim">{weekRange(w.startsOn)}</span>
                <span className="mono">{fmtClock(weekSeconds(s, w))}</span><span>{w.entries.length} albums</span>{strip(w)}
                <span className="vc"><span>{c('heavy')} heavy</span><span>{c('keep')} kept</span><span>{c('pulled')} pulled</span>{un > 0 && <span className="unrated">{un} unrated</span>}</span>
                <span className="chev">›</span>
              </button>
              {isOpen && (
                <div className="wk-items">
                  {w.sent && <p className="sent">Sent to Spotify on {shortDate(w.sent.at.slice(0, 10))} as <span className="mono">{w.sent.playlistRef.slice(0, 26)}…</span></p>}
                  {w.entries.map(e => {
                    const a = s.albums[e.albumId];
                    if (!a) return null;
                    return (
                      <div key={e.albumId} className="wi">
                        <Cover album={a} className="thumb" />
                        <div className="wi-main">
                          <a className="t" href={`#/library/${a.id}`}>{artistNames(s, a)}<em>{a.title}</em></a>
                          <span className="wi-meta">{laneName(e.lane)}. {e.reason}</span>
                          <input className="note-in" defaultValue={e.note ?? ''} placeholder="Add a note" aria-label={`Note on ${a.title}`}
                            onBlur={ev => { if (ev.target.value !== (e.note ?? '')) dispatch({ type: 'entryNote', weekId: w.id, albumId: a.id, note: ev.target.value }); }} />
                        </div>
                        <i className="dot" style={{ background: `var(--g-${a.genre})` }} title={genreName(a.genre)} />
                        <span className="mono dim">{fmtDur(a.seconds)}</span>
                        <span className="vs" role="group" aria-label="Verdict">
                          {VERDICTS.map(([v, l]) => (
                            <button key={v} className={v === 'pulled' ? 'pulled' : ''} aria-pressed={e.verdict === v}
                              onClick={() => dispatch({ type: 'verdict', weekId: w.id, albumId: a.id, verdict: e.verdict === v ? undefined : v })}>{l}</button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!closed.length && <p className="empty">No closed weeks yet. Close this week from the log and it lands here.</p>}
      </section>

      <section className="pane rot">
        <div className="ph"><h2>Rotation</h2><span>From your verdicts</span></div>
        <div className="stats">
          <div><b>{closed.length}</b><span>weeks logged</span></div>
          <div><b>{fmtHM(hours).replace(' min', 'm').replace(' h ', 'h ')}</b><span>programmed</span></div>
          <div><b>{rated.length ? Math.round((heavy / rated.length) * 100) : 0}%</b><span>heavy rotation</span></div>
        </div>
        {groups.map(g => (
          <div key={g.v}>
            <h3>{g.label}<span>{g.list.length}</span></h3>
            {g.list.map(x => <div key={x.id} className="ra">{x.name}<span>Week {x.week}</span></div>)}
          </div>
        ))}
        <p className="hint pad">Heavy rotation albums come back as Gold after {s.policy.goldCooldownWeeks} weeks. Keep in rotation fills Recurrents. Pulled artists stop appearing.</p>
      </section>
    </main>
  );
}
