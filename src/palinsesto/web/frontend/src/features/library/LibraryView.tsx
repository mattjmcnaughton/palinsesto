import { useState } from "react";
import { Cover } from "../../components/Cover";
import {
  type Album,
  GENRES,
  type GenreId,
  SERVICE_NAMES,
  SERVICE_ORDER,
  VERDICTS,
  artistNames,
  currentWeek,
  fmtClock,
  fmtDur,
  genreName,
  laneName,
  weekNumber,
  year,
} from "../../lib/desk";
import { useStore } from "../../lib/store";

const CABLE = ["var(--g-jazz)", "var(--g-ambient)", "var(--g-electronic)", "var(--g-rock)"];
const ROW = 56;

export function LibraryView({ albumId }: { albumId?: string }) {
  const { desk } = useStore();
  const [q, setQ] = useState("");
  const all = Object.values(desk.albums).sort(
    (a, b) =>
      artistNames(desk, a).localeCompare(artistNames(desk, b)) ||
      a.released.localeCompare(b.released),
  );
  const list = q
    ? all.filter((a) =>
        `${artistNames(desk, a)} ${a.title} ${a.label ?? ""} ${genreName(a.genre)}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : all;
  const a = (albumId && desk.albums[albumId]) || all[0];

  return (
    <main className="v-lib">
      <section className="pane">
        <div className="ph">
          <h2>Library</h2>
          <span>{all.length} albums in your catalog</span>
        </div>
        <div className="filter">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by artist, title, label or genre"
            aria-label="Filter library"
          />
        </div>
        {list.map((x) => (
          <a key={x.id} className="row" href={`#/library/${x.id}`} aria-selected={x.id === a?.id}>
            <Cover album={x} className="thumb" />
            <span className="t">
              {artistNames(desk, x)}
              <em>{x.title}</em>
            </span>
            <span className="y">{year(x.released)}</span>
            <span className="d">{fmtDur(x.seconds)}</span>
          </a>
        ))}
        {!list.length && (
          <p className="lane-empty">
            {q
              ? `Nothing in your catalog matches “${q}”.`
              : "Your catalog is empty. Connect Spotify in Settings and sync."}
          </p>
        )}
      </section>
      <section className="pane">{a && <AlbumRecord album={a} key={a.id} />}</section>
    </main>
  );
}

/** An album's catalog record, with the outputs (service links) patched to it. */
export function AlbumRecord({ album: a }: { album: Album }) {
  const { desk, act } = useStore();
  const wk = currentWeek(desk);
  const onLog = wk.entries.some((e) => e.album_id === a.id);
  const logs = desk.weeks.flatMap((w) =>
    w.entries.filter((e) => e.album_id === a.id).map((e) => ({ w, e })),
  );
  const H = SERVICE_ORDER.length * ROW;
  const mid = H / 2;

  return (
    <div className="rec">
      <div className="rec-top">
        <Cover album={a} className="art big" />
        <div>
          <h1>{a.title}</h1>
          <p className="by">{a.artist_ids.map((id) => desk.artists[id]?.name).join(", ")}</p>
          <dl className="kv">
            <dt>Released</dt>
            <dd>{a.released}</dd>
            {a.label && (
              <>
                <dt>Label</dt>
                <dd>{a.label}</dd>
              </>
            )}
            <dt>Length</dt>
            <dd>
              {fmtClock(a.seconds)}, {a.tracks} tracks
            </dd>
            <dt>Genre</dt>
            <dd>
              <select
                className="genre-in"
                aria-label="Genre"
                value={a.genre}
                onChange={(e) =>
                  act("PATCH", `/albums/${a.id}`, { genre: e.target.value as GenreId })
                }
              >
                {GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </dd>
            {a.upc && (
              <>
                <dt>UPC</dt>
                <dd className="mono">{a.upc}</dd>
              </>
            )}
          </dl>
          <div className="rec-acts">
            {onLog ? (
              <span className="dim">On this week's log</span>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  act(
                    "POST",
                    "/log/entries",
                    { album_id: a.id },
                    `Added ${a.title} to week ${weekNumber(desk, wk)}.`,
                  )
                }
              >
                Add to week {weekNumber(desk, wk)}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bay-h">
        Outputs
        <span>This record lives in your catalog. Outputs are the services where it plays.</span>
      </div>
      <div className="bay" style={{ height: H + 16 }}>
        <div className="src">
          <div>
            <div>Catalog</div>
            <div className="mono dim">{a.id.slice(0, 8)}</div>
          </div>
          <span className="jack on" />
        </div>
        <svg
          className="cables"
          viewBox={`0 0 120 ${H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {SERVICE_ORDER.map(
            (svc, i) =>
              a.links.some((l) => l.service === svc) && (
                <path
                  key={svc}
                  d={`M0 ${mid} C 60 ${mid}, 60 ${i * ROW + ROW / 2}, 120 ${i * ROW + ROW / 2}`}
                  stroke={CABLE[i]}
                  strokeWidth="3"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              ),
          )}
        </svg>
        <div>
          {SERVICE_ORDER.map((svc, i) => {
            const link = a.links.find((l) => l.service === svc);
            return (
              <div key={svc} className="o">
                <span
                  className={`jack${link ? " on" : ""}`}
                  style={link ? { background: CABLE[i], borderColor: CABLE[i] } : undefined}
                />
                <div>
                  <div className="lbl">
                    Out {i + 1} {SERVICE_NAMES[svc]}
                  </div>
                  <div className="sub">
                    {link ? (
                      <span className="mono" title={link.ref}>
                        {link.ref}
                      </span>
                    ) : svc === "spotify" ? (
                      "Not patched. Import it from a Spotify search."
                    ) : (
                      "Not patched. Matching on this service comes later."
                    )}
                  </div>
                </div>
                {link && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      act(
                        "DELETE",
                        `/albums/${a.id}/links/${svc}`,
                        undefined,
                        `Unpatched ${SERVICE_NAMES[svc]}.`,
                      )
                    }
                  >
                    Unpatch
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rec-grid">
        <div>
          <h3 className="sub-h">On logs</h3>
          {logs.length ? (
            logs.map(({ w, e }) => (
              <div key={w.id} className="ra">
                <span>
                  <a className="link" href={w.closed ? "#/book" : "#/"}>
                    Week {weekNumber(desk, w)}
                  </a>{" "}
                  as {laneName(e.lane)}
                </span>
                <span>
                  {e.verdict
                    ? VERDICTS.find((v) => v[0] === e.verdict)?.[1]
                    : w.closed
                      ? "Unrated"
                      : "This week"}
                </span>
              </div>
            ))
          ) : (
            <p className="dim">Not aired yet.</p>
          )}
        </div>
        <div>
          <h3 className="sub-h">Your notes</h3>
          <textarea
            className="notes-in"
            defaultValue={a.note}
            placeholder="What to listen for, where it fits"
            rows={4}
            onBlur={(e) => {
              if (e.target.value !== a.note)
                void act("PATCH", `/albums/${a.id}`, { note: e.target.value });
            }}
          />
        </div>
      </div>
    </div>
  );
}
