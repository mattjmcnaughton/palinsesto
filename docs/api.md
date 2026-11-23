# API reference

Every `/api` route answers JSON with `Cache-Control: no-store`. Errors are `{"detail": {"code", "message"}}`. Writes from the browser need the session cookie, `Origin` equal to `BROWSER_ORIGIN`, and `X-CSRF-Token` from `/api/auth/session`.

## Health

| Method | Path | Description |
| --- | --- | --- |
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Database reachable and at the pinned Alembic revision (`routers/health.SCHEMA_REVISION`) |

## Sign-in

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/auth/login` | Redirect to Auth0 (code flow with PKCE and nonce) |
| GET | `/api/auth/callback` | Finish sign-in. 403 `identity_not_admitted` for an email not on the allowlist, 403 `identity_setup_required` for an identity nobody provisioned |
| GET | `/api/auth/session` | `{user, workspace, csrf_token}`, or 401 |
| POST | `/api/auth/logout` | Revoke the session |

## Desk

Under `/api/workspaces/{workspace_id}`. Every route here returns the whole desk (`GET /desk`'s shape): `artists`, `albums`, `weeks` (oldest first, the last open), `policy`, `current_week_id`, `week_numbers`, `candidates`, `checks`, `signals` and `spotify` (connection status without secrets).

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| GET | `/desk` | | The desk; opens this week if none is open |
| POST | `/log/entries` | `{album_id}` | Add to the open week, with the engine's lane and reason |
| DELETE | `/log/entries/{album_id}` | | Pull from the open week |
| POST | `/log/move` | `{album_id, to}` | Reorder |
| POST | `/log/skip` | `{album_id}` or `{}` | Skip for this week, or bring every skipped album back |
| POST | `/log/close` | | Close the open week (409 if empty) and open the next |
| PATCH | `/weeks/{week_id}/entries/{album_id}` | `{verdict?, clear_verdict?, note?}` | Verdicts only on closed weeks (409 otherwise) |
| PATCH | `/albums/{album_id}` | `{note?, genre?}` | Edit a catalog album |
| DELETE | `/albums/{album_id}/links/{service}` | | Unpatch a service link |
| PUT | `/policy` | full policy | Replace the rotation policy (422 if minimum ≥ maximum) |

## Spotify

Also under `/api/workspaces/{workspace_id}`. Failures answer `spotify_<code>` with the fix in `message`; codes are in `integrations/spotify.ERRORS`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/spotify/setup` | `{redirect_uri, redirect_problem}` for the setup guide |
| PUT | `/spotify/credentials` | `{client_id, client_secret}`: verified with Spotify, then sealed; returns the desk |
| GET | `/spotify/connect` | Redirect to Spotify's consent page (PKCE) |
| GET | `/api/spotify/callback` | Spotify's redirect target; stores the token or the error, then returns to `/#/settings` |
| POST | `/spotify/sync` | Read signals, import the albums they point at; `{imported, desk}` |
| POST | `/spotify/search` | `{q}`: up to 10 albums, each with `in_catalog` |
| POST | `/spotify/import` | `{ref, add}`: catalog the album, and add it to the open week |
| POST | `/spotify/send` | Create or replace the open week's private playlist; records `sent` |
| DELETE | `/spotify` | Forget the credentials and token; the catalog and links stay |
