import React from 'react';
import { Play } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clsx } from 'clsx';
import { GlassButton } from '../ui/GlassButton';
import { DRIVERS } from '../../data/initialData';
import { useI18n } from '../../i18n/I18nProvider';
import type { ActiveAeroMode, BatteryAllocationMode, PowerUnitPhilosophy, PreRaceSetup, StrategyStint, TyreCompound } from '../../types';
import type { OnlineTrainingDriverEffects, OnlineTrainingPitCrewEffects } from '../../lib/onlineTrainingEffects';

export type WeekendPlannerSetup = PreRaceSetup & {
  tyreCompound: TyreCompound;
  fuelLoad: number;
  stints: StrategyStint[];
};

interface WeekendSetupPlannerModalProps {
  open: boolean;
  playerDriverIds: string[];
  totalLaps: number;
  preRaceSetup: Record<string, WeekendPlannerSetup>;
  onlineDriverReadiness: Record<string, OnlineTrainingDriverEffects>;
  onlinePitCrewReadiness: OnlineTrainingPitCrewEffects | null;
  compoundColor: Record<TyreCompound, string>;
  mechanicalLocked: boolean;
  canStartRace?: boolean;
  parcFermeMessage?: string | null;
  onUpdateSetup: (driverId: string, updater: (current: WeekendPlannerSetup) => WeekendPlannerSetup) => void;
  onStartRace: () => void;
  normalizeStints: (stints: StrategyStint[]) => StrategyStint[];
  buildWearSeries: (stints: StrategyStint[]) => Array<Record<string, number | null>>;
  buildTheoreticalRaceTime: (stints: StrategyStint[]) => {
    totalSeconds: number;
    baselineLapTimeSeconds: number;
    pitLossSeconds: number;
    pitStops: number;
    stintTimes: number[];
  };
  getPlannedDryRuleStatus: (stints: StrategyStint[]) => {
    legal: boolean;
    label: string;
    tone: string;
    missingCompound: null | TyreCompound;
  };
  getStintWarning: (stints: StrategyStint[], index: number) => string | null;
  getConfidenceBarColor: (value: number) => string;
  getFocusBarColor: (value: number) => string;
  getWearyColor: (state: string) => string;
  formatRaceTime: (seconds: number) => string;
}

export const WeekendSetupPlannerModal: React.FC<WeekendSetupPlannerModalProps> = ({
  open,
  playerDriverIds,
  totalLaps,
  preRaceSetup,
  onlineDriverReadiness,
  onlinePitCrewReadiness,
  compoundColor,
  mechanicalLocked,
  canStartRace = true,
  parcFermeMessage,
  onUpdateSetup,
  onStartRace,
  normalizeStints,
  buildWearSeries,
  buildTheoreticalRaceTime,
  getPlannedDryRuleStatus,
  getStintWarning,
  getConfidenceBarColor,
  getFocusBarColor,
  getWearyColor,
  formatRaceTime,
}) => {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400">{t('raceControl.preRaceSetup')}</div>
            <div className="text-2xl font-black italic tracking-tight text-white">{t('raceControl.strategyPlanner')}</div>
          </div>
          <GlassButton onClick={onStartRace} disabled={!canStartRace} variant="primary" icon={<Play size={16} />}>
            {canStartRace ? t('raceControl.startRace') : 'Authority Lock'}
          </GlassButton>
        </div>

        {mechanicalLocked && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs uppercase tracking-widest text-amber-100">
            {parcFermeMessage ?? 'Parc fermé active. Mechanical setup is locked from qualifying onward.'}
          </div>
        )}

        {onlinePitCrewReadiness && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-[10px] uppercase tracking-widest text-gray-500">{t('raceControl.onlinePitCrewReadiness')}</div>
            <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/30 px-3 py-3 text-gray-300">
                <span className="mb-1 block uppercase tracking-widest text-gray-500">{t('raceControl.pitStopErrorRate')}</span>
                <div className="font-bold text-white">{onlinePitCrewReadiness.pitStopErrorRate.toFixed(1)}%</div>
              </div>
              <div className="rounded border border-white/10 bg-black/30 px-3 py-3 text-gray-300">
                <span className="mb-1 block uppercase tracking-widest text-gray-500">{t('raceControl.pitStopSpeedBonus')}</span>
                <div className="font-bold text-white">+{onlinePitCrewReadiness.pitStopSpeedBonus.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {playerDriverIds.map((id) => {
            const setup = preRaceSetup[id];
            const driver = DRIVERS.find((entry) => entry.id === id);
            if (!setup || !driver) return null;

            const normalizedStints = normalizeStints(setup.stints);
            const wearSeries = buildWearSeries(normalizedStints);
            const plannedDryRuleStatus = getPlannedDryRuleStatus(normalizedStints);
            const theoreticalRace = buildTheoreticalRaceTime(normalizedStints);
            const readiness = onlineDriverReadiness[id];

            return (
              <div key={id} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold" style={{ color: driver.color }}>{driver.name}</div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">{driver.team}</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Laps {totalLaps}</div>
                </div>

                <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">PU Philosophy</div>
                    <select
                      value={setup.powerUnitPhilosophy ?? 'balanced'}
                      onChange={(event) => onUpdateSetup(id, (current) => ({ ...current, powerUnitPhilosophy: event.target.value as PowerUnitPhilosophy }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    >
                      <option value="top_speed">Top Speed</option>
                      <option value="balanced">Balanced</option>
                      <option value="corner_focus">Corner Focus</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Battery Allocation</div>
                    <select
                      value={setup.batteryAllocationMode ?? 'balanced'}
                      onChange={(event) => onUpdateSetup(id, (current) => ({ ...current, batteryAllocationMode: event.target.value as BatteryAllocationMode }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    >
                      <option value="conservative">Conservative</option>
                      <option value="balanced">Balanced</option>
                      <option value="attack">Attack</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Active Aero</div>
                    <select
                      value={setup.activeAeroMode ?? 'balanced'}
                      onChange={(event) => onUpdateSetup(id, (current) => ({ ...current, activeAeroMode: event.target.value as ActiveAeroMode }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    >
                      <option value="low_drag">Low Drag</option>
                      <option value="balanced">Balanced</option>
                      <option value="high_downforce">High Downforce</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                    <span className="mb-1 block uppercase tracking-widest text-gray-500">PU effect</span>
                    {setup.powerUnitPhilosophy === 'top_speed' ? 'Higher terminal speed, weaker corner rotation.' : setup.powerUnitPhilosophy === 'corner_focus' ? 'Stronger cornering, more drag on straights.' : 'Neutral ICE/gear balance.'}
                  </div>
                  <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                    <span className="mb-1 block uppercase tracking-widest text-gray-500">Battery effect</span>
                    {setup.batteryAllocationMode === 'attack' ? 'More deployment and lower regen reserve.' : setup.batteryAllocationMode === 'conservative' ? 'More harvesting, smaller attack bursts.' : 'Balanced deploy and recharge.'}
                  </div>
                  <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                    <span className="mb-1 block uppercase tracking-widest text-gray-500">Aero effect</span>
                    {setup.activeAeroMode === 'low_drag' ? 'Better straight-line speed, less loaded in turns.' : setup.activeAeroMode === 'high_downforce' ? 'More grip in corners, slower at vmax.' : 'Neutral aero platform.'}
                  </div>
                </div>

                {readiness ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500">Training Readiness</div>
                      <div className="text-[10px] text-gray-400">Strength {Math.round(readiness.strength)}</div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 flex justify-between text-[10px]">
                          <span className="uppercase tracking-widest text-gray-400">Confidence</span>
                          <span className="text-gray-300">{Math.round(readiness.morale)}%</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full border border-gray-700 bg-gray-800">
                          <div className="h-full transition-all duration-300" style={{ width: `${readiness.morale}%`, backgroundColor: getConfidenceBarColor(readiness.morale) }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[10px]">
                          <span className="uppercase tracking-widest text-gray-400">Focus</span>
                          <span className="text-gray-300">{Math.round(readiness.concentration)}%</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full border border-gray-700 bg-gray-800">
                          <div className="h-full transition-all duration-300" style={{ width: `${readiness.concentration}%`, backgroundColor: getFocusBarColor(readiness.concentration) }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                      <span className="text-gray-400">Fatigue {Math.round(readiness.fatigue)}%</span>
                      <span className={clsx('font-bold', getWearyColor(readiness.wearyState))}>{readiness.wearyState}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
                    No online training sync data for this driver.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Starting Tyres</div>
                    <select
                      value={setup.tyreCompound}
                      onChange={(event) => onUpdateSetup(id, (current) => ({ ...current, tyreCompound: event.target.value as TyreCompound }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    >
                      <option value="soft">Soft</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Fuel (L)</div>
                    <input
                      type="number"
                      min={0}
                      max={150}
                      step={0.1}
                      value={setup.fuelLoad}
                      onChange={(event) => onUpdateSetup(id, (current) => ({ ...current, fuelLoad: Number(event.target.value) }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Pit Window Start</div>
                    <input
                      type="number"
                      min={1}
                      max={totalLaps}
                      step={1}
                      value={setup.pitWindowStart ?? ''}
                      onChange={(event) => onUpdateSetup(id, (current) => ({
                        ...current,
                        pitWindowStart: event.target.value === '' ? undefined : Number(event.target.value),
                      }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Pit Window End</div>
                    <input
                      type="number"
                      min={1}
                      max={totalLaps}
                      step={1}
                      value={setup.pitWindowEnd ?? ''}
                      onChange={(event) => onUpdateSetup(id, (current) => ({
                        ...current,
                        pitWindowEnd: event.target.value === '' ? undefined : Number(event.target.value),
                      }))}
                      className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                    />
                  </div>
                </div>

                <div className={clsx('rounded border px-3 py-2 text-[10px] font-bold uppercase tracking-widest', plannedDryRuleStatus.tone)}>
                  {plannedDryRuleStatus.label}
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                    <span className="mb-1 block uppercase tracking-widest text-gray-500">Theoretical time</span>
                    <div className="text-xs font-bold text-white">{formatRaceTime(theoreticalRace.totalSeconds)}</div>
                    <div className="mt-1 text-[9px] text-gray-500">Grip-based stint estimate</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                    <span className="mb-1 block uppercase tracking-widest text-gray-500">Pit loss</span>
                    <div className="text-xs font-bold text-white">+{theoreticalRace.pitLossSeconds.toFixed(1)}s</div>
                    <div className="mt-1 text-[9px] text-gray-500">× {theoreticalRace.pitStops} stop{theoreticalRace.pitStops === 1 ? '' : 's'}</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-gray-300">
                    <span className="mb-1 block uppercase tracking-widest text-gray-500">Baseline lap</span>
                    <div className="text-xs font-bold text-white">{theoreticalRace.baselineLapTimeSeconds.toFixed(2)}s</div>
                    <div className="mt-1 text-[9px] text-gray-500">Before grip loss</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Stints</div>
                    <button
                      onClick={() => onUpdateSetup(id, (current) => {
                        const previousStints = current.stints;
                        if (previousStints.length >= 4) return current;
                        const lastEnd = previousStints[previousStints.length - 1]?.endLap || Math.max(1, Math.floor(totalLaps / 2));
                        const nextEnd = Math.min(totalLaps, lastEnd + Math.max(1, Math.floor(totalLaps / 6)));
                        const fallbackCompound = previousStints[previousStints.length - 1]?.compound ?? current.tyreCompound;
                        return {
                          ...current,
                          stints: normalizeStints([
                            ...previousStints,
                            { compound: fallbackCompound, startLap: lastEnd, endLap: nextEnd },
                          ]),
                        };
                      })}
                      className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white"
                    >
                      Add Stint
                    </button>
                  </div>
                  <div className="space-y-2">
                    {setup.stints.map((stint, index) => (
                      <div key={`${id}-stint-${index}`} className="space-y-1">
                        <div className="grid grid-cols-12 items-center gap-2 text-xs">
                          <div className="col-span-4">
                            <select
                              value={stint.compound}
                              onChange={(event) => onUpdateSetup(id, (current) => {
                                const next = [...current.stints];
                                next[index] = { ...next[index], compound: event.target.value as TyreCompound };
                                return { ...current, stints: normalizeStints(next) };
                              })}
                              className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                            >
                              <option value="soft">Soft</option>
                              <option value="medium">Medium</option>
                              <option value="hard">Hard</option>
                            </select>
                          </div>
                          <div className="col-span-3">
                            <input
                              type="number"
                              min={1}
                              max={totalLaps}
                              step={1}
                              value={stint.endLap}
                              onChange={(event) => onUpdateSetup(id, (current) => {
                                const value = event.target.valueAsNumber;
                                if (Number.isNaN(value)) return current;
                                const next = [...current.stints];
                                next[index] = { ...next[index], endLap: value };
                                return { ...current, stints: normalizeStints(next) };
                              })}
                              className="w-full rounded border border-white/10 bg-[#111] px-2 py-1 text-xs text-white focus:border-f1-red focus:outline-none"
                            />
                          </div>
                          <div className="col-span-3 text-[10px] uppercase tracking-widest text-gray-400">
                            {formatRaceTime(theoreticalRace.stintTimes[index] ?? 0)}
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button
                              onClick={() => onUpdateSetup(id, (current) => ({
                                ...current,
                                stints: normalizeStints(current.stints.filter((_, stintIndex) => stintIndex !== index)),
                              }))}
                              className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        {getStintWarning(normalizeStints(setup.stints), index) && (
                          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200">
                            {getStintWarning(normalizeStints(setup.stints), index)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">Tyre Degradation</div>
                  <div className="h-32 rounded-lg border border-white/10 bg-[#111] p-2">
                    {wearSeries.length > 0 && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={wearSeries}>
                          <XAxis dataKey="lap" tick={{ fill: '#6b7280', fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }}
                            formatter={(value: number | string) => [`${Number(value).toFixed(1)}%`, 'Wear']}
                          />
                          {setup.stints.map((stint, index) => (
                            <Line
                              key={`line-${index}`}
                              type="monotone"
                              dataKey={`stint-${index}`}
                              stroke={compoundColor[stint.compound]}
                              strokeWidth={2}
                              dot={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
