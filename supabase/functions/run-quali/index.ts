import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"
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

    // Get weekend details
    const { data: weekend, error: weekendError } = await supabase
      .from('tcc_weekends')
      .select('*')
      .eq('id', weekendId)
      .single()
    
    if (weekendError) throw weekendError
    
    // Allow if practice_complete OR scheduled (if simplified flow)
    if (!['practice_complete', 'scheduled'].includes(weekend.status)) {
      throw new Error(`Invalid status: ${weekend.status}.`)
    }

    // Get all teams
    const { data: teams, error: teamsError } = await supabase
      .from('tcc_teams')
      .select(`
        *,
        tcc_drivers(*),
        tcc_car_parts(*),
        tcc_plans_quali(*)
      `)
      .eq('championship_id', weekend.championship_id)

    if (teamsError) throw teamsError

    const simulationInput = mapTeamsToSimulationInput(teams, weekend)
    const track = TRACKS.find(t => t.id === weekend.track_id)
    if (!track) throw new Error(`Track not found: ${weekend.track_id}`)

    // Run Qualifying Simulation
    // We calculate a lap time for each driver
    const qualiResults = simulationInput.flatMap(team => {
        return team.drivers.map(driver => {
            // 1. Base Pace (Lower is better)
            // Approx 80-100s range usually.
            // Let's assume driver skills are 0-100.
            // Pace 100 = -1.0s, Pace 0 = +1.0s
            const paceSkillEffect = (driver.skills.pace - 50) * -0.02; 
            
            // 2. Car Performance
            // Sum of parts stats
            const carPerf = team.carParts.reduce((acc, part) => {
                // Simple sum of relevant stats
                // Assuming part.stats has 'drag', 'downforce' etc.
                // Simplified: parts have a 'performance' value or similar
                // We'll assume part.stats is a JSON object with keys.
                // For now, let's just use version as a proxy if stats are complex
                // or assume stats has a 'pace_bonus'
                return acc + (part.stats?.pace_bonus || 0); 
            }, 0);
            
            // 3. Track Adaptation (0-1.0)
            const adaptationBonus = (driver.trackAdaptation || 0) * -0.5; // Up to 0.5s gain
            
            // 4. Morale (0-100)
            const moraleEffect = (driver.morale - 50) * -0.005; // +/- 0.25s
            
            // 5. Randomness (Consistency)
            const consistency = driver.skills.consistency;
            const variance = (100 - consistency) * 0.01; // 0.0 to 1.0s variance
            const rng = (Math.random() * variance * 2) - variance; // +/- variance
            
            // Base Track Time (e.g. 90s)
            // We don't have a specific "base lap time" in track data usually, 
            // but we can estimate from track length.
            // 5km track ~ 90s.
            const baseLapTime = (track.totalDistance / 5000) * 90;
            
            const finalLapTime = baseLapTime + paceSkillEffect - carPerf + adaptationBonus + moraleEffect + rng;
            
            return {
                teamId: team.teamId,
                driverId: driver.id,
                driverName: driver.name,
                lapTime: finalLapTime
            };
        });
    }).sort((a, b) => a.lapTime - b.lapTime);

    // Create Grid
    const grid = qualiResults.map((result, index) => ({
        position: index + 1,
        teamId: result.teamId,
        driverId: result.driverId,
        lapTime: result.lapTime,
        gapToPole: result.lapTime - qualiResults[0].lapTime
    }));

    // Store Results
    const { error: insertError } = await supabase
        .from('tcc_quali_results')
        .insert({
            weekend_id: weekendId,
            grid: grid
        })

    if (insertError) throw insertError

    // Update Weekend Status
    const { error: updateError } = await supabase
        .from('tcc_weekends')
        .update({ status: 'quali_complete' })
        .eq('id', weekendId)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, grid }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
