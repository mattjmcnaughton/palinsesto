# Palinsesto domain context

Palinsesto, Italian for a broadcast schedule, is a desk for programming one weekly mix of whole albums. Use these terms in product discussion, UI copy, code and tests.

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| User | A signed-in identity (Auth0 issuer and subject). An operator provisions each User and its Workspace (`palinsesto.bootstrap`); sign-in never creates one. |
| Workspace | The single-owner boundary for every musical record: catalog, weeks, policy, signals and the service connection. `workspace.owner_id` is its only member for now. |
| Catalog | The Workspace's own artists and albums. It is the source of truth; services are links on it. |
| Album, Artist | Catalog records. An album has a release date, length, track count, genre, optional label and UPC, artwork and a note. |
| Service link | A child of an album or artist pointing at a service's own ID, such as `spotify:album:…`, with how it was matched (import, UPC, search, manual). Removing a service never touches history. |
| Genre | One of Jazz, Electronic, R&B and soul, Rock, Folk, Ambient, Hip-hop, or Unsorted. Spotify supplies no album genres, so imported albums start Unsorted and the owner sorts them in the Library. Unsorted never counts toward the genre rule. |
| Week | Seven days from a Monday, numbered by ISO week. Exactly one week is on the desk (open); closed weeks are in the log book. |
| Log, program log | The open week's albums in air order, with each album's in-time on the clock. |
| Log entry | An album on a week's log, with its lane, reason, and later a verdict and note. |
| Lane (rotation category) | Why an album is a candidate. **Currents**: new releases from followed or top artists within the currents window. **First plays**: artists never logged and not among top tracks. **Gold**: heavy-rotation albums past the cooldown, or unlogged albums holding several of the owner's top tracks. **Recurrents**: more from artists marked keep. **Search** (`manual`): added by hand. |
| Candidate | An album the engine puts in a lane this week, with a reason built only from the owner's own facts, never "recommended for you". |
| Reason | The sentence explaining a candidate, such as "Heavy rotation in week 40. Off the log 7 weeks." It is kept on the log entry. |
| Skip | Hide a candidate for this week only. |
| Close a week | Move the open week to the log book and put the next week on the desk. |
| Verdict | Given in the log book on a closed week: **Heavy rotation** (a keeper; returns as Gold after the cooldown), **Keep in rotation** (more from this artist, feeding Recurrents), **Pulled** (not for me; the artist stops being suggested). |
| Rotation policy | The weekly rules: minimum and maximum hours, minimum Currents, First plays and Gold, the largest genre share, no artist twice, the Gold cooldown and the currents window. |
| Checks | The policy evaluated against the open week, shown as lamps on the meter bridge. |
| Program clock | One full turn is the maximum length; each album is an arc coloured by genre; the minimum is a hatched track. |
| Listening signals | Followed artists, top artists, long-term top tracks and recent plays read from Spotify, stored already mapped to catalog IDs. |
| Service connection | A Workspace's Spotify setup: the owner's own developer app (client ID, sealed client secret) and, once connected, a sealed refresh token. States: not set up, credentials, connected, error. |
| Send | Create or replace the open week's private Spotify playlist with every track of each album in log order. The week is **on air** while the log still matches what was sent. |
| Outputs | The services an album record is patched to, shown on its record. |
