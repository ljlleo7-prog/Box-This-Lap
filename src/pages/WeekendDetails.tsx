import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TCC_API } from '../lib/tcc-api';
import { TRACKS } from '../data/tracks';
import { Play, CheckCircle, Clock, ChevronLeft, MapPin, Calendar, AlertTriangle, Image } from 'lucide-react';
import { clsx } from 'clsx';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { PageHeader } from '../components/ui/PageHeader';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n/I18nProvider';
import { useChampionshipStore } from '../store/championshipStore';
import type { OnlineWeekendGaragePlan, OnlineWeekendPlanBundle, SessionSummary, SessionType, WeekendPhase } from '../types';

type SessionCardType = 'practice' | 'quali' | 'race';

type SessionProgressState = {
  status: 'locked' | 'ready' | 'in_progress' | 'completed';
  isActionable: boolean;
  isCompleted: boolean;
  hasRuntimeState: boolean;
  hasSummary: boolean;
};

const PRACTICE_PHASES: SessionType[] = ['fp1', 'fp2', 'fp3'];
const QUALI_PHASES: SessionType[] = ['q1', 'q2', 'q3'];
const PRACTICE_PHASE_SET = new Set<SessionType>(PRACTICE_PHASES);
const QUALI_PHASE_SET = new Set<SessionType>(QUALI_PHASES);

const isSessionSummaryComplete = (summary?: SessionSummary | null) => Boolean(summary?.completed);

const getLastCompletedPhase = (phases: SessionType[], summaries: Partial<Record<SessionType, SessionSummary>>, completedSessions: SessionType[]) => {
  for (let index = phases.length - 1; index >= 0; index -= 1) {
    const phase = phases[index];
    if (completedSessions.includes(phase) || isSessionSummaryComplete(summaries[phase])) {
      return phase;
    }
  }
  return null;
};

const hasInteractiveRuntimeForPhases = (
  plan: OnlineWeekendGaragePlan | null | undefined,
  phases: SessionType[],
) => phases.some((phase) => Boolean(plan?.interactiveSessionStateByPhase?.[phase]));

const getSessionProgressState = ({
  type,
  weekendStatus,
  weekendPhase,
  scheduledAt,
  isCancelled,
  plan,
  sessionSummaries,
  completedSessions,
}: {
  type: SessionCardType;
  weekendStatus: string;
  weekendPhase: WeekendPhase;
  scheduledAt?: string | null;
  isCancelled: boolean;
  plan: OnlineWeekendGaragePlan | null | undefined;
  sessionSummaries: Partial<Record<SessionType, SessionSummary>>;
  completedSessions: SessionType[];
}): SessionProgressState => {
  const hasStarted = scheduledAt ? Date.now() >= new Date(scheduledAt).getTime() : true;
  if (isCancelled || !hasStarted) {
    return {
      status: 'locked',
      isActionable: false,
      isCompleted: false,
      hasRuntimeState: false,
      hasSummary: false,
    };
  }

  if (type === 'practice') {
    const hasRuntimeState = hasInteractiveRuntimeForPhases(plan, PRACTICE_PHASES);
    const hasSummary = PRACTICE_PHASES.some((phase) => isSessionSummaryComplete(sessionSummaries[phase]));
    const practiceComplete = PRACTICE_PHASES.every((phase) => completedSessions.includes(phase) || isSessionSummaryComplete(sessionSummaries[phase]));
    const practiceInProgress = PRACTICE_PHASE_SET.has(weekendPhase as SessionType) || (hasRuntimeState && !practiceComplete);

    if (practiceComplete || ['practice_complete', 'quali_complete', 'race_complete'].includes(weekendStatus)) {
      return { status: 'completed', isActionable: false, isCompleted: true, hasRuntimeState, hasSummary };
    }
    if (practiceInProgress) {
      return { status: 'in_progress', isActionable: true, isCompleted: false, hasRuntimeState, hasSummary };
    }
    return { status: 'ready', isActionable: true, isCompleted: false, hasRuntimeState, hasSummary };
  }

  if (type === 'quali') {
    const practiceComplete = PRACTICE_PHASES.every((phase) => completedSessions.includes(phase) || isSessionSummaryComplete(sessionSummaries[phase]))
      || ['practice_complete', 'quali_complete', 'race_complete'].includes(weekendStatus);
    const hasRuntimeState = hasInteractiveRuntimeForPhases(plan, QUALI_PHASES);
    const hasSummary = QUALI_PHASES.some((phase) => isSessionSummaryComplete(sessionSummaries[phase]));
    const qualiComplete = QUALI_PHASES.every((phase) => completedSessions.includes(phase) || isSessionSummaryComplete(sessionSummaries[phase]))
      || ['quali_complete', 'race_complete'].includes(weekendStatus);
    const qualiInProgress = QUALI_PHASE_SET.has(weekendPhase as SessionType) || (hasRuntimeState && !qualiComplete);

    if (qualiComplete) {
      return { status: 'completed', isActionable: false, isCompleted: true, hasRuntimeState, hasSummary };
    }
    if (!practiceComplete) {
      return { status: 'locked', isActionable: false, isCompleted: false, hasRuntimeState, hasSummary };
    }
    if (qualiInProgress) {
      return { status: 'in_progress', isActionable: true, isCompleted: false, hasRuntimeState, hasSummary };
    }
    return { status: 'ready', isActionable: true, isCompleted: false, hasRuntimeState, hasSummary };
  }

  const practiceComplete = PRACTICE_PHASES.every((phase) => completedSessions.includes(phase) || isSessionSummaryComplete(sessionSummaries[phase]))
    || ['practice_complete', 'quali_complete', 'race_complete'].includes(weekendStatus);
  const qualiComplete = QUALI_PHASES.every((phase) => completedSessions.includes(phase) || isSessionSummaryComplete(sessionSummaries[phase]))
    || ['quali_complete', 'race_complete'].includes(weekendStatus);
  const raceSummary = sessionSummaries.race;
  const hasRuntimeState = Boolean(plan?.interactiveSessionStateByPhase?.race);
  const hasSummary = isSessionSummaryComplete(raceSummary);
  const raceComplete = completedSessions.includes('race') || hasSummary || weekendStatus === 'race_complete';
  const raceInProgress = weekendPhase === 'race' || (hasRuntimeState && !raceComplete);

  if (raceComplete) {
    return { status: 'completed', isActionable: false, isCompleted: true, hasRuntimeState, hasSummary };
  }
  if (!practiceComplete || !qualiComplete) {
    return { status: 'locked', isActionable: false, isCompleted: false, hasRuntimeState, hasSummary };
  }
  if (raceInProgress) {
    return { status: 'in_progress', isActionable: true, isCompleted: false, hasRuntimeState, hasSummary };
  }
  return { status: 'ready', isActionable: true, isCompleted: false, hasRuntimeState, hasSummary };
};

export const WeekendDetails: React.FC = () => {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const teamId = useChampionshipStore((state) => state.teamId);
  const [weekend, setWeekend] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessionSpeeds, setSessionSpeeds] = useState({ practice: 1 as 1 | 2 | 5 | 10, quali: 1 as 1 | 2 | 5 | 10, race: 1 as 1 | 2 | 5 | 10 });
  const [savingSessionSpeed, setSavingSessionSpeed] = useState<'practice' | 'quali' | 'race' | null>(null);
  const [canManageSessionSpeed, setCanManageSessionSpeed] = useState(false);
  const [updatingWeekendState, setUpdatingWeekendState] = useState(false);
  const [weekendBackgroundDraft, setWeekendBackgroundDraft] = useState('');
  const [savingWeekendBackground, setSavingWeekendBackground] = useState(false);
  const [planBundle, setPlanBundle] = useState<OnlineWeekendPlanBundle>({ practice: null, quali: null, race: null });

  useEffect(() => {
    if (id) loadWeekend();
  }, [id, teamId]);

  const loadWeekend = async () => {
    try {
      const { data, error } = await TCC_API.getWeekend(id!);
      if (error) throw error;
      setWeekend(data);
      setWeekendBackgroundDraft(data.hero_background_url || '');
      setSessionSpeeds({
        practice: data.practice_speed_multiplier ?? data.speed_multiplier ?? 1,
        quali: data.quali_speed_multiplier ?? data.speed_multiplier ?? 1,
        race: data.race_speed_multiplier ?? data.speed_multiplier ?? 1,
      });

      if (teamId) {
        const bundle = await TCC_API.getWeekendPlanBundle(id!, teamId);
        setPlanBundle(bundle);
      } else {
        setPlanBundle({ practice: null, quali: null, race: null });
      }

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setCanManageSessionSpeed(false);
      } else {
        const { data: membership } = await supabase
          .from('tcc_championship_members')
          .select('role')
          .eq('championship_id', data.championship_id)
          .eq('user_id', userId)
          .maybeSingle();
        setCanManageSessionSpeed(
          data.tcc_championships?.created_by === userId ||
          membership?.role === 'host' ||
          membership?.role === 'developer'
        );
      }
    } catch (err) {
      console.error('Failed to load weekend:', err);
    } finally {
      setLoading(false);
    }
  };

  const openSession = (type: 'practice' | 'quali' | 'race') => {
    if (!id) return;
    navigate(`/race/${id}?session=${type}`);
  };

  const setSessionSpeed = async (sessionType: 'practice' | 'quali' | 'race', speed: 1 | 2 | 5 | 10) => {
    if (!id) return;
    setSavingSessionSpeed(sessionType);
    try {
      const { data, error } = await TCC_API.setWeekendSessionSpeed(id, sessionType, speed);
      if (error) throw error;
      if (!data?.success) {
        alert(data?.message || t('weekend.error.updateSessionSpeed'));
        return;
      }
      setSessionSpeeds((prev) => ({ ...prev, [sessionType]: speed }));
      await loadWeekend();
    } catch (err: any) {
      console.error(`Failed to set ${sessionType} speed:`, err);
      alert(err?.message || err?.error_description || err?.details || t('weekend.error.updateSessionSpeed'));
    } finally {
      setSavingSessionSpeed(null);
    }
  };

  const cancelWeekend = async () => {
    if (!id || !confirm(t('weekend.cancelConfirm'))) return;
    setUpdatingWeekendState(true);
    try {
      await TCC_API.cancelWeekend(id);
      await loadWeekend();
    } catch (err: any) {
      console.error('Failed to cancel weekend:', err);
      alert(err?.message || t('weekend.error.cancelWeekend'));
    } finally {
      setUpdatingWeekendState(false);
    }
  };

  const toggleEndOfSeason = async () => {
    if (!id) return;
    setUpdatingWeekendState(true);
    try {
      await TCC_API.setWeekendEndOfSeason(id, !weekend.is_end_of_season);
      await loadWeekend();
    } catch (err: any) {
      console.error('Failed to update end-of-season flag:', err);
      alert(err?.message || t('weekend.error.updateEndOfSeason'));
    } finally {
      setUpdatingWeekendState(false);
    }
  };

  const saveWeekendBackground = async () => {
    if (!id) return;
    setSavingWeekendBackground(true);
    try {
      const normalizedUrl = weekendBackgroundDraft.trim();
      await TCC_API.setWeekendBackgroundImage(id, normalizedUrl || null);
      setWeekend((prev: any) => prev ? { ...prev, hero_background_url: normalizedUrl || null } : prev);
    } catch (err: any) {
      console.error('Failed to update weekend background image:', err);
      alert(err?.message || err?.error_description || err?.details || 'Failed to update weekend background image');
    } finally {
      setSavingWeekendBackground(false);
    }
  };

  const currentSessionScheduledAt = (type: 'practice' | 'quali' | 'race') => {
    if (!weekend) return undefined;
    if (type === 'practice') return weekend.scheduled_practice_at_utc || weekend.scheduled_fp1_at_utc;
    if (type === 'quali') return weekend.scheduled_quali_at_utc;
    return weekend.scheduled_race_at_utc;
  };

  const track = weekend ? TRACKS.find(t => t.id === weekend.track_id) : undefined;
  const isCancelled = weekend?.status === 'cancelled';
  const showCancelledNotice = isCancelled && weekend?.scheduled_race_at_utc
    ? Date.now() < new Date(weekend.scheduled_race_at_utc).getTime()
    : false;
  const scheduleRows = weekend ? [
    { label: 'FP1', value: weekend.scheduled_fp1_at_utc || weekend.scheduled_practice_at_utc },
    { label: 'FP2', value: weekend.scheduled_fp2_at_utc },
    { label: 'FP3', value: weekend.scheduled_fp3_at_utc },
    { label: 'Qualifying', value: weekend.scheduled_quali_at_utc },
    { label: 'Race', value: weekend.scheduled_race_at_utc },
  ] : [];
  const sessionSummaries = ((weekend?.sessionSummaries ?? {}) as Partial<Record<SessionType, SessionSummary>>);
  const completedSessions = Array.isArray(weekend?.completedSessions) ? weekend.completedSessions as SessionType[] : [];
  const practiceLastCompletedPhase = getLastCompletedPhase(PRACTICE_PHASES, sessionSummaries, completedSessions);
  const qualiLastCompletedPhase = getLastCompletedPhase(QUALI_PHASES, sessionSummaries, completedSessions);
  const sessionProgressByType = useMemo<Record<SessionCardType, SessionProgressState>>(() => {
    if (!weekend) {
      return {
        practice: { status: 'locked', isActionable: false, isCompleted: false, hasRuntimeState: false, hasSummary: false },
        quali: { status: 'locked', isActionable: false, isCompleted: false, hasRuntimeState: false, hasSummary: false },
        race: { status: 'locked', isActionable: false, isCompleted: false, hasRuntimeState: false, hasSummary: false },
      };
    }

    return {
      practice: getSessionProgressState({
        type: 'practice',
        weekendStatus: weekend.status,
        weekendPhase: weekend.currentPhase,
        scheduledAt: weekend.scheduled_practice_at_utc || weekend.scheduled_fp1_at_utc,
        isCancelled,
        plan: planBundle.practice,
        sessionSummaries,
        completedSessions,
      }),
      quali: getSessionProgressState({
        type: 'quali',
        weekendStatus: weekend.status,
        weekendPhase: weekend.currentPhase,
        scheduledAt: weekend.scheduled_quali_at_utc,
        isCancelled,
        plan: planBundle.quali,
        sessionSummaries,
        completedSessions,
      }),
      race: getSessionProgressState({
        type: 'race',
        weekendStatus: weekend.status,
        weekendPhase: weekend.currentPhase,
        scheduledAt: weekend.scheduled_race_at_utc,
        isCancelled,
        plan: planBundle.race,
        sessionSummaries,
        completedSessions,
      }),
    };
  }, [weekend, isCancelled, planBundle, sessionSummaries, completedSessions]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
        <div className="text-f1-red animate-pulse font-mono tracking-widest">{t('weekend.loadingTelemetry')}</div>
    </div>
  );

  if (!weekend) return (
    <div className="min-h-screen flex items-center justify-center p-8">
        <GlassCard className="max-w-md w-full text-center border-red-500/30">
            <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
            <h2 className="text-xl font-bold text-white mb-2">{t('weekend.eventNotFound')}</h2>
            <GlassButton onClick={() => navigate('/championships')} variant="secondary" className="mt-4">
                {t('weekend.returnToHub')}
            </GlassButton>
        </GlassCard>
    </div>
  );

  const SessionCard = ({
    title,
    type,
    progress,
    onRun,
    results
  }: {
    title: string;
    type: SessionCardType;
    progress: SessionProgressState;
    onRun: () => void;
    results?: any;
  }) => {
    const isCompleted = progress.isCompleted;
    const isActionable = progress.isActionable;
    const scheduledAt = currentSessionScheduledAt(type);
    const hasStarted = scheduledAt ? Date.now() >= new Date(scheduledAt).getTime() : true;
    const actionLabel = progress.status === 'in_progress' ? t('weekend.continueSession') : t('weekend.initializeSession');
    const detailMessage = (() => {
      if (isCancelled) return t('weekend.sessionUnavailableCancelled');
      if (!hasStarted && scheduledAt) return `${t('weekend.sessionUnlocksAt')} ${new Date(scheduledAt).toLocaleString()}.`;
      if (type === 'practice' && progress.status === 'in_progress') {
        return practiceLastCompletedPhase
          ? `${t('weekend.sessionInProgress')} ${practiceLastCompletedPhase.toUpperCase()} ${t('weekend.complete').toLowerCase()}.`
          : t('weekend.sessionInProgress');
      }
      if (type === 'quali' && progress.status === 'in_progress') {
        return qualiLastCompletedPhase
          ? `${t('weekend.sessionInProgress')} ${qualiLastCompletedPhase.toUpperCase()} ${t('weekend.complete').toLowerCase()}.`
          : t('weekend.sessionInProgress');
      }
      if (type === 'race' && progress.status === 'in_progress') return t('weekend.sessionInProgress');
      if (isActionable) return t('weekend.sessionReadyInit');
      return t('weekend.waitingPreviousSession');
    })();

    return (
      <GlassCard
        className={clsx(
          'flex flex-col h-full',
          isActionable ? 'border-f1-red shadow-[0_0_20px_rgba(225,6,0,0.15)] bg-f1-red/20' : 'opacity-80'
        )}
      >
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-2xl font-black text-white italic tracking-tighter">{title.toUpperCase()}</h3>
          {isCompleted ? (
            <span className="flex items-center gap-1 text-green-400 text-xs font-bold bg-green-500/10 px-2 py-1 rounded border border-green-500/30">
              <CheckCircle size={12} /> {t('weekend.complete')}
            </span>
          ) : progress.status === 'in_progress' ? (
            <span className="flex items-center gap-1 text-amber-300 text-xs font-bold bg-amber-500/10 px-2 py-1 rounded border border-amber-500/30">
              <Clock size={12} /> {t('weekend.inProgress')}
            </span>
          ) : isActionable ? (
            <span className="flex items-center gap-1 text-[#00FFFF] text-xs font-bold bg-[#00FFFF]/10 px-2 py-1 rounded border border-[#00FFFF]/30 animate-pulse">
              <Clock size={12} /> {t('weekend.ready')}
            </span>
          ) : (
            <span className="text-gray-500 text-xs font-bold bg-white/5 px-2 py-1 rounded border border-white/10">
              {t('weekend.locked')}
            </span>
          )}
        </div>

        <div className="flex-grow">
          {isCompleted ? (
            <div className="p-4 bg-black/40 rounded-xl border border-white/5">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">{t('weekend.sessionReport')}</p>
              <div className="text-sm font-mono text-[#00FFFF]">
                {type === 'race' ? `${t('weekend.winner')}: ${results?.[0]?.driver_name || t('weekend.unknown')}` : t('weekend.dataProcessingComplete')}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm italic">
              {detailMessage}
            </div>
          )}
        </div>

        {!isCompleted && (
          <div className="mt-6">
            <GlassButton
              onClick={onRun}
              disabled={!isActionable}
              variant={isActionable ? 'primary' : 'secondary'}
              className="w-full"
              icon={<Play size={16} />}
            >
              {actionLabel}
            </GlassButton>
          </div>
        )}
      </GlassCard>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button 
        onClick={() => navigate(`/championships/${weekend.championship_id}`)}
        className="flex items-center gap-2 text-gray-400 hover:text-[#00FFFF] transition-colors group"
      >
        <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> 
        {t('weekend.backToChampionship')}
      </button>

      <PageHeader 
        title={weekend.name || track?.name || 'Grand Prix'}
        subtitle={`${t('weekend.round')} ${weekend.round_number}`}
        backgroundImage={weekend.hero_background_url || 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=2070&auto=format&fit=crop'}
        action={canManageSessionSpeed ? (
          <div className="w-full rounded-xl border border-white/10 bg-black/30 p-3 md:w-[26rem]">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
              <Image size={13} />
              Weekend Background
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={weekendBackgroundDraft}
                onChange={(event) => setWeekendBackgroundDraft(event.target.value)}
                placeholder="https://example.com/weekend.jpg"
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#00FFFF]"
              />
              <GlassButton variant="secondary" onClick={saveWeekendBackground} isLoading={savingWeekendBackground}>
                Save
              </GlassButton>
            </div>
          </div>
        ) : undefined}
        tags={
            <>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm text-gray-300">
                    <MapPin size={14} className="text-[#00FFFF]" />
                    {track?.location ? `${track.location.lat.toFixed(2)}°, ${track.location.long.toFixed(2)}°` : t('weekend.unknownLocation')}
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm text-gray-300">
                    <Calendar size={14} className="text-[#00FFFF]" />
                    {new Date(weekend.scheduled_race_at_utc || weekend.start_time).toLocaleString()}
                </div>
                {weekend.is_end_of_season && (
                  <div className="px-3 py-1 rounded-full text-sm border font-medium bg-yellow-500/10 border-yellow-500/30 text-yellow-300 uppercase">
                    {t('weekend.endOfSeason')}
                  </div>
                )}
                <div className="px-3 py-1 rounded-full text-sm border font-medium bg-gray-800 border-gray-700 text-gray-400 uppercase">
                   {weekend.status?.replace('_', ' ')}
                </div>
            </>
        }
      />

      {showCancelledNotice && (
        <GlassCard className="border-yellow-500/30 bg-yellow-500/10">
          <div className="text-sm font-mono uppercase tracking-widest text-yellow-300">{t('weekend.cancelledTitle')}</div>
          <div className="text-sm text-gray-200 mt-2">
            {t('weekend.cancelledNoticePrefix')} {new Date(weekend.scheduled_race_at_utc).toLocaleString()}.
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="text-sm font-mono uppercase tracking-widest text-gray-400">{t('weekend.schedule')}</div>
          {canManageSessionSpeed && (
            <div className="flex gap-2 flex-wrap">
              <GlassButton variant="secondary" onClick={toggleEndOfSeason} isLoading={updatingWeekendState}>
                {weekend.is_end_of_season ? t('weekend.unsetEndOfSeason') : t('weekend.markEndOfSeason')}
              </GlassButton>
              <GlassButton variant="secondary" onClick={cancelWeekend} isLoading={updatingWeekendState} disabled={isCancelled || weekend.status === 'race_complete'}>
                {isCancelled ? t('weekend.cancelledTitle') : t('weekend.cancelWeekend')}
              </GlassButton>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          {scheduleRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">{row.label}</div>
              <div className="text-white">{row.value ? new Date(row.value).toLocaleString() : t('weekend.notSet')}</div>
            </div>
          ))}
        </div>
        {typeof weekend.practice_block_duration_minutes === 'number' && (
          <div className="mt-3 text-xs text-gray-500">
            {t('weekend.practiceBlockDuration')}: {(weekend.practice_block_duration_minutes / 60).toFixed(1)} {t('weekend.hours')}.
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['practice', 'quali', 'race'] as const).map((sessionType) => {
          const scheduledAt = sessionType === 'practice'
            ? weekend.scheduled_practice_at_utc
            : sessionType === 'quali'
              ? weekend.scheduled_quali_at_utc
              : weekend.scheduled_race_at_utc;
          const isLocked = scheduledAt ? Date.now() >= (new Date(scheduledAt).getTime() - 3 * 60 * 60 * 1000) : false;
          return (
            <GlassCard key={`speed-${sessionType}`} className="p-4">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">{sessionType} {t('weekend.speed')}</div>
              <div className="text-sm text-gray-400 mb-3">
                {scheduledAt ? `${t('weekend.locksBefore')} ${new Date(scheduledAt).toLocaleString()}` : t('weekend.noSessionTimeSet')}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 5, 10].map((speed) => (
                  <button
                    key={`${sessionType}-${speed}`}
                    onClick={() => setSessionSpeed(sessionType, speed as 1 | 2 | 5 | 10)}
                    disabled={!canManageSessionSpeed || isLocked || savingSessionSpeed === sessionType}
                    className={clsx(
                      'px-3 py-1.5 rounded border text-xs font-mono font-bold transition-colors',
                      sessionSpeeds[sessionType] === speed
                        ? 'border-[#00FFFF] bg-[#00FFFF]/10 text-[#00FFFF]'
                        : 'border-white/10 bg-black/30 text-gray-400',
                      (!canManageSessionSpeed || isLocked) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {!canManageSessionSpeed ? t('weekend.hostOnly') : isLocked ? t('weekend.lockedForSession') : t('weekend.hostEditable')}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SessionCard
          title={t('weekend.practice')}
          type="practice"
          progress={sessionProgressByType.practice}
          onRun={() => openSession('practice')}
        />

        <SessionCard
          title={t('weekend.qualifying')}
          type="quali"
          progress={sessionProgressByType.quali}
          onRun={() => openSession('quali')}
        />

        <SessionCard
          title={t('weekend.race')}
          type="race"
          progress={sessionProgressByType.race}
          onRun={() => openSession('race')}
          results={weekend.tcc_race_results}
        />
      </div>

      {weekend.status === 'race_complete' && (
        <GlassCard className="mt-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <CheckCircle className="text-green-400" /> {t('weekend.eventSummary')}
            </h3>
            
            {weekend.tcc_race_results && weekend.tcc_race_results.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium">{t('weekend.pos')}</th>
                                <th className="p-4 font-medium">{t('weekend.driver')}</th>
                                <th className="p-4 font-medium">{t('weekend.team')}</th>
                                <th className="p-4 font-medium">{t('weekend.timeStatus')}</th>
                                <th className="p-4 font-medium text-right">{t('weekend.points')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {weekend.tcc_race_results
                                .sort((a: any, b: any) => a.position - b.position)
                                .map((res: any) => (
                                <tr key={res.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 font-mono text-[#00FFFF] font-bold">
                                        {res.position}
                                    </td>
                                    <td className="p-4 font-bold text-white">
                                        {res.driver_name || `Driver ${res.driver_id.slice(0,4)}`}
                                    </td>
                                    <td className="p-4 text-gray-400">
                                        {res.team_id.slice(0,8)}...
                                    </td>
                                    <td className="p-4 font-mono text-gray-300 text-sm">
                                        {res.status === 'Finished'
                                            ? (res.total_time ? `${(res.total_time/60000).toFixed(2)}m` : t('weekend.finished'))
                                            : <span className="text-red-400">{res.status}</span>
                                        }
                                    </td>
                                    <td className="p-4 font-bold text-white text-right">
                                        {res.points > 0 ? <span className="text-[#00FFFF]">{res.points}</span> : <span className="text-gray-600">0</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-gray-400 italic">
                    {t('weekend.raceCompletedNoClassification')}
                </p>
            )}
        </GlassCard>
      )}
    </div>
  );
};
