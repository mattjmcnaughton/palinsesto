// The app's own catalog is the source of truth. Streaming services are links
// on a record (ServiceLink), never the record itself, so a different service
// can be added or swapped without touching history.

export type ServiceId = 'spotify' | 'apple' | 'tidal' | 'bandcamp';

export interface ServiceLink {
  service: ServiceId;
  /** The service's own identifier, such as a Spotify URI or a Bandcamp URL. */
  ref: string;
  matchedBy: 'import' | 'upc' | 'search' | 'manual';
}

export type GenreId = 'jazz' | 'electronic' | 'rnb' | 'rock' | 'folk' | 'ambient' | 'hiphop';

export interface Artist {
  id: string;
  name: string;
  links: ServiceLink[];
}

export interface Art {
  c1: string;
  c2: string;
  motif: 'disc' | 'bars' | 'grid' | 'arc' | 'split' | 'dot';
}

export interface Album {
  id: string;
  title: string;
  artistIds: string[];
  /** YYYY-MM-DD */
  released: string;
  label?: string;
  tracks: number;
  seconds: number;
  genre: GenreId;
  upc?: string;
  art: Art;
  links: ServiceLink[];
  note?: string;
}

/** Rotation categories, the four candidate lanes. `manual` is an album added by search. */
export type Lane = 'current' | 'first' | 'gold' | 'recurrent' | 'manual';

/** heavy: a keeper. keep: more from this artist. pulled: not for me. */
export type Verdict = 'heavy' | 'keep' | 'pulled';

export interface LogEntry {
  albumId: string;
  lane: Lane;
  reason: string;
  verdict?: Verdict;
  note?: string;
}

export interface Sent {
  at: string;
  service: ServiceId;
  playlistRef: string;
  /** Album IDs in the order they were sent, to tell when the log has changed since. */
  albumIds: string[];
}

export interface Week {
  id: string;
  number: number;
  /** YYYY-MM-DD, a Monday */
  startsOn: string;
  entries: LogEntry[];
  sent?: Sent;
  closed: boolean;
}

export interface Policy {
  minHours: number;
  maxHours: number;
  minCurrents: number;
  minFirstPlays: number;
  minGold: number;
  /** 0 to 1 */
  maxGenreShare: number;
  noRepeatArtist: boolean;
  /** Gold albums come back once they have been off the log this many weeks. */
  goldCooldownWeeks: number;
  /** Currents are albums released within this many days of the week's start. */
  currentWindowDays: number;
}

/** Listening signals read from a connected service. Only the IDs map into the catalog. */
export interface Signals {
  syncedAt: string;
  followedArtistIds: string[];
  topArtistIds: string[];
  /** Plays per album from the listening history export. */
  lifetimePlays: Record<string, number>;
  recentPlays: Record<string, number>;
}

export interface State {
  version: 1;
  artists: Record<string, Artist>;
  albums: Record<string, Album>;
  /** Oldest first. The last week is the one on the desk. */
  weeks: Week[];
  policy: Policy;
  signals: Signals;
  connections: Record<ServiceId, boolean>;
  /** Album IDs skipped for the current week. Cleared when a new week starts. */
  skipped: string[];
}
