# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server
- `npm run build` — type-check with `tsc -b` and build the production bundle
- `npm run check` — run TypeScript checking only (`tsc -b --noEmit`)
- `npm run lint` — run ESLint
- `npm run preview` — serve the built app locally
- `npm run deploy` — build and publish `dist/` to the `gh-pages` branch

## Tests

- There is currently no test runner script in `package.json`.
- Existing checks under `src/tests/` are ad hoc TypeScript scripts rather than a configured Vitest/Jest suite.
- Before adding or modifying tests, inspect how the repository currently expects them to be run instead of assuming a standard test command exists.

## Environment

- The frontend requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `src/lib/supabase.ts` throws at startup if either is missing.
- Supabase auth is configured with a custom cookie-backed storage adapter intended to share sessions across `*.geeksproductionstudio.com`.

## Architecture

### App shell and routing

- This is a React 18 + TypeScript + Vite SPA.
- App entry is `src/main.tsx`, which renders `src/App.tsx`.
- Routing is defined in `src/App.tsx` using `react-router-dom`.
- Most routes are wrapped in `ProtectedRoute`, which gates access on the current Supabase session.
- `src/components/Layout.tsx` provides the persistent sidebar/app shell for authenticated routes.
- `/race-dev` intentionally bypasses auth and loads the race simulator directly in dev mode.

### Two main product areas

The app is split across two broad concerns:

1. **Championship/team management backed by Supabase**
   - Pages like championships, team selection, facilities, and scheduling load and mutate persisted data through Supabase.
   - `src/lib/tcc-api.ts` is the main frontend API wrapper for Supabase Edge Functions, table reads/writes, and RPC calls.
   - Some pages still call `supabase` directly for queries in addition to using `TCC_API`.

2. **Local race simulation engine**
   - The race screen uses an in-browser simulation rather than server-driven live state.
   - Global simulator state lives in the Zustand store at `src/store/raceStore.ts`.
   - `useRaceStore.initRace()` builds a `SimulationEngine` from selected track data, driver data, and team specs.
   - `src/hooks/useGameLoop.ts` drives simulation updates with `requestAnimationFrame` and delegates each frame to the store’s `tick()` action.

### Simulation engine structure

- `src/engine/simulation.ts` coordinates the simulation.
- The engine composes four subsystems:
  - `WeatherSystem`
  - `PhysicsSystem`
  - `RaceLogicSystem`
  - `StrategySystem`
- Update order matters:
  1. weather updates the race conditions
  2. race logic handles incidents, safety car/red flag flow, pits, positions, and other race-wide logic
  3. strategy AI updates each vehicle
  4. physics updates each non-pitting vehicle
- Shared domain types for all of this live in `src/types/index.ts`; read those first when changing simulation behavior.

### Static motorsport data

- Driver roster is hardcoded in `src/data/initialData.ts`.
- Team templates and baseline car specs are in `src/data/teams.ts`.
- Track definitions are in `src/data/tracks/` and aggregated by `src/data/tracks/index.ts`.
- `raceStore.ts` merges baseline team templates with persisted R&D specs from `localStorage` key `rd-team-specs` before creating the engine.

### RaceControl page specifics

- `src/pages/RaceControl.tsx` is the main orchestration layer for the simulator UI.
- It combines store actions/state, the animation loop, pre-race setup UI, telemetry/leaderboard components, and weekend loading.
- In non-dev mode it loads weekend metadata from Supabase to choose the track.
- It also loads `public/openf1/speed_curves.json` and can replace a track’s sector model at runtime with sectors derived from OpenF1 telemetry.
- Real weather mode fetches live weather from Open-Meteo using the selected track’s coordinates.

### OpenF1 data pipeline

- `public/openf1/speed_curves.json` is checked-in derived data used by `RaceControl`.
- The `scripts/` directory contains Node scripts for collecting and analyzing OpenF1 telemetry, including fetching raw telemetry and generating aggregated speed-curve data.
- If race-sector behavior looks wrong, inspect both `src/pages/RaceControl.tsx` and the OpenF1 scripts/data pipeline rather than only the track definition files.

## Build and tooling notes

- Vite config lives in `vite.config.ts`.
- The build uses hidden sourcemaps.
- Path aliases are enabled through `vite-tsconfig-paths`; `@/*` maps to `src/*` in `tsconfig.json`.
- ESLint ignores `dist` and `supabase/functions/**`, so frontend linting does not cover Edge Functions.
- TypeScript is not fully strict (`"strict": false` in `tsconfig.json`), so preserve existing local patterns unless the task explicitly tightens types.
