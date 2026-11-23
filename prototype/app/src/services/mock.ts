// Mock streaming services. A real build would call the Spotify Web API
// (GET /search?type=album capped at 10, POST /me/playlists, POST /playlists/{id}/items)
// and other services' matching APIs. Everything here resolves after a short delay.
import { artFor, hash, newId } from '../domain/format';
import type { Album, Artist, GenreId, ServiceId, ServiceLink, State } from '../domain/types';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface RemoteAlbum {
  ref: string; title: string; artists: string[]; released: string; seconds: number;
  tracks: number; label: string; genre: GenreId; upc: string;
}

const r = (title: string, artists: string[], released: string, len: string, genre: GenreId, label: string, tracks: number): RemoteAlbum => {
  const [m, s] = len.split(':').map(Number);
  const h = hash(title + artists[0]);
  return { ref: 'spotify:album:' + h.toString(36).toUpperCase().padEnd(22, 'X'), title, artists, released, seconds: m * 60 + s, tracks, label, genre, upc: String(h).padStart(12, '0') };
};

const SPOTIFY: RemoteAlbum[] = [
  r('Gold', ['Alabaster DePlume'], '2022-04-01', '60:33', 'jazz', 'International Anthem', 19),
  r('Untitled (Black Is)', ['Sault'], '2020-06-19', '57:44', 'rnb', 'Forever Living Originals', 20),
  r('Vulture Prince', ['Arooj Aftab'], '2021-04-23', '49:58', 'folk', 'New Amsterdam', 7),
  r('Mood Valiant', ['Hiatus Kaiyote'], '2021-06-25', '46:16', 'rnb', 'Brainfeeder', 12),
  r('Lives Outgrown', ['Beth Gibbons'], '2024-05-17', '46:00', 'folk', 'Domino', 10),
  r('Diamond Jubilee', ['Cindy Lee'], '2024-03-29', '122:01', 'rock', 'Realistik', 32),
  r('The Epic', ['Kamasi Washington'], '2015-05-05', '172:48', 'jazz', 'Brainfeeder', 17),
  r('Day of Radiance', ['Laraaji'], '1980-01-01', '44:18', 'ambient', 'EG', 5),
  r('Perceive Its Beauty, Acknowledge Its Grace', ['Shabaka'], '2024-04-12', '41:20', 'jazz', 'Impulse!', 11),
  r('Spiritual Jazz Vol. 1', ['Various Artists'], '2008-11-03', '74:02', 'jazz', 'Jazzman', 15),
  r('In a Silent Way', ['Miles Davis'], '1969-07-30', '38:08', 'jazz', 'Columbia', 2),
  r('Endlessness', ['Nala Sinephro'], '2024-09-06', '46:10', 'jazz', 'Warp', 10),
  r('Promises', ['Floating Points', 'Pharoah Sanders', 'London Symphony Orchestra'], '2021-03-26', '45:53', 'jazz', 'Luaka Bop', 9),
  r('Untrue', ['Burial'], '2007-11-05', '50:33', 'electronic', 'Hyperdub', 13),
  r('Ghost Stories', ['Gilles Peterson'], '2019-05-17', '58:40', 'electronic', 'Brownswood', 14),
  r('Sinner Get Ready', ['Lingua Ignota'], '2021-08-06', '62:10', 'rock', 'Sargent House', 10),
];

/** Album search. Spotify caps development-mode search at 10 results per type. */
export async function searchSpotify(q: string): Promise<RemoteAlbum[]> {
  await wait(380);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SPOTIFY.filter(a => {
    const hay = `${a.title} ${a.artists.join(' ')} ${a.genre} ${a.label}`.toLowerCase();
    return words.every(w => hay.includes(w));
  }).slice(0, 10);
}

/** The catalog album this remote album already maps to, matched by artist and title. */
export function inCatalog(s: State, ra: RemoteAlbum): Album | undefined {
  const first = ra.artists[0].toLowerCase();
  return Object.values(s.albums).find(a => a.title.toLowerCase() === ra.title.toLowerCase() && a.artistIds.some(id => s.artists[id]?.name.toLowerCase() === first));
}

/** Turn a remote album into catalog records. Spotify becomes one link on them. */
export function toCatalog(ra: RemoteAlbum, s: State): { album: Album; artists: Artist[] } {
  const artists = ra.artists.map(name => {
    const found = Object.values(s.artists).find(a => a.name.toLowerCase() === name.toLowerCase());
    return found ?? { id: slug(name) || newId('art'), name, links: [{ service: 'spotify' as const, ref: 'spotify:artist:' + hash(name).toString(36).toUpperCase(), matchedBy: 'search' as const }] };
  });
  let id = slug(ra.title) || newId('alb');
  if (s.albums[id]) id = `${id}-${hash(ra.ref).toString(36).slice(0, 4)}`;
  return {
    artists,
    album: {
      id, title: ra.title, artistIds: artists.map(a => a.id), released: ra.released, label: ra.label, tracks: ra.tracks,
      seconds: ra.seconds, genre: ra.genre, upc: ra.upc, art: artFor(ra.ref), links: [{ service: 'spotify', ref: ra.ref, matchedBy: 'search' }],
    },
  };
}

/** Look an album up on another service by UPC, then by artist and title. Bandcamp misses some. */
export async function findMatch(service: ServiceId, a: Album, artistName: string): Promise<ServiceLink | null> {
  await wait(850);
  const h = hash(a.id + service);
  switch (service) {
    case 'spotify': return { service, ref: 'spotify:album:' + h.toString(36).toUpperCase().padEnd(22, 'Q'), matchedBy: 'upc' };
    case 'apple': return { service, ref: `music.apple.com/album/${slug(a.title)}/${1400000000 + (h % 99999999)}`, matchedBy: 'upc' };
    case 'tidal': return { service, ref: `tidal.com/album/${10000000 + (h % 89999999)}`, matchedBy: 'upc' };
    case 'bandcamp': return h % 3 === 0 ? null : { service, ref: `${slug(artistName).replace(/-/g, '')}.bandcamp.com/album/${slug(a.title)}`, matchedBy: 'search' };
  }
}

/** Create a private playlist holding every track of each album, in log order. */
export async function createSpotifyPlaylist(name: string, albumRefs: string[]): Promise<{ ref: string; tracks: number }> {
  await wait(1100);
  return { ref: 'spotify:playlist:' + hash(name + albumRefs.join()).toString(36).toUpperCase().padEnd(22, 'P'), tracks: albumRefs.length };
}
