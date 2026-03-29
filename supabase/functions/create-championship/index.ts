import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { TEAM_TEMPLATES } from "../_shared/data/teams.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { name } = await req.json()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    // Create championship
    const { data: championship, error: champError } = await supabase
      .from('tcc_championships')
      .insert({ name, created_by: user.id })
      .select()
      .single()

    if (champError) throw champError

    // Add creator as host
    const { error: memberError } = await supabase
      .from('tcc_championship_members')
      .insert({
        championship_id: championship.id,
        user_id: user.id,
        role: 'host'
      })

    if (memberError) throw memberError

    // Initialize Teams and Drivers from Templates
    for (const template of TEAM_TEMPLATES) {
      // Create Team
      const { data: team, error: teamError } = await supabase
        .from('tcc_teams')
        .insert({
          championship_id: championship.id,
          name: template.name,
          color: template.color,
          budget: template.budget,
          reputation: template.reputation,
          token_cost: template.tokenCost,
          performance: template.performance,
          specs: template.specs
        })
        .select()
        .single()

      if (teamError) {
        console.error(`Failed to create team ${template.name}:`, teamError)
        continue
      }

      // Create Drivers for this Team
      if (template.drivers && template.drivers.length > 0) {
        const driversPayload = template.drivers.map(d => {
          const perf = d.performance;
          const pace = Math.round(
            (perf.corneringHigh + perf.corneringMedium + perf.corneringLow + perf.straight) / 4
          );
          return {
            team_id: team.id,
            name: d.name,
            skills: {
              pace,
              consistency: d.skill.consistency,
              tire_management: d.skill.tyreManagement,
              ers_efficiency: 80,
              racecraft: d.skill.racecraft,
              wet_skill: d.skill.wetWeather
            },
            morale: d.morale,
            adaptation_by_track: {}
          };
        })

        const { error: driverError } = await supabase
          .from('tcc_drivers')
          .insert(driversPayload)
        
        if (driverError) {
          console.error(`Failed to create drivers for ${template.name}:`, driverError)
        }
      }
    }

    return new Response(
      JSON.stringify(championship),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
