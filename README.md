# Palinsesto

Palinsesto is a personal radio programmer's desk for building one album-length mix a week: 4 to 8 hours of whole albums that mix new releases, artists you've never heard, old favourites coming back, and more from artists you want to keep exploring. Each week goes into a log book with your verdicts, and those verdicts shape what's suggested next.

Albums and artists are Palinsesto's own records. Spotify supplies your listening signals, album search and the weekly playlist through your own Spotify developer app, and is only a link on those records, so your history doesn't depend on it.

## Status

A first working build: sign-in with Auth0, a single-owner Workspace, the catalog, weeks, log book and rotation policy on Postgres, and the Spotify connection with an in-app setup guide. It runs at https://palinsesto.mattjmcnaughton.com on an Amp Box, signed in to by Matt only; see [box-operations.md](docs/technical/box-operations.md).

- `src/palinsesto/`: the FastAPI backend; `src/palinsesto/web/frontend/`: the React frontend and its Storybook.
- `docs/plan.md`: decisions and delivery order. `CONTEXT.md`: the domain language.
- `docs/development.md`: running it locally, with a synthetic sign-in provider and a fake Spotify.
- `prototype/`: the original frontend-only prototype ("Rotation") and design studies, kept for reference.

## Quick start

```sh
.agents/setup                 # Node, pnpm, just, Python and dependencies
just storybook-fe             # every screen on mocked data at http://localhost:6006
just gate                     # format, lint, typecheck, unit tests
```
