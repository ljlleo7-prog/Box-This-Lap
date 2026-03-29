# Context

The current car development experience in `src/pages/ResearchDevelopment.tsx` is a local, single-screen picker that applies a single focus per part directly into `rd-team-specs`. That is too coarse for the intended gameplay: there is no explicit project initiation flow, no mixed design bias, no investment/time tradeoff, no ATR-style wind-tunnel/CFD allocation, no versioned part lineage, no inventory stock, and no per-car installation choice.

The recommended direction is to turn the page into a local-first management surface with a data model that is shaped for later Supabase persistence. Development should create named part designs, calculate time/effect up front from sliders + budget + aero resources, move completed designs into stock rather than instantly mutating the whole car, and let the team install different designs on each car.

# Recommended approach

## 1. Introduce an explicit local-first R&D domain model

Create a dedicated R&D state layer instead of deriving everything from `focusByProject` + `activeProjects`.

### Add/extend types

Primary files:
- `src/types/championship.ts`
- `src/types/index.ts` only if shared scalar types/helpers are needed
- `src/lib/localSaves.ts`

Add a local-first model shaped for later backend migration:
- `PartCategory` — front wing, floor, rear wing, suspension, power unit, cooling, energy store
- `DesignBiasAllocation` — weighted slider values per bias option for a project
- `AeroResourceAllocation` — wind tunnel hours + CFD hours reserved for a project
- `DevelopmentInvestment` — money invested and optional rush/normal mode flag if needed
- `PartDesign` — id, part category, design code (`FW-01`, `FL-02`, etc.), optional custom name, status, bias allocation, projected effects, actual effects, development timing, ATR usage, money spend, stock count, created/completed round
- `InstalledPartSet` / `CarPartAssignment` — mapping for car 1 and car 2 by part category to a specific design id
- `ManufacturingOrder` — design id, quantity, target car(s) or reserve stock, progress, completion timing
- `AtrPeriodState` — total allowed wind tunnel / CFD time, used time, remaining time, derived from constructor standing
- `ResearchDepartmentState` (or similar) — active projects, completed designs, stock, manufacturing queue, current ATR period

Recommended placement:
- Add these under offline championship state first by extending `OfflineTeamState` in `src/types/championship.ts`, because that file already owns `developmentQueue`, `activeProjects`, `completedProjects`, facilities, and constructor standings.
- Keep the online `/research` page using a local save adapter initially, but shape the state identically so it can later be persisted to Supabase.

## 2. Replace direct spec mutation with “base specs + installed parts” aggregation

Primary files:
- `src/pages/ResearchDevelopment.tsx`
- `src/lib/localSaves.ts`
- any new R&D helpers under `src/lib/` or `src/pages/ResearchDevelopment` local module split

Do **not** keep writing final effective specs directly as the only source of truth.

Recommended model:
- Team template/base specs remain the baseline.
- Completed designs store their own stat deltas.
- Installed parts for each car determine active deltas.
- Team/car effective specs are derived from `base specs + installed design effects`.
- Reserve stock has no effect until manufactured and installed.

This solves the user’s requirement that a newly developed part should not instantly replace everything.

## 3. Add a dedicated “Start Development” window

Primary files:
- `src/pages/ResearchDevelopment.tsx`
- likely new components under `src/components/` or `src/pages/research-development/`

Recommended UI structure:
- Main page becomes dashboard-style with sections:
  - active development projects
  - ATR resource overview
  - completed designs and stock
  - manufacturing queue
  - current car installations (Car 1 / Car 2)
- A separate modal/panel opens to start a new project.

In the start window include:
- part category selector
- auto-generated design code preview (`FW-01`) + editable custom nickname field
- draggable multi-bias sliders whose total is normalized to 100%
- money investment input/slider
- wind tunnel allocation input/slider
- CFD allocation input/slider
- live outputs:
  - projected completion time
  - projected effect per stat
  - warnings if ATR cap exceeded or active-project slots exceeded

Since there is no existing modal/slider primitive in the repo, implement lightweight local components that match the current glass-card styling rather than introducing a full UI framework.

## 4. Use weighted bias math instead of one-choice focus

Primary files:
- `src/pages/ResearchDevelopment.tsx`
- new helper module for formulas

Current `PROJECTS[*].focusOptions[*].effects` is reusable as the seed for bias definitions.

Recommended adaptation:
- keep each part’s existing focus options as bias vectors
- convert from “choose one option” to “allocate percentages across multiple options”
- normalize the slider weights so all active biases sum to 100%
- compute projected effect as weighted sum of those bias vectors

Example direction:
- Front wing can blend downforce 50 / balance 30 / efficiency 20 instead of choosing one
- negative tradeoffs remain part of the weighted output

This reuses current balancing content rather than inventing a second stat system.

## 5. Add deterministic formulas for time, effect, and ATR limits

Primary files:
- new formula/helper module
- `src/pages/ResearchDevelopment.tsx`
- `src/types/championship.ts`

### Recommended calculation inputs
- part category base complexity
- weighted bias distribution
- money invested
- wind tunnel hours allocated
- CFD hours allocated
- relevant facility levels (especially aero/factory/powertrain)
- constructor standing-derived ATR cap

### Recommended outputs
- projected duration
- projected final effect
- projected manufacturing difficulty/cost multiplier if desired later

### Suggested formula shape
Keep it simple and inspectable:
- `rawEffect = weightedBiasEffect * complexityMultiplier`
- `investmentFactor = diminishing returns curve`
- `atrFactor = diminishing returns from wind tunnel + CFD`
- `facilityFactor = modest multiplier from facility levels`
- `finalProjectedEffect = rawEffect * investmentFactor * atrFactor * facilityFactor`
- `developmentTime = baseWeeks / (investmentSpeedFactor * resourceSpeedFactor * facilityFactor)`

### ATR cap rule
Use constructor standing to derive an ATR allowance table.
Recommended first-pass implementation:
- store a standings-to-cap lookup for positions 1..10 (higher team = lower allowance)
- page derives current standing from offline `constructorStandings` when available
- if not available yet on online path, fall back to neutral/mid-grid allowance and mark it as such in UI

This fits the user request while tolerating the repo’s current incomplete online standings support.

## 6. Version and naming rules for designs

Primary files:
- new R&D helpers
- `src/pages/ResearchDevelopment.tsx`

Recommended naming behavior:
- each part category has a 2-letter code map (`FW`, `FL`, `RW`, `SU`, `PU`, `CP`, `ES`)
- default name/code is generated sequentially per part, e.g. `FW-01`, `FW-02`
- optional custom display name may be added, e.g. `FW-02 / Monaco-Specialized`
- internal id should remain stable UUID-like/local unique id, separate from display code

Track numbering per category, not globally.

## 7. Treat development and manufacturing as separate pipelines

Primary files:
- `src/types/championship.ts`
- `src/pages/ResearchDevelopment.tsx`
- `src/lib/localSaves.ts`

Recommended lifecycle:
1. Start development project
2. Project consumes budget + ATR allocation and progresses toward completion
3. Completion creates a design blueprint with zero or initial prototype stock
4. Manufacturing orders build physical stock for that design
5. Installation screen assigns available stock to Car 1 / Car 2 independently

Important interpretation of the user clarification:
- both cars can use the same design if stock exists
- or they can use different designs for the same part category

So installation should be per car, while development is per design.

## 8. Add explicit stock and install management

Primary files:
- `src/pages/ResearchDevelopment.tsx`
- new local helper/state modules

Recommended stock model:
- each completed design stores `stockAvailable`
- manufacturing increments stock on completion
- installing onto a car consumes one unit if not already installed there
- swapping a part off a car can either:
  - return reusable stock to inventory, or
  - mark previous stock as used/retired

Recommended first implementation: return previously installed part to inventory if it is still serviceable. It is simpler and matches the idea of interchangeable stock.

UI sections:
- design inventory table: design code/name, projected or actual effects, stock, status
- car install cards: Car 1 and Car 2, each slot per part category with dropdown of eligible stock
- low-stock / out-of-stock warnings

## 9. Save R&D state through a hybrid adapter

Primary files:
- `src/lib/localSaves.ts`
- `src/pages/ResearchDevelopment.tsx`

Because the user chose hybrid persistence, plan for one domain shape with a local adapter now.

Recommended approach:
- add new local storage key(s) for the full R&D state, rather than only `rd-team-specs`
- keep a derived helper that can still output effective specs for existing simulator consumers
- encapsulate read/write in `localSaves.ts` behind helpers such as:
  - `loadResearchState(teamKey)`
  - `saveResearchState(teamKey, state)`
  - `deriveInstalledTeamSpecs(baseSpecs, researchState, carId?)`

This preserves current functionality while making a later Supabase migration mostly an adapter/API task.

## 10. Suggested file changes

Critical files to modify:
- `src/pages/ResearchDevelopment.tsx` — replace single-screen picker with dashboard + start-development window + inventory/manufacturing/install flow
- `src/types/championship.ts` — extend offline team/development types into a richer design/manufacturing/install model
- `src/lib/localSaves.ts` — persist/load full R&D state and derived specs

Likely new files to add:
- `src/lib/researchDevelopment.ts` or similar — formulas, code generation, normalization, ATR cap helpers
- `src/components/research/StartDevelopmentModal.tsx`
- `src/components/research/DevelopmentProjectCard.tsx`
- `src/components/research/DesignInventoryTable.tsx`
- `src/components/research/ManufacturingQueuePanel.tsx`
- `src/components/research/CarInstallationPanel.tsx`

Keep the initial split modest; if implementation stays manageable, some of these can begin as local components imported by `ResearchDevelopment.tsx`.

## 11. Order of implementation

1. Extend types and local save helpers for full R&D state.
2. Add pure helpers for:
   - sequential design codes
   - slider normalization
   - projected effect calculation
   - projected time calculation
   - ATR allowance from standings
   - effective specs from installed parts
3. Refactor `ResearchDevelopment.tsx` to read/write the new state shape.
4. Build the start-development modal with multi-bias sliders and live projections.
5. Add active projects and completed design inventory sections.
6. Add manufacturing queue and stock accounting.
7. Add per-car installation management.
8. Preserve compatibility by continuing to expose derived specs to existing race systems.

# Reuse opportunities

Re-use these existing pieces rather than replacing them outright:
- `PROJECTS` and `focusOptions` in `src/pages/ResearchDevelopment.tsx` as the source for part categories and bias effect vectors
- `TeamSpecs` in `src/types/index.ts` as the stat surface for all projected/installed effects
- `OfflineTeamState.developmentQueue`, `activeProjects`, `completedProjects`, `facilities`, and `OfflineChampionship.constructorStandings` in `src/types/championship.ts` as the natural home for the richer domain model
- `TEAM_TEMPLATES` lookup pattern in `src/pages/ResearchDevelopment.tsx` for baseline car performance
- `src/lib/localSaves.ts` as the persistence adapter entry point
- queue/status presentation ideas from `src/pages/Facilities.tsx` for manufacturing/development lists

# Trade-offs and recommendation

## Recommended path
Implement this as a **local-first hybrid domain model** now.

Why this path:
- the current page is already local-state heavy
- the repo does not yet expose standings/resource APIs needed for a full backend-first design flow
- offline championship types already provide a good long-term home for richer development state
- shaping the data model now avoids repainting the UI later when Supabase is introduced

## Explicit non-goals for first pass
To keep scope controlled, first pass should avoid:
- real-time background time progression across wall-clock time
- server synchronization
- durability/wear states per individual physical part instance
- highly granular manufacturing lead-time simulation beyond queue + quantity + completion estimate

# Verification

## Code-level verification
- Run `npm run check`
- Run `npm run build`
- Run `npm run lint` if the touched files are covered cleanly by current lint config

## Manual verification in app
- Open `/research`
- Start a new project from the dedicated window
- Confirm mixed slider biases update projected stats live
- Confirm money + wind tunnel + CFD allocations update projected duration/effect
- Confirm ATR cap changes when standings input changes or when using different fallback standing values
- Complete a development project in seeded/local test state and confirm it creates a named design instead of directly mutating all specs
- Queue manufacturing for a completed design and confirm stock increments on completion
- Install one design on Car 1 and another on Car 2 for the same part category
- Confirm derived effective specs reflect installed parts only
- Reload the page and verify full R&D state persists correctly
