# Race Weekend Implementation Plan

## 1. Type Definitions and State Management (`src/types/championship.ts`, `src/store/weekendStore.ts`)

- **Phases & Sessions:**
  - Update `WeekendPhase` to: `'pre_weekend' | 'fp1' | 'fp2' | 'fp3' | 'q1' | 'q2' | 'q3' | 'race' | 'post_race'`.
  - Update `SessionType` to: `'fp1' | 'fp2' | 'fp3' | 'q1' | 'q2' | 'q3' | 'race'`.
- **Advanced Car Setup:**
  - Expand `SessionSetupState` with: `frontWingAngle`, `rearWingAngle`, `rideHeight`, `suspensionStiffness`, `toeOut`, `camber, and gearbox setting (prioritize acceleration or top speed).`
  - Add `selectedTyreSetId` to reference a specific physical tyre set instead of just a compound.
- **Tyre Allocations:**
  - Create `TyreSet` interface: `{ id: string, compound: TyreCompound, wear: number, returned: boolean }`.
  - Add `tyreAllocations: Record<string, TyreSet[]>` to `OfflineWeekend` to track each driver's physical tyre stack.
- **Setup Feedback & Knowledge:**
  - Create `SetupFeedback` interface: `{ optimalRange: [number, number], currentValue: number, status: 'poor' | 'okay' | 'good' | 'optimal' }`.
  - Add `setupKnowledge: Record<string, Record<string, SetupFeedback>>` to track the player's progress in finding the ideal setup for each driver.
  - The optimalRange will narrow as setupKnowledge increases.
- **Store Updates:**
  - Update `weekendStore.ts` to handle the new granular phases and manage `tyreAllocations` and `setupKnowledge`.

## 2. Tyre Stack and Allocation Rules (`src/engine/systems/TyreManager.ts`)

- **Initialization:**
  - At `pre_weekend`, generate the standard allocation for each driver (e.g., 8 Softs, 3 Mediums, 2 Hards, 4 Inters, 3 Wets).
- **Session Transitions & Returning Tyres:**
  - After FP1: Automatically return 2 sets of tyres (usually the most worn ones).
  - After FP2: Return 2 sets.
  - After FP3: Return 2 sets.
- **Wear Tracking:**
  - Update the specific `TyreSet` wear at the end of each session so used tyres retain their degradation if used again.

## 3. Parc Fermé Rules (`src/utils/rules.ts` or `src/store/weekendStore.ts`)

- **Locking Setup:**
  - Implement a check: if `currentPhase` is `q1`, `q2`, `q3`, or `race`, Parc Fermé is active.
  - When Parc Fermé is active, UI and store logic must block changes to `frontWingAngle`, `rearWingAngle`, `rideHeight`, `suspensionStiffness`, `toeOut`, and `camber`.
  - Only `tyreCompound` (via `selectedTyreSetId`), `fuelLoad`, and active systems (e.g., Engine Modes) can be changed.

## 4. Sophisticated Car Physics (`src/engine/systems/PhysicsSystem.ts`)

- **Performance Modifiers:**
  - **Aero (Wings):** Higher wing angles increase `cornering` grip but decrease `top_speed` and `acceleration` due to drag.
  - **Suspension/Ride Height:** Affects mechanical grip. Lower ride height increases downforce but risks bottoming out. Stiff suspension improves responsiveness but reduces grip on bumpy tracks.
  - **Alignment (Toe/Camber):** Affects tyre wear rates and cornering behavior (oversteer/understeer balance).
- **Integration:**
  - Modify the base `TeamSpecs` dynamically based on the current `SessionSetupState` before feeding them into the simulation engine to calculate lap times and telemetry.

## 5. Driver Feedback & AI Setup Algorithm (`src/engine/systems/SetupFeedbackSystem.ts`)

- **Ideal Setup Generation:**
  - For each track, generate an "ideal" hidden setup (e.g., Monza needs low wings, Monaco needs high wings).
- **Feedback Loop:**
  - During FP1, FP2, and FP3, as the driver completes laps, calculate the delta between the current setup and the ideal setup.
  - Generate textual feedback based on the delta (e.g., "The car is too loose in the rear, I need more rear wing" -> Oversteer).
  - Gradually narrow the `optimalRange` for each parameter based on the driver's `setupKnowledge` skill and laps completed. The UI will show these narrowing ranges to guide the player to the perfect setup.

## 6. Execution Flow

1. Update `types` and `store` to support the new data structures.
2. Implement `TyreManager` for allocation and returning rules.
3. Build the `SetupFeedbackSystem` for practice sessions.
4. Update `PhysicsSystem` to map setup parameters to car performance.
5. Integrate Parc Fermé rules into the weekend transition logic.
6. Verify transitions from FP1 -> FP2 -> FP3 -> Q1 -> Q2 -> Q3 -> Race.

