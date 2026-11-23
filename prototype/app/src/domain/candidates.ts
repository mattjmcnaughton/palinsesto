// The candidate engine: sorts the catalog into the four rotation categories using
// listening signals and his own history. Every candidate carries a reason built only
// from those facts, never "recommended for you".
import { daysBetween, genreName, shortDate, year } from './format';
import type { Album, Lane, LogEntry, State, Verdict, Week } from './types';

export type CandLane = Exclude<Lane, 'manual'>;

export const LANES: { id: CandLane; name: string; code: string; desc: string }[] = [
  { id: 'current', name: 'Currents', code: 'CUR', desc: 'New albums from artists you follow or play a lot.' },
  { id: 'first', name: 'First plays', code: 'ADD', desc: 'Artists you have never put on a log.' },
  { id: 'gold', name: 'Gold', code: 'GLD', desc: 'Heavy rotation albums off the log a while, and old favourites never logged.' },
  { id: 'recurrent', name: 'Recurrents', code: 'REC', desc: 'More from artists you kept in rotation.' },
];
export const laneCode = (l: Lane) => (l === 'manual' ? 'SRC' : LANES.find(x => x.id === l)!.code);
export const laneName = (l: Lane) => (l === 'manual' ? 'Search' : LANES.find(x => x.id === l)!.name);

export interface Candidate { album: Album; lane: CandLane; reason: string; rank: number }

export const currentWeek = (s: State) => s.weeks[s.weeks.length - 1];
export const weekSeconds = (s: State, w: Week) => w.entries.reduce((t, e) => t + (s.albums[e.albumId]?.seconds ?? 0), 0);

interface Mark { week: number; verdict?: Verdict }
interface History {
  albumLast: Record<string, Mark>;
  /** Latest week any album by the artist was logged. */
  artistWeek: Record<string, number>;
  /** Latest verdict given to any album by the artist. */
  artistVerdict: Record<string, Mark>;
}

export function history(s: State): History {
  const h: History = { albumLast: {}, artistWeek: {}, artistVerdict: {} };
  for (const w of s.weeks) {
    if (!w.closed) continue;
    for (const e of w.entries) {
      h.albumLast[e.albumId] = { week: w.number, verdict: e.verdict };
      for (const id of s.albums[e.albumId]?.artistIds ?? []) {
        h.artistWeek[id] = w.number;
        if (e.verdict) h.artistVerdict[id] = { week: w.number, verdict: e.verdict };
      }
    }
  }
  return h;
}

function classify(s: State, h: History, wk: Week, a: Album): Omit<Candidate, 'album'> | null {
  const p = s.policy, sig = s.signals;
  const name = (id: string) => s.artists[id]?.name ?? 'this artist';
  const logged = h.albumLast[a.id];
  const days = daysBetween(a.released, wk.startsOn);
  const followed = a.artistIds.find(id => sig.followedArtistIds.includes(id));
  const top = a.artistIds.find(id => sig.topArtistIds.includes(id));

  if (!logged && days >= -6 && days <= p.currentWindowDays && (followed || top)) {
    const reason = followed ? `You follow ${name(followed)}. Out ${shortDate(a.released)}.` : `${name(top!)} is in your top artists. Out ${shortDate(a.released)}.`;
    return { lane: 'current', reason, rank: -days };
  }
  if (logged?.verdict === 'pulled' || a.artistIds.some(id => h.artistVerdict[id]?.verdict === 'pulled')) return null;

  const kept = a.artistIds.find(id => h.artistVerdict[id]?.verdict === 'keep');
  if (!logged && kept) return { lane: 'recurrent', reason: `You kept ${name(kept)} in rotation in week ${h.artistVerdict[kept].week}.`, rank: h.artistVerdict[kept].week };

  const plays = sig.lifetimePlays[a.id] ?? 0;
  if (!logged && !plays && !a.artistIds.some(id => h.artistWeek[id] != null)) {
    const recent = sig.recentPlays[a.id];
    return { lane: 'first', reason: recent ? `Played ${recent} times this month. Never logged.` : `New to you. ${genreName(a.genre)}, ${year(a.released)}.`, rank: recent ?? 0 };
  }
  if (logged?.verdict === 'heavy') {
    const off = wk.number - logged.week;
    return off >= p.goldCooldownWeeks ? { lane: 'gold', reason: `Heavy rotation in week ${logged.week}. Off the log ${off} weeks.`, rank: off } : null;
  }
  if (!logged && plays >= 20) return { lane: 'gold', reason: `Played ${plays} times in your history. Never logged.`, rank: plays / 10 };
  return null;
}

export function candidates(s: State): Candidate[] {
  const h = history(s), wk = currentWeek(s);
  const out: Candidate[] = [];
  for (const a of Object.values(s.albums)) {
    const c = classify(s, h, wk, a);
    if (c) out.push({ album: a, ...c });
  }
  return out.sort((x, y) => y.rank - x.rank || x.album.title.localeCompare(y.album.title));
}

/** The log entry for adding an album, with its category and reason. */
export function entryFor(s: State, albumId: string): LogEntry {
  const c = candidates(s).find(x => x.album.id === albumId);
  return c ? { albumId, lane: c.lane, reason: c.reason } : { albumId, lane: 'manual', reason: 'Added from your library.' };
}
