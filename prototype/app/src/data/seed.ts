// Sample data. Albums and artists are real; runtimes are approximate, and the release
// dates of the "new" albums are moved into the demo week so they show up as Currents.
// Listening signals, verdicts and notes are invented.
import { artFor, hash } from '../domain/format';
import type { Album, Artist, GenreId, LogEntry, State, Verdict, Week } from '../domain/types';

const ARTISTS: [string, string][] = [
  ['floating-points', 'Floating Points'], ['turnstile', 'Turnstile'], ['bon-iver', 'Bon Iver'],
  ['japanese-breakfast', 'Japanese Breakfast'], ['little-simz', 'Little Simz'], ['nala-sinephro', 'Nala Sinephro'],
  ['mkgee', 'Mk.gee'], ['jessica-pratt', 'Jessica Pratt'], ['ichiko-aoba', 'Ichiko Aoba'], ['cleo-sol', 'Cleo Sol'],
  ['alice-coltrane', 'Alice Coltrane'], ['sade', 'Sade'], ['talk-talk', 'Talk Talk'], ['boards-of-canada', 'Boards of Canada'],
  ['television', 'Television'], ['pharoah-sanders', 'Pharoah Sanders'], ['lso', 'London Symphony Orchestra'],
  ['khruangbin', 'Khruangbin'], ['kelela', 'Kelela'], ['big-thief', 'Big Thief'], ['steely-dan', 'Steely Dan'],
  ['radiohead', 'Radiohead'], ['j-dilla', 'J Dilla'], ['joni-mitchell', 'Joni Mitchell'], ['fontaines-dc', 'Fontaines D.C.'],
  ['wilco', 'Wilco'], ['avalanches', 'The Avalanches'], ['john-coltrane', 'John Coltrane'], ['burial', 'Burial'],
  ['slowdive', 'Slowdive'], ['kendrick-lamar', 'Kendrick Lamar'], ['aphex-twin', 'Aphex Twin'], ['wednesday', 'Wednesday'],
  ['jon-hopkins', 'Jon Hopkins'], ['nick-drake', 'Nick Drake'], ['brian-eno', 'Brian Eno'], ['madvillain', 'Madvillain'],
  ['adrianne-lenker', 'Adrianne Lenker'], ['four-tet', 'Four Tet'], ['yussef-dayes', 'Yussef Dayes'],
  ['erykah-badu', 'Erykah Badu'], ['hiroshi-yoshimura', 'Hiroshi Yoshimura'], ['frank-ocean', 'Frank Ocean'],
];

type Row = [id: string, title: string, artists: string, released: string, length: string, genre: GenreId, label: string, tracks: number];
const ALBUMS: Row[] = [
  // New this week (dates moved into the demo window)
  ['cascade', 'Cascade', 'floating-points', '2026-11-13', '47:15', 'electronic', 'Ninja Tune', 9],
  ['never-enough', 'Never Enough', 'turnstile', '2026-11-06', '43:19', 'rock', 'Roadrunner', 14],
  ['sable-fable', 'SABLE, fABLE', 'bon-iver', '2026-11-13', '41:52', 'folk', 'Jagjaguwar', 13],
  ['brunettes', 'For Melancholy Brunettes (& sad women)', 'japanese-breakfast', '2026-10-30', '31:31', 'rock', 'Dead Oceans', 10],
  ['lotus', 'Lotus', 'little-simz', '2026-11-06', '54:12', 'hiphop', 'AWAL', 13],
  // New to him
  ['endlessness', 'Endlessness', 'nala-sinephro', '2024-09-06', '46:10', 'jazz', 'Warp', 10],
  ['two-star', 'Two Star & the Dream Police', 'mkgee', '2024-02-02', '36:27', 'rnb', 'R&R', 12],
  ['here-in-the-pitch', 'Here in the Pitch', 'jessica-pratt', '2024-05-03', '27:55', 'folk', 'Mexican Summer', 9],
  ['windswept-adan', 'Windswept Adan', 'ichiko-aoba', '2020-12-02', '50:01', 'ambient', 'Hermine', 12],
  ['mother', 'Mother', 'cleo-sol', '2021-08-20', '50:06', 'rnb', 'Forever Living Originals', 12],
  // Long-time favourites
  ['satchidananda', 'Journey in Satchidananda', 'alice-coltrane', '1971-02-01', '37:04', 'jazz', 'Impulse!', 5],
  ['love-deluxe', 'Love Deluxe', 'sade', '1992-10-26', '47:24', 'rnb', 'Epic', 9],
  ['spirit-of-eden', 'Spirit of Eden', 'talk-talk', '1988-09-12', '41:21', 'rock', 'Parlophone', 6],
  ['mhtrtc', 'Music Has the Right to Children', 'boards-of-canada', '1998-04-20', '70:57', 'electronic', 'Warp', 18],
  ['marquee-moon', 'Marquee Moon', 'television', '1977-02-08', '45:55', 'rock', 'Elektra', 8],
  ['in-rainbows', 'In Rainbows', 'radiohead', '2007-10-10', '42:39', 'rock', 'XL', 10],
  ['donuts', 'Donuts', 'j-dilla', '2006-02-07', '43:10', 'hiphop', 'Stones Throw', 31],
  ['blue', 'Blue', 'joni-mitchell', '1971-06-22', '36:15', 'folk', 'Reprise', 10],
  ['romance', 'Romance', 'fontaines-dc', '2024-08-23', '37:26', 'rock', 'XL', 11],
  ['yhf', 'Yankee Hotel Foxtrot', 'wilco', '2002-04-23', '51:44', 'rock', 'Nonesuch', 11],
  ['since-i-left-you', 'Since I Left You', 'avalanches', '2000-11-27', '60:24', 'electronic', 'Modular', 18],
  ['a-love-supreme', 'A Love Supreme', 'john-coltrane', '1965-01-01', '32:47', 'jazz', 'Impulse!', 4],
  ['untrue', 'Untrue', 'burial', '2007-11-05', '50:33', 'electronic', 'Hyperdub', 13],
  ['souvlaki', 'Souvlaki', 'slowdive', '1993-05-17', '40:23', 'rock', 'Creation', 10],
  ['tpab', 'To Pimp a Butterfly', 'kendrick-lamar', '2015-03-15', '78:51', 'hiphop', 'TDE', 16],
  ['hejira', 'Hejira', 'joni-mitchell', '1976-11-22', '51:57', 'folk', 'Asylum', 9],
  ['saw-85-92', 'Selected Ambient Works 85-92', 'aphex-twin', '1992-11-09', '74:28', 'ambient', 'Apollo', 13],
  ['rat-saw-god', 'Rat Saw God', 'wednesday', '2023-04-07', '41:47', 'rock', 'Dead Oceans', 10],
  ['immunity', 'Immunity', 'jon-hopkins', '2013-06-03', '60:16', 'electronic', 'Domino', 8],
  ['pink-moon', 'Pink Moon', 'nick-drake', '1972-02-25', '28:22', 'folk', 'Island', 11],
  ['airports', 'Ambient 1: Music for Airports', 'brian-eno', '1978-03-01', '48:09', 'ambient', 'Polydor', 4],
  ['madvillainy', 'Madvillainy', 'madvillain', '2004-03-23', '46:24', 'hiphop', 'Stones Throw', 22],
  // Weeks 44 to 46
  ['thembi', 'Thembi', 'pharoah-sanders', '1971-01-01', '40:12', 'jazz', 'Impulse!', 6],
  ['take-me-apart', 'Take Me Apart', 'kelela', '2017-10-06', '56:08', 'rnb', 'Warp', 14],
  ['aja', 'Aja', 'steely-dan', '1977-09-23', '39:58', 'rock', 'ABC', 7],
  ['bright-future', 'Bright Future', 'adrianne-lenker', '2024-03-22', '42:47', 'folk', '4AD', 12],
  ['three', 'Three', 'four-tet', '2024-03-15', '43:34', 'electronic', 'Text', 8],
  ['con-todo', 'Con Todo El Mundo', 'khruangbin', '2018-01-26', '38:36', 'rnb', 'Dead Oceans', 10],
  ['black-classical', 'Black Classical Music', 'yussef-dayes', '2023-09-08', '71:43', 'jazz', 'Brownswood', 19],
  ['capacity', 'Capacity', 'big-thief', '2017-06-09', '41:15', 'folk', 'Saddle Creek', 11],
  ['karma', 'Karma', 'pharoah-sanders', '1969-01-01', '36:46', 'jazz', 'Impulse!', 2],
  ['mamas-gun', "Mama's Gun", 'erykah-badu', '2000-11-21', '71:37', 'rnb', 'Motown', 14],
  ['nine-post-cards', 'Music for Nine Post Cards', 'hiroshi-yoshimura', '1982-01-01', '39:31', 'ambient', 'Sound Process', 9],
  ['blonde', 'Blonde', 'frank-ocean', '2016-08-20', '60:08', 'rnb', 'Boys Don\'t Cry', 17],
  // Rest of the discographies he has marked to follow up on
  ['promises', 'Promises', 'floating-points,pharoah-sanders,lso', '2021-03-26', '45:53', 'jazz', 'Luaka Bop', 9],
  ['jewels', 'Jewels of Thought', 'pharoah-sanders', '1970-01-01', '41:36', 'jazz', 'Impulse!', 2],
  ['a-la-sala', 'A La Sala', 'khruangbin', '2024-04-05', '44:18', 'rnb', 'Dead Oceans', 12],
  ['mordechai', 'Mordechai', 'khruangbin', '2020-06-26', '41:52', 'rnb', 'Dead Oceans', 10],
  ['raven', 'Raven', 'kelela', '2023-02-10', '55:11', 'rnb', 'Warp', 15],
  ['dragon', 'Dragon New Mountain I Believe in You', 'big-thief', '2022-02-11', '79:48', 'folk', '4AD', 20],
  ['ufof', 'U.F.O.F.', 'big-thief', '2019-05-03', '43:00', 'folk', '4AD', 12],
  ['gaucho', 'Gaucho', 'steely-dan', '1980-11-21', '38:41', 'rock', 'MCA', 7],
];

const secs = (mmss: string) => { const [m, s] = mmss.split(':').map(Number); return m * 60 + s; };
const b62 = (n: number) => { const c = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'; let s = ''; for (let i = 0; i < 22; i++) { s += c[n % 62]; n = (Math.imul(n, 1103515245) + 12345) >>> 0; } return s; };

const BANDCAMP: Record<string, string> = {
  promises: 'luakabop.bandcamp.com/album/promises',
  endlessness: 'nalasinephro.bandcamp.com/album/endlessness',
  donuts: 'jdilla.bandcamp.com/album/donuts',
  madvillainy: 'madvillain.bandcamp.com/album/madvillainy',
};

// Past weeks: [week number, Monday, entries as [albumId, lane, verdict]]
type E = [string, LogEntry['lane'], Verdict | null, string?];
const HISTORY: [number, string, E[]][] = [
  [40, '2026-09-28', [['satchidananda', 'gold', 'heavy'], ['in-rainbows', 'gold', 'heavy'], ['donuts', 'gold', 'heavy'], ['blue', 'gold', 'heavy'], ['romance', 'current', 'pulled', 'Too much like the last one.']]],
  [41, '2026-10-05', [['love-deluxe', 'gold', 'heavy'], ['mhtrtc', 'gold', 'heavy'], ['yhf', 'gold', 'keep'], ['since-i-left-you', 'gold', 'heavy'], ['a-love-supreme', 'gold', 'heavy']]],
  [42, '2026-10-12', [['untrue', 'gold', 'heavy'], ['souvlaki', 'gold', 'heavy'], ['tpab', 'gold', 'keep'], ['hejira', 'recurrent', 'heavy'], ['saw-85-92', 'gold', 'heavy']]],
  [43, '2026-10-19', [['rat-saw-god', 'first', 'pulled'], ['immunity', 'first', 'pulled', 'Fine, but never reached for it.'], ['pink-moon', 'gold', 'heavy'], ['airports', 'gold', 'heavy'], ['madvillainy', 'gold', 'heavy']]],
  [44, '2026-10-26', [['thembi', 'first', 'keep', 'Need the rest of the Impulse! years.'], ['take-me-apart', 'first', 'keep'], ['aja', 'gold', 'keep'], ['bright-future', 'first', 'heavy'], ['three', 'current', 'heavy']]],
  [45, '2026-11-02', [['con-todo', 'first', 'keep'], ['black-classical', 'first', 'heavy'], ['blonde', 'gold', 'heavy'], ['mordechai', 'recurrent', null]]],
  [46, '2026-11-09', [['capacity', 'first', 'keep'], ['karma', 'recurrent', 'keep'], ['mamas-gun', 'gold', 'heavy'], ['nine-post-cards', 'first', null]]],
];

// The week on the desk, already partly programmed.
const DRAFT: E[] = [
  ['satchidananda', 'gold', null], ['cascade', 'current', null], ['love-deluxe', 'gold', null],
  ['endlessness', 'first', null], ['promises', 'recurrent', null], ['spirit-of-eden', 'gold', null], ['never-enough', 'current', null],
];

export function seedState(): State {
  const artists: Record<string, Artist> = {};
  for (const [id, name] of ARTISTS) artists[id] = { id, name, links: [{ service: 'spotify', ref: 'spotify:artist:' + b62(hash(id)), matchedBy: 'import' }] };
  const albums: Record<string, Album> = {};
  for (const [id, title, ids, released, len, genre, label, tracks] of ALBUMS) {
    const links: Album['links'] = [{ service: 'spotify', ref: 'spotify:album:' + b62(hash(id + 'sp')), matchedBy: 'import' }];
    if (BANDCAMP[id]) links.push({ service: 'bandcamp', ref: BANDCAMP[id], matchedBy: 'manual' });
    albums[id] = { id, title, artistIds: ids.split(','), released, label, tracks, seconds: secs(len), genre, art: artFor(id), links, upc: String(hash(id)).padStart(12, '0') };
  }
  albums.promises.note = 'Movement 6 is the one. Play it loud.';
  albums.untrue.note = 'Night bus record. Best after midnight.';

  const reasonFor = (lane: LogEntry['lane']) => ({ current: 'New release from an artist you follow.', first: 'New to you.', gold: 'A favourite you had not played in a while.', recurrent: 'More from an artist you kept in rotation.', manual: 'Added by search.' })[lane];
  const entry = ([albumId, lane, verdict, note]: E): LogEntry => ({ albumId, lane, reason: reasonFor(lane), ...(verdict ? { verdict } : {}), ...(note ? { note } : {}) });
  const weeks: Week[] = HISTORY.map(([number, startsOn, es]) => ({
    id: 'wk_' + number, number, startsOn, closed: true, entries: es.map(entry),
    sent: { at: startsOn + 'T09:00:00', service: 'spotify', playlistRef: 'spotify:playlist:' + b62(hash('pl' + number)), albumIds: es.map(e => e[0]) },
  }));
  weeks.push({ id: 'wk_47', number: 47, startsOn: '2026-11-16', closed: false, entries: DRAFT.map(entry) });
  // Reasons on the draft read like the candidate engine's, which recomputes them for new adds.
  const draftReasons: Record<string, string> = {
    satchidananda: 'Heavy rotation in week 40. Off the log 7 weeks.', cascade: 'You follow Floating Points. Out 13 Nov.',
    'love-deluxe': 'Heavy rotation in week 41. Off the log 6 weeks.', endlessness: 'New to you. Found by searching spiritual jazz.',
    promises: 'You kept Pharoah Sanders in rotation in week 46.', 'spirit-of-eden': 'Played 30 times in your history. Never logged.',
    'never-enough': 'In your top artists. Out 6 Nov.',
  };
  weeks[weeks.length - 1].entries.forEach(e => { e.reason = draftReasons[e.albumId] ?? e.reason; });

  return {
    version: 1, artists, albums, weeks, skipped: [],
    policy: { minHours: 4, maxHours: 8, minCurrents: 2, minFirstPlays: 1, minGold: 1, maxGenreShare: 0.4, noRepeatArtist: true, goldCooldownWeeks: 6, currentWindowDays: 21 },
    signals: {
      syncedAt: '2026-11-20T07:42:00',
      followedArtistIds: ['floating-points', 'bon-iver', 'little-simz', 'big-thief', 'khruangbin', 'kelela'],
      topArtistIds: ['turnstile', 'japanese-breakfast', 'floating-points', 'sade', 'boards-of-canada'],
      lifetimePlays: { 'spirit-of-eden': 30, 'marquee-moon': 42, mhtrtc: 51, 'love-deluxe': 38, 'in-rainbows': 64, blue: 27 },
      recentPlays: { brunettes: 14, 'never-enough': 9 },
    },
    connections: { spotify: true, apple: true, tidal: false, bandcamp: true },
  };
}
