// Helpers shared by the three prototypes: generated cover art, time formatting,
// the weekly rules check, and service-independent album records.
(() => {
  const D = window.MIX_DATA;
  const byId = Object.fromEntries(D.albums.map(a => [a.id, a]));

  const hash = s => {
    let h = 2166136261;
    for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  // Seconds, so clock readouts look like real runtimes rather than round minutes.
  const secs = a => a.minutes * 60 + (hash(a.id || a.artist + a.title) % 60) - 30;

  const PALETTE = [["#1d3b8f", "#f2c14e"], ["#c8243c", "#f4d35e"], ["#0f2a33", "#9ad6b4"], ["#e8dcc2", "#6b3f2a"],
    ["#2e4a3a", "#e9d8a6"], ["#e86a33", "#f7e9d0"], ["#5b1f2b", "#f0a07a"], ["#9fd3c7", "#1f4e5f"]];
  const MOTIFS = ["disc", "bars", "grid", "arc", "split", "dot"];
  const artFor = a => {
    if (a.art) return a.art;
    const h = hash(a.artist + a.title);
    const p = PALETTE[h % PALETTE.length];
    return { c1: p[0], c2: p[1], motif: MOTIFS[(h >> 3) % MOTIFS.length] };
  };

  // Abstract placeholder sleeves. A real build would use the linked service's artwork.
  function cover(a) {
    const { c1, c2, motif } = artFor(a);
    const h = hash(a.artist + a.title);
    let g = "";
    switch (motif) {
      case "disc": g = `<circle cx="50" cy="50" r="31" fill="${c2}"/><circle cx="50" cy="50" r="4" fill="${c1}"/>`; break;
      case "bars": for (let i = 0; i < 6; i++) { const hh = 18 + ((h >> (i * 3)) & 31) * 1.9; g += `<rect x="${12 + i * 13}" y="${88 - hh}" width="8" height="${hh}" fill="${c2}"/>`; } break;
      case "grid": for (let i = 0; i < 16; i++) if ((h >> i) & 1 || i === 5) g += `<rect x="${14 + (i % 4) * 19}" y="${14 + Math.floor(i / 4) * 19}" width="15" height="15" fill="${c2}"/>`; break;
      case "arc": g = `<circle cx="${70 + (h % 20)}" cy="${78 + (h % 14)}" r="58" fill="${c2}"/>`; break;
      case "split": g = `<rect x="0" y="${52 + (h % 16)}" width="100" height="60" fill="${c2}"/><rect x="10" y="${40 + (h % 16)}" width="34" height="2" fill="${c2}"/>`; break;
      default: g = `<circle cx="${28 + (h % 20)}" cy="${30 + (h % 18)}" r="13" fill="${c2}"/><rect x="12" y="78" width="${30 + (h % 40)}" height="3" fill="${c2}"/>`;
    }
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" fill="${c1}"/>${g}</svg>`;
  }

  const pad = n => String(n).padStart(2, "0");
  const fmtHM = m => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h} h ${pad(m % 60)} min` : `${m % 60} min`; };
  const fmtClock = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
  const fmtDur = s => s < 3600 ? `${Math.floor(s / 60)}:${pad(Math.round(s) % 60)}` : fmtClock(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const genreName = id => D.genres.find(g => g.id === id).name;

  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = s => new Date(s + "T12:00:00");
  const shortDate = s => { const d = day(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
  const weekRange = s => {
    const a = day(s), b = new Date(a); b.setDate(a.getDate() + 6);
    return a.getMonth() === b.getMonth() ? `${a.getDate()} to ${b.getDate()} ${MON[b.getMonth()]}` : `${shortDate(s)} to ${b.getDate()} ${MON[b.getMonth()]}`;
  };

  // His weekly rules, checked live against the current mix.
  function policy(items) {
    const min = items.reduce((t, a) => t + a.minutes, 0);
    const by = k => items.filter(a => a.lane === k).length;
    const g = {};
    items.forEach(a => { g[a.genre] = (g[a.genre] || 0) + a.minutes; });
    const top = Object.entries(g).sort((x, y) => y[1] - x[1])[0];
    const share = top ? top[1] / min : 0;
    const names = items.map(a => a.artist);
    const dup = names.length !== new Set(names).size;
    return [
      { id: "len", label: "4 to 8 hours", ok: min >= 240 && min <= 480, value: fmtHM(min) },
      { id: "new", label: "At least 2 new releases", ok: by("new") >= 2, value: String(by("new")) },
      { id: "discover", label: "At least 1 new artist", ok: by("discover") >= 1, value: String(by("discover")) },
      { id: "vault", label: "At least 1 from the vault", ok: by("vault") >= 1, value: String(by("vault")) },
      { id: "genre", label: "No genre over 40%", ok: share <= 0.4, value: top ? `${genreName(top[0])} ${Math.round(share * 100)}%` : "None" },
      { id: "artist", label: "No artist twice", ok: !dup, value: dup ? "Repeat" : "" }
    ];
  }

  // The app's own record of an album. Services are links that can be added or removed.
  const records = {};
  function recordFor(a) {
    if (records[a.id]) return records[a.id];
    const r = a.id === D.record.albumId ? D.record : null;
    const h = hash(a.id);
    return (records[a.id] = {
      catalogId: r ? r.catalogId : "alb_" + h.toString(36).toUpperCase().slice(0, 6),
      released: r ? r.released : String(a.year),
      label: r ? r.label : null,
      tracks: r ? r.tracks : 7 + (h % 6),
      artists: r ? r.artists : [a.artist],
      notes: r ? r.notes : "",
      services: (r ? r.services : [{ name: "Spotify", status: "linked" }, { name: "Apple Music", status: "unlinked" }, { name: "Tidal", status: "unlinked" }, { name: "Bandcamp", status: "unlinked" }]).map(s => ({ ...s }))
    });
  }

  window.MIX = { D, byId, hash, secs, artFor, cover, fmtHM, fmtClock, fmtDur, esc, genreName, shortDate, weekRange, policy, recordFor };
})();
