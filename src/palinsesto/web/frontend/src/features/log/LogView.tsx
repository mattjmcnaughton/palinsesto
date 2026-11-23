import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Clock } from "../../components/Clock";
import { Cover } from "../../components/Cover";
import {
  type Album,
  type Candidate,
  GENRES,
  LANES,
  artistNames,
  currentWeek,
  fmtClock,
  fmtDur,
  genreName,
  laneCode,
  weekNumber,
  weekRange,
  weekSeconds,
  year,
} from "../../lib/desk";
import { useStore } from "../../lib/store";

const Icon = {
  up: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
};

/** The selection the three panes share: the candidate or log row in focus. */
export interface Selection {
  sel: string | null;
  setSel: (id: string | null) => void;
  ghost: string | null;
  setGhost: (id: string | null) => void;
}

function useActions() {
  const { desk, act } = useStore();
  const wk = currentWeek(desk);
  const total = weekSeconds(desk, wk);
  return {
    add: (id: string) =>
      act(
        "POST",
        "/log/entries",
        { album_id: id },
        `Added ${desk.albums[id].title}. It airs at ${fmtClock(total)}.`,
      ),
    pull: (id: string) =>
      act(
        "DELETE",
        `/log/entries/${id}`,
        undefined,
        `Pulled ${desk.albums[id].title} from the log.`,
      ),
    skip: (id: string) =>
      act("POST", "/log/skip", { album_id: id }, `Skipped ${desk.albums[id].title} for this week.`),
    move: (id: string, to: number) => act("POST", "/log/move", { album_id: id, to }),
  };
}

export function useLanes() {
  const { desk } = useStore();
  const wk = currentWeek(desk);
  return useMemo(() => {
    const skipped = new Set(wk.skipped);
    const lanes = LANES.map((l) => ({
      ...l,
      list: desk.candidates.filter((c) => c.lane === l.id && !skipped.has(c.album_id)),
      skipped: desk.candidates.filter((c) => c.lane === l.id && skipped.has(c.album_id)).length,
    }));
    return { lanes, flat: lanes.flatMap((l) => l.list.map((c) => c.album_id)) };
  }, [desk, wk]);
}

export function LogView() {
  const { desk } = useStore();
  const wk = currentWeek(desk);
  const { flat } = useLanes();
  const onLog = new Set(wk.entries.map((e) => e.album_id));
  const [sel, setSel] = useState<string | null>(() => flat.find((id) => !onLog.has(id)) ?? null);
  const [ghost, setGhost] = useState<string | null>(null);
  const selection = { sel, setSel, ghost, setGhost };
  const { add, pull, skip } = useActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input, textarea") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      const i = sel ? flat.indexOf(sel) : -1;
      if (e.key === "j" || e.key === "k") {
        const next = flat[Math.max(0, Math.min(flat.length - 1, i + (e.key === "j" ? 1 : -1)))];
        if (next) {
          setSel(next);
          setGhost(null);
          requestAnimationFrame(() => {
            const el = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(next)}"]`);
            el?.focus({ preventScroll: true });
            el?.scrollIntoView({ block: "nearest" });
          });
        }
      } else if (e.key === "a" && sel && !onLog.has(sel)) void add(sel);
      else if (e.key === "x" && sel && onLog.has(sel)) void pull(sel);
      else if (e.key === "s" && sel && !onLog.has(sel)) {
        setSel(flat[i + 1] ?? flat[i - 1] ?? null);
        void skip(sel);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <main className="v-log">
      <Inputs {...selection} />
      <ProgramLog {...selection} />
      <MeterBridge {...selection} />
    </main>
  );
}

/** Inputs: the four candidate lanes, with the Spotify search slot under First plays. */
export function Inputs({ sel, setSel, setGhost }: Selection) {
  const { desk, act } = useStore();
  const wk = currentWeek(desk);
  const { lanes, flat } = useLanes();
  const onLog = new Set(wk.entries.map((e) => e.album_id));
  const { add, pull, skip } = useActions();
  const startOf = (id: string) => {
    let t = 0;
    for (const e of wk.entries) {
      if (e.album_id === id) return t;
      t += desk.albums[e.album_id]?.seconds ?? 0;
    }
    return t;
  };

  const row = (c: Candidate) => {
    const a = desk.albums[c.album_id];
    if (!a) return null;
    const on = onLog.has(a.id);
    const isSel = sel === a.id;
    return (
      <div key={a.id}>
        <button
          type="button"
          className={`row${on ? " onlog" : ""}`}
          data-row={a.id}
          aria-selected={isSel}
          onClick={() => {
            setSel(a.id);
            setGhost(null);
          }}
          onPointerEnter={() => setGhost(a.id)}
        >
          <Cover album={a} className="thumb" />
          <span className="t">
            {artistNames(desk, a)}
            <em>{a.title}</em>
          </span>
          <span className={`y${on ? " onl" : ""}`}>{on ? "On log" : year(a.released)}</span>
          <span className="d">{fmtDur(a.seconds)}</span>
        </button>
        {isSel && (
          <div className="detail">
            <Cover album={a} className="art" />
            <div>
              <p className="why">
                {on ? wk.entries.find((e) => e.album_id === a.id)?.reason : c.reason}
              </p>
              <p className="meta">
                {a.title}, {year(a.released)}
                {a.label ? `, ${a.label}` : ""}. {genreName(a.genre)}, {fmtDur(a.seconds)}.
              </p>
              <div className="detail-acts">
                {on ? (
                  <>
                    <button type="button" className="btn" onClick={() => pull(a.id)}>
                      Pull from log <kbd>X</kbd>
                    </button>
                    <span className="airs">Airs at {fmtClock(startOf(a.id))}</span>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn primary" onClick={() => add(a.id)}>
                      Add to log <kbd>A</kbd>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const i = flat.indexOf(a.id);
                        setSel(flat[i + 1] ?? flat[i - 1] ?? null);
                        void skip(a.id);
                      }}
                    >
                      Skip <kbd>S</kbd>
                    </button>
                  </>
                )}
                <a className="link" href={`#/library/${a.id}`}>
                  Record
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="pane" onPointerLeave={() => setGhost(null)}>
      <div className="ph">
        <h2>Inputs</h2>
        <span>{flat.length} candidates</span>
      </div>
      {lanes.map((l, i) => (
        <section className="lane" key={l.id}>
          <div className="lane-h">
            <span className="no">{i + 1}</span>
            <h3>{l.name}</h3>
            <span className="n">{l.list.length}</span>
            <p>{l.desc}</p>
          </div>
          {l.list.length ? (
            l.list.map(row)
          ) : (
            <p className="lane-empty">
              {l.id === "current"
                ? "Nothing current this week."
                : "Nothing in this category right now."}
            </p>
          )}
          {l.id === "first" && <SpotifySearch />}
          {l.skipped > 0 && (
            <button type="button" className="restore" onClick={() => act("POST", "/log/skip", {})}>
              {l.skipped} skipped this week. Bring them back
            </button>
          )}
        </section>
      ))}
    </section>
  );
}

interface Found {
  ref: string;
  title: string;
  artists: string[];
  released: string;
  tracks: number;
  in_catalog: boolean;
}

/** The slot at the end of First plays: search Spotify for something new and import it. */
export function SpotifySearch() {
  const { desk, act, call, busy } = useStore();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; items: Found[] } | null>(null);
  const connected = desk.spotify.state === "connected";

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const items = await call<Found[]>("POST", "/spotify/search", { q });
    if (items) setRes({ q, items });
  };

  if (!connected)
    return (
      <div className="slot">
        <p className="hint">
          Connect Spotify in{" "}
          <a className="link" href="#/settings">
            Settings
          </a>{" "}
          to search for someone new.
        </p>
      </div>
    );
  return (
    <div className="slot">
      <form onSubmit={run}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Spotify for someone new"
          aria-label="Search Spotify"
        />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Searching" : "Search"}
        </button>
      </form>
      {res &&
        (res.items.length ? (
          <div className="slot-res">
            {res.items.map((ra) => (
              <div key={ra.ref} className="sr">
                <span className="t">
                  {ra.artists.join(", ")}
                  <em>{ra.title}</em>
                </span>
                <span className="y">{year(ra.released)}</span>
                <span className="d">{ra.tracks} tr</span>
                <button
                  type="button"
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "POST",
                      "/spotify/import",
                      { ref: ra.ref, add: true },
                      ra.in_catalog
                        ? `Added ${ra.title} from your catalog.`
                        : `Imported ${ra.title} into your catalog and added it to the log.`,
                    )
                  }
                >
                  {ra.in_catalog ? "Add" : "Import"}
                </button>
              </div>
            ))}
            <p className="hint">
              Spotify returns at most 10 albums per search. Imported albums become records in your
              catalog; set their genre in the Library.
            </p>
          </div>
        ) : (
          <p className="hint">No albums on Spotify match “{res.q}”.</p>
        ))}
    </div>
  );
}

/** The program log: the week's albums in air order, with in-times and the rules lines. */
export function ProgramLog({ sel, setSel }: Selection) {
  const { desk, act } = useStore();
  const wk = currentWeek(desk);
  const n = weekNumber(desk, wk);
  const { pull, move } = useActions();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const total = weekSeconds(desk, wk);
  const max = desk.policy.max_hours * 3600;
  const min = desk.policy.min_hours * 3600;
  let cum = 0;
  let minShown = false;
  let maxShown = false;
  const logRows = wk.entries.map((e, i) => {
    const a = desk.albums[e.album_id];
    if (!a) return null;
    const st = cum;
    cum += a.seconds;
    const out = [];
    if (!maxShown && cum > max) {
      maxShown = true;
      out.push(
        <div key="max" className="rule max">
          {fmtClock(max)} maximum
        </div>,
      );
    }
    out.push(
      // biome-ignore lint/a11y/useKeyWithClickEvents: rows also have move and pull buttons
      <div
        key={a.id}
        className={`lr${cum > max ? " over" : ""}${sel === a.id ? " hl" : ""}${drag === a.id ? " dragging" : ""}${over === i && drag ? " drop" : ""}`}
        draggable
        onDragStart={(ev) => {
          setDrag(a.id);
          ev.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(ev) => {
          if (drag) {
            ev.preventDefault();
            setOver(i);
          }
        }}
        onDrop={(ev) => {
          ev.preventDefault();
          if (drag && drag !== a.id) void move(drag, i);
          setDrag(null);
          setOver(null);
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        onClick={() => setSel(a.id)}
      >
        <span className="p">{String(i + 1).padStart(2, "0")}</span>
        <span className="in">{fmtClock(st)}</span>
        <span className="al" title={e.reason}>
          {artistNames(desk, a)}
          <em>{a.title}</em>
        </span>
        <i
          className="dot"
          style={{ background: `var(--g-${a.genre})` }}
          title={genreName(a.genre)}
        />
        <span className="cat" title={e.reason}>
          {laneCode(e.lane)}
        </span>
        <span className="du">{fmtDur(a.seconds)}</span>
        <span className="act">
          <button
            type="button"
            className="ib"
            aria-label="Move up"
            disabled={i === 0}
            onClick={(ev) => {
              ev.stopPropagation();
              void move(a.id, i - 1);
            }}
          >
            {Icon.up}
          </button>
          <button
            type="button"
            className="ib"
            aria-label="Move down"
            disabled={i === wk.entries.length - 1}
            onClick={(ev) => {
              ev.stopPropagation();
              void move(a.id, i + 1);
            }}
          >
            {Icon.down}
          </button>
          <button
            type="button"
            className="ib"
            aria-label="Pull from log"
            onClick={(ev) => {
              ev.stopPropagation();
              void pull(a.id);
            }}
          >
            {Icon.x}
          </button>
        </span>
      </div>,
    );
    if (!minShown && cum >= min) {
      minShown = true;
      out.push(
        <div key="min" className="rule">
          {fmtClock(min)} minimum met
        </div>,
      );
    }
    return out;
  });
  const left = max - total;

  return (
    <section className="pane">
      <div className="ph">
        <h2>Program log</h2>
        <span>
          Week {n}, {weekRange(wk.starts_on)}
        </span>
        <span className="r mono">{fmtClock(total)}</span>
      </div>
      {wk.entries.length ? (
        <>
          <div className="lr head">
            <span>#</span>
            <span>In</span>
            <span>Album</span>
            <span />
            <span>Cat</span>
            <span className="du">Dur</span>
            <span />
          </div>
          {logRows}
          {!minShown && <div className="rule">{fmtClock(min - total)} to minimum</div>}
          <div className="out">
            <span>
              {left >= 0 ? `${fmtClock(left)} of air left` : `Overrun ${fmtClock(-left)}`}
            </span>
            <span>
              Out <b>{fmtClock(total)}</b>
            </span>
          </div>
          <div className="close">
            {confirmClose ? (
              <>
                <span>Close week {n}? It moves to the log book for verdicts.</span>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setConfirmClose(false);
                    void act(
                      "POST",
                      "/log/close",
                      undefined,
                      `Week ${n} is in the log book. The next week is on the desk.`,
                    );
                  }}
                >
                  Close week {n}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmClose(false)}>
                  Keep working
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmClose(true)}>
                Close week and start the next
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="empty">Dead air. Add an album from the inputs to start the clock.</p>
      )}
    </section>
  );
}

/** The meter bridge: the clock, the policy lamps, and the genre and category meters. */
export function MeterBridge({ sel, setSel, ghost }: Selection) {
  const { desk } = useStore();
  const wk = currentWeek(desk);
  const onLog = new Set(wk.entries.map((e) => e.album_id));
  const total = weekSeconds(desk, wk);
  const max = desk.policy.max_hours * 3600;
  const min = desk.policy.min_hours * 3600;
  const preview = ghost && !onLog.has(ghost) ? ghost : sel && !onLog.has(sel) ? sel : null;
  const ghostAlbum: Album | null = preview ? (desk.albums[preview] ?? null) : null;
  const items = wk.entries.map((e) => desk.albums[e.album_id]).filter(Boolean);
  const t = total || 1;
  const segs = (n: number, col: string) => (
    <span className="segs">
      {Array.from({ length: 10 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed meter segments
        <i key={i} style={i < n ? { background: col, boxShadow: "none" } : undefined} />
      ))}
    </span>
  );
  return (
    <section className="pane">
      <div className="ph">
        <h2>Meter bridge</h2>
      </div>
      <Clock desk={desk} week={wk} ghost={ghostAlbum} selected={sel} onSelect={setSel} />
      <div className="lamps">
        <span className={total >= min ? "lit" : ""}>
          <span className={`lamp${total >= min ? " amber" : ""}`} />
          Minimum met
        </span>
        <span className={total > max ? "lit" : ""}>
          <span className={`lamp${total > max ? " air" : ""}`} />
          Overrun
        </span>
      </div>
      <div className="sec">
        <h3>
          Rotation policy{" "}
          <a className="link" href="#/settings">
            Edit
          </a>
        </h3>
        {desk.checks.map((c) => (
          <div key={c.id} className={`pol${c.ok ? "" : " miss"}`}>
            <span className={`lamp ${c.ok ? "on" : "air"}`} />
            <span>{c.label}</span>
            <span className="v">{c.value}</span>
          </div>
        ))}
      </div>
      <div className="sec">
        <h3>Genres</h3>
        {GENRES.map((g) => {
          const sec = items.filter((a) => a.genre === g.id).reduce((x, a) => x + a.seconds, 0);
          if (g.id === "unsorted" && !sec) return null;
          return (
            <div key={g.id} className="meter">
              <span>{g.name}</span>
              {segs(Math.round((sec / t) * 10), `var(--g-${g.id})`)}
              <span className="v">{Math.round((sec / t) * 100)}%</span>
            </div>
          );
        })}
      </div>
      <div className="sec">
        <h3>Categories</h3>
        {LANES.map((l) => {
          const n = wk.entries.filter((e) => e.lane === l.id).length;
          return (
            <div key={l.id} className="meter">
              <span>{l.name}</span>
              {segs(n, "var(--text)")}
              <span className="v">{n}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
