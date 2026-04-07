import React from 'react';
import { ChevronLeft, CloudRain, Pause, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { GlassButton } from '../ui/GlassButton';
import type { RaceState, SessionType } from '../../types';

interface WeekendSessionHeaderProps {
  raceState: RaceState | null;
  sessionType: SessionType;
  weekendId?: string;
  devMode?: boolean;
  liveSyncError: string | null;
  isAuthoritative: boolean;
  authorityRole: string | null;
  authorityUserId: string | null;
  authorityUsername: string | null;
  authoritativeSpeed: 1 | 2 | 5 | 10;
  isPlaying: boolean;
  onBack: () => void;
  onToggleWeather: () => void;
  onSpeedChange: (speed: 1 | 2 | 5 | 10) => void;
  lockWeather?: boolean;
  lockSpeed?: boolean;
  lockStartPause?: boolean;
  onStartPause: () => void;
}

const getSessionLabel = (sessionType: SessionType) => {
  if (sessionType.startsWith('fp')) return sessionType.toUpperCase();
  if (sessionType.startsWith('q')) return sessionType.toUpperCase();
  return 'RACE';
};

export const WeekendSessionHeader: React.FC<WeekendSessionHeaderProps> = ({
  raceState,
  sessionType,
  weekendId,
  devMode,
  liveSyncError,
  isAuthoritative,
  authorityRole,
  authorityUserId,
  authorityUsername,
  authoritativeSpeed,
  isPlaying,
  onBack,
  onToggleWeather,
  onSpeedChange,
  lockWeather = false,
  lockSpeed = false,
  lockStartPause = false,
  onStartPause,
}) => {
  const authorityLabel = liveSyncError
    ? 'Sync offline'
    : isAuthoritative
      ? 'You are the authority'
      : authorityUsername
        ? `Following ${authorityUsername}`
        : authorityUserId
          ? 'Following active authority'
          : 'No active authority';

  return (
    <header className="flex flex-col items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white/80 p-4 backdrop-blur-md dark:border-white/5 dark:bg-[#121212]/40 md:flex-row md:items-center">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          title="Back"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter text-zinc-900 dark:text-white">Race Weekend</h2>
          <div className="mt-1 flex items-center gap-3 font-mono text-xs text-zinc-500 dark:text-gray-400 md:text-sm">
            <span className="text-[#00FFFF]">{getSessionLabel(sessionType)}</span>
            <span>•</span>
            <span>{raceState ? `Lap ${raceState.currentLap}/${raceState.totalLaps}` : 'Pre-session'}</span>
            <span>•</span>
            <span>{raceState?.trackTemp.toFixed(1)}°C</span>
            <span>•</span>
            <span className="uppercase">{raceState?.weather}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!devMode && weekendId && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
            <span className={clsx('h-2 w-2 rounded-full', liveSyncError ? 'bg-red-400' : isAuthoritative ? 'bg-emerald-400' : authorityUserId ? 'bg-amber-400' : 'bg-zinc-400')} />
            <span>{authorityLabel}</span>
            <span className="text-gray-500">{authoritativeSpeed}x session</span>
          </div>
        )}

        <button
          onClick={onToggleWeather}
          disabled={lockWeather}
          className={clsx(
            'px-3 py-1.5 rounded text-xs font-bold uppercase border transition-all flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60',
            raceState?.weatherMode === 'real'
              ? 'bg-blue-500/20 border-blue-500 text-blue-400'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          )}
          title={lockWeather ? 'Live race weather locked' : 'Toggle Real Weather API'}
        >
          <CloudRain size={14} />
          {lockWeather ? 'LIVE WX LOCK' : raceState?.weatherMode === 'real' ? 'LIVE WX' : 'SIM WX'}
        </button>

        <div className="flex bg-black/40 rounded-lg overflow-hidden border border-white/10">
          {[1, 2, 5, 10].map(speed => (
            <button
              key={speed}
              onClick={() => onSpeedChange(speed as 1 | 2 | 5 | 10)}
              disabled={lockSpeed}
              className={clsx(
                'px-3 py-1.5 text-xs font-mono font-bold transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed',
                authoritativeSpeed === speed ? 'text-[#00FFFF] bg-[#00FFFF]/10' : 'text-gray-500'
              )}
              title={lockSpeed ? 'Weekend-configured session speed is locked during live race' : undefined}
            >
              {speed}x
            </button>
          ))}
        </div>

        <GlassButton
          onClick={onStartPause}
          disabled={lockStartPause}
          variant={isPlaying ? 'secondary' : 'primary'}
          className="min-w-[140px]"
          icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
        >
          {lockStartPause ? 'AUTHORITY LOCK' : isPlaying ? 'Running' : 'Start Session'}
        </GlassButton>
      </div>
    </header>
  );
};
