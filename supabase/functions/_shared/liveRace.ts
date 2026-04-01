import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export const LIVE_SYNC_SESSION_TIMEOUT_MS = 6000

export type LiveSessionType = 'race'

export interface LivePresenceRow {
  weekend_id: string
  session_type: LiveSessionType
  user_id: string
  team_id: string | null
  is_running: boolean
  last_seen_at: string
  streak_started_at: string | null
  updated_at: string
}

interface WeekendContext {
  weekend: {
    id: string
    championship_id: string
    status: string
  }
  championship: {
    created_by: string | null
  } | null
  memberRole: string | null
  isCreator: boolean
  normalizedTeamId: string | null
}

export interface AuthoritySelection {
  authorityUserId: string | null
  authorityRole: 'host' | 'participant'
  authorityTeamId: string | null
}

export function createUserClient(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )
}

export function createAdminClient(req: Request) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )
}

export async function requireUser(req: Request) {
  const supabaseClient = createUserClient(req)
  const {
    data: { user },
  } = await supabaseClient.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}

export async function loadWeekendContext(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  weekendId: string,
  userId: string,
  teamId?: string | null
): Promise<WeekendContext> {
  const { data: weekend, error: weekendError } = await supabaseAdmin
    .from('tcc_weekends')
    .select('id, championship_id, status')
    .eq('id', weekendId)
    .maybeSingle()

  if (weekendError) throw weekendError
  if (!weekend) throw new Error('Weekend not found')
  if (weekend.status !== 'quali_complete') {
    throw new Error(`Weekend is not ready for live race sync: ${weekend.status}`)
  }

  const { data: championship, error: championshipError } = await supabaseAdmin
    .from('tcc_championships')
    .select('created_by')
    .eq('id', weekend.championship_id)
    .maybeSingle()

  if (championshipError) throw championshipError

  const { data: member, error: memberError } = await supabaseAdmin
    .from('tcc_championship_members')
    .select('role')
    .eq('championship_id', weekend.championship_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError) throw memberError
  if (!member && championship?.created_by !== userId) {
    throw new Error('Forbidden: Not a championship member')
  }

  let normalizedTeamId: string | null = null
  if (teamId) {
    const { data: team, error: teamError } = await supabaseAdmin
      .from('tcc_teams')
      .select('id, owner_id, championship_id')
      .eq('id', teamId)
      .maybeSingle()

    if (teamError) throw teamError
    if (!team || team.championship_id !== weekend.championship_id) {
      throw new Error('Invalid team for this championship')
    }

    const isCreator = championship?.created_by === userId
    const isHostMember = member?.role === 'host'
    const isDeveloper = member?.role === 'developer'
    const ownsTeam = team.owner_id === userId

    if (!ownsTeam && !isCreator && !isHostMember && !isDeveloper) {
      throw new Error('Forbidden: Team does not belong to the current user')
    }

    normalizedTeamId = team.id
  }

  return {
    weekend,
    championship,
    memberRole: member?.role ?? null,
    isCreator: championship?.created_by === userId,
    normalizedTeamId,
  }
}

export function isPresenceFresh(lastSeenAt: string, nowMs: number) {
  return nowMs - new Date(lastSeenAt).getTime() <= LIVE_SYNC_SESSION_TIMEOUT_MS
}

export function computeNextStreakStartedAt(
  previousPresence: LivePresenceRow | null,
  isRunning: boolean,
  nowIso: string,
  nowMs: number,
) {
  if (!isRunning) {
    return null
  }

  if (
    previousPresence &&
    previousPresence.is_running &&
    isPresenceFresh(previousPresence.last_seen_at, nowMs)
  ) {
    return previousPresence.streak_started_at ?? previousPresence.last_seen_at ?? nowIso
  }

  return nowIso
}

export function selectAuthority(
  presenceRows: LivePresenceRow[],
  championshipCreatedBy: string | null,
  nowMs: number,
): AuthoritySelection {
  const aliveRunning = presenceRows.filter(
    (presence) => presence.is_running && isPresenceFresh(presence.last_seen_at, nowMs)
  )

  const hostPresence = aliveRunning.find(
    (presence) => championshipCreatedBy && presence.user_id === championshipCreatedBy
  )

  if (hostPresence) {
    return {
      authorityUserId: hostPresence.user_id,
      authorityRole: 'host',
      authorityTeamId: hostPresence.team_id,
    }
  }

  const sorted = [...aliveRunning].sort((a, b) => {
    const aStreak = new Date(a.streak_started_at ?? a.last_seen_at).getTime()
    const bStreak = new Date(b.streak_started_at ?? b.last_seen_at).getTime()
    if (aStreak !== bStreak) return aStreak - bStreak
    return a.user_id.localeCompare(b.user_id)
  })

  const winner = sorted[0]

  return {
    authorityUserId: winner?.user_id ?? null,
    authorityRole: 'participant',
    authorityTeamId: winner?.team_id ?? null,
  }
}
