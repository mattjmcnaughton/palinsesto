# Architecture

Palinsesto is a FastAPI backend on Postgres with a React frontend served from the same origin. Read [CONTEXT.md](../CONTEXT.md) for domain meanings and [plan.md](plan.md) for decisions.

## Layering

```
routers (HTTP, auth dependencies, DTOs, redirects)
  -> services (authorization, transactions, orchestration, external calls)
    -> repositories (queries) and models (tables)
domains/ (pure rules, used by services)
integrations/ (provider transport and payload mapping, used by services)
```

| Location | Responsibility |
| --- | --- |
| `domains/rotation.py` | The candidate engine (lanes and reasons), the weekly checks and week arithmetic. Plain dataclasses in, plain results out; no HTTP, database or clock. |
| `services/access.py` | Browser sessions, `AuthenticatedActor`, and `owned_workspace`, which every Workspace operation goes through. API keys and MCP credentials will join here when Palinsesto copies Accanto's design. |
| `services/browser_auth.py` | Login transactions and admission: an allowlisted email whose issuer and subject an operator provisioned. `bootstrap.py` provisions a User and its Workspace. |
| `services/desk.py` | Reads and writes the desk. Each write locks the Workspace row, applies one change and returns the whole desk with candidates and checks. |
| `services/spotify.py` | The Workspace's Spotify connection: sealed credentials, Connect, token refresh, sync, search, import and send. Stores blocking failures as safe error codes on the connection. |
| `integrations/spotify.py` | `SpotifyAccounts` (authorize URL, token endpoint) and `SpotifyApi` (the Web API endpoints used). Maps every failure to a code in `ERRORS`. |
| `repositories/desk.py` | Loads a Workspace's records keyed by public UUIDs; finds or creates catalog artists for Spotify artists. |
| `web/frontend/src/lib` | Same-origin transport with CSRF (`api.ts`), the desk types and formatting (`desk.ts`), and the desk store (`store.tsx`), which replaces the cached desk with each write's response. |
| `web/frontend/src/features` | The screens: log (inputs, program log, meter bridge), log book, library and album record, settings with the Spotify setup guide, and the shell. |
| `web/frontend/src/stories` | Storybook: `screens/` for whole screens and the setup guide's states, `components/` for the clock, lanes, log, meter bridge, log book and record; `mocks/` for MSW. |

## Data model

- `app_user` (issuer, subject) and `workspace` (unique `owner_id`, time zone, policy as JSONB).
- `artist`, `album`, `album_artist` (ordered credits) and `service_link` (a child of exactly one album or artist; one link per record and service; one record per Workspace, service and ref).
- `week` (Monday start, `closed_at`, last `sent` export, `skipped` album UUIDs) with a partial unique index allowing one open week per Workspace; `log_entry` (position, lane, reason, verdict, note).
- `service_connection` (one per Workspace and service: client ID, Fernet-sealed secret JSON, state, error code), `service_authorization` (single-use, browser-bound Connect state and PKCE verifier) and `listening_signals` (latest signals, mapped to catalog UUIDs).
- Browser credentials as in Accanto: `browser_session` stores only token hashes; `oidc_login_transaction` is single-use and browser-bound.

## Testing boundaries

- `tests/unit`: the domain engine on hand-built desks, OIDC token validation with the synthetic provider, and the Spotify client against the fake server.
- `tests/integration`: the HTTP API on real Postgres, signing in through the synthetic OIDC fixture and connecting to the fake Spotify, including every setup error.
- Storybook renders every screen without a backend. Its desk fixture is produced by the backend from the prototype's seed (`just storybook-fixture`), so stories show the engine's real candidates and checks.
