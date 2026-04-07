import React from 'react';
import { Trophy, Flag, TimerReset, Zap, ChevronRight, Medal } from 'lucide-react';
import type { ChampionshipStandingEntry, Driver, SessionSummary, VehicleState } from '../../types';
import { DRIVERS } from '../../data/initialData';
import { GlassCard } from '../ui/GlassCard';
import { GlassButton } from '../ui/GlassButton';

interface PostRaceResultsSceneProps {
  open: boolean;
  trackName: string;
  summary: SessionSummary;
  vehicles: VehicleState[];
  playerDriverIds: string[];
  playerTeamLabel: string;
  isCompleting: boolean;
  driverStandings: ChampionshipStandingEntry[];
  constructorStandings: ChampionshipStandingEntry[];
  onEndWeekend: () => void;
}

const POINTS_BY_POSITION = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const formatLapTime = (seconds?: number | null) => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const totalMilliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMilliseconds / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

const formatTimeOrGap = (entry: SessionSummary['classification'][number]) => {
  if (typeof entry.timeOrGap === 'string') return entry.timeOrGap;
  if (typeof entry.timeOrGap === 'number') return entry.position === 1 ? formatLapTime(entry.timeOrGap) : `+${entry.timeOrGap.toFixed(3)}s`;
  return '—';
};

const getDriver = (driverId: string): Driver | undefined => DRIVERS.find((driver) => driver.id === driverId);

export const PostRaceResultsScene: React.FC<PostRaceResultsSceneProps> = ({
  open,
  trackName,
  summary,
  vehicles,
  playerDriverIds,
  playerTeamLabel,
  isCompleting,
  driverStandings,
  constructorStandings,
  onEndWeekend,
}) => {
  if (!open) return null;

  const classification = [...summary.classification].sort((a, b) => a.position - b.position);
  const winner = classification[0];
  const winnerDriver = winner ? getDriver(winner.driverId) : undefined;
  const enrichedRows = classification.map((entry) => {
    const vehicle = vehicles.find((candidate) => candidate.driverId === entry.driverId);
    const driver = getDriver(entry.driverId);
    const pointsAwarded = POINTS_BY_POSITION[entry.position - 1] ?? 0;
    return {
      ...entry,
      driver,
      vehicle,
      pointsAwarded,
      isPlayerDriver: playerDriverIds.includes(entry.driverId),
    };
  });

  const fastestLapRow = enrichedRows.reduce<typeof enrichedRows[number] | null>((best, row) => {
    if (!row.bestLapTime || row.bestLapTime <= 0) return best;
    if (!best?.bestLapTime || row.bestLapTime < best.bestLapTime) return row;
    return best;
  }, null);

  const playerBest = enrichedRows.find((row) => row.isPlayerDriver) ?? null;
  const podium = enrichedRows.slice(0, 3);
  const driverPointsPreview = enrichedRows
    .filter((row) => row.driver)
    .slice(0, 10)
    .map((row) => {
      const current = driverStandings.find((entry) => entry.entityId === row.driverId);
      return {
        name: row.driver?.name ?? row.driverId,
        currentPoints: current?.points ?? 0,
        projectedPoints: (current?.points ?? 0) + row.pointsAwarded,
        gained: row.pointsAwarded,
      };
    });

  const constructorPointsPreview = podium.reduce<Record<string, { name: string; gained: number; currentPoints: number; projectedPoints: number }>>((acc, row) => {
    if (!row.driver) return acc;
    const name = row.driver.team;
    const current = constructorStandings.find((entry) => entry.name === name || entry.entityId === name);
    const existing = acc[name] ?? {
      name,
      gained: 0,
      currentPoints: current?.points ?? 0,
      projectedPoints: current?.points ?? 0,
    };
    existing.gained += row.pointsAwarded;
    existing.projectedPoints = existing.currentPoints + existing.gained;
    acc[name] = existing;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 backdrop-blur-md">
      <div className="min-h-full px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <GlassCard className="overflow-hidden border-f1-red/30 bg-gradient-to-br from-zinc-950/95 via-zinc-900/95 to-f1-red/10">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.35em] text-f1-red">
                  <Flag size={14} />
                  Checkered Flag
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-zinc-400">{trackName}</div>
                  <h2 className="mt-2 text-4xl font-orbitron font-black italic tracking-tight text-white md:text-5xl">Race Finished</h2>
                  <p className="mt-3 max-w-2xl text-sm text-zinc-300">
                    Final classification locked in. Review the race order, lap-time highlights, projected points swing, and end the weekend when ready.
                  </p>
                </div>

                {winnerDriver && (
                  <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/30 p-5 md:flex-row md:items-center">
                    <div className="h-24 w-24 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                      {winnerDriver.avatarUrl ? (
                        <img src={winnerDriver.avatarUrl} alt={winnerDriver.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl font-black text-white">
                          {winnerDriver.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs uppercase tracking-[0.3em] text-amber-300">Winner Spotlight</div>
                      <div className="mt-2 text-3xl font-black text-white">{winnerDriver.name}</div>
                      <div className="mt-1 text-sm text-zinc-400">{winnerDriver.team}</div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200">P1 • {winner?.lapsCompleted ?? '—'} laps</span>
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-cyan-200">Best lap {formatLapTime(winner?.bestLapTime ?? null)}</span>
                        <span className="rounded-full border border-f1-red/30 bg-f1-red/10 px-3 py-1 text-f1-red">+{POINTS_BY_POSITION[0]} pts preview</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <GlassCard className="border-white/10 bg-black/25">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-500"><TimerReset size={14} /> Fastest Lap</div>
                  <div className="mt-3 text-2xl font-black text-white">{fastestLapRow?.driver?.name ?? '—'}</div>
                  <div className="mt-1 text-sm text-cyan-300">{formatLapTime(fastestLapRow?.bestLapTime ?? null)}</div>
                </GlassCard>
                <GlassCard className="border-white/10 bg-black/25">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-500"><Zap size={14} /> Player Team</div>
                  <div className="mt-3 text-2xl font-black text-white">{playerTeamLabel}</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    {playerBest ? `${playerBest.driver?.name ?? playerBest.driverId} • P${playerBest.position}` : 'No tracked finisher'}
                  </div>
                </GlassCard>
              </div>
            </div>
          </GlassCard>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <GlassCard className="border-white/10 bg-zinc-950/90">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-zinc-400">
                <Trophy size={16} /> Final Classification
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      <th className="px-3 py-3">Pos</th>
                      <th className="px-3 py-3">Driver</th>
                      <th className="px-3 py-3">Team</th>
                      <th className="px-3 py-3">Gap / Time</th>
                      <th className="px-3 py-3">Best Lap</th>
                      <th className="px-3 py-3 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {enrichedRows.map((row) => (
                      <tr key={row.driverId} className={row.isPlayerDriver ? 'bg-f1-red/5' : undefined}>
                        <td className="px-3 py-3 font-mono font-bold text-cyan-300">{row.position}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-zinc-900">
                              {row.driver?.avatarUrl ? (
                                <img src={row.driver.avatarUrl} alt={row.driver.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-black text-white">
                                  {(row.driver?.name ?? row.driverId).split(' ').map((part) => part[0]).join('').slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-white">{row.driver?.name ?? row.driverId}</div>
                              <div className="text-xs text-zinc-500">{row.vehicle?.lapCount ?? row.lapsCompleted ?? '—'} laps • {row.vehicle?.pitStopCount ?? 0} stops</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-zinc-400">{row.driver?.team ?? '—'}</td>
                        <td className="px-3 py-3 font-mono text-zinc-200">{formatTimeOrGap(row)}</td>
                        <td className="px-3 py-3 font-mono text-zinc-300">{formatLapTime(row.bestLapTime ?? null)}</td>
                        <td className="px-3 py-3 text-right font-bold text-f1-red">+{row.pointsAwarded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            <div className="flex flex-col gap-6">
              <GlassCard className="border-white/10 bg-zinc-950/90">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-zinc-400">
                  <Medal size={16} /> Driver Points Preview
                </div>
                <div className="space-y-3">
                  {driverPointsPreview.slice(0, 5).map((entry) => (
                    <div key={entry.name} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex items-center justify-between text-sm font-bold text-white">
                        <span>{entry.name}</span>
                        <span className="text-f1-red">+{entry.gained}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{entry.currentPoints} → {entry.projectedPoints} pts</div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="border-white/10 bg-zinc-950/90">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-zinc-400">
                  <Trophy size={16} /> Constructor Swing
                </div>
                <div className="space-y-3">
                  {Object.values(constructorPointsPreview).map((entry) => (
                    <div key={entry.name} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex items-center justify-between text-sm font-bold text-white">
                        <span>{entry.name}</span>
                        <span className="text-cyan-300">+{entry.gained}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">{entry.currentPoints} → {entry.projectedPoints} pts</div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="border-f1-red/20 bg-gradient-to-br from-black/40 to-f1-red/10">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">Weekend Control</div>
                    <div className="mt-2 text-2xl font-black text-white">Lock the result</div>
                    <p className="mt-2 text-sm text-zinc-300">Finalize the race, update the weekend state, and return to the weekend overview when you’re ready.</p>
                  </div>
                  <GlassButton onClick={onEndWeekend} isLoading={isCompleting} className="w-full justify-center" icon={<ChevronRight size={16} />}>
                    End Weekend
                  </GlassButton>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
