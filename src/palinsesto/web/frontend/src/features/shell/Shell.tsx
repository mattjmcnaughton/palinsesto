import { useEffect, useRef, useState } from "react";
import {
  artistNames,
  currentWeek,
  fmtClock,
  fmtDur,
  shortDate,
  spotifyLink,
  weekNumber,
  weekSeconds,
} from "../../lib/desk";
import { useStore } from "../../lib/store";
import { LogBookView } from "../book/LogBookView";
import { LibraryView } from "../library/LibraryView";
import { LogView } from "../log/LogView";
import { SettingsView } from "../settings/SettingsView";

export type Screen = "log" | "book" | "library" | "settings";
export const SCREENS: [Screen, string, string][] = [
  ["log", "Log", "#/"],
  ["book", "Log book", "#/book"],
  ["library", "Library", "#/library"],
  ["settings", "Settings", "#/settings"],
];

/** The desk: header, the current screen, and the command line with Send. */
export function Shell({ screen, albumId }: { screen: Screen; albumId?: string }) {
  const { desk, act, busy, toast, dismiss } = useStore();
  const wk = currentWeek(desk);
  const total = weekSeconds(desk, wk);
  const sentIds = wk.sent?.album_ids.join();
  const linkedIds = wk.entries
    .filter((e) => desk.albums[e.album_id] && spotifyLink(desk.albums[e.album_id]))
    .map((e) => e.album_id)
    .join();
  const onAir = !!wk.sent && sentIds === linkedIds;
  const connected = desk.spotify.state === "connected";

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.error ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  const send = () =>
    act(
      "POST",
      "/spotify/send",
      undefined,
      `On air. Week ${weekNumber(desk, wk)} is a private Spotify playlist, ${fmtClock(total)}.`,
    );

  // Command line: find an album in the catalog and add it.
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(0);
  const cmd = useRef<HTMLInputElement>(null);
  const matches = q.trim()
    ? Object.values(desk.albums)
        .filter(
          (a) =>
            !wk.entries.some((e) => e.album_id === a.id) &&
            `${artistNames(desk, a)} ${a.title}`.toLowerCase().includes(q.trim().toLowerCase()),
        )
        .slice(0, 7)
    : [];
  const addFromCmd = (id: string) => {
    void act("POST", "/log/entries", { album_id: id }, `Added ${desk.albums[id].title}.`);
    setQ("");
    setHit(0);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement).matches("input, textarea")) {
        e.preventDefault();
        cmd.current?.focus();
      }
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);

  return (
    <div className="app">
      <header>
        <a className="mark" href="#/">
          <span className={`lamp${onAir ? " air" : ""}`} title={onAir ? "On air" : "Off air"} />
          Palinsesto
        </a>
        <span className="week">
          Week {weekNumber(desk, wk)}, from {shortDate(wk.starts_on)}
        </span>
        <nav>
          {SCREENS.map(([s, label, href]) => (
            <a key={s} href={href} aria-current={screen === s ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="outs">
          <a href="#/settings">
            <span
              className={`lamp${connected ? " on" : desk.spotify.state === "error" ? " air" : ""}`}
            />
            Out 1 Spotify
          </a>
          <span className="dim">
            {desk.spotify.synced_at
              ? `Synced ${new Date(desk.spotify.synced_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Not synced"}
          </span>
        </div>
      </header>

      {screen === "book" ? (
        <LogBookView />
      ) : screen === "library" ? (
        <LibraryView albumId={albumId} />
      ) : screen === "settings" ? (
        <SettingsView />
      ) : (
        <LogView key={wk.id} />
      )}

      <footer>
        <label className="cmd">
          <span>&gt;</span>
          <input
            ref={cmd}
            value={q}
            placeholder="Find an album in your library and press Enter to add"
            autoComplete="off"
            aria-label="Find an album"
            onChange={(e) => {
              setQ(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHit((h) => Math.min(matches.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHit((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter" && matches[hit]) addFromCmd(matches[hit].id);
              else if (e.key === "Escape") {
                setQ("");
                cmd.current?.blur();
              }
            }}
          />
        </label>
        <div className="keys">
          <span>
            <kbd>J</kbd>
            <kbd>K</kbd>move
          </span>
          <span>
            <kbd>A</kbd>add
          </span>
          <span>
            <kbd>S</kbd>skip
          </span>
          <span>
            <kbd>X</kbd>pull
          </span>
          <span>
            <kbd>/</kbd>find
          </span>
        </div>
        <span className="send-state">
          {wk.sent
            ? onAir
              ? `On air since ${shortDate(wk.sent.at)}`
              : "Log changed since it was sent"
            : connected
              ? ""
              : "Connect Spotify in Settings to send"}
        </span>
        <button
          type="button"
          className="btn primary send"
          onClick={send}
          disabled={busy || !connected || !wk.entries.length}
        >
          {busy
            ? "Working"
            : wk.sent && !onAir
              ? "Update the Spotify playlist"
              : onAir
                ? "Sent to Spotify"
                : "Send to Spotify"}
        </button>
        {q.trim() && (
          <div className="results">
            {matches.length ? (
              matches.map((a, i) => (
                <button
                  type="button"
                  key={a.id}
                  className="row"
                  aria-current={i === hit}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addFromCmd(a.id);
                  }}
                >
                  <span className="t">
                    {artistNames(desk, a)}
                    <em>{a.title}</em>
                  </span>
                  <span className="d">{fmtDur(a.seconds)}</span>
                </button>
              ))
            ) : (
              <p>
                No album in your library matches “{q}”. Search Spotify from First plays to import
                one.
              </p>
            )}
          </div>
        )}
      </footer>

      {toast && (
        <output className={`toast${toast.error ? " err" : ""}`} key={toast.id}>
          <span>{toast.msg}</span>
          <button type="button" onClick={dismiss}>
            Dismiss
          </button>
        </output>
      )}
    </div>
  );
}
