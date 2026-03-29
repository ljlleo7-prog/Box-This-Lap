# Product Requirements Document: 2026 Race Weekend Simulator MVP

**Version**: 1.0
**Date**: 2026-03-20
**Author**: Sarah (Product Owner)
**Quality Score**: 92/100

---

## Executive Summary

This product evolves the current project into a race-weekend-first Formula 1 management simulator designed for experienced F1 fans and the creator’s existing community. The goal is to fill the gap left by the discontinued evolution of F1 Manager by delivering a fresh simulation experience centered on the 2026 rules era, where active aero, new ERS behavior, PU design philosophy, and battery allocation create a new strategic landscape.

The MVP should prove that the game can deliver believable race control, strategic depth, and team decision-making without requiring a full live-service backend. For testing and iteration, the initial release remains a free, local, async experience with no Supabase dependency. The long-term direction is a future restructure into a fully synchronous multiplayer championship with real-time development scheduling and shared race events.

---

## Problem Statement

**Current Situation**: Existing F1 management games are no longer evolving in step with the sport’s next major regulation cycle. The 2026 season introduces a compelling new era with active aero, power unit tradeoffs, battery allocation, and revised ERS behavior, but there is no current management simulator positioned to deeply explore those systems for dedicated fans.

**Proposed Solution**: Build a race-weekend-first simulator that most closely mimics the appeal of F1 Manager 24 while differentiating on 2026 regulation accuracy, telemetry-based speed simulation, and a tighter focus on the strategic and operational realities of running a team over a championship.

**Business Impact**: This feature can attract and retain experienced F1 fans looking for a deeper and more current simulation experience, strengthen engagement with the creator’s audience, and establish a strong simulation foundation that can later support a synchronous multiplayer championship product.

---

## Success Metrics

**Primary KPIs:**
- **Simulation believability**: At least 80% of target testers describe race pace, strategy outcomes, and session flow as believable for a 2026-inspired F1 simulator.
- **Race weekend completion**: At least 60% of testers complete a full practice–qualifying–race cycle in a test build.
- **Replay intent**: At least 50% of testers choose to start another weekend or continue a championship after their first completed event.

**Validation**: Measure through closed testing with experienced F1 fans and existing followers using structured feedback forms, session observations, and qualitative review of whether telemetry behavior, strategy tradeoffs, and management decisions feel credible.

---

## User Personas

### Primary: Hardcore F1 Strategy Fan
- **Role**: Experienced F1 follower and simulation player
- **Goals**: Run a team through a realistic race weekend, explore 2026 regulations, and make meaningful strategic decisions
- **Pain Points**: Existing games feel outdated, too shallow in future-regulation modeling, or no longer actively evolving
- **Technical Level**: Advanced

### Secondary: Community Follower / Returning Manager-Game Player
- **Role**: Existing audience member who enjoys F1 Manager-style gameplay but does not require full esports-level complexity
- **Goals**: Experience a believable and engaging F1 management fantasy without being overwhelmed by unnecessary systems like deep sponsorship or economic micromanagement
- **Pain Points**: Too much off-track management can distract from the racing and engineering fantasy
- **Technical Level**: Intermediate to Advanced

---

## User Stories & Acceptance Criteria

### Story 1: Run a Full Race Weekend

**As a** hardcore F1 strategy fan
**I want to** manage practice, qualifying, and race sessions
**So that** I can feel like I am running the team through a realistic F1 weekend

**Acceptance Criteria:**
- [ ] The player can progress through a structured weekend flow including practice, qualifying, and race sessions.
- [ ] Each session presents meaningful decisions that influence performance or preparation for later sessions.
- [ ] Session outcomes persist into the next phase of the weekend.

### Story 2: Manage 2026-Era Car and Energy Tradeoffs

**As a** hardcore F1 strategy fan
**I want to** make decisions around active aero, ERS behavior, PU philosophy, and battery allocation
**So that** the 2026 regulation era feels distinct from older F1 management games

**Acceptance Criteria:**
- [ ] The simulation exposes 2026-specific systems in ways the player can influence.
- [ ] These systems materially affect pace, efficiency, strategy, or race outcomes.
- [ ] The player can understand the tradeoffs of their choices through UI feedback and race results.

### Story 3: Shape Team Performance Between Weekends

**As a** returning management-game player
**I want to** improve my team through development, crew management, driver setup influence, and light facilities progression
**So that** weekend performance reflects my season-level decisions

**Acceptance Criteria:**
- [ ] The player can invest in car development choices that alter strengths and weaknesses.
- [ ] Crew-related decisions affect operational outcomes such as readiness, execution quality, or development speed.
- [ ] Driver-related preparation or setup systems influence session confidence, readiness, or performance.

### Story 4: Play an Async Championship Prototype

**As a** tester of the MVP
**I want to** progress through a championship in an async, local format
**So that** the core loop can be validated before multiplayer infrastructure is introduced

**Acceptance Criteria:**
- [ ] Championship progression works without Supabase or required online services.
- [ ] The game can be played as a free local prototype.
- [ ] The architecture leaves room for future migration toward synchronous multiplayer championships.

---

## Functional Requirements

### Core Features

**Feature 1: Weekend Flow Management**
- Description: The MVP must support a clear race-weekend loop with practice, qualifying, and race phases as the core gameplay structure.
- User flow: Start or continue a championship weekend → prepare car/team → run practice → adjust setup/plan → run qualifying → finalize race plan → run race → review outcome → move to next event.
- Edge cases: The player exits mid-weekend, re-enters a saved state, or makes suboptimal setup choices.
- Error handling: The system must preserve weekend state reliably and avoid corrupted progression when moving between phases.

**Feature 2: Telemetry-Based Race Simulation**
- Description: On-track pace and behavior should be anchored in telemetry-derived speed modeling and track characteristics.
- User flow: Player enters session → simulation uses track/vehicle/condition inputs → race pace, speed traces, and outcomes reflect conditions and decisions.
- Edge cases: Wet conditions, safety car changes, extreme tyre wear, and ERS depletion.
- Error handling: If telemetry-derived enrichments are unavailable for a track, the system should still produce a coherent fallback simulation model.

**Feature 3: 2026 Regulation Systems**
- Description: Active aero, revised ERS behavior, PU philosophy, and battery allocation must be represented as central systems rather than cosmetic labels.
- User flow: Player selects or develops team direction → systems alter pace, deployability, efficiency, and strategy decisions during sessions.
- Edge cases: Battery over-commitment, mismatched setup philosophy for a track, or conflicting performance tradeoffs.
- Error handling: The UI must clearly communicate why a decision helps or hurts performance.

**Feature 4: Strategy and Operational Depth**
- Description: The MVP must include meaningful tyre, ERS, weather, incidents, safety car, and operational choices similar to the appeal of F1 Manager 24.
- User flow: Player monitors session state → adjusts pace/ERS/strategy → responds to weather, tyre state, incidents, and race control events.
- Edge cases: Sudden weather changes, neutralizations, bad pit timing, and compromised driver readiness.
- Error handling: Strategic consequences should remain legible even if the player makes poor choices.

**Feature 5: Lightweight Team Management Layer**
- Description: Between weekends, the player should shape future performance through car development, crew management, driver management, and facilities lite.
- User flow: Review post-race needs → choose upgrades or assignments → carry improvements and tradeoffs into the next event.
- Edge cases: Conflicting upgrade directions, crew overload, or underprepared drivers.
- Error handling: The system should prevent invalid management states and explain tradeoffs clearly.

### Out of Scope
- Heavy economic simulation
- Sponsorship negotiation systems
- Full online persistence or Supabase-backed live progression in the MVP
- Fully synchronous shared race weekends in the MVP
- Deep off-track narrative, contract drama, or broad non-performance management systems

---

## Technical Constraints

### Performance
- Session simulation should feel responsive and readable on standard desktop hardware.
- Race simulation updates must support smooth playback at gameplay speeds that make strategy management practical.
- Save/load state for local async progression should be reliable enough for testing across multiple weekends.

### Security
- MVP should avoid dependence on backend auth or paid account systems.
- Local save and progression systems should avoid exposing sensitive keys or requiring Supabase runtime credentials for core gameplay.
- Future sync architecture should be considered, but it is not a blocker for the offline MVP.

### Integration
- **Current frontend simulator**: Must build on the existing in-browser simulation engine and race control flow rather than replacing it wholesale in MVP.
- **Telemetry-derived track data**: Must continue to support or expand the current OpenF1-based speed-curve approach where useful.
- **Future multiplayer architecture**: MVP decisions should not block later migration into a synchronous championship model.

### Technology Stack
- React + TypeScript + Vite frontend
- Existing local simulation engine and Zustand-based race state management
- Local/offline-first MVP with no required Supabase connection for core play loop
- Desktop browser-first compatibility for MVP

---

## MVP Scope & Phasing

### Phase 1: MVP (Required for Initial Launch)
- Practice, qualifying, and race weekend flow
- Telemetry-based race pace/speed simulation
- 2026-specific systems: active aero, ERS changes, PU philosophy, battery allocation
- Strategic race management: tyres, weather, incidents, race control, operational decisions
- Lightweight car development tree
- Crew management
- Driver management inputs tied to readiness/performance
- Facilities lite
- Local async championship progression with no Supabase dependency

**MVP Definition**: A free local prototype where experienced F1 fans can run a believable 2026-style weekend and continue into a lightweight championship loop, with race realism and strategic depth prioritized over monetization, sponsorship, or online infrastructure.

### Phase 2: Enhancements (Post-Launch)
- Better balancing and realism tuning through tester feedback
- Deeper development interactions and cross-weekend tradeoffs
- More robust championship structure and progression UX
- Broader track/ruleset coverage and richer operational modeling

### Future Considerations
- Fully synchronous multiplayer championship structure
- Real-time development scheduling shared across players
- Shared live race sessions
- Expanded live-service or community league infrastructure

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| 2026 systems feel superficial instead of transformative | Medium | High | Make active aero, ERS, PU philosophy, and battery allocation materially affect pace, strategy, and setup outcomes |
| Simulation realism disappoints experienced F1 fans | Medium | High | Prioritize telemetry-informed validation, closed testing with knowledgeable fans, and fast iteration on race behavior |
| MVP scope grows too large from trying to match all of F1 Manager 24 | High | High | Keep the product race-weekend-first and intentionally limit economics, sponsorship, and non-core management systems |
| Future migration to synchronous multiplayer becomes expensive | Medium | Medium | Preserve modular boundaries between local simulation, progression, and future synchronization concerns |
| Management systems dilute the race-sim focus | Medium | Medium | Keep management layers lightweight and tie them directly to weekend outcomes |

---

## Dependencies & Blockers

**Dependencies:**
- Existing simulation engine and race control UI foundation
- Track definitions and telemetry-derived speed data
- Clear internal design for how 2026 rule systems affect simulation variables
- Ongoing tester feedback from experienced F1 fans

**Known Blockers:**
- Exact numeric implementation details for 2026 regulation systems are not yet fully specified
- Future synchronous multiplayer architecture is intentionally deferred, so MVP architecture must avoid overcommitting to the current local-only structure

---

## Appendix

### Glossary
- **Active aero**: Dynamic aerodynamic modes or settings that influence drag/downforce tradeoffs under the 2026 concept.
- **PU philosophy**: The design direction of the power unit package, shaping performance strengths and weaknesses.
- **Battery allocation**: How electrical energy availability and usage are distributed and managed across a session or event.
- **Async championship**: A progression model where players do not need to participate in real time together.
- **Telemetry-based simulation**: A simulation approach using real-world speed trace or track-derived data as an input to believable on-track behavior.

### References
- Current project architecture and simulator foundation
- Existing race control and telemetry data pipeline
- F1 Manager 24 as tonal and structural inspiration for race-weekend management
- 2026 Formula 1 regulation era as the design target for differentiation

---

*This PRD was created through interactive requirements gathering with quality scoring to ensure comprehensive coverage of business, functional, UX, and technical dimensions.*
