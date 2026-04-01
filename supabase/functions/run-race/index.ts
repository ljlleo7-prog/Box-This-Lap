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

    const qualiResult = weekend.tcc_quali_results?.[0];
    if (!qualiResult || !qualiResult.grid) {
        throw new Error("Qualifying results not found");
    }
    
    const gridOrder = qualiResult.grid
        .sort((a: any, b: any) => a.position - b.position)
        .map((g: any) => g.driverId);

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

    const drivers = simulationInput.flatMap(t => t.drivers);

    const engine = new SimulationEngine(track, drivers, Date.now(), gridOrder);
    engine.startRace();

    const dt = 1.0; 
    let steps = 0;
    const MAX_STEPS = 10000;

    while (engine.getState().status === 'racing' && steps < MAX_STEPS) {
        engine.update(dt);
        steps++;
    }

    const finalState = engine.getState();
    const { data: economyConfig } = await supabase
      .from('tcc_economy_config')
      .select('disable_rewards')
      .eq('championship_id', weekend.championship_id)
      .maybeSingle();

    const rewardsDisabled = !!economyConfig?.disable_rewards;
    const cashRewardMap = [2500000, 1800000, 1500000, 1200000, 1000000, 800000, 600000, 400000, 250000, 150000];

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
            totalTime: v.elapsedTime,
            status: v.damage >= 100 ? 'DNF' : 'Finished',
            points: 0,
            cashReward: 0
        }));

    const pointsMap = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const pointsAwarded: any = {};
    const teamCashRewards: Record<string, number> = {};
    
    classification.forEach((entry, index) => {
        if (!rewardsDisabled && entry.status !== 'DNF' && index < cashRewardMap.length) {
            entry.cashReward = cashRewardMap[index];
            teamCashRewards[entry.teamId] = (teamCashRewards[entry.teamId] || 0) + entry.cashReward;
        }
        if (!rewardsDisabled && entry.status !== 'DNF') {
            teamCashRewards[entry.teamId] = (teamCashRewards[entry.teamId] || 0) + 100000;
        }
        if (entry.status !== 'DNF' && index < pointsMap.length) {
            entry.points = pointsMap[index];
            pointsAwarded[entry.teamId] = (pointsAwarded[entry.teamId] || 0) + entry.points;
        }
    });

    const fastestLap = finalState.vehicles
      .filter(v => Number.isFinite(v.bestLapTime) && v.bestLapTime > 0)
      .sort((a, b) => a.bestLapTime - b.bestLapTime)[0];

    if (!rewardsDisabled && fastestLap) {
      const fastestLapEntry = classification.find((entry: any) => entry.driverId === fastestLap.driverId);
      if (fastestLapEntry?.teamId) {
        fastestLapEntry.cashReward = (fastestLapEntry.cashReward || 0) + 200000;
        teamCashRewards[fastestLapEntry.teamId] = (teamCashRewards[fastestLapEntry.teamId] || 0) + 200000;
      }
    }

    const { error: insertError } = await supabase
        .from('tcc_race_results')
        .insert({
            weekend_id: weekendId,
            classification: classification,
            lap_summary: {},
            incidents: [],
            points_awarded: pointsAwarded
        })

    if (insertError) throw insertError

    const { error: updateError } = await supabase
        .from('tcc_weekends')
        .update({ status: 'race_complete' })
        .eq('id', weekendId)

    if (updateError) throw updateError

    if (!rewardsDisabled) {
      for (const team of teams) {
        if (!team.owner_id) continue
        const cashAmount = Math.round(teamCashRewards[team.id] || 0)
        if (cashAmount <= 0) continue
        await supabase.rpc('tcc_reward_cash', {
          p_championship_id: weekend.championship_id,
          p_user_id: team.owner_id,
          p_cash_amount: cashAmount,
          p_reason: 'race_position',
          p_metadata: {
            weekend_id: weekendId,
            round_number: weekend.round_number,
            team_id: team.id
          }
        })
      }
    }

    const { count: totalRounds } = await supabase
      .from('tcc_weekends')
      .select('*', { count: 'exact', head: true })
      .eq('championship_id', weekend.championship_id)
      .neq('status', 'cancelled')

    const { count: completedRounds } = await supabase
      .from('tcc_weekends')
      .select('*', { count: 'exact', head: true })
      .eq('championship_id', weekend.championship_id)
      .eq('status', 'race_complete')

    let seasonAward: any = null
    if (!rewardsDisabled && (totalRounds || 0) > 0 && totalRounds === completedRounds) {
      const { data: seasonAwardData, error: seasonAwardError } = await supabase.rpc('tcc_award_season_tokens', {
        p_championship_id: weekend.championship_id
      })
      if (!seasonAwardError) {
        seasonAward = seasonAwardData
      }
      await supabase
        .from('tcc_championships')
        .update({ status: 'completed' })
        .eq('id', weekend.championship_id)
    }

    return new Response(JSON.stringify({ success: true, classification, teamCashRewards, seasonAward, rewardsDisabled }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
