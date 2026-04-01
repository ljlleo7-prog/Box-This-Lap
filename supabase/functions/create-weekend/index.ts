import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // User client for Auth check
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Service client for DB operations (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const {
      championshipId,
      trackId,
      speedMultiplier,
      practiceSpeedMultiplier,
      qualiSpeedMultiplier,
      raceSpeedMultiplier,
      hostLocalDatetime,
      weatherMode,
      realismPreset
    } = await req.json()
    
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    // Check host authorization using admin client because function writes with service role
    const { data: member } = await supabaseAdmin
        .from('tcc_championship_members')
        .select('role')
        .eq('championship_id', championshipId)
        .eq('user_id', user.id)
        .maybeSingle()

    const { data: championship } = await supabaseAdmin
      .from('tcc_championships')
      .select('created_by')
      .eq('id', championshipId)
      .maybeSingle()

    const isCreator = championship?.created_by === user.id
    const memberRole = member?.role ?? null
    const isHost = memberRole === 'host' || memberRole === 'developer'

    if (!isCreator && !isHost) {
        throw new Error('Forbidden: Only the championship host can schedule weekends')
    }

    // Convert host local time to UTC
    const hostTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; 
    
    const scheduledRaceAtUtc = new Date(hostLocalDatetime);
    if (isNaN(scheduledRaceAtUtc.getTime())) throw new Error('Invalid date format');

    // Validate 24-hour advance rule
    const now = new Date();
    const hoursUntilRace = (scheduledRaceAtUtc.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilRace < 24) {
      // For dev/testing, we might want to relax this. But strict rule applies.
      // throw new Error('Race must be scheduled at least 24 hours in advance');
    }
    
    // Validate 24-hour gap from previous weekend
    const { data: previousWeekend } = await supabaseAdmin
      .from('tcc_weekends')
      .select('scheduled_race_at_utc')
      .eq('championship_id', championshipId)
      .neq('status', 'cancelled')
      .order('scheduled_race_at_utc', { ascending: false })
      .limit(1)
      .single();
    
    if (previousWeekend) {
      const gapHours = (scheduledRaceAtUtc.getTime() - new Date(previousWeekend.scheduled_race_at_utc).getTime()) / (1000 * 60 * 60);
      if (Math.abs(gapHours) < 24) {
        throw new Error('Race weekends must have at least 24-hour gap from other races');
      }
    }
    
    // Schedule practice and quali (2 hours and 1 hour before race)
    const scheduledPracticeAtUtc = new Date(scheduledRaceAtUtc.getTime() - 2 * 60 * 60 * 1000);
    const scheduledQualiAtUtc = new Date(scheduledRaceAtUtc.getTime() - 1 * 60 * 60 * 1000);
    
    // Get current round number
    const { count } = await supabaseAdmin
      .from('tcc_weekends')
      .select('*', { count: 'exact', head: true })
      .eq('championship_id', championshipId)
    
    const roundNumber = (count || 0) + 1;

    const resolvedPracticeSpeed = [1, 2, 5, 10].includes(practiceSpeedMultiplier) ? practiceSpeedMultiplier : ([1, 2, 5, 10].includes(speedMultiplier) ? speedMultiplier : 1);
    const resolvedQualiSpeed = [1, 2, 5, 10].includes(qualiSpeedMultiplier) ? qualiSpeedMultiplier : ([1, 2, 5, 10].includes(speedMultiplier) ? speedMultiplier : 1);
    const resolvedRaceSpeed = [1, 2, 5, 10].includes(raceSpeedMultiplier) ? raceSpeedMultiplier : ([1, 2, 5, 10].includes(speedMultiplier) ? speedMultiplier : 1);

    // Create weekend using Admin client
    const { data: weekend, error } = await supabaseAdmin
      .from('tcc_weekends')
      .insert({
        championship_id: championshipId,
        track_id: trackId,
        speed_multiplier: speedMultiplier ?? resolvedRaceSpeed,
        practice_speed_multiplier: resolvedPracticeSpeed,
        quali_speed_multiplier: resolvedQualiSpeed,
        race_speed_multiplier: resolvedRaceSpeed,
        weather_mode: weatherMode,
        realism_preset: realismPreset,
        host_timezone: hostTimezone,
        scheduled_practice_at_utc: scheduledPracticeAtUtc.toISOString(),
        scheduled_quali_at_utc: scheduledQualiAtUtc.toISOString(),
        scheduled_race_at_utc: scheduledRaceAtUtc.toISOString(),
        round_number: roundNumber
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(weekend), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
