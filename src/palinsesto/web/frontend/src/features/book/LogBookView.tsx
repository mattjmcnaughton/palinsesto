import { useState } from "react";
import { Cover } from "../../components/Cover";
import {
  type Desk,
  VERDICTS,
  type Verdict,
  type Week,
  artistNames,
  currentWeek,
  fmtClock,
  fmtDur,
  fmtHM,
  genreName,
  laneName,
  shortDate,
  weekNumber,
  weekRange,
  weekSeconds,
} from "../../lib/desk";
import { useStore } from "../../lib/store";

/** Artist standing from the latest verdict on any of their albums in a closed week. */
export function rotationGroups(desk: Desk) {
  const latest: Record<string, { verdict: Verdict; week: number }> = {};
  for (const w of desk.weeks) {
    if (!w.closed) continue;
    for (const e of w.entries) {
      if (!e.verdict) continue;
      for (const id of desk.albums[e.album_id]?.artist_ids ?? [])
        latest[id] = { verdict: e.verdict, week: weekNumber(desk, w) };
    }
  }
  return VERDICTS.map(([v, label]) => ({
    v,
    label,
    list: Object.entries(latest)
      .filter(([, m]) => m.verdict === v)
      .map(([id, m]) => ({ id, name: desk.artists[id]?.name ?? id, week: m.week }))
      .sort((a, b) => b.week - a.week || a.name.localeCompare(b.name)),
  }));
}

export function LogBookView() {
  const { desk, act } = useStore();
  const wk = currentWeek(desk);
  const closed = desk.weeks.filter((w) => w.closed).reverse();
  const [open, setOpen] = useState<string | null>(
    closed.find((w) => w.entries.some((e) => !e.verdict))?.id ?? closed[0]?.id ?? null,
  );

  const strip = (w: Week) => {
    const t = weekSeconds(desk, w) || 1;
    return (
      <span className="strip">
        {w.entries.map((e) => {
          const a = desk.albums[e.album_id];
          return a ? (
            <i
              key={e.album_id}
              style={{ flex: a.seconds / t, background: `var(--g-${a.genre})` }}
            />
          ) : null;
        })}
      </span>
    );
  };

  const rated = closed.flatMap((w) => w.entries).filter((e) => e.verdict);
  const heavy = rated.filter((e) => e.verdict === "heavy").length;
  const hours = closed.reduce((t, w) => t + weekSeconds(desk, w), 0);
  const entryPath = (w: Week, albumId: string) => `/weeks/${w.id}/entries/${albumId}`;

  return (
    <main className="v-book">
      <section className="pane">
        <div className="ph">
          <h2>Log book</h2>
          <span>Every week you have programmed, newest first</span>
        </div>
        <a className="wk draft" href="#/">
          <span className="w">Week {weekNumber(desk, wk)}</span>
          <span className="dim">{weekRange(wk.starts_on)}</span>
          <span className="mono">{fmtClock(weekSeconds(desk, wk))}</span>
          <span>{wk.entries.length} albums</span>
          {strip(wk)}
          <span className="vc">
            <span>
              <span className={`lamp ${wk.sent ? "air" : "amber"}`} />
              {wk.sent ? "On air" : "On the desk"}
            </span>
          </span>
          <span className="chev">›</span>
        </a>
        {closed.map((w) => {
          const isOpen = open === w.id;
          const c = (v: Verdict) => w.entries.filter((e) => e.verdict === v).length;
          const un = w.entries.filter((e) => !e.verdict).length;
          return (
            <div key={w.id}>
              <button
                type="button"
                className="wk"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : w.id)}
              >
                <span className="w">Week {weekNumber(desk, w)}</span>
                <span className="dim">{weekRange(w.starts_on)}</span>
                <span className="mono">{fmtClock(weekSeconds(desk, w))}</span>
                <span>{w.entries.length} albums</span>
                {strip(w)}
                <span className="vc">
                  <span>{c("heavy")} heavy</span>
                  <span>{c("keep")} kept</span>
                  <span>{c("pulled")} pulled</span>
                  {un > 0 && <span className="unrated">{un} unrated</span>}
                </span>
                <span className="chev">›</span>
              </button>
              {isOpen && (
                <div className="wk-items">
                  {w.sent && (
                    <p className="sent">
                      Sent to Spotify on {shortDate(w.sent.at)} as{" "}
                      <span className="mono">{w.sent.playlist_ref}</span>
                    </p>
                  )}
                  {w.entries.map((e) => {
                    const a = desk.albums[e.album_id];
                    if (!a) return null;
                    return (
                      <div key={e.album_id} className="wi">
                        <Cover album={a} className="thumb" />
                        <div className="wi-main">
                          <a className="t" href={`#/library/${a.id}`}>
                            {artistNames(desk, a)}
                            <em>{a.title}</em>
                          </a>
                          <span className="wi-meta">
                            {laneName(e.lane)}. {e.reason}
                          </span>
                          <input
                            className="note-in"
                            defaultValue={e.note}
                            placeholder="Add a note"
                            aria-label={`Note on ${a.title}`}
                            onBlur={(ev) => {
                              if (ev.target.value !== e.note)
                                void act("PATCH", entryPath(w, a.id), { note: ev.target.value });
                            }}
                          />
                        </div>
                        <i
                          className="dot"
                          style={{ background: `var(--g-${a.genre})` }}
                          title={genreName(a.genre)}
                        />
                        <span className="mono dim">{fmtDur(a.seconds)}</span>
                        <fieldset className="vs" aria-label="Verdict">
                          {VERDICTS.map(([v, l]) => (
                            <button
                              type="button"
                              key={v}
                              className={v === "pulled" ? "pulled" : ""}
                              aria-pressed={e.verdict === v}
                              onClick={() =>
                                act(
                                  "PATCH",
                                  entryPath(w, a.id),
                                  e.verdict === v ? { clear_verdict: true } : { verdict: v },
                                )
                              }
                            >
                              {l}
                            </button>
                          ))}
                        </fieldset>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!closed.length && (
          <p className="empty">
            No closed weeks yet. Close this week from the log and it lands here.
          </p>
        )}
      </section>

      <section className="pane rot">
        <div className="ph">
          <h2>Rotation</h2>
          <span>From your verdicts</span>
        </div>
        <div className="stats">
          <div>
            <b>{closed.length}</b>
            <span>weeks logged</span>
          </div>
          <div>
            <b>{fmtHM(hours).replace(" min", "m").replace(" h ", "h ")}</b>
            <span>programmed</span>
          </div>
          <div>
            <b>{rated.length ? Math.round((heavy / rated.length) * 100) : 0}%</b>
            <span>heavy rotation</span>
          </div>
        </div>
        {rotationGroups(desk).map((g) => (
          <div key={g.v}>
            <h3>
              {g.label}
              <span>{g.list.length}</span>
            </h3>
            {g.list.map((x) => (
              <div key={x.id} className="ra">
                {x.name}
                <span>Week {x.week}</span>
              </div>
            ))}
          </div>
        ))}
        <p className="hint pad">
          Heavy rotation albums come back as Gold after {desk.policy.gold_cooldown_weeks} weeks.
          Keep in rotation fills Recurrents. Pulled artists stop appearing.
        </p>
      </section>
    </main>
  );
}
