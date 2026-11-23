// Sample data shared by all three prototypes. Albums are real; runtimes are approximate,
// and the "new this week" framing and reasons are illustrative, not pulled from Spotify.
// Each album is a catalog record owned by the app; services are links, not the source of truth.
window.MIX_DATA = {
  week: { number: 47, label: "Week 47", starts: "2026-11-16", catalogNo: "HL 047" },
  target: { minMinutes: 240, maxMinutes: 480 },
  genres: [
    { id: "jazz", name: "Jazz" },
    { id: "electronic", name: "Electronic" },
    { id: "rnb", name: "R&B and soul" },
    { id: "rock", name: "Rock" },
    { id: "folk", name: "Folk" },
    { id: "ambient", name: "Ambient" }
  ],
  lanes: [
    { id: "new", name: "New releases", desc: "New albums from artists you follow or play a lot." },
    { id: "discover", name: "New artists", desc: "Artists you have never added to a mix." },
    { id: "vault", name: "Back from the vault", desc: "Albums you rated a keeper and haven't played in a year." },
    { id: "explore", name: "Keep exploring", desc: "More from artists you marked to follow up on." }
  ],
  // art: two colors and a motif ("disc", "bars", "grid", "arc", "split", "dot") for generated covers.
  albums: [
    { id: "cascade", artist: "Floating Points", title: "Cascade", year: 2024, minutes: 47, genre: "electronic", lane: "new", reason: "You follow Floating Points. Out Friday.", art: { c1: "#1d3b8f", c2: "#f2c14e", motif: "bars" } },
    { id: "neverenough", artist: "Turnstile", title: "Never Enough", year: 2025, minutes: 43, genre: "rock", lane: "new", reason: "In your top artists for 6 months.", art: { c1: "#8fd1e8", c2: "#14213d", motif: "arc" } },
    { id: "sable", artist: "Bon Iver", title: "SABLE, fABLE", year: 2025, minutes: 42, genre: "folk", lane: "new", reason: "You follow Bon Iver. New full-length.", art: { c1: "#e86a33", c2: "#f7e9d0", motif: "split" } },
    { id: "brunettes", artist: "Japanese Breakfast", title: "For Melancholy Brunettes (& sad women)", year: 2025, minutes: 32, genre: "rock", lane: "new", reason: "Played 14 times in October.", art: { c1: "#2e4a3a", c2: "#e9d8a6", motif: "dot" } },
    { id: "endlessness", artist: "Nala Sinephro", title: "Endlessness", year: 2024, minutes: 46, genre: "jazz", lane: "discover", reason: "Found through a search for spiritual jazz.", art: { c1: "#d9d4c7", c2: "#3a3a3a", motif: "grid" } },
    { id: "twostar", artist: "Mk.gee", title: "Two Star & the Dream Police", year: 2024, minutes: 36, genre: "rnb", lane: "discover", reason: "Appears with artists in your top 20.", art: { c1: "#5b1f2b", c2: "#f0a07a", motif: "arc" } },
    { id: "pitch", artist: "Jessica Pratt", title: "Here in the Pitch", year: 2024, minutes: 28, genre: "folk", lane: "discover", reason: "New to you. Short and quiet.", art: { c1: "#c9b48a", c2: "#2b2b2b", motif: "dot" } },
    { id: "adan", artist: "Ichiko Aoba", title: "Windswept Adan", year: 2020, minutes: 50, genre: "ambient", lane: "discover", reason: "New to you. Fits your ambient weeks.", art: { c1: "#9fd3c7", c2: "#1f4e5f", motif: "split" } },
    { id: "satchidananda", artist: "Alice Coltrane", title: "Journey in Satchidananda", year: 1971, minutes: 37, genre: "jazz", lane: "vault", reason: "Keeper in week 12. Not played since March.", art: { c1: "#c8243c", c2: "#f4d35e", motif: "disc" } },
    { id: "lovedeluxe", artist: "Sade", title: "Love Deluxe", year: 1992, minutes: 47, genre: "rnb", lane: "vault", reason: "Keeper in week 3. Not played in 14 months.", art: { c1: "#1b1b1b", c2: "#d6c6a8", motif: "arc" } },
    { id: "spiritofeden", artist: "Talk Talk", title: "Spirit of Eden", year: 1988, minutes: 41, genre: "rock", lane: "vault", reason: "You played it 30 times in 2024.", art: { c1: "#e8dcc2", c2: "#6b3f2a", motif: "dot" } },
    { id: "mhtrtc", artist: "Boards of Canada", title: "Music Has the Right to Children", year: 1998, minutes: 70, genre: "electronic", lane: "vault", reason: "Keeper in week 8. Not played in a year.", art: { c1: "#a9c6b8", c2: "#3d5a4c", motif: "grid" } },
    { id: "marquee", artist: "Television", title: "Marquee Moon", year: 1977, minutes: 46, genre: "rock", lane: "vault", reason: "In your all-time top 50.", art: { c1: "#f2efe6", c2: "#111111", motif: "split" } },
    { id: "promises", artist: "Floating Points, Pharoah Sanders & LSO", title: "Promises", year: 2021, minutes: 46, genre: "jazz", lane: "explore", reason: "You marked Pharoah Sanders as follow up in week 44.", art: { c1: "#efe6d2", c2: "#2f5d8a", motif: "disc" } },
    { id: "alasala", artist: "Khruangbin", title: "A La Sala", year: 2024, minutes: 44, genre: "rnb", lane: "explore", reason: "More from this artist, marked in week 45.", art: { c1: "#e9b44c", c2: "#4a2c2a", motif: "bars" } },
    { id: "raven", artist: "Kelela", title: "Raven", year: 2023, minutes: 55, genre: "rnb", lane: "explore", reason: "You rated Take Me Apart a keeper.", art: { c1: "#0f2a33", c2: "#9ad6b4", motif: "arc" } },
    { id: "dragon", artist: "Big Thief", title: "Dragon New Mountain I Believe In You", year: 2022, minutes: 80, genre: "folk", lane: "explore", reason: "More from this artist, marked in week 46.", art: { c1: "#d96c4f", c2: "#f3e3c3", motif: "grid" } }
  ],
  // Albums already in this week's mix, in order.
  mix: ["satchidananda", "cascade", "lovedeluxe", "endlessness", "promises", "spiritofeden", "neverenough"],
  // Past weeks. verdict: "keeper" | "more" | "no" | null (not rated yet)
  history: [
    { week: 46, starts: "2026-11-09", catalogNo: "HL 046", items: [
      { artist: "Big Thief", title: "Capacity", minutes: 41, genre: "folk", verdict: "more" },
      { artist: "Pharoah Sanders", title: "Karma", minutes: 37, genre: "jazz", verdict: "keeper" },
      { artist: "Burial", title: "Untrue", minutes: 50, genre: "electronic", verdict: "keeper" },
      { artist: "Fontaines D.C.", title: "Romance", minutes: 37, genre: "rock", verdict: "no" },
      { artist: "Erykah Badu", title: "Mama's Gun", minutes: 72, genre: "rnb", verdict: "keeper" },
      { artist: "Hiroshi Yoshimura", title: "Music for Nine Post Cards", minutes: 40, genre: "ambient", verdict: null }
    ] },
    { week: 45, starts: "2026-11-02", catalogNo: "HL 045", items: [
      { artist: "Khruangbin", title: "Con Todo El Mundo", minutes: 39, genre: "rnb", verdict: "more" },
      { artist: "Yussef Dayes", title: "Black Classical Music", minutes: 72, genre: "jazz", verdict: "keeper" },
      { artist: "Four Tet", title: "Three", minutes: 44, genre: "electronic", verdict: "keeper" },
      { artist: "Wednesday", title: "Rat Saw God", minutes: 42, genre: "rock", verdict: "no" },
      { artist: "Adrianne Lenker", title: "Bright Future", minutes: 43, genre: "folk", verdict: "keeper" }
    ] },
    { week: 44, starts: "2026-10-26", catalogNo: "HL 044", items: [
      { artist: "Pharoah Sanders", title: "Thembi", minutes: 40, genre: "jazz", verdict: "more" },
      { artist: "Kelela", title: "Take Me Apart", minutes: 56, genre: "rnb", verdict: "keeper" },
      { artist: "Slowdive", title: "Souvlaki", minutes: 40, genre: "rock", verdict: "keeper" },
      { artist: "Jon Hopkins", title: "Immunity", minutes: 60, genre: "electronic", verdict: "no" },
      { artist: "Brian Eno", title: "Music for Airports", minutes: 48, genre: "ambient", verdict: "keeper" },
      { artist: "Nick Drake", title: "Pink Moon", minutes: 28, genre: "folk", verdict: "keeper" },
      { artist: "Steely Dan", title: "Aja", minutes: 40, genre: "rock", verdict: "more" }
    ] }
  ],
  // One service-independent album record, shown on each prototype's record view.
  record: {
    albumId: "promises",
    catalogId: "alb_7Q2KX9",
    released: "2021-03-26",
    label: "Luaka Bop",
    tracks: 9,
    appearsIn: [],
    artists: ["Floating Points", "Pharoah Sanders", "London Symphony Orchestra"],
    services: [
      { name: "Spotify", status: "linked", id: "spotify:album:5Y0..." },
      { name: "Apple Music", status: "unlinked" },
      { name: "Tidal", status: "unlinked" },
      { name: "Bandcamp", status: "linked", id: "luakabop.bandcamp.com/album/promises" }
    ],
    notes: "Movement 6 is the one. Play it loud."
  }
};
