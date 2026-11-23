// The desk as the API returns it, and the formatting the screens share.
// The candidate engine and the weekly rules run on the server
// (palinsesto/domains/rotation.py); the browser only displays their results.

export type ServiceId = "spotify" | "apple" | "tidal" | "bandcamp";
export type GenreId =
  | "jazz"
  | "electronic"
  | "rnb"
  | "rock"
  | "folk"
  | "ambient"
  | "hiphop"
  | "unsorted";
export type Lane = "current" | "first" | "gold" | "recurrent" | "manual";
export type Verdict = "heavy" | "keep" | "pulled";

export interface ServiceLink {
  service: ServiceId;
  ref: string;
  matched_by: "import" | "upc" | "search" | "manual";
}
export interface Artist {
  id: string;
  name: string;
  links: ServiceLink[];
}
export interface Album {
  id: string;
  title: string;
  artist_ids: string[];
  released: string;
  label: string | null;
  tracks: number;
  seconds: number;
  genre: GenreId;
  upc: string | null;
  image_url: string | null;
  note: string;
  links: ServiceLink[];
}
export interface Entry {
  album_id: string;
  lane: Lane;
  reason: string;
  verdict: Verdict | null;
  note: string;
}
export interface Sent {
  at: string;
  service: "spotify";
  playlist_ref: string;
  album_ids: string[];
  tracks: number;
  left_out: number;
}
export interface Week {
  id: string;
  starts_on: string;
  closed: boolean;
  sent: Sent | null;
  skipped: string[];
  entries: Entry[];
}
export interface Candidate {
  album_id: string;
  lane: Exclude<Lane, "manual">;
  reason: string;
  rank: number;
}
export interface Check {
  id: string;
  label: string;
  ok: boolean;
  value: string;
}
export interface Policy {
  min_hours: number;
  max_hours: number;
  min_currents: number;
  min_first_plays: number;
  min_gold: number;
  max_genre_share: number;
  no_repeat_artist: boolean;
  gold_cooldown_weeks: number;
  current_window_days: number;
}
export type SpotifyErrorCode =
  | "invalid_client"
  | "redirect_mismatch"
  | "access_denied"
  | "not_allowlisted"
  | "premium_required"
  | "token_revoked";
export interface SpotifyStatus {
  state: "not_set_up" | "credentials" | "connected" | "error";
  client_id?: string;
  error?: SpotifyErrorCode | null;
  account_name?: string | null;
  connected_at?: string | null;
  synced_at?: string | null;
}
export interface Desk {
  artists: Record<string, Artist>;
  albums: Record<string, Album>;
  /** Oldest first; the last one is on the desk. */
  weeks: Week[];
  signals: { synced_at: string } | null;
  policy: Policy;
  current_week_id: string;
  week_numbers: Record<string, number>;
  candidates: Candidate[];
  checks: Check[];
  spotify: SpotifyStatus;
}

export const GENRES: { id: GenreId; name: string }[] = [
  { id: "jazz", name: "Jazz" },
  { id: "electronic", name: "Electronic" },
  { id: "rnb", name: "R&B and soul" },
  { id: "rock", name: "Rock" },
  { id: "folk", name: "Folk" },
  { id: "ambient", name: "Ambient" },
  { id: "hiphop", name: "Hip-hop" },
  { id: "unsorted", name: "Unsorted" },
];
export const genreName = (id: GenreId) => GENRES.find((g) => g.id === id)?.name ?? id;

export const LANES: { id: Candidate["lane"]; name: string; code: string; desc: string }[] = [
  {
    id: "current",
    name: "Currents",
    code: "CUR",
    desc: "New albums from artists you follow or play a lot.",
  },
  { id: "first", name: "First plays", code: "ADD", desc: "Artists you have never put on a log." },
  {
    id: "gold",
    name: "Gold",
    code: "GLD",
    desc: "Heavy rotation albums off the log a while, and old favourites never logged.",
  },
  {
    id: "recurrent",
    name: "Recurrents",
    code: "REC",
    desc: "More from artists you kept in rotation.",
  },
];
export const laneCode = (l: Lane) =>
  l === "manual" ? "SRC" : (LANES.find((x) => x.id === l)?.code ?? l);
export const laneName = (l: Lane) =>
  l === "manual" ? "Search" : (LANES.find((x) => x.id === l)?.name ?? l);

export const VERDICTS: [Verdict, string][] = [
  ["heavy", "Heavy rotation"],
  ["keep", "Keep in rotation"],
  ["pulled", "Pulled"],
];

export const SERVICE_NAMES: Record<ServiceId, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  tidal: "Tidal",
  bandcamp: "Bandcamp",
};
export const SERVICE_ORDER: ServiceId[] = ["spotify", "apple", "tidal", "bandcamp"];

export const currentWeek = (d: Desk) => d.weeks[d.weeks.length - 1];
export const weekNumber = (d: Desk, w: Week) => d.week_numbers[w.id];
export const weekSeconds = (d: Desk, w: Week) =>
  w.entries.reduce((t, e) => t + (d.albums[e.album_id]?.seconds ?? 0), 0);
export const artistNames = (d: Desk, a: Album) =>
  a.artist_ids.map((id) => d.artists[id]?.name ?? "Unknown").join(", ");
export const spotifyLink = (a: Album) => a.links.find((l) => l.service === "spotify");

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Art {
  c1: string;
  c2: string;
  motif: "disc" | "bars" | "grid" | "arc" | "split" | "dot";
}
const PALETTE: [string, string][] = [
  ["#1d3b8f", "#f2c14e"],
  ["#c8243c", "#f4d35e"],
  ["#0f2a33", "#9ad6b4"],
  ["#e8dcc2", "#6b3f2a"],
  ["#2e4a3a", "#e9d8a6"],
  ["#e86a33", "#f7e9d0"],
  ["#5b1f2b", "#f0a07a"],
  ["#9fd3c7", "#1f4e5f"],
  ["#efe6d2", "#2f5d8a"],
  ["#e9b44c", "#4a2c2a"],
  ["#1b1b1b", "#d6c6a8"],
  ["#d96c4f", "#f3e3c3"],
];
const MOTIFS: Art["motif"][] = ["disc", "bars", "grid", "arc", "split", "dot"];
/** A generated sleeve for an album with no artwork. */
export function artFor(seed: string): Art {
  const h = hash(seed);
  const [c1, c2] = PALETTE[h % PALETTE.length];
  return { c1, c2, motif: MOTIFS[(h >> 4) % MOTIFS.length] };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtClock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
export const fmtDur = (s: number) =>
  s < 3600 ? `${Math.floor(s / 60)}:${pad(Math.round(s) % 60)}` : fmtClock(s);
export const fmtHM = (s: number) => {
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${pad(m % 60)} min` : `${m} min`;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
export const shortDate = (iso: string) => {
  const d = toDate(iso);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
};
export const weekRange = (iso: string) => {
  const a = toDate(iso);
  const b = toDate(addDays(iso, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} to ${b.getDate()} ${MON[b.getMonth()]}`
    : `${shortDate(iso)} to ${shortDate(addDays(iso, 6))}`;
};
export const year = (iso: string) => iso.slice(0, 4);
