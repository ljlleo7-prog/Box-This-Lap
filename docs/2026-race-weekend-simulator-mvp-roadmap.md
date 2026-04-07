# Implementation Roadmap: 2026 Race Weekend Simulator MVP

> Superseded direction: this roadmap captures an earlier offline-first MVP strategy. It is kept as historical planning material, but it is no longer the active championship direction. For the current online/Supabase-focused architecture, use `README.md`, `docs/technical_architecture.md`, and `docs/team_championship_architecture.md`.

**Source PRD**: `docs/2026-race-weekend-simulator-mvp-prd.md`
**Date**: 2026-03-20
**Goal**: Turn the current browser-based race simulator into a race-weekend-first, offline-first 2026-era F1 management simulator MVP.

---

## 1. Roadmap Overview

This roadmap prioritizes proving the core fantasy first:

> **"I run an F1 team through a believable 2026 race weekend."**

That means development should sequence in this order:
1. stabilize and modularize the current local simulation foundation
2. add full weekend structure and persistence
3. implement 2026 regulation systems that materially affect simulation
4. layer in strategic/operational depth
5. add lightweight between-weekend management systems
6. wrap everything in an async local championship loop
7. validate realism and reshape architecture for future sync multiplayer

The MVP should remain:
- local/offline-first
- free
- browser-based
- independent of Supabase for core play

---

## 2. Guiding Delivery Principles

### Prioritize
- Race realism over menu breadth
- Legible tradeoffs over hidden complexity
- Systems that materially change race outcomes
- Modular boundaries that support later sync multiplayer migration

### Deprioritize
- Heavy economy simulation
- Sponsorship systems
- Narrative/drama systems
- Deep account/auth infrastructure
- Full multiplayer implementation during MVP

### Key architectural rule
Any new feature added during MVP should answer one of these questions:
- Does it improve **race realism**?
- Does it improve **weekend decision-making**?
- Does it improve **lightweight team progression** tied directly to weekends?

If not, it should likely be postponed.

---

## 3. Phased Implementation Plan

## Phase 0 — Foundation Audit and Refactor Boundaries

### Objective
Prepare the current codebase to support weekend flow, local persistence, and new regulation systems without piling everything into `RaceControl` and `raceStore`.

### Why first
The current architecture already contains a local simulation engine, Zustand store, track data, weather integration, and telemetry-derived sector generation. Before adding major systems, the code needs cleaner boundaries so new features do not become coupled to one giant page component.

### Deliverables
- Audit current responsibilities in:
  - `src/pages/RaceControl.tsx`
  - `src/store/raceStore.ts`
  - `src/engine/simulation.ts`
  - `src/engine/systems/*`
- Separate pure simulation state from UI/session orchestration state
- Define a persistent championship/weekend domain model distinct from live race state
- Create a clear save/load abstraction for local storage-backed progression
- Reduce direct race orchestration logic inside `RaceControl`

### Likely work areas
- `src/store/raceStore.ts`
- `src/pages/RaceControl.tsx`
- new store/domain modules under `src/store/` or `src/lib/`
- `src/types/index.ts`

### Exit criteria
- Simulation engine remains functional after refactor
- Weekend/session orchestration is no longer tightly embedded in one page component
- Local persistence boundary exists, even if only with placeholder data
- Future systems can depend on typed domain objects instead of ad hoc page state

---

## Phase 1 — Weekend Structure MVP

### Objective
Turn the current single-race experience into a structured practice → qualifying → race weekend loop.

### Core player value
The player can run a complete weekend instead of just launching a race simulation.

### Deliverables
- Weekend state model with phases:
  - pre-weekend
  - practice
  - qualifying
  - race
  - post-race
- Session-to-session carryover for:
  - setup choices
  - readiness/confidence-like values
  - tyre planning / strategy inputs
  - session results and grid determination
- Weekend progression UI
- Save/load of weekend progress locally
- Replace temporary dev-only race entry flow with explicit weekend entry points

### Functional scope
- Practice should allow preparation and information gathering
- Qualifying should generate a starting order from team/driver/car/session conditions
- Race should consume prior weekend outcomes
- The player must be able to leave and resume a weekend locally

### Suggested implementation slices
1. Define `Championship`, `Weekend`, `Session`, and `TeamProgress` types
2. Add a weekend controller/store separate from the live race store
3. Build a pre-session summary + post-session summary loop
4. Make qualifying output the race grid
5. Persist everything in local storage or a local save blob

### Exit criteria
- A player can complete a full weekend end-to-end
- Session outcomes persist correctly into the next phase
- The weekend can be resumed after refresh/reload
- Testers can understand where they are in the weekend at all times

---

## Phase 2 — Telemetry-Based Race Realism Improvements

### Objective
Strengthen the current simulation’s credibility using telemetry-informed behavior as the realism anchor.

### Why now
Once weekend structure exists, the next biggest value driver is whether races feel believable.

### Deliverables
- Formalize the telemetry-derived track behavior pipeline
- Standardize fallback behavior for tracks without telemetry-derived enrichments
- Improve sector/segment realism for speed traces, corner types, and track behavior
- Add validation tooling to compare simulated outputs against expected telemetry patterns
- Expose key simulation outputs in debuggable/inspectable form for balancing

### Functional scope
- Speed traces should look plausible per track
- Pace changes should reflect weather, tyres, ERS, and team/driver characteristics
- Track-specific behavior should feel meaningfully different across circuits

### Suggested implementation slices
1. Move telemetry enrichment logic out of `RaceControl` into a dedicated preprocessing/domain layer
2. Define a stable enriched track model used by the engine
3. Add internal debug views or export tools for lap traces and pace distributions
4. Tune physics/race logic using telemetry-informed comparisons

### Likely work areas
- `src/pages/RaceControl.tsx`
- `src/data/tracks/*`
- `src/engine/systems/PhysicsSystem.ts`
- `scripts/*`
- `public/openf1/speed_curves.json`

### Exit criteria
- Track pace profiles are visibly distinct and believable
- Simulation has a clear fallback path when telemetry enrichment is absent
- Internal tuning can be done without manually reverse-engineering UI state

---

## Phase 3 — 2026 Regulations Systems

### Objective
Make the game feel like a 2026-era simulator rather than a generic F1 management clone.

### Core systems to implement
- Active aero
- Revised ERS behavior/regulations
- PU design philosophy
- Battery allocation

### Design requirement
These systems must **materially affect race behavior and management decisions**. They should not just be labels in menus.

### Deliverables
- New typed domain models for 2026 systems
- Integration into simulation calculations and pre-race setup
- UI affordances so players can understand the tradeoffs
- Team-level differences or development directions tied to these systems

### Functional scope
- Active aero changes drag/downforce tradeoffs by context or player choice
- ERS behavior reflects new deployment/recovery rules and strategic constraints
- PU philosophy creates team-level strengths/weaknesses across track types or usage profiles
- Battery allocation shapes session/race deployability and longer-run strategy choices

### Suggested implementation slices
1. Extend `src/types/index.ts` with 2026 regulation models
2. Add regulation-aware vehicle/team parameters to the engine
3. Update strategy and physics systems to consume them
4. Add minimal UI in pre-race setup and telemetry displays
5. Add balancing fixtures/scenarios for each regulation subsystem

### Exit criteria
- Testers can identify the game as “2026-focused” based on gameplay differences
- Each new regulation system changes strategy or pace outcomes in visible ways
- Tradeoffs are understandable through the UI and race results

---

## Phase 4 — Strategy and Operational Depth

### Objective
Deepen the race management layer to better match the appeal of F1 Manager 24 during sessions.

### Core systems
- Tyre strategy depth
- Weather adaptation
- Incidents and race control events
- ERS and pace tradeoffs
- Operational execution detail
- Safety car / red flag consequences

### Deliverables
- Improved pit and stint strategy behavior
- Better incident/race control handling and consequence modeling
- More meaningful in-session decision levers
- Stronger operational systems affecting readiness and execution

### Functional scope
- Player decisions during races should matter frequently and clearly
- Poor strategic timing should be punishable but understandable
- Operational preparation should influence race outcomes without becoming excessive micromanagement

### Suggested implementation slices
1. Expand `StrategySystem` for richer AI and player-facing decisions
2. Improve `RaceLogicSystem` around neutralizations, incidents, restarts, and pit timing
3. Make telemetry/leaderboard UI surface the reasons behind pace or outcome changes
4. Connect crew readiness or operational state to pit execution / session quality

### Exit criteria
- Race weekends contain recurring meaningful decisions, not just passive watching
- Strategy outcomes feel plausible to experienced F1 fans
- Operational systems are visible and consequential without bloating the UI

---

## Phase 5 — Lightweight Team Management Layer

### Objective
Add between-weekend progression systems that directly support the race-weekend-first fantasy.

### Systems in scope
- Car development tree
- Crew management
- Driver management
- Facilities lite

### Systems explicitly out of scope
- Heavy economy
- Sponsorship
- Deep contracts/politics/drama

### Deliverables
- Development tree with tradeoffs tied to 2026 systems and circuit performance
- Crew roles/assignments that affect preparation, pit performance, or development throughput
- Driver preparation/setup/readiness inputs
- Lightweight facilities progression that modifies team capabilities

### Functional scope
- Between weekends, the player should make a small number of meaningful choices
- Every management system should connect to a race-weekend outcome
- The UI should present tradeoffs clearly and avoid spreadsheet overload

### Suggested implementation slices
1. Reuse and adapt any existing R&D data flow (for example local `rd-team-specs`) into a formal development system
2. Add crew/domain data structures and assignment effects
3. Add driver prep/confidence/readiness systems if not already modeled
4. Add a simplified facilities model with a small number of impactful upgrades

### Likely work areas
- `src/pages/ResearchDevelopment.tsx`
- `src/pages/Facilities.tsx`
- `src/data/teams.ts`
- `src/store/` persistence modules
- `src/types/index.ts`

### Exit criteria
- The player can make between-weekend decisions in under a few minutes
- Those decisions produce visible effects during the next weekend
- The systems feel meaningful without requiring sponsorship/economy scaffolding

---

## Phase 6 — Local Async Championship Loop

### Objective
Wrap the weekend and management systems into a complete offline-first championship progression loop.

### Deliverables
- Championship calendar progression
- Weekend generation / round advancement
- Persistent standings and history
- Local save slots or profile-like progression
- Removal or bypassing of Supabase dependencies for MVP core loop

### Functional scope
- A player can start a new championship locally
- Progress persists without online services
- Results, standings, and upgrades carry across rounds
- The loop supports repeat testing and replay value

### Suggested implementation slices
1. Build local championship state schema
2. Add local persistence adapter to replace or bypass backend dependencies for MVP flows
3. Keep Supabase-backed features isolated and optional rather than required
4. Create basic championship dashboards for progression, standings, and next-event entry

### Exit criteria
- The game is playable as a free local async championship prototype
- No mandatory Supabase connection is needed for core MVP play
- Testers can complete multiple rounds and observe persistent team progression

---

## Phase 7 — Balancing, Validation, and MVP Hardening

### Objective
Use tester feedback to improve realism, reduce confusion, and prepare the MVP for wider community playtesting.

### Deliverables
- Closed-test feedback loops with experienced F1 fans
- Tuning passes on telemetry realism, strategy outcomes, and 2026 systems
- UI clarity improvements for complex tradeoffs
- Stability pass on persistence and weekend progression
- KPI review against PRD success metrics

### Validation focus
- Do testers find race pace and outcomes believable?
- Can testers complete weekends without confusion?
- Do they want to continue after one event?
- Are 2026 systems felt as real tradeoffs rather than feature bullets?

### Exit criteria
- 80%+ tester sentiment for believable simulation
- 60%+ test completion of a full weekend
- 50%+ replay intent
- Major progression/persistence defects resolved

---

## 4. Cross-Cutting Workstreams

These should run alongside the phases above.

### A. Save/Load and State Model Discipline
Needed from Phase 0 onward.
- define stable serializable state boundaries
- keep simulation runtime state separate from persistent progression state
- avoid embedding save logic inside UI components

### B. Debug and Tuning Tooling
Needed from Phase 2 onward.
- scenario runners for tyre/weather/ERS/2026 regulation validation
- visible debug telemetry for lap traces and strategic events
- balancing fixtures for known test cases

### C. UX Legibility
Needed in every phase.
- always explain why pace changed
- always explain why a setup or development choice helped/hurt
- show consequences, not just raw numbers

### D. Future Sync Readiness
Needed from Phase 0 onward.
- keep local championship orchestration separate from simulation engine rules
- avoid hard-wiring persistence assumptions into core game logic
- treat “local async” as a transport mode, not the final architecture

---

## 5. Suggested Milestones

### Milestone A — Weekend Prototype
Includes:
- Phase 0
- Phase 1

**Outcome:** Complete practice → qualifying → race flow with local persistence.

### Milestone B — Believable Race Core
Includes:
- Phase 2
- core parts of Phase 3
- core parts of Phase 4

**Outcome:** Simulation feels credible and distinctly 2026-focused.

### Milestone C — Management-Coupled Championship MVP
Includes:
- remaining Phase 3
- Phase 5
- Phase 6

**Outcome:** Local async championship with light but meaningful between-weekend progression.

### Milestone D — Playtest-Ready MVP
Includes:
- Phase 7

**Outcome:** Community-testable MVP with clear realism goals and stable progression.

---

## 6. Recommended Build Order by System

If implementing incrementally inside the current codebase, this is the recommended system order:

1. persistent local championship/weekend models
2. weekend phase controller and UI flow
3. qualifying/grid generation
4. save/load architecture
5. enriched track model pipeline
6. telemetry realism tuning tools
7. 2026 regulation models
8. active aero integration
9. ERS 2026 integration
10. PU philosophy + battery allocation
11. race strategy/race control depth improvements
12. crew/driver/facilities/dev-tree systems
13. championship dashboards and progression UX
14. playtest balancing and hardening

---

## 7. Key Risks During Implementation

### Risk: Too much is added to `RaceControl`
**Mitigation:** move orchestration into stores/controllers/services before adding major features.

### Risk: 2026 features become cosmetic
**Mitigation:** require each new regulation system to affect pace, deployability, or decision-making before considering it done.

### Risk: Management systems outgrow the race focus
**Mitigation:** tie every management choice to weekend outcomes and cap system breadth aggressively.

### Risk: Supabase dependencies remain embedded in MVP-critical paths
**Mitigation:** isolate backend-backed features and introduce a local-only progression adapter early.

### Risk: Future sync architecture gets harder because MVP is too local-specific
**Mitigation:** keep engine, progression state, and persistence interfaces modular from the beginning.

---

## 8. Definition of MVP Done

The MVP is complete when all of the following are true:
- A player can run a full practice → qualifying → race weekend locally
- Weekend outcomes persist and feed a multi-round championship
- The simulation feels telemetry-informed and strategically believable
- 2026 systems are central and materially affect outcomes
- Lightweight management systems influence future weekends
- No Supabase connection is required for core play
- Testers understand the loop and want to continue playing

---

## 9. Post-MVP Transition Direction

After the MVP is validated, the next roadmap should focus on restructuring for:
- synchronous championship orchestration
- real-time development schedules
- shared race sessions
- eventual online persistence and multiplayer coordination

That should be treated as a separate architecture roadmap built on the modular boundaries established in Phase 0.
