# Running and debugging the deployment on an Amp Box

**Status: not deployed.** `.amp/box.yaml` and `scripts/box-build.sh` are ready, but no
`.amp/box-deploy.json`, Neon project or Auth0 application exists yet. This runbook
follows Accanto's and Shelfmark's, so Palinsesto can join the shared Box
`mattjmcnaughton/apps` as the `palinsesto` deployment once Matt decides to deploy.

The deployment will hold a real listening history and Spotify credentials. Debug it
from logs, health endpoints, schema state and provider metadata; none of them needs
to read catalog rows or connection secrets, and none should.

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| Build | The orb running `amp boxes deploy` | `scripts/box-build.sh` builds a relocatable CPython 3.12, the locked dependencies and the palinsesto wheel with the SPA into `box-release/`. No source, tests or fakes ship. |
| Web service | Box `mattjmcnaughton/apps`, deployment `palinsesto`, service `web` | Defined in `.amp/box.yaml`. Uvicorn access logs are off, because Spotify's OAuth callback carries a one-time code in its query string. |
| Database | Neon project `palinsesto` (to create) | `palinsesto_owner` runs migrations and never reaches the Box. `palinsesto_app` is the restricted runtime login in the Box's `DATABASE_URL`. |
| Sign-in | Auth0 application "Palinsesto" (to create) | Callback `<deployment URL>/api/auth/callback`. |
| Spotify | Each Workspace owner's own Spotify developer app | Redirect URI `<deployment URL>/api/spotify/callback`, shown with a copy button in Settings. Palinsesto holds no Spotify app of its own. |

Runtime configuration lives on the deployment, never in Git:

- Secrets: `DATABASE_URL` (asyncpg URL with `?ssl=verify-full`), `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET`, `OIDC_ALLOWED_EMAILS` (a JSON list, such as
  `["me@example.com"]`), `BROWSER_CSRF_SECRET`, and `CONNECTION_SECRET_KEY`, the
  Fernet key that encrypts each Workspace's Spotify client secret and refresh token.
- Environment variable: `OIDC_ISSUER`, exactly as the provider's discovery document
  reports it. Auth0 issuers end with `/`.
- Set by Amp: `PORT` and `AMP_DEPLOYMENT_URL`, which becomes `BROWSER_ORIGIN`.

Losing or rotating `CONNECTION_SECRET_KEY` makes stored Spotify secrets unreadable;
each owner then re-enters their client secret and reconnects. Back it up outside
the Box.

List what is stored, without values, with `manage_amp` (topics `secrets` and
`environment_variables`, operation `list`, scope `box`). Set values with the same
tool, which asks for them in a masked dialog.

## Deploying

Deploys use pushed code only. Migrate first, from an orb with the owner credential:

```sh
PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt \
DATABASE_URL="<owner asyncpg URL with ?ssl=verify-full>" \
uv run alembic upgrade head
amp boxes deploy
```

Grant `palinsesto_app` `SELECT, INSERT, UPDATE, DELETE` on the tables a migration
adds. `/readyz` returns 503 until the database is at `SCHEMA_REVISION`.

## Debugging with Amp

```sh
amp boxes deployments mattjmcnaughton/apps    # status, ID, port, commit
amp boxes exec mattjmcnaughton/apps --deployment palinsesto \
  'curl -s localhost:<port>/healthz; echo; curl -s localhost:<port>/readyz'
amp boxes exec mattjmcnaughton/apps \
  'sudo journalctl -u amp-box-deploy-<deployment-id>-svc-web.service -n 200 --no-pager -o cat'
```

- `/healthz` failing: the process is not running; read the log.
- `/readyz` `"database": "unreachable"`: check `DATABASE_URL`, Neon and TLS.
- `/readyz` `"schema incompatible"`: run the migration.
- Settings validation errors can echo configuration values. Redact emails and
  connection URLs before pasting logs anywhere.

### Sign-in problems

- A 503 from `/api/auth/login`: issuer, origin, client ID or CSRF secret missing.
- `identity_not_admitted`: wrong issuer, unverified email, or an email not in
  `OIDC_ALLOWED_EMAILS`.
- `identity_setup_required`: no User exists for that exact issuer and subject.
  Provision it from an orb with the owner credential (the subject is the user's
  `user_id` in Auth0, such as `auth0|…`):

  ```sh
  PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt DATABASE_URL="<owner asyncpg URL>" \
  uv run python -m palinsesto.bootstrap --issuer "<OIDC_ISSUER>" --subject "<user_id>"
  ```

### Spotify problems

These are per Workspace and are explained to the owner in Settings; the operator
usually has nothing to fix. The connection stores a safe error code only, never a
token, code or secret: `invalid_client`, `redirect_mismatch`, `access_denied`,
`not_allowlisted`, `premium_required`, `token_revoked`. If owners see
`secret_unreadable` after a deploy, `CONNECTION_SECRET_KEY` changed.

## Privacy rules for agents

- Do not start Amp threads on the Box against the `palinsesto` deployment, and do
  not enable the Box review widget on it.
- Do not read `service_connection` or `service_authorization` rows, and never decrypt
  a stored secret.
- Integration tests and `just storybook-fixture` only target a database whose name
  contains `test`. Never point them at Neon.
