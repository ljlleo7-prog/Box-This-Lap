# Local Championship Integration - Complete

## Overview

A complete local single-player career mode has been implemented with full R&D integration and time progression. The system is designed to be easily convertible to multiplayer.

## Features Implemented

### 1. Championship Structure
- **Local Career Mode** at `/career` route
- Single team with 2 drivers
- 24-race calendar
- Constructor and driver standings tracking
- Round-based progression (14 days per round)

### 2. R&D Time Integration
- Development projects complete based on rounds passed
- Manufacturing orders progress with time
- Stock automatically added when manufacturing completes
- ATR resources reset per period (tied to constructor standing)

### 3. Data Model (Multiplayer-Ready)
```typescript
OfflineChampionship {
  teams: OfflineTeamState[]  // Easy to extend to multiple players
  currentRound: number
  driverStandings: ChampionshipStandingEntry[]
  constructorStandings: ChampionshipStandingEntry[]
}

OfflineTeamState {
  researchDepartment: ResearchDepartmentState
  facilities: FacilityState
  drivers: OfflineDriverState[]
  // All team-specific state
}
```

### 4. Time Progression System
**When "Advance Round" is clicked:**
1. Add 14 days (2 weeks between races)
2. Check active R&D projects:
   - If `weeksElapsed >= projectedDurationWeeks` → Move to completed designs
   - Add 1 prototype stock
3. Check manufacturing queue:
   - If `daysElapsed >= durationDays` → Complete order
   - Add manufactured stock to design
4. Update championship round counter
5. Save all state

### 5. Integration Points

**Championship Dashboard** (`/career`)
- View current round and standings
- Quick access to R&D and Race Weekend
- "Advance Round" button (processes time)
- Next race preview

**R&D Page** (`/research`)
- Loads from championship context if available
- Falls back to standalone mode for backward compatibility
- Saves to both championship and standalone storage
- All R&D features work in both modes

**Race Simulator** (existing)
- Already loads derived specs from `rd-team-specs`
- No changes needed - automatically uses R&D-modified car performance

## File Structure

### New Files
- `src/pages/Championship.tsx` - Career mode dashboard
- `src/lib/championshipHelpers.ts` - Championship creation and time progression

### Modified Files
- `src/App.tsx` - Added `/career` route
- `src/pages/ResearchDevelopment.tsx` - Championship context integration
- `src/lib/localSaves.ts` - Championship-aware save/load
- `src/types/championship.ts` - Added `ManufacturingMode` type

## Usage Flow

1. **Start Career**
   - Navigate to `/career`
   - Click "Create Championship"
   - Creates McLaren team with Norris & Piastri (hardcoded for now)

2. **Develop Car**
   - Click "R&D Department"
   - Start development projects (8-12 weeks)
   - Projects stay "in progress" until rounds advance

3. **Advance Time**
   - Return to `/career`
   - Click "Advance to Next Round"
   - Projects complete if enough time passed
   - Manufacturing completes if enough time passed

4. **Manufacture Parts**
   - Go to R&D page
   - Click "Manufacture" on completed designs
   - Choose mode (normal/intense/urgent)
   - Order added to queue

5. **Install Parts**
   - Use dropdowns in "Car Installations" section
   - Assign different designs to Car 1 and Car 2
   - Specs automatically update

6. **Race Weekend**
   - Click "Race Weekend" from dashboard
   - Simulator uses derived specs from installed parts

## Multiplayer Conversion Path

The system is designed for easy multiplayer migration:

### Current (Local)
```typescript
SaveGame {
  championship: OfflineChampionship {
    teams: [playerTeam]  // Single team
  }
}
```

### Future (Multiplayer)
```typescript
OnlineChampionship {
  id: uuid
  teams: OnlineTeamState[]  // Multiple teams, one per player
  currentRound: number
  // Stored in Supabase
}

OnlineTeamState {
  userId: uuid  // Link to player
  researchDepartment: ResearchDepartmentState
  // Same structure as OfflineTeamState
}
```

### Migration Steps
1. Move `OfflineChampionship` → Supabase table
2. Add `user_id` foreign key to teams
3. Replace `loadSaveGame()` with Supabase queries
4. Add real-time subscriptions for standings updates
5. Add turn-based or real-time round progression
6. Keep all R&D logic identical (already team-scoped)

## Key Design Decisions

**Why 14 days per round?**
- Matches real F1 calendar spacing
- Allows 8-12 week projects to complete in 4-6 rounds
- Manufacturing (3-6 days) completes in 1 round

**Why local-first?**
- Faster development
- No server dependency
- Easy testing
- Clean migration path to multiplayer

**Why separate R&D state from championship?**
- Backward compatibility with standalone R&D page
- Allows R&D testing without full championship
- Easy to merge later

## Testing Checklist

- [x] Create championship
- [x] View championship dashboard
- [x] Navigate to R&D from dashboard
- [x] Start development project
- [x] Advance round (project still in progress)
- [x] Advance multiple rounds (project completes)
- [x] Start manufacturing
- [x] Advance round (manufacturing completes, stock added)
- [x] Install parts on cars
- [ ] Manual: Race with custom specs
- [ ] Manual: Verify standings update after race
- [ ] Manual: Test full season progression

## Next Steps

1. Add race result processing (update standings)
2. Add championship creation modal (choose team/drivers)
3. Add season end / championship winner screen
4. Add driver/team management features
5. Prepare Supabase schema for multiplayer migration
