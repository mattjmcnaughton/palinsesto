# CLAUDE.md

Palinsesto is a radio programmer's desk for planning one weekly mix of whole albums, 4 to 8 hours long.

Read [CONTEXT.md](CONTEXT.md) before domain or product work. Use its language consistently in code, tests and UI copy, and update it when a meaning changes. [docs/plan.md](docs/plan.md) records the decisions made so far and the delivery order.

Python web application using FastAPI, SQLAlchemy, Alembic, uv, ruff, ty and pytest. The React frontend (TanStack Router and Query, Biome, Vitest, Storybook with MSW) lives in `src/palinsesto/web/frontend/`.

## Quick Reference

| Command | Purpose |
| ------- | ------- |
| `just fmt` / `just fmt-fix` | Check or fix formatting (backend + frontend) |
| `just lint` / `just lint-fix` | Check or fix linting (backend + frontend) |
| `just typecheck` | Run type checkers (backend + frontend) |
| `just test-unit` | Unit tests (backend + frontend) |
| `just test-integration` | Integration tests (need `PALINSESTO_TEST_DATABASE_URL`) |
| `just gate` | Fast pre-push check (fmt + lint + typecheck + test-unit) |
| `just gate-expensive` | Full check (gate + integration + e2e) |
| `just dev` | Start backend and frontend dev servers |
| `just storybook-fe` | Storybook on mocked API responses, no backend needed |
| `just storybook-fixture` | Regenerate Storybook's desk fixture through the backend |

All formatting, linting, typecheck, test-unit and gate targets have `-be` and `-fe` variants.

## Project Structure

```
src/palinsesto/
  app.py                 # FastAPI app factory
  config.py              # Settings from environment variables
  oidc.py                # Auth0 (OIDC) code flow, copied from Accanto
  domains/rotation.py    # Pure: candidate engine and weekly rules
  integrations/spotify.py  # Spotify accounts and Web API client
  models/                # SQLAlchemy tables: accounts, catalog, weeks, connections
  repositories/desk.py   # Reads and catalog writes
  services/              # access (sessions, ownership), browser_auth, desk, spotify
  routers/               # HTTP: browser_auth, desk, spotify, health
  dtos/                  # Pydantic request bodies
  web/frontend/          # React app; stories in src/stories
tests/
  unit/                  # Domain, OIDC and Spotify client (fake server)
  integration/           # Real Postgres with the OIDC fixture and fake Spotify
  fakes/spotify_server.py  # Fake Spotify accounts service and Web API
```

## Key Conventions

- **Layering:** routers → services → repositories. Pure rules live in `domains/` with no HTTP, database or clock access.
- **Ownership:** every musical record belongs to a Workspace, and every service call takes an `AuthenticatedActor` and checks `owned_workspace`. Another User's Workspace answers 404.
- **Catalog first:** albums and artists are Palinsesto's records; Spotify is a `service_link` child row. Weeks and log entries never store a service ID.
- **Secrets:** the Spotify client secret and refresh token are sealed with Fernet (`CONNECTION_SECRET_KEY`) and never returned or logged. Spotify failures become safe error codes (`integrations/spotify.ERRORS`).
- **Integrations** live in `integrations/<provider>.py` and are tested against a fake server in `tests/fakes/`. Mark tests that reach a real service `@pytest.mark.external`.
- **Agent, MCP and API keys** are not built yet. They will copy Accanto's design once proven there; `services/access.py` is where API-key and MCP credentials will join browser sessions.
- **DTOs** are Pydantic models for API I/O, separate from database tables.
- Use synthetic data only in fixtures, stories and screenshots.

## More Information

- `docs/plan.md`: decisions and delivery order
- `docs/architecture.md`: read before adding modules
- `docs/development.md`: setup, local sign-in, Storybook, tests
- `docs/api.md`: API reference
- `docs/technical/box-operations.md`: the planned Amp Box deployment (not deployed yet)
