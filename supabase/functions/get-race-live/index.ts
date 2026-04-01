import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from "../_shared/cors.ts"
import { createAdminClient, LIVE_SYNC_SESSION_TIMEOUT_MS, loadWeekendContext, requireUser, selectAuthority } from "../_shared/liveRace.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const user = await requireUser(req)
    const supabaseAdmin = createAdminClient(req)
    const { weekendId, sessionType = 'race' } = await req.json()

    if (!weekendId) {
      throw new Error('weekendId is required')
    }

    if (sessionType !== 'race') {
      throw new Error('Unsupported session type')
    }

    const context = await loadWeekendContext(supabaseAdmin, weekendId, user.id)
    const nowMs = Date.now()

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('tcc_live_snapshot_current')
      .select('weekend_id, session_type, authority_user_id, authority_role, revision, sim_time, race_state, source_updated_at, updated_at')
      .eq('weekend_id', weekendId)
      .eq('session_type', sessionType)
      .maybeSingle()

    if (snapshotError) throw snapshotError

    const { data: presenceRows, error: presenceError } = await supabaseAdmin
      .from('tcc_live_presence')
      .select('weekend_id, session_type, user_id, team_id, is_running, last_seen_at, streak_started_at, updated_at')
      .eq('weekend_id', weekendId)
      .eq('session_type', sessionType)

    if (presenceError) throw presenceError

    const authority = selectAuthority(presenceRows ?? [], context.championship?.created_by ?? null, nowMs)
    const snapshotFresh = snapshot
      ? nowMs - new Date(snapshot.updated_at).getTime() <= LIVE_SYNC_SESSION_TIMEOUT_MS
      : false

    return new Response(JSON.stringify({
      weekendId,
      sessionType,
      authorityUserId: authority.authorityUserId,
      authorityRole: authority.authorityRole,
      authorityTeamId: authority.authorityTeamId,
      isRequesterAuthority: authority.authorityUserId === user.id,
      snapshot: snapshot ? {
        ...snapshot,
        isFresh: snapshotFresh,
      } : null,
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
