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
- **Third-party credentials:** one encrypted service connection per Workspace. Use Fernet with a server key, as Accanto PR #39 does for YNAB. Never return secrets to the browser.
- **Agent, MCP and API:** once Accanto proves its design, copy it. That design is in `docs/prd/02-agent-access.md` and `docs/tdds/03-agent-access.md` on Accanto's `transactions-inbox` branch (PR #39), discussed in [this Accanto thread](https://ampcode.com/threads/T-01a200e9-cc7d-7328-aa9e-238b59f1a420). In short:
  - One service-level tool catalog, exposed as REST, as MCP at `/mcp` (API-key bearer tokens), and through a built-in pydantic-ai sidebar agent.
  - Writes are only proposed by default.

  Leave room for this design, but don't build it before Accanto finishes.

## Data sources (open)

The Spotify Web API needs OAuth for anything user-specific. Since February 2026 a development-mode app allows only 5 allowlisted users, and its owner needs Premium. The recommended split:

- **Last.fm:** a user name plus an API key that the owner pastes in, like YNAB. It provides full scrobble history, top artists and albums over any period, and recent plays. This replaces Spotify for listening signals and needs no OAuth.
- **MusicBrainz:** free, with no key (it does need a User-Agent and a rate limit of 1 request per second). It provides artist discographies with release dates and UPCs, for "new releases from artists I follow" and for canonical catalog IDs. Cover Art Archive provides the artwork.
- **Spotify:** used only to create the weekly playlist and for album search links. Register one Palinsesto Spotify app and have the owner click "Connect Spotify" (OAuth with PKCE). The 5-user limit is fine for a single-owner personal app. Store the refresh token encrypted on the workspace's connection.
- **Spotify's extended streaming history export** (a JSON upload) can back-fill old listening later.

Until the owner confirms this split, keep the integrations behind small interfaces and start with fakes.

## Delivery order

1. Scaffold with Copier. Move the prototype's domain (candidate engine, policy) and UI into the template structure. Set up Storybook stories for the clock, the program log, the inputs lanes, the meter bridge, the log book and the album record with its outputs.
2. Backend: User, Workspace, Auth0 sign-in and sessions (follow Accanto's `services/access.py` and `oidc.py`). Then the catalog, weeks, log entries, verdicts and policy API, with the candidate engine as a pure domain module.
3. Integrations: Last.fm, MusicBrainz and Spotify export, each with a fake server for tests.
4. Deploy as an Amp Box with Neon and Auth0, following `docs/technical/box-operations.md` in Accanto.
5. Agent, MCP and API with keys, once Accanto has proven them.
