# Rotation

A frontend-only prototype of a weekly album-mix planner. It uses mock data and stores its state in the browser's `localStorage`.

```sh
npm install
npm run dev        # dev server
npm run build      # type-check and build
```

- `src/domain`: the catalog types, the candidate engine (Currents, First plays, Gold, Recurrents) and the weekly rules.
- `src/data/seed.ts`: the demo catalog, listening signals and weeks 40 to 47.
- `src/services/mock.ts`: stand-ins for the Spotify search and playlist calls and for matching on other services.
- `src/state/store.ts`: the reducer and persistence. Settings has a "Reset to demo data" button.

Albums and artists are the app's own records. A streaming service is one link on a record, so history does not depend on any one service.
