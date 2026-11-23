import type { Album, Art, GenreId, State } from './types';

export const GENRES: { id: GenreId; name: string }[] = [
  { id: 'jazz', name: 'Jazz' },
  { id: 'electronic', name: 'Electronic' },
  { id: 'rnb', name: 'R&B and soul' },
  { id: 'rock', name: 'Rock' },
  { id: 'folk', name: 'Folk' },
  { id: 'ambient', name: 'Ambient' },
  { id: 'hiphop', name: 'Hip-hop' },
];
export const genreName = (id: GenreId) => GENRES.find(g => g.id === id)?.name ?? id;

export const SERVICE_NAMES = { spotify: 'Spotify', apple: 'Apple Music', tidal: 'Tidal', bandcamp: 'Bandcamp' } as const;
export const SERVICE_ORDER = ['spotify', 'apple', 'tidal', 'bandcamp'] as const;

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PALETTE: [string, string][] = [
  ['#1d3b8f', '#f2c14e'], ['#c8243c', '#f4d35e'], ['#0f2a33', '#9ad6b4'], ['#e8dcc2', '#6b3f2a'],
  ['#2e4a3a', '#e9d8a6'], ['#e86a33', '#f7e9d0'], ['#5b1f2b', '#f0a07a'], ['#9fd3c7', '#1f4e5f'],
  ['#efe6d2', '#2f5d8a'], ['#e9b44c', '#4a2c2a'], ['#1b1b1b', '#d6c6a8'], ['#d96c4f', '#f3e3c3'],
];
const MOTIFS: Art['motif'][] = ['disc', 'bars', 'grid', 'arc', 'split', 'dot'];
export function artFor(seed: string): Art {
  const h = hash(seed);
  const [c1, c2] = PALETTE[h % PALETTE.length];
  return { c1, c2, motif: MOTIFS[(h >> 4) % MOTIFS.length] };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtClock = (s: number) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
export const fmtDur = (s: number) => (s < 3600 ? `${Math.floor(s / 60)}:${pad(Math.round(s) % 60)}` : fmtClock(s));
export const fmtHM = (s: number) => {
  const m = Math.round(s / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${pad(m % 60)} min` : `${m} min`;
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const toDate = (iso: string) => new Date(iso + 'T12:00:00');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
export const shortDate = (iso: string) => { const d = toDate(iso); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export const weekRange = (iso: string) => {
  const a = toDate(iso), b = toDate(addDays(iso, 6));
  return a.getMonth() === b.getMonth() ? `${a.getDate()} to ${b.getDate()} ${MON[b.getMonth()]}` : `${shortDate(iso)} to ${shortDate(addDays(iso, 6))}`;
};
export const year = (iso: string) => iso.slice(0, 4);

export const artistNames = (s: State, a: Album) => a.artistIds.map(id => s.artists[id]?.name ?? 'Unknown').join(', ');

export function newId(prefix: string) {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + '_' + (r[0].toString(36) + r[1].toString(36)).slice(0, 8).toUpperCase();
}
