-- Team Construction Championship (TCC) Tables
-- Uses 'tcc_' prefix to avoid conflicts with existing tables

-- Players/Profiles specific to TCC (links to auth.users)
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

CREATE POLICY "Users can insert their own player profile" ON tcc_players
    FOR INSERT WITH CHECK (auth.uid() = id);

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

CREATE POLICY "Players can update their team data" ON tcc_teams
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Players can manage their drivers" ON tcc_drivers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_drivers.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their facilities" ON tcc_facilities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_facilities.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their car parts" ON tcc_car_parts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_car_parts.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their R&D projects" ON tcc_rd_projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_rd_projects.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can manage their training plans" ON tcc_training_plans
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_drivers 
            JOIN tcc_teams ON tcc_teams.id = tcc_drivers.team_id 
            WHERE tcc_drivers.id = tcc_training_plans.driver_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can submit practice plans" ON tcc_plans_practice
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_plans_practice.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can submit quali plans" ON tcc_plans_quali
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_plans_quali.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Players can submit race plans" ON tcc_plans_race
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_teams 
            WHERE tcc_teams.id = tcc_plans_race.team_id 
            AND tcc_teams.owner_id = auth.uid()
        )
    );

CREATE POLICY "Public can view results" ON tcc_quali_results
    FOR SELECT USING (true);

CREATE POLICY "Public can view results" ON tcc_race_results
    FOR SELECT USING (true);

CREATE POLICY "Public can view standings" ON tcc_standings
    FOR SELECT USING (true);
