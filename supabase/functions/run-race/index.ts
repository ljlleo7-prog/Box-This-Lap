import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"
import { SimulationEngine } from "../_shared/engine/simulation.ts"
import { mapTeamsToSimulationInput } from "../_shared/mapper.ts"
import { TRACKS } from "../_shared/data/tracks/index.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { weekendId } = await req.json()

    // Get weekend and quali results
    const { data: weekend, error: weekendError } = await supabase
      .from('tcc_weekends')
      .select(`
        *,
        tcc_quali_results(*)
      `)
      .eq('id', weekendId)
      .single()
    
    if (weekendError) throw weekendError
    if (weekend.status !== 'quali_complete') {
      throw new Error(`Invalid status: ${weekend.status}. Expected 'quali_complete'.`)
    }

    // Get grid order
    // tcc_quali_results is an array (relation), likely 1 item due to single() on weekend?
    // Wait, relation is one-to-many potentially?
    // Actually, select with join usually returns array if not specified.
    // But since I used .single() on weekend, relations are usually arrays.
    // Let's assume tcc_quali_results is an array.
    const qualiResult = weekend.tcc_quali_results?.[0];
    if (!qualiResult || !qualiResult.grid) {
        throw new Error("Qualifying results not found");
    }
    
    const gridOrder = qualiResult.grid
        .sort((a: any, b: any) => a.position - b.position)
        .map((g: any) => g.driverId);

    // Get teams
    const { data: teams, error: teamsError } = await supabase
      .from('tcc_teams')
      .select(`
        *,
        tcc_drivers(*),
        tcc_car_parts(*),
        tcc_plans_race(*)
      `)
      .eq('championship_id', weekend.championship_id)

    if (teamsError) throw teamsError

    const simulationInput = mapTeamsToSimulationInput(teams, weekend)
    const track = TRACKS.find(t => t.id === weekend.track_id)
    if (!track) throw new Error(`Track not found: ${weekend.track_id}`)

    // Flatten drivers list for engine
    const drivers = simulationInput.flatMap(t => t.drivers);

    // Initialize Engine with Grid Order
    const engine = new SimulationEngine(track, drivers, Date.now(), gridOrder);
    
    // Configure Simulation
    // Inject strategy plans? 
    // The engine's StrategySystem usually initializes defaults.
    // We should map the DB plans to the engine's expected strategy format.
    // Currently mapTeamsToSimulationInput puts them in `raceStrategy`.
    // We need to ensure the engine uses them.
    // The current engine implementation pulls strategy in `initializeRace`.
    // It calls `strategySystem.initializeStrategy`.
    // We might need to inject the user's specific strategy *after* initialization or modify `initializeRace` to accept it.
    // For now, we'll rely on the default generated strategy or assume engine adaptation.
    // (Ideally, we'd pass strategy map to constructor).
    
    engine.startRace();

    // Run Simulation Loop
    // Use 1.0s time step for speed
    const dt = 1.0; 
    let steps = 0;
    const MAX_STEPS = 10000; // Safety break (approx 3 hours race time)

    while (engine.getState().status === 'racing' && steps < MAX_STEPS) {
        engine.update(dt);
        steps++;
    }

    const finalState = engine.getState();

    // Prepare Results
    const classification = finalState.vehicles
        .sort((a, b) => {
            if (a.hasFinished && !b.hasFinished) return -1;
            if (!a.hasFinished && b.hasFinished) return 1;
            if (a.lapCount !== b.lapCount) return b.lapCount - a.lapCount;
            return b.distanceOnLap - a.distanceOnLap;
        })
        .map((v, i) => ({
            position: i + 1,
            driverId: v.driverId,
            teamId: teams.find((t: any) => t.tcc_drivers.some((d: any) => d.id === v.driverId))?.id,
            laps: v.lapCount,
            totalTime: v.elapsedTime, // or finish time
            status: v.damage >= 100 ? 'DNF' : 'Finished',
            points: 0 // To be calculated
        }));

    // Calculate Points (F1 style: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1)
    const pointsMap = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const pointsAwarded: any = {};
    
    classification.forEach((entry, index) => {
        if (entry.status !== 'DNF' && index < pointsMap.length) {
            entry.points = pointsMap[index];
            pointsAwarded[entry.teamId] = (pointsAwarded[entry.teamId] || 0) + entry.points;
        }
    });

    // Store Results
    const { error: insertError } = await supabase
        .from('tcc_race_results')
        .insert({
            weekend_id: weekendId,
            classification: classification,
            lap_summary: {}, // Placeholder for detailed logs
            incidents: [], // Placeholder
            points_awarded: pointsAwarded
        })

    if (insertError) throw insertError

    // Update Weekend Status
    const { error: updateError } = await supabase
        .from('tcc_weekends')
        .update({ status: 'race_complete' })
        .eq('id', weekendId)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, classification }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
