import { createContext, useContext } from 'react';
import { seedState } from '../data/seed';
import { addDays } from '../domain/format';
import type { Album, Artist, LogEntry, Policy, Sent, ServiceId, ServiceLink, State, Verdict, Week } from '../domain/types';

export type Action =
  | { type: 'add'; entry: LogEntry }
  | { type: 'remove'; albumId: string }
  | { type: 'move'; albumId: string; to: number }
  | { type: 'skip'; albumId: string }
  | { type: 'unskip' }
  | { type: 'verdict'; weekId: string; albumId: string; verdict?: Verdict }
  | { type: 'entryNote'; weekId: string; albumId: string; note: string }
  | { type: 'sent'; weekId: string; sent: Sent }
  | { type: 'closeWeek' }
  | { type: 'import'; album: Album; artists: Artist[]; entry?: LogEntry }
  | { type: 'link'; albumId: string; link: ServiceLink }
  | { type: 'unlink'; albumId: string; service: ServiceId }
  | { type: 'albumNote'; albumId: string; note: string }
  | { type: 'policy'; patch: Partial<Policy> }
  | { type: 'connection'; service: ServiceId; on: boolean }
  | { type: 'reset' };

const cur = (s: State) => s.weeks[s.weeks.length - 1];
const mapWeek = (s: State, id: string, f: (w: Week) => Week): State => ({ ...s, weeks: s.weeks.map(w => (w.id === id ? f(w) : w)) });
const mapCur = (s: State, f: (w: Week) => Week) => (cur(s).closed ? s : mapWeek(s, cur(s).id, f));
const mapAlbum = (s: State, id: string, f: (a: Album) => Album): State => (s.albums[id] ? { ...s, albums: { ...s.albums, [id]: f(s.albums[id]) } } : s);
const mapEntry = (s: State, weekId: string, albumId: string, f: (e: LogEntry) => LogEntry) =>
  mapWeek(s, weekId, w => ({ ...w, entries: w.entries.map(e => (e.albumId === albumId ? f(e) : e)) }));

function addEntry(s: State, entry: LogEntry): State {
  if (cur(s).entries.some(e => e.albumId === entry.albumId)) return s;
  return { ...mapCur(s, w => ({ ...w, entries: [...w.entries, entry] })), skipped: s.skipped.filter(id => id !== entry.albumId) };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'add': return addEntry(s, a.entry);
    case 'remove': return mapCur(s, w => ({ ...w, entries: w.entries.filter(e => e.albumId !== a.albumId) }));
    case 'move': return mapCur(s, w => {
      const e = w.entries.find(x => x.albumId === a.albumId);
      if (!e) return w;
      const rest = w.entries.filter(x => x !== e);
      rest.splice(Math.max(0, Math.min(rest.length, a.to)), 0, e);
      return { ...w, entries: rest };
    });
    case 'skip': return s.skipped.includes(a.albumId) ? s : { ...s, skipped: [...s.skipped, a.albumId] };
    case 'unskip': return { ...s, skipped: [] };
    case 'verdict': return mapEntry(s, a.weekId, a.albumId, e => {
      const { verdict: _old, ...rest } = e;
      return a.verdict ? { ...rest, verdict: a.verdict } : rest;
    });
    case 'entryNote': return mapEntry(s, a.weekId, a.albumId, e => ({ ...e, note: a.note }));
    case 'sent': return mapWeek(s, a.weekId, w => ({ ...w, sent: a.sent }));
    case 'closeWeek': {
      const w = cur(s);
      if (!w.entries.length) return s;
      const next: Week = { id: 'wk_' + (w.number + 1), number: w.number + 1, startsOn: addDays(w.startsOn, 7), entries: [], closed: false };
      return { ...s, weeks: [...s.weeks.map(x => (x.id === w.id ? { ...x, closed: true } : x)), next], skipped: [] };
    }
    case 'import': {
      const artists = { ...s.artists };
      a.artists.forEach(x => { artists[x.id] = artists[x.id] ?? x; });
      const next = { ...s, artists, albums: { ...s.albums, [a.album.id]: a.album } };
      return a.entry ? addEntry(next, a.entry) : next;
    }
    case 'link': return mapAlbum(s, a.albumId, x => ({ ...x, links: [...x.links.filter(l => l.service !== a.link.service), a.link] }));
    case 'unlink': return mapAlbum(s, a.albumId, x => ({ ...x, links: x.links.filter(l => l.service !== a.service) }));
    case 'albumNote': return mapAlbum(s, a.albumId, x => ({ ...x, note: a.note }));
    case 'policy': return { ...s, policy: { ...s.policy, ...a.patch } };
    case 'connection': return { ...s, connections: { ...s.connections, [a.service]: a.on } };
    case 'reset': return seedState();
  }
}

const KEY = 'rotation.state.v1';
export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.version === 1 && s.weeks?.length) return s;
    }
  } catch { /* fall back to the demo data */ }
  return seedState();
}
export const save = (s: State) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } };

export interface Store {
  s: State;
  /** Apply an action. A message shows a toast; undoable toasts offer Undo. */
  dispatch: (a: Action, message?: string, undoable?: boolean) => void;
  toast: (message: string) => void;
}
export const StoreCtx = createContext<Store>(null!);
export const useStore = () => useContext(StoreCtx);
