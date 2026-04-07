# Box This Lap

Box This Lap is a Formula-style online championship manager and race weekend simulator built with React, TypeScript, and Vite.
It combines Supabase-backed championship flows with a browser-based race simulation engine, strategy tooling, and team-management surfaces.

## Highlights

- Supabase authentication with protected online championship flows
- Championship-oriented navigation for dashboard, weekends, team hub, facilities, and R&D
- Live race control with leaderboard, pace, tyre, weather, and telemetry views
- Strategy tools for compounds, stint planning, pit windows, and setup tuning
- Browser-based simulation engine used by championship weekend flows

## Tech Stack

- React 18 + TypeScript
- Vite 6
- Zustand for state
- Tailwind CSS for styling
- Recharts for telemetry charts
- Supabase for auth + backend integration

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Create environment variables

Create a `.env` file in the project root with:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The app will fail fast at startup if these variables are missing.

### 3) Run the app

```bash
npm run dev
```

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build production assets
- `npm run check` — run TypeScript checks only
- `npm run lint` — run ESLint across the repository
- `npm run preview` — serve the production build locally
- `npm run deploy` — build and deploy `dist` to the `gh-pages` branch

## Primary Routes

- `/login` — authentication page
- `/` — protected dashboard
- `/championships` — championship list
- `/championships/:id/select-team` — team selection for a championship
- `/championships/:id` — championship details and progression
- `/weekends/:id` — weekend details
- `/race/:weekendId` — race control for a backend-created weekend
- `/team-hub` — team overview and operations
- `/research` — car development and R&D
- `/facilities` — facility management
- `/settings` — user/application settings

## Legacy and Dev Routes

These routes still exist in the codebase, but they are not the primary product direction:

- `/race-dev` — local race control/dev route
- `/practice-quali-dev` — development route for session experiments
- `/career` — local career/championship prototype path
- `/offline` and `/offline/weekend` — legacy local/offline shell routes

## Project Structure

- `src/pages` — page-level routes and flows
- `src/components` — shared UI and race-specific components
- `src/store` — Zustand state stores
- `src/engine` — simulation systems (physics, strategy, weather, tyres, weekend flow)
- `src/data` — tracks, teams, and initial race data
- `src/lib` — integration helpers (Supabase, local saves, API wrappers)
- `supabase/functions` — edge functions for championship/weekend simulation actions
- `supabase/migrations` — database schema and policy migrations

## Architecture Docs

- `docs/technical_architecture.md` — current repo-level architecture summary
- `docs/team_championship_architecture.md` — detailed online championship and data-model architecture

## Deployment Notes

- Production domain is configured via `public/CNAME` as `championship.geeksproductionstudio.com`
- This repo includes a GitHub Pages deployment script (`npm run deploy`)

## License

MIT
