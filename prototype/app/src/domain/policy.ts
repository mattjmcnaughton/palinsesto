// His weekly rules, checked live against a week's log.
import { weekSeconds } from './candidates';
import { fmtHM, genreName } from './format';
import type { GenreId, Lane, State, Week } from './types';

export interface Check { id: string; label: string; ok: boolean; value: string }

export function checks(s: State, w: Week): Check[] {
  const p = s.policy;
  const t = weekSeconds(s, w);
  const n = (l: Lane) => w.entries.filter(e => e.lane === l).length;

  const g: Partial<Record<GenreId, number>> = {};
  const seen = new Map<string, number>();
  for (const e of w.entries) {
    const a = s.albums[e.albumId];
    if (!a) continue;
    g[a.genre] = (g[a.genre] ?? 0) + a.seconds;
    a.artistIds.forEach(id => seen.set(id, (seen.get(id) ?? 0) + 1));
  }
  const top = (Object.entries(g) as [GenreId, number][]).sort((x, y) => y[1] - x[1])[0];
  const share = top && t ? top[1] / t : 0;
  const dup = [...seen.entries()].find(([, c]) => c > 1);

  return [
    { id: 'len', label: `${p.minHours} to ${p.maxHours} hours`, ok: t >= p.minHours * 3600 && t <= p.maxHours * 3600, value: fmtHM(t) },
    { id: 'current', label: `At least ${p.minCurrents} ${p.minCurrents === 1 ? 'current' : 'currents'}`, ok: n('current') >= p.minCurrents, value: String(n('current')) },
    { id: 'first', label: `At least ${p.minFirstPlays} first ${p.minFirstPlays === 1 ? 'play' : 'plays'}`, ok: n('first') >= p.minFirstPlays, value: String(n('first')) },
    { id: 'gold', label: `At least ${p.minGold} from gold`, ok: n('gold') >= p.minGold, value: String(n('gold')) },
    { id: 'genre', label: `No genre over ${Math.round(p.maxGenreShare * 100)}%`, ok: share <= p.maxGenreShare, value: top ? `${genreName(top[0])} ${Math.round(share * 100)}%` : 'None' },
    ...(p.noRepeatArtist ? [{ id: 'artist', label: 'No artist twice', ok: !dup, value: dup ? s.artists[dup[0]]?.name ?? 'Repeat' : '' }] : []),
  ];
}
