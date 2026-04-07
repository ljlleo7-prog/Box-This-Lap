# Team Construction Championship - Technical Architecture

> This document is the canonical detailed architecture reference for the repo's online championship direction. The intended product path is Supabase-backed championship management with the simulation engine used as a race-execution subsystem.

## 1. System Overview

The Team Construction Championship system consists of two main layers:

**Persistent Championship Layer (Supabase)**
- Stores all team, driver, facility, and development data
- Manages championship scheduling and user authentication
- Handles race weekend orchestration and results storage
- Provides real-time updates via Supabase Realtime

**Ephemeral Simulation Engine (Existing)**
- Multi-lap race simulation engine (existing system)
- Stateless computation layer that processes race weekends
- Receives input states and strategy plans from Supabase
- Returns simulation results to be stored back in Supabase

The orchestration layer (Supabase Edge Functions) acts as the bridge between these two systems, managing the flow of data and ensuring deterministic execution of race weekends.

## 2. Database Schema

### Core Tables

Note: All TCC-specific tables use the `tcc_` prefix to avoid conflicts with existing tables.

```sql
-- User profiles (using existing auth.users, plus a TCC-specific table if needed)
CREATE TABLE tcc_players (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    username VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Championships
CREATE TABLE tcc_championships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_by UUID REFERENCES tcc_players(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Championship members with roles
CREATE TABLE tcc_championship_members (
    championship_id UUID REFERENCES tcc_championships(id) ON DELETE CASCADE,
    user_id UUID REFERENCES tcc_players(id) ON DELETE CASCADE,
    role VARCHAR(20) CHECK (role IN ('host', 'developer', 'player')),
    PRIMARY KEY (championship_id, user_id)
);

-- Teams
CREATE TABLE tcc_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    championship_id UUID REFERENCES tcc_championships(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES tcc_players(id),
    name VARCHAR(100) NOT NULL,
    budget INTEGER DEFAULT 10000000,
    reputation INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drivers
CREATE TABLE tcc_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES tcc_teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    skills JSONB NOT NULL DEFAULT '{"pace": 50, "consistency": 50, "tire_management": 50, "ers_efficiency": 50, "racecraft": 50, "wet_skill": 50}',
    morale FLOAT DEFAULT 75.0,
    adaptation_by_track JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Facilities
CREATE TABLE tcc_facilities (
    team_id UUID PRIMARY KEY REFERENCES tcc_teams(id) ON DELETE CASCADE,
    levels JSONB NOT NULL DEFAULT '{"factory": 1, "aero": 1, "powertrain": 1, "simulator": 1, "pit_crew": 1, "logistics": 1}',
    upgrade_queue JSONB DEFAULT '[]'
);

-- Car parts inventory
CREATE TABLE tcc_car_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES tcc_teams(id) ON DELETE CASCADE,
    category VARCHAR(20) CHECK (category IN ('front_wing', 'rear_wing', 'floor', 'suspension', 'cooling', 'engine_mapping')),
    version INTEGER NOT NULL,
    perf_stats JSONB NOT NULL,
    reliability FLOAT NOT NULL,
    installed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, category, version)
);

-- R&D projects
CREATE TABLE tcc_rd_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES tcc_teams(id) ON DELETE CASCADE,
    category VARCHAR(20) CHECK (category IN ('front_wing', 'rear_wing', 'floor', 'suspension', 'cooling', 'engine_mapping')),
    target_spec JSONB NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_hours_effective INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
    completes_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Training plans
CREATE TABLE tcc_training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES tcc_drivers(id) ON DELETE CASCADE,
    plan_type VARCHAR(20) CHECK (plan_type IN ('pace', 'consistency', 'tire_management', 'ers_efficiency', 'racecraft', 'wet_skill')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_hours_effective INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    completes_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Race weekends
CREATE TABLE tcc_weekends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    championship_id UUID REFERENCES tcc_championships(id) ON DELETE CASCADE,
    track_id VARCHAR(50) NOT NULL,
    speed_multiplier INTEGER CHECK (speed_multiplier IN (1, 2, 5, 10)),
    weather_mode VARCHAR(20) CHECK (weather_mode IN ('realistic', 'preset')),
    realism_preset VARCHAR(20) DEFAULT 'standard',
    host_timezone VARCHAR(50) NOT NULL,
    scheduled_practice_at_utc TIMESTAMP WITH TIME ZONE,
    scheduled_quali_at_utc TIMESTAMP WITH TIME ZONE,
    scheduled_race_at_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'practice_complete', 'quali_complete', 'race_complete', 'cancelled'))
);

-- Practice plans
CREATE TABLE tcc_plans_practice (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekend_id UUID REFERENCES tcc_weekends(id) ON DELETE CASCADE,
    team_id UUID REFERENCES tcc_teams(id) ON DELETE CASCADE,
    preset JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(weekend_id, team_id)
);

-- Qualifying plans
CREATE TABLE tcc_plans_quali (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekend_id UUID REFERENCES tcc_weekends(id) ON DELETE CASCADE,
    team_id UUID REFERENCES tcc_teams(id) ON DELETE CASCADE,
    preset JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(weekend_id, team_id)
);

-- Race strategy plans
CREATE TABLE tcc_plans_race (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekend_id UUID REFERENCES tcc_weekends(id) ON DELETE CASCADE,
    team_id UUID REFERENCES tcc_teams(id) ON DELETE CASCADE,
    preset JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(weekend_id, team_id)
);

-- Qualifying results
CREATE TABLE tcc_quali_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekend_id UUID REFERENCES tcc_weekends(id) ON DELETE CASCADE,
    grid JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Race results
CREATE TABLE tcc_race_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekend_id UUID REFERENCES tcc_weekends(id) ON DELETE CASCADE,
    classification JSONB NOT NULL,
    lap_summary JSONB NOT NULL,
    incidents JSONB DEFAULT '[]',
    points_awarded JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Standings snapshots
CREATE TABLE tcc_standings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    championship_id UUID REFERENCES tcc_championships(id) ON DELETE CASCADE,
    table_type VARCHAR(20) CHECK (table_type IN ('drivers', 'constructors')),
    snapshot JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE tcc_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_championship_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_car_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_rd_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_weekends ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_plans_practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_plans_quali ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_plans_race ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_quali_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcc_standings ENABLE ROW LEVEL SECURITY;

-- Grant basic read access to anon role
GRANT SELECT ON tcc_championships TO anon;
GRANT SELECT ON tcc_weekends TO anon;
GRANT SELECT ON tcc_quali_results TO anon;
GRANT SELECT ON tcc_race_results TO anon;
GRANT SELECT ON tcc_standings TO anon;

-- Grant full access to authenticated role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;

-- RLS Policies
CREATE POLICY "Users can view their own player profile" ON tcc_players
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own player profile" ON tcc_players
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public can view championships" ON tcc_championships
    FOR SELECT USING (true);

CREATE POLICY "Hosts can create championships" ON tcc_championships
    FOR INSERT WITH CHECK (
        created_by = auth.uid()
    );

CREATE POLICY "Players can view their team data" ON tcc_teams
    FOR SELECT USING (
        owner_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM tcc_championship_members 
            WHERE championship_id = tcc_teams.championship_id 
            AND user_id = auth.uid() 
            AND role IN ('host', 'developer')
        )
    );

-- (Policies continue for other tcc_ tables similarly)
```

CREATE POLICY "Players can update their team data" ON teams
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Players can manage their drivers" ON drivers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = drivers.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their facilities" ON facilities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = facilities.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their car parts" ON car_parts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = car_parts.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their R&D projects" ON rd_projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = rd_projects.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their training plans" ON training_plans
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM drivers 
            JOIN teams ON teams.id = drivers.team_id 
            WHERE drivers.id = training_plans.driver_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can submit practice plans" ON plans_practice
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = plans_practice.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can submit quali plans" ON plans_quali
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = plans_quali.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can submit race plans" ON plans_race
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams 
            WHERE teams.id = plans_race.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Public can view results" ON quali_results
    FOR SELECT USING (true);

CREATE POLICY "Public can view results" ON race_results
    FOR SELECT USING (true);

CREATE POLICY "Public can view standings" ON standings
    FOR SELECT USING (true);
```

## 3. Orchestration Layer (Supabase Edge Functions)

### Core Edge Functions

#### `createChampionship`
Creates a new championship and assigns the creator as host.

```typescript
export async function createChampionship(
  request: Request,
  supabase: SupabaseClient
) {
  const { name } = await request.json();
  const userId = request.auth.userId;
  
  // Create championship
  const { data: championship } = await supabase
    .from('championships')
    .insert({ name, created_by: userId })
    .select()
    .single();
  
  // Add creator as host
  await supabase
    .from('championship_members')
    .insert({
      championship_id: championship.id,
      user_id: userId,
      role: 'host'
    });
  
  return championship;
}
```

#### `createWeekend`
Creates a race weekend with validation for scheduling constraints.

```typescript
export async function createWeekend(
  request: Request,
  supabase: SupabaseClient
) {
  const {
    championshipId,
    trackId,
    speedMultiplier,
    hostLocalDatetime,
    weatherMode,
    realismPreset
  } = await request.json();
  
  // Convert host local time to UTC
  const hostTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const scheduledRaceAtUtc = new Date(hostLocalDatetime);
  
  // Validate 24-hour advance rule
  const now = new Date();
  const hoursUntilRace = (scheduledRaceAtUtc.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursUntilRace < 24) {
    throw new Error('Race must be scheduled at least 24 hours in advance');
  }
  
  // Validate 24-hour gap from previous weekend
  const { data: previousWeekend } = await supabase
    .from('weekends')
    .select('scheduled_race_at_utc')
    .eq('championship_id', championshipId)
    .order('scheduled_race_at_utc', { ascending: false })
    .limit(1)
    .single();
  
  if (previousWeekend) {
    const gapHours = (scheduledRaceAtUtc.getTime() - new Date(previousWeekend.scheduled_race_at_utc).getTime()) / (1000 * 60 * 60);
    if (gapHours < 24) {
      throw new Error('Race weekends must have at least 24-hour gap');
    }
  }
  
  // Schedule practice and quali (2 hours and 1 hour before race)
  const scheduledPracticeAtUtc = new Date(scheduledRaceAtUtc.getTime() - 2 * 60 * 60 * 1000);
  const scheduledQualiAtUtc = new Date(scheduledRaceAtUtc.getTime() - 1 * 60 * 60 * 1000);
  
  // Create weekend
  const { data: weekend } = await supabase
    .from('weekends')
    .insert({
      championship_id: championshipId,
      track_id: trackId,
      speed_multiplier: speedMultiplier,
      weather_mode: weatherMode,
      realism_preset: realismPreset,
      host_timezone: hostTimezone,
      scheduled_practice_at_utc: scheduledPracticeAtUtc,
      scheduled_quali_at_utc: scheduledQualiAtUtc,
      scheduled_race_at_utc: scheduledRaceAtUtc
    })
    .select()
    .single();
  
  return weekend;
}
```

#### `runPractice`
Orchestrates practice session simulation.

```typescript
export async function runPractice(
  weekendId: string,
  supabase: SupabaseClient,
  simulationEngine: SimulationEngine
) {
  // Get weekend details
  const { data: weekend } = await supabase
    .from('weekends')
    .select('*')
    .eq('id', weekendId)
    .single();
  
  if (!weekend || weekend.status !== 'scheduled') {
    throw new Error('Invalid weekend status for practice');
  }
  
  // Get all teams and their practice plans
  const { data: teams } = await supabase
    .from('teams')
    .select(`
      *,
      drivers(*),
      car_parts(*),
      plans_practice(*)
    `)
    .eq('championship_id', weekend.championship_id);
  
  // Map DB state to simulation input
  const simulationInput = mapTeamsToSimulationInput(teams, weekend);
  
  // Run practice simulation
  const practiceResults = await simulationEngine.runPractice({
    trackId: weekend.track_id,
    teams: simulationInput,
    weatherMode: weekend.weather_mode,
    realismPreset: weekend.realism_preset
  });
  
  // Update driver adaptation and morale based on results
  for (const result of practiceResults) {
    await supabase
      .from('drivers')
      .update({
        adaptation_by_track: {
          ...result.driver.adaptation_by_track,
          [weekend.track_id]: result.adaptationDelta
        },
        morale: Math.max(0, Math.min(100, result.driver.morale + result.moraleDelta))
      })
      .eq('id', result.driverId);
  }
  
  // Update weekend status
  await supabase
    .from('weekends')
    .update({ status: 'practice_complete' })
    .eq('id', weekendId);
  
  // Broadcast practice completion
  await supabase
    .channel(`weekend:${weekendId}`)
    .send({
      type: 'broadcast',
      event: 'practice_complete',
      payload: { weekendId }
    });
  
  return practiceResults;
}
```

#### `runQuali`
Orchestrates qualifying simulation.

```typescript
export async function runQuali(
  weekendId: string,
  supabase: SupabaseClient,
  simulationEngine: SimulationEngine
) {
  // Get weekend details
  const { data: weekend } = await supabase
    .from('weekends')
    .select('*')
    .eq('id', weekendId)
    .single();
  
  if (!weekend || weekend.status !== 'practice_complete') {
    throw new Error('Invalid weekend status for qualifying');
  }
  
  // Get all teams with updated practice data
  const { data: teams } = await supabase
    .from('teams')
    .select(`
      *,
      drivers(*),
      car_parts(*),
      plans_quali(*)
    `)
    .eq('championship_id', weekend.championship_id);
  
  // Map to simulation input
  const simulationInput = mapTeamsToSimulationInput(teams, weekend);
  
  // Run qualifying simulation
  const qualiResults = await simulationEngine.runQualifying({
    trackId: weekend.track_id,
    teams: simulationInput,
    weatherMode: weekend.weather_mode,
    realismPreset: weekend.realism_preset
  });
  
  // Store qualifying results
  const grid = qualiResults.map((result, index) => ({
    position: index + 1,
    teamId: result.teamId,
    driverId: result.driverId,
    lapTime: result.lapTime,
    gap: result.gapToPole
  }));
  
  await supabase
    .from('quali_results')
    .insert({
      weekend_id: weekendId,
      grid: grid
    });
  
  // Update weekend status
  await supabase
    .from('weekends')
    .update({ status: 'quali_complete' })
    .eq('id', weekendId);
  
  // Broadcast qualifying results
  await supabase
    .channel(`weekend:${weekendId}`)
    .send({
      type: 'broadcast',
      event: 'quali_results',
      payload: { weekendId, grid }
    });
  
  return qualiResults;
}
```

#### `runRace`
Orchestrates race simulation.

```typescript
export async function runRace(
  weekendId: string,
  supabase: SupabaseClient,
  simulationEngine: SimulationEngine
) {
  // Get weekend details and qualifying results
  const { data: weekend } = await supabase
    .from('weekends')
    .select(`
      *,
      quali_results(*)
    `)
    .eq('id', weekendId)
    .single();
  
  if (!weekend || weekend.status !== 'quali_complete') {
    throw new Error('Invalid weekend status for race');
  }
  
  // Get all teams with race plans
  const { data: teams } = await supabase
    .from('teams')
    .select(`
      *,
      drivers(*),
      car_parts(*),
      plans_race(*)
    `)
    .eq('championship_id', weekend.championship_id);
  
  // Map to simulation input with grid positions
  const simulationInput = mapTeamsToRaceSimulationInput(teams, weekend);
  
  // Run race simulation
  const raceResults = await simulationEngine.runRace({
    trackId: weekend.track_id,
    grid: weekend.quali_results.grid,
    teams: simulationInput,
    weatherMode: weekend.weather_mode,
    realismPreset: weekend.realism_preset,
    speedMultiplier: weekend.speed_multiplier
  });
  
  // Store race results
  await supabase
    .from('race_results')
    .insert({
      weekend_id: weekendId,
      classification: raceResults.classification,
      lap_summary: raceResults.lapSummary,
      incidents: raceResults.incidents,
      points_awarded: raceResults.points
    });
  
  // Update weekend status
  await supabase
    .from('weekends')
    .update({ status: 'race_complete' })
    .eq('id', weekendId);
  
  // Update standings
  await updateChampionshipStandings(weekend.championship_id, supabase);
  
  // Broadcast race results
  await supabase
    .channel(`weekend:${weekendId}`)
    .send({
      type: 'broadcast',
      event: 'race_results',
      payload: { weekendId, results: raceResults }
    });
  
  return raceResults;
}
```

## 4. Frontend Architecture

### Route Structure

```typescript
// src/routes/index.tsx
export const routes = [
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/championships', element: <ChampionshipsPage /> },
  { path: '/championships/new', element: <CreateChampionshipPage /> },
  { path: '/championships/:id', element: <ChampionshipPage /> },
  { path: '/championships/:id/schedule', element: <SchedulePage /> },
  { path: '/championships/:id/standings', element: <StandingsPage /> },
  { path: '/team', element: <TeamManagementPage /> },
  { path: '/team/drivers', element: <DriversPage /> },
  { path: '/team/facilities', element: <FacilitiesPage /> },
  { path: '/team/development', element: <DevelopmentPage /> },
  { path: '/weekends/:id', element: <WeekendPage /> },
  { path: '/weekends/:id/practice', element: <PracticeSetupPage /> },
  { path: '/weekends/:id/qualifying', element: <QualifyingSetupPage /> },
  { path: '/weekends/:id/race', element: <RaceSetupPage /> },
  { path: '/weekends/:id/results', element: <ResultsPage /> }
];
```

### Key Components

#### Championship Management
```typescript
// src/components/ChampionshipCard.tsx
interface ChampionshipCardProps {
  championship: Championship;
  userRole: 'host' | 'developer' | 'player';
}

export function ChampionshipCard({ championship, userRole }: ChampionshipCardProps) {
  const canCreateWeekend = userRole === 'host' || userRole === 'developer';
  
  return (
    <div className="card">
      <h3>{championship.name}</h3>
      <p>Status: {championship.status}</p>
      <p>Created: {new Date(championship.created_at).toLocaleDateString()}</p>
      
      {canCreateWeekend && (
        <button onClick={() => navigate(`/championships/${championship.id}/schedule/new`)}>
          Schedule Weekend
        </button>
      )}
      
      <button onClick={() => navigate(`/championships/${championship.id}`)}>
        View Details
      </button>
    </div>
  );
}
```

#### Weekend Schedule Component
```typescript
// src/components/WeekendSchedule.tsx
interface WeekendScheduleProps {
  championshipId: string;
}

export function WeekendSchedule({ championshipId }: WeekendScheduleProps) {
  const { data: weekends } = useWeekends(championshipId);
  const user = useUser();
  const userRole = useUserRole(championshipId, user?.id);
  
  // Subscribe to weekend updates
  useEffect(() => {
    const channel = supabase
      .channel(`weekends:${championshipId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekends' }, payload => {
        // Refresh weekends data
        refetchWeekends();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [championshipId]);
  
  return (
    <div className="schedule">
      {weekends?.map(weekend => (
        <WeekendCard 
          key={weekend.id} 
          weekend={weekend} 
          userRole={userRole}
        />
      ))}
    </div>
  );
}
```

#### Team Management Dashboard
```typescript
// src/components/TeamDashboard.tsx
export function TeamDashboard() {
  const { data: team } = useTeam();
  const { data: drivers } = useDrivers();
  const { data: facilities } = useFacilities();
  const { data: rdProjects } = useRdProjects();
  const { data: trainingPlans } = useTrainingPlans();
  
  return (
    <div className="dashboard">
      <section className="budget">
        <h2>Team Budget</h2>
        <p>${team?.budget?.toLocaleString()}</p>
      </section>
      
      <section className="drivers">
        <h2>Drivers</h2>
        {drivers?.map(driver => (
          <DriverCard key={driver.id} driver={driver} />
        ))}
      </section>
      
      <section className="facilities">
        <h2>Facilities</h2>
        <FacilitiesGrid facilities={facilities} />
      </section>
      
      <section className="development">
        <h2>Active Development</h2>
        <DevelopmentQueue 
          rdProjects={rdProjects} 
          trainingPlans={trainingPlans} 
        />
      </section>
    </div>
  );
}
```

## 5. Data Flow

### Race Weekend Lifecycle

```
1. Host Creates Weekend
   ↓
   Edge Function: createWeekend()
   - Validates 24h advance rule
   - Validates 24h gap from previous
   - Creates weekend record
   - Schedules Edge Function calls
   ↓
2. Players Submit Plans
   ↓
   Frontend: Practice/Quali/Race Setup Pages
   - Players choose presets
   - Plans stored in DB with RLS
   ↓
3. Practice Session
   ↓
   Scheduled Edge Function: runPractice()
   - Fetches team states and plans
   - Maps to simulation input
   - Runs simulation
   - Updates driver adaptation
   - Broadcasts results
   ↓
4. Qualifying Session
   ↓
   Scheduled Edge Function: runQuali()
   - Includes practice effects
   - Runs qualifying simulation
   - Stores grid positions
   - Broadcasts results
   ↓
5. Race Session
   ↓
   Scheduled Edge Function: runRace()
   - Uses qualifying grid
   - Applies strategy plans
   - Runs race simulation
   - Stores full results
   - Updates standings
   - Broadcasts completion
```

### State Mapping Functions

```typescript
// Map database team state to simulation input
function mapTeamsToSimulationInput(teams: any[], weekend: any): SimulationTeamInput[] {
  return teams.map(team => {
    const practicePlan = team.plans_practice?.[0];
    const qualiPlan = team.plans_quali?.[0];
    const racePlan = team.plans_race?.[0];
    
    return {
      teamId: team.id,
      drivers: team.drivers.map(driver => ({
        id: driver.id,
        name: driver.name,
        skills: driver.skills,
        morale: driver.morale,
        trackAdaptation: driver.adaptation_by_track[weekend.track_id] || 0
      })),
      carParts: team.car_parts.filter(part => part.installed),
      practicePreset: practicePlan?.preset || getDefaultPracticePreset(),
      qualiPreset: qualiPlan?.preset || getDefaultQualiPreset(),
      raceStrategy: racePlan?.preset || getDefaultRaceStrategy()
    };
  });
}

// Map simulation results to database updates
function mapSimulationResultsToDbUpdates(results: any[]): DbUpdate[] {
  return results.map(result => ({
    table: 'drivers',
    id: result.driverId,
    updates: {
      morale: Math.max(0, Math.min(100, result.morale + result.moraleDelta)),
      skills: result.skillImprovements
    }
  }));
}
```

### Real-time Updates

```typescript
// Weekend status subscription
const weekendSubscription = supabase
  .channel(`weekend:${weekendId}`)
  .on('broadcast', { event: 'practice_complete' }, payload => {
    // Update UI to show practice results
    refetchPracticeResults();
  })
  .on('broadcast', { event: 'quali_results' }, payload => {
    // Update UI with grid positions
    setGridPositions(payload.grid);
  })
  .on('broadcast', { event: 'race_results' }, payload => {
    // Update UI with race results
    setRaceResults(payload.results);
    navigate(`/weekends/${weekendId}/results`);
  })
  .subscribe();

// Standings updates
const standingsSubscription = supabase
  .channel(`standings:${championshipId}`)
  .on('postgres_changes', { event: 'UPDATE', table: 'standings' }, payload => {
    // Update standings display
    setStandings(payload.new.snapshot);
  })
  .subscribe();
```

This architecture provides a robust foundation for the Team Construction Championship system, with clear separation between the persistent game state (Supabase) and the ephemeral simulation engine, orchestrated through Supabase Edge Functions for reliable and scalable execution.