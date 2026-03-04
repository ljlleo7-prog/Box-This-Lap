import { SimulationTeamInput, Driver, CarPart, StrategyPlan, TyreCompound, RaceStrategyMode } from './types/index.ts';

export function mapTeamsToSimulationInput(teams: any[], weekend: any): SimulationTeamInput[] {
    return teams.map(team => {
        // Parse plans (handle defaults if missing)
        const practicePlan = team.tcc_plans_practice?.[0]?.preset || {};
        const qualiPlan = team.tcc_plans_quali?.[0]?.preset || {};
        const racePlan = team.tcc_plans_race?.[0]?.preset || {};

        // Map drivers
        const drivers = team.tcc_drivers.map((d: any) => ({
            id: d.id,
            name: d.name,
            skills: d.skills,
            morale: d.morale,
            // Adaptation is stored as JSONB map by trackId
            trackAdaptation: d.adaptation_by_track?.[weekend.track_id] || 0
        }));

        // Map car parts (installed ones)
        const carParts = team.tcc_car_parts
            .filter((p: any) => p.installed)
            .map((p: any) => ({
                id: p.id,
                category: p.category,
                stats: p.perf_stats,
                reliability: p.reliability
            }));

        return {
            teamId: team.id,
            drivers,
            carParts,
            // Defaults should be handled by the engine if these are empty/partial
            practicePreset: practicePlan,
            qualiPreset: qualiPlan,
            raceStrategy: racePlan
        };
    });
}
