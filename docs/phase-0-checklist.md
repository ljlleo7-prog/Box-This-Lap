# Phase 0 Implementation Checklist: Refactor Boundaries and Local Domain Model

> Superseded direction: this checklist belongs to the earlier offline-first planning track. It is preserved for reference only and should not be treated as the active championship roadmap. For the current online/Supabase-focused direction, use `README.md`, `docs/technical_architecture.md`, and `docs/team_championship_architecture.md`.

**Source plan**: `docs/2026-race-weekend-simulator-codebase-execution-plan.md`
**Goal**: Prepare the current codebase for offline weekend progression, centralized local persistence, and future 2026 systems without overloading `RaceControl` or `raceStore`.

---

## Phase 0 Definition of Done

Phase 0 is complete when all of the following are true:
- `src/pages/RaceControl.tsx` no longer owns OpenF1 track enrichment logic directly
- local save/persistence utilities exist in one dedicated module
- persistent championship/weekend domain types exist separately from live race types
- `src/store/raceStore.ts` is clearly moving toward live session-only responsibility
- new store boundaries are established for weekend/championship progression, even if initial implementations are minimal

---

## Work Order

## Step 1 — Extract OpenF1 track enrichment from `RaceControl`

### Why first
This is the cleanest high-impact extraction. `RaceControl.tsx` is currently overloaded, and the telemetry-derived sector logic is self-contained enough to move early.

### Files to touch
- `src/pages/RaceControl.tsx`
- new `src/lib/openf1TrackModel.ts`
- optionally `src/types/index.ts`

### Checklist
- [ ] Create `src/lib/openf1TrackModel.ts`
- [ ] Move these functions out of `RaceControl.tsx`:
  - `resolveOpenF1Curve`
  - `smoothSpeeds`
  - `findApexes`
  - `buildSegmentsFromCurve`
  - `buildOpenF1Sectors`
- [ ] Add a loader/helper API such as:
  - `resolveOpenF1Curve(...)`
  - `buildOpenF1Sectors(...)`
  - optional `buildEnrichedTrack(...)`
- [ ] Update `RaceControl.tsx` to import and use those helpers instead of defining them inline
- [ ] Keep runtime behavior unchanged after extraction

### Notes
- Do not redesign the algorithm yet; Phase 0 is structural, not tuning work.
- `public/openf1/speed_curves.json` remains the runtime source for now.
- `public/openf1/sectoring_ollama.json` should be treated as analysis/supporting data unless intentionally promoted later.

### Completion check
- [ ] `RaceControl.tsx` is meaningfully shorter and easier to reason about
- [ ] OpenF1 sector generation can be reused outside the page component

---

## Step 2 — Introduce persistent offline domain types

### Why second
The MVP needs non-live state types before new stores or persistence utilities can be designed cleanly.

### Files to touch
- `src/types/index.ts`
- new `src/types/championship.ts`

### Checklist
- [ ] Create `src/types/championship.ts`
- [ ] Add first-pass types for:
  - `WeekendPhase`
  - `SessionType`
  - `OfflineChampionship`
  - `OfflineWeekend`
  - `OfflineTeamState`
  - `OfflineDriverState`
  - `CrewState`
  - `FacilityState`
  - `DevelopmentProject`
  - `SaveGame`
- [ ] Keep race-engine types in `src/types/index.ts`
- [ ] Only move shared or imported aliases if absolutely necessary
- [ ] Avoid mixing persistent championship types back into engine runtime types unless there is a direct simulation dependency

### Suggested initial modeling approach
- `RaceState` remains the live engine snapshot
- `OfflineWeekend` stores:
  - track id
  - current phase
  - setup state
  - session summaries/results
  - references to current team/driver modifiers
- `OfflineChampionship` stores:
  - calendar
  - standings
  - current round index
  - team progression state
- `SaveGame` wraps the full persistent local shape and version info

### Completion check
- [ ] The codebase has a clear distinction between runtime simulation state and persistent progression state
- [ ] New stores can now depend on typed offline models

---

## Step 3 — Centralize local persistence

### Why third
The repo already uses ad hoc local storage (`rd-team-specs` in `src/store/raceStore.ts`). Before adding more persistence, establish a single persistence layer.

### Files to touch
- new `src/lib/localSaves.ts`
- `src/store/raceStore.ts`
- optionally management pages that currently use direct localStorage access later

### Checklist
- [ ] Create `src/lib/localSaves.ts`
- [ ] Add a versioned save schema constant, e.g. `SAVE_VERSION`
- [ ] Add helpers like:
  - `loadSaveGame()`
  - `saveSaveGame(save)`
  - `loadTeamSpecs()`
  - `saveTeamSpecs(specs)`
  - `clearSaveGame()`
- [ ] Migrate direct `localStorage.getItem('rd-team-specs')` access in `src/store/raceStore.ts` behind the new module
- [ ] Keep implementation localStorage-based for now
- [ ] Make failure behavior safe: invalid JSON should fall back cleanly

### Notes
- Phase 0 does not need save slots yet; one save model is enough.
- The important part is removing scattered serialization logic.

### Completion check
- [ ] `raceStore.ts` no longer parses local storage inline for team specs
- [ ] future weekend/championship persistence has a single home

---

## Step 4 — Split store responsibilities with minimal new stores

### Why fourth
Once types and persistence exist, establish the boundary between live race session state and long-horizon progression state.

### Files to touch
- `src/store/raceStore.ts`
- new `src/store/weekendStore.ts`
- new `src/store/championshipStore.ts`

### Checklist
- [ ] Create `src/store/weekendStore.ts`
- [ ] Create `src/store/championshipStore.ts`
- [ ] Keep initial implementations intentionally minimal
- [ ] In `weekendStore`, add placeholder state for:
  - current weekend
  - current phase
  - selected/prepared setup data
  - session summaries
- [ ] In `championshipStore`, add placeholder state for:
  - active championship
  - current round index
  - standings
  - team progression
- [ ] Leave `raceStore.ts` owning only live session responsibilities:
  - engine instance
  - active race state
  - playback controls
  - in-race player actions
- [ ] Do not fully migrate all logic yet; just establish the boundaries and move obvious non-race state out where possible

### Specific `raceStore.ts` cleanup targets
- [ ] Keep `engine`, `raceState`, `isPlaying`, `gameSpeed`
- [ ] Keep `startRace`, `pauseRace`, `setGameSpeed`, `tick`, `updateStrategy`
- [ ] Consider moving `selectedTrackId` out later, but it can remain for now if needed
- [ ] Consider moving weather-fetch orchestration out later if not convenient now
- [ ] Remove or isolate long-term progression assumptions from this store

### Completion check
- [ ] new weekend/championship stores exist and compile
- [ ] `raceStore.ts` has a clearer “live session only” direction

---

## Step 5 — Add an offline MVP route shell

### Why in Phase 0
Not to build the full feature yet, but to create the path where the offline MVP will live so future work is not forced through the Supabase flow.

### Files to touch
- `src/App.tsx`
- new `src/pages/OfflineChampionship.tsx`
- new `src/pages/OfflineWeekend.tsx`

### Checklist
- [ ] Add a local/offline route path that bypasses `ProtectedRoute`
- [ ] Create `OfflineChampionship.tsx` as a placeholder shell
- [ ] Create `OfflineWeekend.tsx` as a placeholder shell
- [ ] Keep `/race-dev` working
- [ ] Do not remove existing Supabase-backed routes

### Purpose of this step
- establish the MVP route path now
- avoid coupling future weekend/championship work to `ChampionshipDetails.tsx` and `TCC_API`

### Completion check
- [ ] App has a clear offline MVP entry point
- [ ] future work can proceed without backend dependency pressure

---

## Step 6 — Reduce orchestration burden inside `RaceControl`

### Why last in Phase 0
After helper extraction and new stores exist, make `RaceControl` easier to use as a session runner in Phase 1.

### Files to touch
- `src/pages/RaceControl.tsx`
- `src/store/raceStore.ts`
- possibly new helper modules under `src/lib/`

### Checklist
- [ ] Keep `RaceControl` focused on:
  - rendering race/session UI
  - binding to store state
  - handling local component interactions
- [ ] Remove inline OpenF1 transformation logic already extracted in Step 1
- [ ] Reduce direct branching between dev mode and backend mode where practical
- [ ] Prepare it to accept richer initialization inputs later from weekend context
- [ ] Avoid adding new persistent logic here

### Completion check
- [ ] `RaceControl.tsx` is no longer the place where new architecture is being invented
- [ ] it is ready to be reused by a future `OfflineWeekend` flow

---

## Recommended Commit Grouping

If you want to implement Phase 0 incrementally, these are the cleanest groups:

### Group A — Track model extraction
- `src/lib/openf1TrackModel.ts`
- `src/pages/RaceControl.tsx`

### Group B — Offline domain and persistence foundation
- `src/types/championship.ts`
- `src/lib/localSaves.ts`
- `src/store/raceStore.ts`

### Group C — New store boundaries
- `src/store/weekendStore.ts`
- `src/store/championshipStore.ts`

### Group D — Offline route shells
- `src/App.tsx`
- `src/pages/OfflineChampionship.tsx`
- `src/pages/OfflineWeekend.tsx`

This grouping will make review easier and reduce regression risk.

---

## Suggested First PR / First Implementation Slice

If you want the best first slice, start with this exact subset:

- [ ] Step 1 — extract OpenF1 logic into `src/lib/openf1TrackModel.ts`
- [ ] Step 2 — add `src/types/championship.ts`
- [ ] Step 3 — add `src/lib/localSaves.ts` and route `rd-team-specs` through it

Why this slice first:
- low risk
- high architectural value
- minimal product behavior change
- immediately makes the next steps easier

---

## Validation Checklist for Phase 0

Before moving to Phase 1, verify all of the following:
- [ ] `npm run build` succeeds
- [ ] `RaceControl` still works in its current mode(s)
- [ ] OpenF1-enriched track behavior still loads correctly
- [ ] `rd-team-specs` still loads through the new persistence layer
- [ ] offline-specific new types and stores compile cleanly
- [ ] offline route shells render without requiring auth/backend

---

## After Phase 0, the Immediate Next Step

Once this checklist is done, Phase 1 should start with:
1. extracting qualifying/grid generation out of `RaceLogicSystem.initializeRace()`
2. creating a real `OfflineWeekend` state machine
3. wiring `RaceControl` to consume weekend-produced session inputs

That is the point where the product truly starts becoming a full weekend simulator rather than a single-race runner.
