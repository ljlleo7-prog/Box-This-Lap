import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TRACKS } from '../data/tracks';
import { TCC_API } from '../lib/tcc-api';
import { supabase } from '../lib/supabase';
import { useChampionshipStore } from '../store/championshipStore';
import { useRaceStore } from '../store/raceStore';

const getSessionTypeFromParam = (value: string | null) => {
  if (value === 'practice') return 'fp1' as const;
  if (value === 'quali') return 'q1' as const;
  return 'race' as const;
};

const getLiveSessionType = (sessionType: 'fp1' | 'q1' | 'race') => {
  if (sessionType === 'race') return 'race' as const;
  if (sessionType.startsWith('q')) return 'quali' as const;
  return 'practice' as const;
};

export const useRaceWeekendController = (weekendId?: string, devMode?: boolean) => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(!!weekendId);
  const [error, setError] = useState<string | null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [pendingSessionSpeed, setPendingSessionSpeed] = useState<1 | 2 | 5 | 10 | null>(null);
  const [liveSyncError, setLiveSyncError] = useState<string | null>(null);
  const authorityUsernameCacheRef = useRef<Record<string, string | null>>({});
  const teamId = useChampionshipStore((state) => state.teamId);
  const liveSyncInFlightRef = useRef(false);
  const hydratedLiveRevisionRef = useRef<number>(0);
  const cleanupSentRef = useRef(false);
  const lastSentRaceStateHashRef = useRef<string | null>(null);

  const resolveAuthorityUsername = async (authorityUserId: string | null | undefined) => {
    if (!authorityUserId) return null;
    if (authorityUsernameCacheRef.current[authorityUserId] !== undefined) {
      return authorityUsernameCacheRef.current[authorityUserId];
    }
    try {
      const username = await TCC_API.getPlayerUsername(authorityUserId);
      authorityUsernameCacheRef.current[authorityUserId] = username;
      return username;
    } catch (error) {
      console.error('Failed to resolve authority username', error);
      authorityUsernameCacheRef.current[authorityUserId] = null;
      return null;
    }
  };

  const normalizeAuthorityState = async (live: {
    authorityUserId: string | null;
    authorityRole: 'host' | 'participant';
    isRequesterAuthority: boolean;
  }, currentUserId: string | null | undefined) => {
    const fallbackUserId = live.authorityUserId ?? currentUserId ?? null;
    return {
      authorityUserId: fallbackUserId,
      authorityUsername: await resolveAuthorityUsername(fallbackUserId),
      authorityRole: live.authorityUserId ? live.authorityRole : 'participant' as const,
      isAuthoritative: live.authorityUserId ? live.isRequesterAuthority : Boolean(currentUserId),
    };
  };

  const {
    initWeekend,
    initRaceFromSnapshot,
    setTrack,
    setSessionType,
    setAuthoritativeSessionSpeed,
    raceState,
    isPlaying,
    isAuthoritative,
    liveRevision,
    setLiveAuthority,
    applyLiveSnapshot,
    serializeLiveRaceState,
    fetchRealWeather,
  } = useRaceStore();

  const sessionType = useMemo(() => getSessionTypeFromParam(searchParams.get('session')), [searchParams]);

  useEffect(() => {
    setSessionType(sessionType);
  }, [sessionType, setSessionType]);

  useEffect(() => {
    if (devMode) {
      const requestedTrackId = searchParams.get('track');
      const initialTrackId = TRACKS.some(track => track.id === requestedTrackId) ? requestedTrackId! : TRACKS[0].id;
      setError(null);
      setLoading(true);
      setTrack(initialTrackId);
      setPendingSessionSpeed(1);
      setPendingTrackId(initialTrackId);
      return;
    }

    if (!weekendId) {
      setError('No race weekend id provided');
      return;
    }

    const loadWeekend = async () => {
      try {
        const { data: weekend, error } = await TCC_API.getWeekend(weekendId);
        if (error) throw error;

        setTrack(weekend.track_id);

        const speed = sessionType === 'fp1'
          ? (weekend.practice_speed_multiplier ?? weekend.speed_multiplier ?? 1)
          : sessionType === 'q1'
            ? (weekend.quali_speed_multiplier ?? weekend.speed_multiplier ?? 1)
            : (weekend.race_speed_multiplier ?? weekend.speed_multiplier ?? 1);
        const normalizedSpeed = (speed === 2 || speed === 5 || speed === 10 ? speed : 1) as 1 | 2 | 5 | 10;
        setAuthoritativeSessionSpeed(normalizedSpeed);

        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData.user?.id ?? null;
        const live = await TCC_API.getRaceLive(weekendId, getLiveSessionType(sessionType));
        const authorityState = await normalizeAuthorityState(live, currentUserId);
        if (live.snapshot?.race_state) {
          hydratedLiveRevisionRef.current = live.snapshot.revision;
          await initRaceFromSnapshot(live.snapshot, weekend.track_id);
          setAuthoritativeSessionSpeed(normalizedSpeed);
          setLiveAuthority({
            authorityUserId: authorityState.authorityUserId,
            authorityUsername: authorityState.authorityUsername,
            authorityRole: authorityState.authorityRole,
            isAuthoritative: authorityState.isAuthoritative,
            revision: live.snapshot.revision,
            sessionType: live.sessionType,
            syncedAt: live.snapshot.updated_at,
          });
          setLoading(false);
          return;
        }

        setLiveAuthority({
          authorityUserId: authorityState.authorityUserId,
          authorityUsername: authorityState.authorityUsername,
          authorityRole: authorityState.authorityRole,
          isAuthoritative: authorityState.isAuthoritative,
          revision: live.snapshot?.revision ?? 0,
          sessionType: live.sessionType,
          syncedAt: live.snapshot?.updated_at ?? null,
        });
        setPendingSessionSpeed(normalizedSpeed);
        setPendingTrackId(weekend.track_id);
      } catch (err) {
        console.error(err);
        setError('Failed to load weekend');
        setLoading(false);
      }
    };

    loadWeekend();
  }, [weekendId, devMode, searchParams, sessionType, setTrack, setAuthoritativeSessionSpeed, initRaceFromSnapshot, setLiveAuthority, initWeekend]);

  useEffect(() => {
    if (!pendingTrackId) return;
    const initialize = async () => {
      await initWeekend(pendingTrackId, sessionType);
      if (pendingSessionSpeed !== null) {
        setAuthoritativeSessionSpeed(pendingSessionSpeed);
      }
      setLoading(false);
      setPendingTrackId(null);
      setPendingSessionSpeed(null);
    };
    initialize();
  }, [pendingTrackId, pendingSessionSpeed, initWeekend, sessionType, setAuthoritativeSessionSpeed]);

  useEffect(() => {
    if (!weekendId || devMode || !raceState) return;

    const syncLiveState = async () => {
      if (liveSyncInFlightRef.current) return;
      liveSyncInFlightRef.current = true;

      try {
        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData.user?.id ?? null;
        const serializedRaceState = isPlaying && isAuthoritative ? serializeLiveRaceState() : null;
        const serializedRaceStateHash = serializedRaceState ? JSON.stringify(serializedRaceState) : null;
        const shouldSendRaceState = Boolean(
          serializedRaceState
          && serializedRaceStateHash
          && serializedRaceStateHash !== lastSentRaceStateHashRef.current
        );
        const live = await TCC_API.syncRaceLive({
          weekendId,
          teamId,
          sessionType: sessionType === 'race' ? 'race' : sessionType.startsWith('q') ? 'quali' : 'practice',
          isRunning: isPlaying,
          simTime: isPlaying ? raceState.elapsedTime : undefined,
          raceState: shouldSendRaceState ? serializedRaceState : undefined,
        });
        if (shouldSendRaceState) {
          lastSentRaceStateHashRef.current = serializedRaceStateHash;
        }
        const authorityState = await normalizeAuthorityState(live, currentUserId);

        setLiveAuthority({
          authorityUserId: authorityState.authorityUserId,
          authorityUsername: authorityState.authorityUsername,
          authorityRole: authorityState.authorityRole,
          isAuthoritative: authorityState.isAuthoritative,
          revision: live.snapshot?.revision ?? liveRevision,
          sessionType: live.sessionType,
          syncedAt: live.snapshot?.updated_at ?? new Date().toISOString(),
        });

        if (live.snapshot && live.snapshot.revision > hydratedLiveRevisionRef.current) {
          const shouldHydrate = !authorityState.isAuthoritative || live.snapshot.authority_user_id !== currentUserId;
          if (shouldHydrate) {
            hydratedLiveRevisionRef.current = live.snapshot.revision;
            applyLiveSnapshot(live.snapshot);
          }
        }

        setLiveSyncError(null);
      } catch (err) {
        console.error('Failed to sync live race state', err);
        setLiveSyncError('Live sync disconnected');
      } finally {
        liveSyncInFlightRef.current = false;
      }
    };

    syncLiveState();
    const interval = window.setInterval(syncLiveState, 2000);
    return () => window.clearInterval(interval);
  }, [weekendId, devMode, raceState, isPlaying, isAuthoritative, serializeLiveRaceState, setLiveAuthority, liveRevision, applyLiveSnapshot, sessionType, teamId]);

  useEffect(() => {
    cleanupSentRef.current = false;
    lastSentRaceStateHashRef.current = null;
  }, [weekendId, sessionType, devMode]);

  useEffect(() => {
    if (!weekendId || devMode || sessionType !== 'race') return;

    const sendOfflinePresence = () => {
      if (cleanupSentRef.current) return;
      cleanupSentRef.current = true;
      if (!navigator.onLine) return;
      void TCC_API.syncRaceLiveOffline({
        weekendId,
        teamId,
        sessionType: 'race',
      }).catch((error) => {
        console.debug('Live race teardown sync failed', error);
      });
    };

    const handlePageHide = () => {
      sendOfflinePresence();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      sendOfflinePresence();
    };
  }, [weekendId, devMode, sessionType, teamId]);

  return {
    loading,
    error,
    liveSyncError,
    sessionType,
  };
};
