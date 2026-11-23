# Development

## Toolchain

`.agents/setup` installs Node from `.nvmrc`, pnpm from the frontend's `packageManager`, just, Python 3.12 and both lockfiles' dependencies. It does not start Postgres or configure sign-in.

```sh
.agents/setup
cp .env.example .env
docker compose up -d --wait postgres      # Postgres on 127.0.0.1:5433
uv run alembic upgrade head
```

Without Docker (as in an Amp orb), install Postgres from the distribution and point `DATABASE_URL` at it.

## Checks

```sh
just gate                                 # fmt, lint, typecheck and unit tests, no database
createdb palinsesto_test && DATABASE_URL=…/palinsesto_test uv run alembic upgrade head
PALINSESTO_TEST_DATABASE_URL=postgresql+asyncpg://…/palinsesto_test just test-integration
```

Integration tests need a disposable database whose name contains `test`. They sign in through the synthetic OIDC provider (`tests/oidc_fixture.py`) and connect to the fake Spotify (`tests/fakes/spotify_server.py`), both in process.

## Storybook

```sh
just storybook-fe          # http://localhost:6006
just build-storybook-fe    # static build in the frontend's storybook-static/
```

- `Screens/Desk`: the whole app on the demo desk, per screen, plus empty, changed-since-sent, signed-out, loading and failed.
- `Screens/Spotify setup`: the setup guide not set up, with credentials entered, connected, and for each error (invalid client, localhost redirect, redirect mismatch, cancelled consent, not allowlisted, Premium lapsed, token revoked, rejected save).
- `Components/Desk`: the program clock (with a candidate preview and an overrun), the inputs lanes, the program log, the meter bridge, the log book, the album record with its outputs, and covers.
- MSW serves every `/api` read from `src/stories/mocks/api.ts`. Writes answer with the same desk and are logged to the console.
- `src/stories/mocks/desk.json` comes from the prototype's synthetic seed loaded through the backend, so its candidates and checks are the engine's. Regenerate it with `PALINSESTO_TEST_DATABASE_URL=… just storybook-fixture` after changing the engine.

## Running signed in, without Auth0 or Spotify

Three loopback processes stand in for production. Spotify only accepts `http://127.0.0.1` with a port, never `localhost`, so use 127.0.0.1 throughout.

```sh
uv run uvicorn tests.oidc_fixture:app --port 55439           # synthetic Auth0, auto-approves
uv run uvicorn tests.fakes.spotify_server:app --port 55440    # fake Spotify
cd src/palinsesto/web/frontend && pnpm build && cd -
BROWSER_ORIGIN=http://127.0.0.1:55438 \
BROWSER_CSRF_SECRET=synthetic-csrf-secret-at-least-32-characters \
OIDC_ISSUER=http://127.0.0.1:55439 OIDC_CLIENT_ID=synthetic-client \
OIDC_CLIENT_SECRET=synthetic-client-secret \
OIDC_ALLOWED_EMAILS='["synthetic@example.test"]' \
CONNECTION_SECRET_KEY=<Fernet key> \
SPOTIFY_ACCOUNTS_URL=http://127.0.0.1:55440 SPOTIFY_API_URL=http://127.0.0.1:55440/v1 \
uv run uvicorn palinsesto.app:app --port 55438
```

Provision the fixture's identity once, with `uv run python -m palinsesto.bootstrap --issuer http://127.0.0.1:55439 --subject synthetic-user`. Then open http://127.0.0.1:55438, sign in, and in Settings enter the fake's client ID `0123456789abcdef0123456789abcdef` and secret `fedcba9876543210fedcba9876543210`. Never expose the auto-approving OIDC fixture publicly. In an orb, run these with `amp orb service start`.

## Migrations

Import tables in `palinsesto.models` so Alembic sees them. Create a migration with `uv run alembic revision --autogenerate --rev-id 000N -m …`, review it, and bump `SCHEMA_REVISION` in `routers/health.py`.

## Privacy

Fixtures, stories and screenshots use invented or public catalog data only. Never commit `.env`, a Spotify client secret, or exports of a real Workspace.
