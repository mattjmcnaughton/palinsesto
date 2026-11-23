# Palinsesto build plan

Build Palinsesto the way Accanto is built:

- Scaffold it from the `python-web` (Postgres) and `frontend-react` Copier templates.
- Design screens in Storybook against MSW mocks.
- Run on Neon Postgres behind Auth0.
- Deploy it as an Amp Box.

The design came out of [this thread](https://ampcode.com/threads/T-01a1f8c5-d7f3-75a1-8335-faa41c0b6ccb).

## Decided

- **Name:** Palinsesto, the Italian word for a broadcast schedule.
- **Visual direction:** "Rotation", a dark radio programmer's desk. See `prototype/app/` and `prototype/design-directions/rotation.html`.
- **Stack and conventions:** follow Accanto (`mattjmcnaughton/accanto`): FastAPI, SQLAlchemy, Alembic, uv, ruff, ty and pytest, plus a React frontend with TanStack Router and Query, Tailwind, Biome, Vitest, and Storybook with MSW.
  - Layers: routers, then services, then repositories.
  - Pure domain rules live in `domains/`, with no HTTP, database or clock access.
  - Provider-specific code lives in `integrations/<provider>.py`.
- **Accounts:** a User signs in with Auth0. A Workspace has a single owner (`workspace.owner_id`), like Accanto's Entity. Every musical record belongs to a Workspace. There are no multi-member workspaces for now.
- **Catalog:** artists and albums are the app's own records. Service links (`spotify:album:…`, Apple Music, Bandcamp) are child rows, and weeks and verdicts never point at a service ID directly.
- **Third-party credentials:** one encrypted service connection per Workspace and service. Use Fernet with a server key, as Accanto PR #39 does for YNAB. Never return secrets to the browser.
- **Sign-in admission:** a verified email on `OIDC_ALLOWED_EMAILS` is provisioned a User and its Workspace on first sign-in. Accanto instead requires an operator to provision each identity first; Palinsesto's allowlist is the gate.
- **Where the engine runs:** the candidate engine and policy checks are Python (`domains/rotation.py`). The desk API returns candidates and checks with the records, and the browser only displays them.
- **Week numbers** are ISO week numbers of the week's Monday.
- **Agent, MCP and API:** once Accanto proves its design, copy it. That design is in `docs/prd/02-agent-access.md` and `docs/tdds/03-agent-access.md` on Accanto's `transactions-inbox` branch (PR #39), discussed in [this Accanto thread](https://ampcode.com/threads/T-01a200e9-cc7d-7328-aa9e-238b59f1a420). In short:
  - One service-level tool catalog, exposed as REST, as MCP at `/mcp` (API-key bearer tokens), and through a built-in pydantic-ai sidebar agent.
  - Writes are only proposed by default.

  Leave room for this design, but don't build it before Accanto finishes.

## Data sources (decided)

Matt decided on Spotify only, with no Last.fm or MusicBrainz.

- **Bring your own app.** Each Workspace owner registers their own Spotify developer app. In Settings they enter its client ID and secret, then click "Connect Spotify", which runs the authorization code flow with PKCE.
- **Secrets.** The client secret and refresh token are encrypted together with Fernet (`CONNECTION_SECRET_KEY`) on the Workspace's Spotify service connection, as Accanto PR #39 does for YNAB. They are never returned to the browser or logged.
- **What Spotify provides:**
  - Listening signals: followed artists, top artists, long-term top tracks and the last 50 recently played tracks.
  - Album search, capped at 10 results in development mode.
  - Artist discographies with release dates, for Currents.
  - The weekly playlist export (`POST /me/playlists`, then `/playlists/{id}/items`).
- **Development-mode limits.** The app's owner needs Premium; at most 5 users can be on the app's allowlist; batch album and artist reads are gone, and album objects have no label. Spotify supplies no album genres, so imported albums start Unsorted until the owner sorts them in the Library.
- **Setup guide.** Settings has a step-by-step guide: Premium, create the app with "Web API", the exact redirect URI with a copy button (HTTPS, or `http://127.0.0.1` with a port; never localhost), User Management, then the credentials and Connect. It also explains each error people hit, with its fix: INVALID_CLIENT, a redirect mismatch, a 403 for an account missing from the allowlist, lapsed Premium, a revoked or expired token, and cancelled consent.
- **Tests** use `tests/fakes/spotify_server.py`, a fake accounts service and Web API that reproduces each of those errors.
- **Later:** Spotify's extended streaming history export (a JSON upload) can back-fill old listening.

## Delivery order

1. Done. Scaffold with Copier. Move the prototype's domain (candidate engine, policy) and UI into the template structure. Set up Storybook stories for the clock, the program log, the inputs lanes, the meter bridge, the log book and the album record with its outputs.
2. Done. Backend: User, Workspace, Auth0 sign-in and sessions (follow Accanto's `services/access.py` and `oidc.py`). Then the catalog, weeks, log entries, verdicts and policy API, with the candidate engine as a pure domain module.
3. Integrations: the Spotify connection (signals, search, discographies and playlist export) with a fake server for tests. Done in the first pass, ahead of order, once the data source was decided.
4. Deploy as an Amp Box with Neon and Auth0, following `docs/technical/box-operations.md` in Accanto.
5. Agent, MCP and API with keys, once Accanto has proven them.
