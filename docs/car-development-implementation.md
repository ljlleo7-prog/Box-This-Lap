# Car Development System - Implementation Complete

## Overview

The R&D page has been completely rewritten to implement a local-first car development system with proper design lifecycle management, multi-bias development, ATR resource tracking, and per-car part installation.

## Key Features Implemented

### 1. Multi-Bias Design System
- Replaced single-focus selection with weighted sliders
- Each part can blend multiple design philosophies (e.g., 50% downforce + 30% balance + 20% efficiency)
- Sliders auto-normalize to 100% total allocation
- Live calculation of projected effects based on weighted bias vectors

### 2. ATR Resource Management
- Wind tunnel and CFD hour caps based on constructor standing (P1 = 36h/180h, P10 = 54h/270h)
- Real-time tracking of used vs. available resources
- Projects consume ATR allocation when started
- Visual progress bars show resource utilization

### 3. Development Lifecycle
**Active Projects** → **Completed Designs** → **Stock** → **Car Installation**

- Start development with custom investment, ATR allocation, and bias weights
- Complete projects to move them to design inventory (starts with 1 stock)
- Add stock units via manufacturing buttons
- Install designs independently on Car 1 and Car 2

### 4. Live Projections
The Start Development modal shows real-time calculations:
- **Duration**: Based on investment, ATR allocation, and facility levels
- **Stat Effects**: Weighted combination of bias effects with diminishing returns
- **ATR Impact**: Shows how wind tunnel and CFD hours affect outcomes

### 5. Per-Car Installation
- Each car can use different part designs for the same category
- Dropdown selectors show available designs with stock counts
- Only designs with stock > 0 can be installed
- Base spec is always available as fallback

### 6. Persistence & Integration
- All R&D state saves to `localStorage` under `rd-research-state` key
- Derived effective specs save to `rd-team-specs` (existing key)
- Race simulator automatically loads derived specs via `raceStore.ts`
- Base specs + installed part effects = effective car performance

## Data Model

### ResearchDepartmentState
```typescript
{
  atr: AtrPeriodState,              // Resource caps and usage
  activeDesignProjects: PartDesign[], // In-progress developments
  completedDesigns: PartDesign[],    // Finished designs with stock
  manufacturingQueue: ManufacturingOrder[], // (placeholder for future)
  carAssignments: CarPartAssignment[] // Car 1 & Car 2 installations
}
```

### PartDesign
```typescript
{
  id, partCategory, code, displayName, customName,
  status, biasAllocations, projectedEffects, actualEffects,
  investment, aero, startedAt, completedAt,
  projectedDurationWeeks, stock
}
```

## Formulas

### Effect Calculation
```
weightedEffects = Σ(biasEffect × weight/100)
investmentFactor = 1 + min(1.25, log10(max(10, money)) × 0.22)
aeroFactor = 1 + min(0.8, windTunnel/120 + cfd/600)
facilityFactor = 1 + (aero-1)×0.04 + (factory-1)×0.03 + (powertrain-1)×0.02
finalEffect = weightedEffects × investmentFactor × aeroFactor × facilityFactor
```

### Duration Calculation
```
investmentSpeed = 1 + min(1.1, log10(max(10, money)) × 0.18)
resourceSpeed = 1 + min(0.9, windTunnel/140 + cfd/700)
facilitySpeed = 1 + (aero-1)×0.03 + (factory-1)×0.04
duration = baseDurationWeeks / (investmentSpeed × resourceSpeed × facilitySpeed)
```

## Usage Flow

1. **Start a Project**
   - Click "Start Project" button
   - Select part category (Front Wing, Floor, etc.)
   - Adjust bias sliders to blend design philosophies
   - Set investment amount and ATR allocation
   - Review projected duration and effects
   - Click "Start Development"

2. **Complete Development**
   - Click "Complete" button on active project
   - Design moves to completed inventory with 1 stock unit

3. **Build Stock**
   - Click "+1 Stock" or "+2 Stock" on completed designs
   - Stock increments immediately (simplified manufacturing)

4. **Install Parts**
   - Go to Car Installations section
   - Select design from dropdown for each part category
   - Each car can use different designs
   - Changes apply immediately

5. **Race with Custom Specs**
   - Navigate to Race Control
   - Simulator loads derived specs automatically
   - Car performance reflects installed parts

## Files Modified

### Core Implementation
- `src/pages/ResearchDevelopment.tsx` - Complete rewrite with new UI
- `src/lib/researchDevelopment.ts` - Formulas and helpers (new file)
- `src/lib/localSaves.ts` - Added R&D state persistence
- `src/types/championship.ts` - Extended with R&D types

### Integration Points
- `src/store/raceStore.ts` - Already loads from `rd-team-specs` (no changes needed)
- Race simulator uses derived specs automatically

## Testing Checklist

- [x] Type-check passes (`npm run check`)
- [x] Build succeeds (`npm run build`)
- [x] Start development modal opens and closes
- [x] Bias sliders normalize to 100%
- [x] Projections update live
- [x] Projects move from active → completed
- [x] Stock increments work
- [x] Installation dropdowns show available designs
- [x] State persists across page reloads
- [ ] Manual: Verify derived specs affect race performance
- [ ] Manual: Test with different constructor standings
- [ ] Manual: Verify ATR caps enforce limits

## Future Enhancements

### Short Term
- Add validation to prevent exceeding ATR caps
- Show warning when trying to start project without resources
- Add "Remove Stock" or "Uninstall" actions
- Display current effective specs summary

### Medium Term
- Implement proper manufacturing queue with time progression
- Add facility level integration (currently uses defaults)
- Add cost tracking and budget constraints
- Show design comparison tool

### Long Term
- Migrate to Supabase for online persistence
- Add real-time progression tied to championship rounds
- Implement part durability and wear
- Add design versioning and upgrade paths

## Notes

- Manufacturing is simplified: "+Stock" buttons add units instantly
- No time progression: projects complete manually via "Complete" button
- Facility levels default to 1 if not provided
- Constructor standing defaults to P5 (mid-grid) if not available
- Stock management is simplified: no consumption tracking on installation
