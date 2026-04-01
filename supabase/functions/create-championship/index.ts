import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"
import { TEAM_TEMPLATES } from "../_shared/data/teams.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { name } = await req.json()

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Championship name is required')
    }

    const championshipName = name.trim()

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { error: profileError } = await supabaseAdmin
      .from('tcc_players')
      .upsert({
        id: user.id,
        username: user.user_metadata?.username ?? user.email ?? 'Player'
      }, {
        onConflict: 'id'
      })

    if (profileError) throw profileError

    const { data: championship, error: champError } = await supabaseAdmin
      .from('tcc_championships')
      .insert({ name: championshipName, created_by: user.id })
      .select()
      .single()

    if (champError) throw champError

    const { error: memberError } = await supabaseAdmin
      .from('tcc_championship_members')
      .insert({
        championship_id: championship.id,
        user_id: user.id,
        role: 'host'
      })

    if (memberError) throw memberError

    const { error: economyError } = await supabaseAdmin
      .from('tcc_economy_config')
      .insert({
        championship_id: championship.id,
        base_token_cash_rate: 10000,
        seasonal_converted_cash_cap: 135000000,
        weekly_investment_cap_tkn: 1200,
        economy_mode: 'beta_calendar_budget',
        is_beta: true,
        disable_token_transactions: true,
        disable_token_pricing: true,
        disable_rewards: true,
        daily_budget_cash: 12000000,
        weekly_budget_cash: 50000000,
        budget_timezone: 'UTC'
      })

    if (economyError) throw economyError

    for (const template of TEAM_TEMPLATES) {
      const { data: team, error: teamError } = await supabaseAdmin
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

      if (teamError) throw new Error(`Failed to create team ${template.name}: ${teamError.message}`)

      const { error: facilityError } = await supabaseAdmin
        .from('tcc_facilities')
        .insert({
          team_id: team.id,
          levels: {
            factory: 1,
            aero: 1,
            powertrain: 1,
            simulator: 1,
            pit_crew: 1,
            logistics: 1,
          },
          upgrade_queue: []
        })

      if (facilityError) throw new Error(`Failed to create facilities for ${template.name}: ${facilityError.message}`)

      if (template.drivers && template.drivers.length > 0) {
        const driversPayload = template.drivers.map((d) => {
          const perf = d.performance
          const pace = Math.round(
            (perf.corneringHigh + perf.corneringMedium + perf.corneringLow + perf.straight) / 4
          )
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
          }
        })

        const { error: driverError } = await supabaseAdmin
          .from('tcc_drivers')
          .insert(driversPayload)

        if (driverError) throw new Error(`Failed to create drivers for ${template.name}: ${driverError.message}`)
      }
    }

    return new Response(
      JSON.stringify({ championship }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
