# Codebase-Specific Execution Plan: 2026 Race Weekend Simulator MVP

**Source roadmap**: `docs/2026-race-weekend-simulator-mvp-roadmap.md`
**Source PRD**: `docs/2026-race-weekend-simulator-mvp-prd.md`
**Date**: 2026-03-20

---

## 1. Current Codebase Reality

This repository already contains the core of a local browser simulation, but the current implementation is split between two product directions:

1. **Local single-race simulator path**
   - `src/pages/RaceControl.tsx`
   - `src/store/raceStore.ts`
   - `src/engine/simulation.ts`
   - `src/engine/systems/*`

2. **Supabase-backed championship/product path**
   - `src/lib/supabase.ts`
   - `src/lib/tcc-api.ts`
   - `src/pages/ChampionshipDetails.tsx`
   - `src/pages/TeamSelection.tsx`
   - other `src/pages/*` that rely on Supabase state

For the MVP defined in the PRD, the implementation should shift toward an **offline-first local championship architecture** while preserving the existing engine as the runtime simulation core.

---

## 2. Main Refactor Targets

### A. `src/pages/RaceControl.tsx`
This file is currently doing too much:
- loads weekend data
- loads OpenF1 speed curves
- derives track sectors at runtime
- initializes the race
- manages pre-race setup state
- runs dev mode and backend mode branches
- owns a large amount of UI orchestration

**Plan:** keep it as a screen component, but move orchestration responsibilities out into dedicated modules.

### B. `src/store/raceStore.ts`
This store currently mixes:
- track selection
- engine lifecycle
- simulation playback
- weather fetch orchestration
- pre-race setup application
- local R&D spec merge logic

**Plan:** keep this as the live race/session store only. Move weekend/championship progression and persistence into new stores/modules.

### C. `src/engine/systems/*`
This is the strongest foundation in the repo:
- `PhysicsSystem.ts`
- `RaceLogicSystem.ts`
- `StrategySystem.ts`
- `WeatherSystem.ts`
- `TyreModel.ts`

**Plan:** most realism work and 2026 regulation implementation should land here, not in React page code.

### D. Supabase coupling in app flow
Current app structure still assumes backend-backed product flows in many places.

**Plan:** for MVP, create a local-only gameplay path that does not require Supabase for championship progression, while leaving existing Supabase pages intact or clearly separated.

---

## 3. Proposed Target Architecture in This Repo

## 3.1 Keep

### Keep as core simulation runtime
- `src/engine/simulation.ts`
- `src/engine/systems/PhysicsSystem.ts`
- `src/engine/systems/RaceLogicSystem.ts`
- `src/engine/systems/StrategySystem.ts`
- `src/engine/systems/WeatherSystem.ts`
- `src/engine/systems/TyreModel.ts`
- `src/hooks/useGameLoop.ts`
- `src/data/tracks/*`
- `src/data/initialData.ts`
- `src/data/teams.ts`

### Keep as visual building blocks
- `src/components/race/LiveLeaderboard.tsx`
- `src/components/race/TelemetryPanel.tsx`
- `src/components/CircularTrackMap.tsx`
- `src/components/ui/*`

## 3.2 Add

### New domain/state modules
Recommended additions:
- `src/types/championship.ts`
- `src/store/championshipStore.ts`
- `src/store/weekendStore.ts`
- `src/lib/localSaves.ts`
- `src/lib/openf1TrackModel.ts`
- `src/lib/offlineGameData.ts`

### New pages or route-level shells
Recommended additions:
- `src/pages/OfflineChampionship.tsx`
- `src/pages/OfflineWeekend.tsx`
- `src/pages/OfflineTeamHQ.tsx`

These do not have to replace the existing Supabase pages immediately, but they should become the MVP path.

## 3.3 Narrow

### Narrow `raceStore` to session runtime only
It should own:
- active engine instance
- active race state
- playback controls
- player strategy updates during a running session

It should stop owning:
- championship progression
- weekend persistence
- long-term management state
- OpenF1 loading logic
- backend weekend loading logic

---

## 4. Execution Plan by Phase and File

## Phase 0 — Refactor Boundaries and Local Domain Model

### Goal
Prepare the codebase so weekend progression, persistence, and management systems can be added without overloading `RaceControl`.

### File-level plan

#### 1. Extend the type system
**Files:**
- `src/types/index.ts`
- new `src/types/championship.ts`

**Actions:**
- keep `RaceState`, `VehicleState`, `Track`, `Driver`, `TeamSpecs` in `src/types/index.ts`
- add new non-live domain types for:
  - `OfflineChampionship`
  - `OfflineWeekend`
  - `WeekendPhase`
  - `SessionType`
  - `OfflineTeamState`
  - `OfflineDriverState`
  - `CrewState`
  - `FacilityState`
  - `DevelopmentProject`
  - `SaveGame`

**Reason:** current types are race-engine-centric; MVP needs persistent progression types too.

#### 2. Extract local persistence
**Files:**
- new `src/lib/localSaves.ts`

**Actions:**
- create a versioned local save adapter on top of `localStorage`
- store:
  - current championship
  - current weekend
  - team progression
  - settings / save slots if needed
- centralize serialization logic here

**Reason:** local persistence is currently ad hoc (`rd-team-specs` in `src/store/raceStore.ts`).

#### 3. Split store responsibilities
**Files:**
- `src/store/raceStore.ts`
- new `src/store/weekendStore.ts`
- new `src/store/championshipStore.ts`

**Actions:**
- keep `raceStore` focused on live session simulation
- create `weekendStore` for:
  - current weekend phase
  - session progression
  - pre-session setup state
  - session result carryover
- create `championshipStore` for:
  - calendar
  - standings
  - team progression
  - round advancement

**Reason:** `raceStore.ts` is currently the wrong home for long-horizon state.

#### 4. Extract OpenF1 track enrichment
**Files:**
- `src/pages/RaceControl.tsx`
- new `src/lib/openf1TrackModel.ts`
- optionally new `src/lib/trackModel.ts`

**Actions:**
- move functions like:
  - `resolveOpenF1Curve`
  - `smoothSpeeds`
  - `findApexes`
  - `buildSegmentsFromCurve`
  - `buildOpenF1Sectors`
  out of `RaceControl.tsx`
- expose a clean API such as:
  - `buildEnrichedTrack(track, curves)`
  - `loadOpenF1Curves()`

**Reason:** telemetry enrichment is core domain logic, not page logic.

### Exit condition
- `RaceControl.tsx` becomes mostly a page component
- persistence exists in one place
- local championship/weekend types exist
- the code is ready for weekend progression

---

## Phase 1 — Build Offline Weekend Flow

### Goal
Replace the current single-race/dev-mode launch pattern with a full weekend loop.

### File-level plan

#### 1. Create weekend progression state
**Files:**
- new `src/store/weekendStore.ts`
- new `src/types/championship.ts`

**Actions:**
- define phases:
  - `pre_weekend`
  - `practice`
  - `qualifying`
  - `race`
  - `post_race`
- persist results between phases
- keep session summaries separate from live `RaceState`

#### 2. Decouple qualifying from race initialization
**Files:**
- `src/engine/systems/RaceLogicSystem.ts`
- `src/engine/simulation.ts`

**Current issue:** `RaceLogicSystem.initializeRace()` currently also simulates grid order.

**Actions:**
- extract qualifying simulation/grid generation into a separate method or service
- allow race initialization to accept a prepared grid instead of always generating one internally

**Reason:** weekend flow needs practice → quali → race as separate steps.

#### 3. Build offline weekend pages/UI flow
**Files:**
- new `src/pages/OfflineWeekend.tsx`
- possibly reuse `src/pages/RaceControl.tsx`
- `src/App.tsx`

**Actions:**
- add a local MVP route path that does not depend on Supabase auth
- create a weekend hub screen showing:
  - current phase
  - setup status
  - session results
  - next action
- use `RaceControl` as the session runner, but feed it offline weekend state

#### 4. Make race sessions configurable from weekend context
**Files:**
- `src/store/raceStore.ts`
- `src/engine/simulation.ts`

**Actions:**
- allow `initRace()` to accept richer inputs:
  - track
  - seeded team state
  - driver readiness/setup modifiers
  - qualifying-derived grid
  - session type

### Exit condition
- a player can go through practice → qualifying → race locally
- weekend state survives refresh/reload
- race sessions use weekend-produced inputs instead of raw defaults only

---

## Phase 2 — Formalize Telemetry-Based Track Model

### Goal
Make telemetry realism reusable, testable, and not embedded in UI code.

### File-level plan

#### 1. Create enriched track pipeline
**Files:**
- new `src/lib/openf1TrackModel.ts`
- `src/data/tracks/index.ts`
- optionally new `src/types/index.ts`

**Actions:**
- define an `EnrichedTrack` shape or extend `Track`
- preprocess sectors before handing them to the engine
- support fallback to static track sectors if OpenF1 data is missing

#### 2. Move curve files and loaders into a stable path
**Files:**
- `public/openf1/speed_curves.json`
- `public/openf1/sectoring_ollama.json`
- `scripts/*`

**Actions:**
- document which file is canonical for runtime
- make `speed_curves.json` the source for engine enrichment unless a better derived artifact replaces it
- keep analysis artifacts clearly separate from runtime artifacts

#### 3. Add tuning/debug hooks
**Files:**
- `src/components/race/TelemetryPanel.tsx`
- maybe new `src/components/race/SimulationDebugPanel.tsx`
- `scripts/analyze_openf1_speed_curves.js`

**Actions:**
- expose lap trace overlays or per-sector expected speed diagnostics in dev mode
- keep this optional and hidden from standard play UI

### Exit condition
- track enrichment no longer lives in `RaceControl`
- runtime can choose enriched or fallback track models predictably
- realism tuning becomes easier

---

## Phase 3 — Implement 2026 Regulation Systems

### Goal
Encode active aero, ERS changes, PU philosophy, and battery allocation into the engine and setup flows.

### File-level plan

#### 1. Extend core simulation types
**Files:**
- `src/types/index.ts`

**Actions:**
Add types for:
- `AeroMode` / `ActiveAeroProfile`
- `PowerUnitPhilosophy`
- `BatteryAllocationPlan`
- `ERSRegulationProfile2026`
- team/car-level 2026 attributes
- pre-session setup fields for regulation choices

#### 2. Add team/car regulation state
**Files:**
- `src/data/teams.ts`
- `src/store/championshipStore.ts`
- `src/store/weekendStore.ts`

**Actions:**
- extend team templates with 2026-focused baseline philosophy data
- allow development to shift these values over time
- carry these values into race session initialization

#### 3. Integrate into physics
**Files:**
- `src/engine/systems/PhysicsSystem.ts`

**Actions:**
- apply active aero effects to straight/corner tradeoffs
- update top-speed/downforce behavior based on aero state
- integrate battery allocation and ERS behavior into acceleration/deploy logic
- make PU philosophy shape performance by track sector type or efficiency curve

#### 4. Integrate into strategy and race logic
**Files:**
- `src/engine/systems/StrategySystem.ts`
- `src/engine/systems/RaceLogicSystem.ts`

**Actions:**
- update AI decision-making to account for new ERS and battery constraints
- expose pit/strategy tradeoffs influenced by 2026 systems

#### 5. Expose in UI
**Files:**
- `src/pages/RaceControl.tsx`
- `src/components/race/TelemetryPanel.tsx`

**Actions:**
- add clear visual indicators for active aero state, ERS behavior, battery condition, and setup philosophy
- explain tradeoffs without burying player in raw parameters

### Exit condition
- 2026 systems clearly change race behavior
- setup and race outcomes visibly reflect those systems
- they are not cosmetic

---

## Phase 4 — Deepen Strategy and Operational Layer

### Goal
Increase race-weekend decision density and realism.

### File-level plan

#### 1. Expand strategy planning model
**Files:**
- `src/types/index.ts`
- `src/engine/systems/StrategySystem.ts`

**Actions:**
- evolve current stint planning beyond tyre-only emphasis
- account for:
  - weather windows
  - battery/ERS deployment intent
  - operational readiness
  - damage/risk response

#### 2. Improve race control events
**Files:**
- `src/engine/systems/RaceLogicSystem.ts`

**Actions:**
- refine incident logic
- improve safety car / VSC / red flag behavior
- make restart handling and neutralization consequences more legible

#### 3. Improve player-facing feedback
**Files:**
- `src/components/race/LiveLeaderboard.tsx`
- `src/components/race/TelemetryPanel.tsx`
- `src/pages/RaceControl.tsx`

**Actions:**
- show why pace changed
- show why a stop is recommended
- show tyre/weather/ERS/risk pressures clearly

#### 4. Add crew-operation hooks
**Files:**
- `src/types/championship.ts`
- `src/store/championshipStore.ts`
- `src/engine/systems/RaceLogicSystem.ts`

**Actions:**
- let crew readiness or pit crew quality affect pit execution and session preparation outputs

### Exit condition
- races contain regular meaningful intervention points
- operational systems influence outcomes in understandable ways

---

## Phase 5 — Build Lightweight Management Layer on Existing Pages

### Goal
Reuse current management-related pages as the basis for the offline MVP, replacing backend dependency where needed.

### File-level plan

#### 1. Repurpose R&D flow
**Files:**
- `src/pages/ResearchDevelopment.tsx`
- `src/data/teams.ts`
- `src/store/championshipStore.ts`
- `src/lib/localSaves.ts`

**Actions:**
- move from loose `rd-team-specs` storage to a structured local development system
- add development tree/project concepts
- tie outcomes into `TeamSpecs`

#### 2. Repurpose facilities flow
**Files:**
- `src/pages/Facilities.tsx`
- `src/store/championshipStore.ts`

**Actions:**
- convert facilities to local data source
- simplify into “facilities lite” with a few high-impact categories
- make them affect development throughput, pit crew quality, or simulation prep

#### 3. Add crew management
**Files:**
- new `src/pages/CrewManagement.tsx` or extend `src/pages/TeamHub.tsx`
- `src/store/championshipStore.ts`
- `src/types/championship.ts`

**Actions:**
- introduce crew roles and assignments
- connect crew quality to weekend or development outcomes

#### 4. Add driver management inputs
**Files:**
- `src/pages/TeamHub.tsx`
- `src/store/championshipStore.ts`
- `src/data/initialData.ts`

**Actions:**
- support local driver prep/readiness/setup confidence modifiers
- feed these into qualifying/race initialization

### Exit condition
- between-weekend choices exist and matter
- current management pages are useful in an offline flow
- no backend is required for core management systems

---

## Phase 6 — Build Offline Championship Path and Reduce MVP Backend Dependence

### Goal
Create a complete local async championship loop.

### File-level plan

#### 1. Add offline championship entry path
**Files:**
- `src/App.tsx`
- new `src/pages/OfflineChampionship.tsx`
- new `src/pages/OfflineTeamHQ.tsx`

**Actions:**
- add routes that bypass `ProtectedRoute`
- make offline championship the MVP path for testing

#### 2. Isolate Supabase path from offline MVP path
**Files:**
- `src/App.tsx`
- `src/lib/tcc-api.ts`
- `src/lib/supabase.ts`
- current Supabase-backed pages

**Actions:**
- do not remove Supabase code immediately
- instead keep backend-backed flows separate from the local MVP loop
- avoid forcing offline MVP pages to import `TCC_API`

#### 3. Add local standings/calendar progression
**Files:**
- `src/store/championshipStore.ts`
- new `src/lib/offlineGameData.ts`
- new/offline pages

**Actions:**
- calculate standings locally
- advance rounds locally
- persist results and progression across rounds

### Exit condition
- a player can start and continue a full offline championship
- no Supabase call is required for MVP core flow
- backend-backed paths remain optional/legacy instead of mandatory

---

## Phase 7 — Validation, Debugging, and Test Harnesses

### Goal
Make balancing and realism iteration practical in this codebase.

### File-level plan

#### 1. Formalize scenario-based tests
**Files:**
- `src/tests/red_flag_restart.test.ts`
- `src/tests/pit_simulation.ts`
- new `src/tests/*.ts`

**Actions:**
- expand ad hoc scripts into a consistent set of simulation scenario runners
- add scenarios for:
  - qualifying output
  - wet crossover
  - ERS/battery behavior
  - active aero impact
  - pit crew quality
  - safety car/restart handling

#### 2. Create internal balancing scripts
**Files:**
- `scripts/*`
- maybe new `scripts/sim_balance_*.js`

**Actions:**
- compare simulated sector speed distributions against OpenF1-derived expectations
- validate whether 2026 systems are materially affecting results

#### 3. Add optional dev diagnostics UI
**Files:**
- `src/pages/RaceControl.tsx`
- `src/components/race/TelemetryPanel.tsx`

**Actions:**
- expose hidden dev-only stats for tuning
- keep user-facing UI simpler than debug output

### Exit condition
- simulation changes can be validated systematically
- realism tuning is faster and less manual

---

## 5. Recommended Immediate Build Order

If starting implementation now, use this exact order:

1. extract OpenF1 track enrichment from `RaceControl.tsx`
2. add `src/types/championship.ts`
3. add `src/lib/localSaves.ts`
4. split `raceStore.ts` into live race store + weekend/championship stores
5. decouple qualifying/grid generation from `RaceLogicSystem.initializeRace()`
6. add offline weekend route and page shell
7. add local weekend persistence and progression
8. reuse current pages for offline R&D / facilities / team state
9. integrate 2026 systems into types and physics
10. expand strategy/race logic for 2026 and operational depth
11. add local championship standings/calendar flow
12. add balancing/debug scenario scripts

---

## 6. What to Avoid During Implementation

### Avoid
- adding more domain logic into `RaceControl.tsx`
- adding long-term progression state into `raceStore.ts`
- making Supabase removal the first task; isolate it instead
- implementing sponsorship/economy before the core loop is complete
- adding 2026 labels in UI before engine behavior supports them

### Prefer
- engine-first changes for realism
- store/domain-first changes for progression
- page components that consume prepared state rather than generating it
- local save abstractions over scattered `localStorage` keys

---

## 7. Definition of “Codebase Ready for MVP Buildout”

This repo is ready for full MVP feature implementation when these structural conditions are true:
- `RaceControl.tsx` is mostly presentation + session orchestration, not core domain logic
- telemetry enrichment is a reusable module
- `raceStore.ts` is limited to live race session concerns
- championship/weekend state has its own types and stores
- local persistence is centralized
- offline championship flow exists without required Supabase coupling

At that point, the remaining work becomes feature implementation rather than architectural untangling.
