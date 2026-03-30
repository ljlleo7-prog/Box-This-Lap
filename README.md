# Box This Lap

Box This Lap is a Formula-style race weekend simulator and championship manager built with React, TypeScript, and Vite.
It combines race simulation, pre-race setup strategy, telemetry-focused UI, and Supabase-backed championship flows.

## Highlights

- Live race control with leaderboard, pace, tyre, weather, and telemetry views
- Strategy tools for compounds, stint planning, pit windows, and setup tuning
- Championship-oriented navigation (dashboard, weekends, team hub, facilities, R&D)
- Supabase authentication and backend API integration for online flows
- Local/offline entry points for MVP progression and simulator shell routes

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

## Key Routes

- `/login` — authentication page
- `/` — protected dashboard
- `/championships` — championship list and drill-down pages
- `/race/:weekendId` — race control for a backend-created weekend
- `/race-dev?track=<trackId>` — local race control/dev route
- `/career` — championship/career mode entry
- `/offline` and `/offline/weekend` — local-first MVP shell routes

## Project Structure

- `src/pages` — page-level routes and flows
- `src/components` — shared UI and race-specific components
- `src/store` — Zustand state stores
- `src/engine` — simulation systems (physics, strategy, weather, tyres, weekend flow)
- `src/data` — tracks, teams, and initial race data
- `src/lib` — integration helpers (Supabase, local saves, API wrappers)
- `supabase/functions` — edge functions for championship/weekend simulation actions
- `supabase/migrations` — database schema and policy migrations

## Deployment Notes

- Production domain is configured via `public/CNAME` as `championship.geeksproductionstudio.com`
- This repo includes a GitHub Pages deployment script (`npm run deploy`)

## License

MIT
