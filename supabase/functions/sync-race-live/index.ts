import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from "../_shared/cors.ts"
import { computeNextStreakStartedAt, createAdminClient, LIVE_SYNC_SESSION_TIMEOUT_MS, loadWeekendContext, requireUser, selectAuthority } from "../_shared/liveRace.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const user = await requireUser(req)
    const supabaseAdmin = createAdminClient(req)
    const {
      weekendId,
      sessionType = 'race',
      teamId = null,
      isRunning = false,
      simTime = null,
      raceState = null,
    } = await req.json()

    if (!weekendId) {
      throw new Error('weekendId is required')
    }

    if (sessionType !== 'race') {
      throw new Error('Unsupported session type')
    }

    const context = await loadWeekendContext(supabaseAdmin, weekendId, user.id, teamId)
    const nowIso = new Date().toISOString()
    const nowMs = Date.now()

    const { data: existingPresence, error: existingPresenceError } = await supabaseAdmin
      .from('tcc_live_presence')
      .select('weekend_id, session_type, user_id, team_id, is_running, last_seen_at, streak_started_at, updated_at')
      .eq('weekend_id', weekendId)
      .eq('session_type', sessionType)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingPresenceError) throw existingPresenceError

    const streakStartedAt = computeNextStreakStartedAt(existingPresence, Boolean(isRunning), nowIso, nowMs)

    const { error: upsertPresenceError } = await supabaseAdmin
      .from('tcc_live_presence')
      .upsert({
        weekend_id: weekendId,
        session_type: sessionType,
        user_id: user.id,
        team_id: context.normalizedTeamId,
        is_running: Boolean(isRunning),
        last_seen_at: nowIso,
        streak_started_at: streakStartedAt,
        updated_at: nowIso,
      }, {
        onConflict: 'weekend_id,session_type,user_id'
      })

    if (upsertPresenceError) throw upsertPresenceError

    const { data: presenceRows, error: presenceError } = await supabaseAdmin
      .from('tcc_live_presence')
      .select('weekend_id, session_type, user_id, team_id, is_running, last_seen_at, streak_started_at, updated_at')
      .eq('weekend_id', weekendId)
      .eq('session_type', sessionType)

    if (presenceError) throw presenceError

    const authority = selectAuthority(presenceRows ?? [], context.championship?.created_by ?? null, nowMs)

    const { data: currentSnapshot, error: currentSnapshotError } = await supabaseAdmin
      .from('tcc_live_snapshot_current')
      .select('weekend_id, session_type, authority_user_id, authority_role, revision, sim_time, race_state, source_updated_at, updated_at')
      .eq('weekend_id', weekendId)
      .eq('session_type', sessionType)
      .maybeSingle()

    if (currentSnapshotError) throw currentSnapshotError

    let snapshot = currentSnapshot
    const canWriteSnapshot = authority.authorityUserId === user.id && Boolean(isRunning) && raceState && typeof simTime === 'number'

    if (canWriteSnapshot) {
      const nextRevision = (currentSnapshot?.revision ?? 0) + 1
      const snapshotPayload = {
        weekend_id: weekendId,
        session_type: sessionType,
        authority_user_id: user.id,
        authority_role: authority.authorityRole,
        revision: nextRevision,
        sim_time: simTime,
        race_state: raceState,
        source_updated_at: nowIso,
        updated_at: nowIso,
      }

      const { data: savedSnapshot, error: savedSnapshotError } = await supabaseAdmin
        .from('tcc_live_snapshot_current')
        .upsert(snapshotPayload, {
          onConflict: 'weekend_id,session_type'
        })
        .select('weekend_id, session_type, authority_user_id, authority_role, revision, sim_time, race_state, source_updated_at, updated_at')
        .single()

      if (savedSnapshotError) throw savedSnapshotError
      snapshot = savedSnapshot
    }

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
