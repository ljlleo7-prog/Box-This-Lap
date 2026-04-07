import React, { useEffect, useMemo, useState } from 'react';
import { RaceState, TrackTelemetryMetadata } from '../../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Bar, ComposedChart } from 'recharts';
import { DRIVERS } from '../../data/initialData';
import { TRACKS } from '../../data/tracks';
import { useRaceStore } from '../../store/raceStore';

type SpeedSample = { dist: number; speed: number };

const solveLinearSystem = (matrix: number[][], vector: number[]) => {
  const size = vector.length;
  for (let i = 0; i < size; i += 1) {
    let maxRow = i;
    for (let r = i + 1; r < size; r += 1) {
      if (Math.abs(matrix[r][i]) > Math.abs(matrix[maxRow][i])) {
        maxRow = r;
      }
    }
    if (Math.abs(matrix[maxRow][i]) < 1e-12) return null;
    if (maxRow !== i) {
      [matrix[i], matrix[maxRow]] = [matrix[maxRow], matrix[i]];
      [vector[i], vector[maxRow]] = [vector[maxRow], vector[i]];
    }
    for (let r = i + 1; r < size; r += 1) {
      const factor = matrix[r][i] / matrix[i][i];
      for (let c = i; c < size; c += 1) {
        matrix[r][c] -= factor * matrix[i][c];
      }
      vector[r] -= factor * vector[i];
    }
  }
  const solution = new Array(size).fill(0);
  for (let i = size - 1; i >= 0; i -= 1) {
    let sum = vector[i];
    for (let c = i + 1; c < size; c += 1) {
      sum -= matrix[i][c] * solution[c];
    }
    solution[i] = sum / matrix[i][i];
  }
  return solution;
};

const fitPolynomial = (points: SpeedSample[], degree: number) => {
  if (points.length < degree + 1) return null;
  const minDist = points[0].dist;
  const maxDist = points[points.length - 1].dist;
  const range = maxDist - minDist;
  if (range <= 0) return null;
  const sumX = new Array(degree * 2 + 1).fill(0);
  const sumY = new Array(degree + 1).fill(0);
  for (const point of points) {
    const x = (point.dist - minDist) / range;
    let xPow = 1;
    for (let i = 0; i <= degree * 2; i += 1) {
      sumX[i] += xPow;
      if (i <= degree) {
        sumY[i] += point.speed * xPow;
      }
      xPow *= x;
    }
  }
  const matrix = new Array(degree + 1).fill(0).map(() => new Array(degree + 1).fill(0));
  const vector = new Array(degree + 1).fill(0);
  for (let i = 0; i <= degree; i += 1) {
    for (let j = 0; j <= degree; j += 1) {
      matrix[i][j] = sumX[i + j];
    }
    vector[i] = sumY[i];
  }
  const coeffs = solveLinearSystem(matrix, vector);
  if (!coeffs) return null;
  return { coeffs, minDist, maxDist, range };
};

const smoothChunk = (points: SpeedSample[], samples: number) => {
  if (points.length < 3) return points;
  const ordered = [...points].sort((a, b) => a.dist - b.dist);
  const fit = fitPolynomial(ordered, 2);
  if (!fit) return ordered;
  const { coeffs, minDist, range } = fit;
  const smoothed: SpeedSample[] = [];
  const steps = Math.max(3, samples);
  for (let i = 0; i < steps; i += 1) {
    const ratio = steps === 1 ? 0 : i / (steps - 1);
    const dist = minDist + ratio * range;
    let speed = 0;
    let xPow = 1;
    for (let p = 0; p < coeffs.length; p += 1) {
      speed += coeffs[p] * xPow;
      xPow *= ratio;
    }
    const clampedSpeed = Math.max(0, Math.min(400, speed));
    smoothed.push({ dist: Math.round(dist), speed: Math.round(clampedSpeed) });
  }
  return smoothed;
};

const smoothCurveChunked = (points: SpeedSample[], chunkMode: 'p1' | 'p2' | 'p5' | 'sector', totalDistance?: number, sectors?: { startDistance: number; endDistance: number }[]) => {
  if (points.length < 3) return points;
  const ordered = [...points].sort((a, b) => a.dist - b.dist);
  const minDist = ordered[0].dist;
  const maxDist = ordered[ordered.length - 1].dist;
  const range = maxDist - minDist;
  if (range <= 0) return ordered;
  const bounds: Array<[number, number]> = [];
  if (chunkMode === 'sector' && sectors && sectors.length) {
    sectors.forEach(sector => {
      bounds.push([sector.startDistance, sector.endDistance]);
    });
    if (bounds[bounds.length - 1][1] < totalDistance) {
      bounds[bounds.length - 1][1] = totalDistance ?? bounds[bounds.length - 1][1];
    }
  } else {
    const pct = chunkMode === 'p1' ? 0.01 : chunkMode === 'p2' ? 0.02 : 0.05;
    const span = (totalDistance ?? range) * pct;
    let cursor = minDist;
    while (cursor < maxDist) {
      const end = Math.min(maxDist, cursor + span);
      bounds.push([cursor, end]);
      cursor = end;
    }
  }
  const totalSpan = (totalDistance ?? range) || range;
  const smoothed: SpeedSample[] = [];
  bounds.forEach(([start, end]) => {
    const chunk = ordered.filter(point => point.dist >= start && point.dist <= end);
    if (!chunk.length) return;
    const chunkSpan = Math.max(1, end - start);
    const sampleCount = Math.max(6, Math.round((chunkSpan / totalSpan) * 200));
    smoothed.push(...smoothChunk(chunk, sampleCount));
  });
  return smoothed.length ? smoothed : ordered;
};

interface TelemetryPanelProps {
  raceState: RaceState | null;
  defaultDriverIds?: string[];
  telemetryMetadata?: TrackTelemetryMetadata;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ raceState, defaultDriverIds = [], telemetryMetadata }) => {
  const activeSessionType = useRaceStore(state => state.activeSessionType);
  const isTimedSession = activeSessionType.startsWith('fp') || activeSessionType.startsWith('q');
  const [activeTab, setActiveTab] = useState<'weather' | 'speed' | 'psychology'>('weather');
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(defaultDriverIds ?? []);
  const [smoothMode, setSmoothMode] = useState<'p1' | 'p2' | 'p5' | 'sector'>('p2');
  const [showOpenF1Raw, setShowOpenF1Raw] = useState(true);
  const [showOpenF1Smooth, setShowOpenF1Smooth] = useState(true);
  const [showGame, setShowGame] = useState(false);

  if (!raceState) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Waiting for session data
      </div>
    );
  }

  useEffect(() => {
      if (selectedDriverIds.length === 0 && defaultDriverIds && defaultDriverIds.length > 0) {
          setSelectedDriverIds(defaultDriverIds);
      }
  }, [defaultDriverIds, selectedDriverIds.length]);

  // Default to leader if no drivers selected
  const activeDriverIds = selectedDriverIds.length > 0 
      ? selectedDriverIds 
      : [raceState.vehicles.find(v => v.position === 1)?.id || ''];

  // Toggle selection
  const toggleDriver = (id: string) => {
      setSelectedDriverIds(prev => {
          if (prev.includes(id)) {
              return prev.filter(d => d !== id);
          }
          if (prev.length >= 5) return prev; // Limit to 5
          return [...prev, id];
      });
  };

  const weatherWindowStart = Math.floor(raceState.elapsedTime / 60);
  const weatherWindowEnd = weatherWindowStart + 30;
  const weatherData = useMemo(() => {
    const currentPoint = {
      time: weatherWindowStart,
      cloudCover: Math.round(raceState.cloudCover),
      rain: Math.round(raceState.rainIntensityLevel)
    };

    const futurePoints = raceState.weatherForecast
      .filter(item => item.timeOffset > raceState.elapsedTime)
      .map(item => ({
        time: item.timeOffset / 60,
        cloudCover: Math.round(item.cloudCover),
        rain: Math.round(item.rainIntensity)
      }))
      .filter(item => item.time >= weatherWindowStart && item.time <= weatherWindowEnd);

    const series = [currentPoint, ...futurePoints].sort((a, b) => a.time - b.time);
    if (series.length < 2) {
      series.push({
        time: weatherWindowEnd,
        cloudCover: currentPoint.cloudCover,
        rain: currentPoint.rain
      });
    }

    return series;
  }, [raceState.cloudCover, raceState.elapsedTime, raceState.rainIntensityLevel, raceState.weatherForecast, weatherWindowEnd, weatherWindowStart]);

  // Prepare Speed Data (Last Lap)
  // We need to merge multiple driver traces into one dataset based on distance?
  // Or just render multiple Lines on the same chart if they have same X axis?
  // They might have slightly different distance points due to recording intervals?
  // Recharts LineChart prefers a single array of objects if using XAxis 'category' or unified index.
  // But if XAxis is type="number", we can just plot multiple lines?
  // Actually, Recharts requires a single `data` array prop for the Chart, and keys for lines.
  // BUT, if the X values (distance) are not identical, it's tricky.
  // However, we record at ~10m intervals. We can align them or just use one driver's distance as reference?
  // Better: "Scatter" style line chart or just use the first driver's distance axis and interpolate?
  // Simplest: Combine all points into one array sorted by distance, with nulls for others?
  // Or: Use `dataKey` with different arrays? No, Recharts `data` is global.
  // Wait, if we use `type="number"` for XAxis, we can have multiple data series?
  // Recharts 2.x supports `data` on `Line` component directly!
  // Let's check if installed version supports it. Package.json says recharts ^3.7.0. Yes.
  
  // Group selected drivers by team to determine styling
  const driversByTeam: Record<string, string[]> = {};
  activeDriverIds.forEach(id => {
      const driver = DRIVERS.find(d => d.id === id);
      if (driver) {
          if (!driversByTeam[driver.team]) driversByTeam[driver.team] = [];
          driversByTeam[driver.team].push(id);
      }
  });

  const getDriverStyle = (id: string) => {
      const driver = DRIVERS.find(d => d.id === id);
      if (!driver) return { stroke: '#888', strokeDasharray: undefined };
      
      const teamMates = driversByTeam[driver.team] || [];
      // If multiple teammates selected, make the second one dashed
      const isSecond = teamMates.indexOf(id) > 0;
      
      return {
          stroke: driver.color,
          strokeDasharray: isSecond ? "5 5" : undefined
      };
  };

  const liveSpeedReadouts = activeDriverIds
      .map(id => {
          const vehicle = raceState.vehicles.find(v => v.id === id);
          if (!vehicle) return null;
          const driver = DRIVERS.find(d => d.id === id);
          return {
              id,
              speed: Math.round(vehicle.speed * 3.6),
              color: driver?.color || '#888'
          };
      })
      .filter(Boolean) as { id: string; speed: number; color: string }[];
  const activeTrack = TRACKS.find(track => track.id === raceState.trackId);
  const rawTelemetryPoints = Array.isArray(activeTrack?.telemetryPoints) ? activeTrack.telemetryPoints : [];
  const openF1Curve = rawTelemetryPoints.map(p => ({
    dist: Math.round(p.dist),
    speed: Math.round(p.speed * 3.6) // convert back to kph for display
  }));
  
  const openF1SmoothCurve = openF1Curve.length
      ? smoothCurveChunked(openF1Curve, smoothMode, activeTrack?.totalDistance, activeTrack?.sectors)
      : [];
  const gameSpeedChartData = activeDriverIds.reduce<SpeedSample[]>((acc, id) => {
      if (acc.length) return acc;
      const vehicle = raceState.vehicles.find(v => v.id === id);
      if (!vehicle) return acc;
      const lastLapTrace = vehicle.telemetry.lastLapSpeedTrace ?? [];
      const currentLapTrace = vehicle.telemetry.currentLapSpeedTrace ?? [];
      const lastLap = lastLapTrace.map(p => ({
          dist: Math.round(p.distance),
          speed: Math.round(p.speed * 3.6)
      }));
      if (lastLap.length) return lastLap;
      return currentLapTrace.map(p => ({
          dist: Math.round(p.distance),
          speed: Math.round(p.speed * 3.6)
      }));
  }, []);
  const hasLiveTelemetryTrace = activeDriverIds.some(id => {
    const vehicle = raceState.vehicles.find(v => v.id === id);
    if (!vehicle) return false;
    return (vehicle.telemetry.lastLapSpeedTrace?.length ?? 0) > 0 || (vehicle.telemetry.currentLapSpeedTrace?.length ?? 0) > 0;
  });
  const showTelemetryUnavailableHint = !openF1Curve.length && !hasLiveTelemetryTrace;
  const speedChartData = openF1Curve.length ? openF1Curve : gameSpeedChartData;
  const telemetrySourceLabel = telemetryMetadata?.source === 'openf1-calculated'
    ? 'PRECOMPUTED'
    : telemetryMetadata?.source === 'openf1-runtime-fallback'
      ? 'RUNTIME FALLBACK'
      : 'DEFAULT TRACK';
  const telemetryCoverageLabel = telemetryMetadata?.coverage
    ? `${Math.round((telemetryMetadata.coverage.coveredRatio ?? 0) * 100)}%`
    : null;

  return (
    <div className="flex h-full w-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Telemetry</h3>
        <div className="flex gap-2 rounded bg-zinc-100 p-1 dark:bg-zinc-900">
            <button
                onClick={() => setActiveTab('weather')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'weather' ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
                WEATHER
            </button>
            <button
                onClick={() => setActiveTab('speed')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'speed' ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
                SPEED
            </button>
            <button
                onClick={() => setActiveTab('psychology')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'psychology' ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
                PSYCHOLOGY
            </button>
        </div>
      </div>

      <div className="flex-1 min-h-[260px] relative w-full min-w-0">
          {activeTab === 'weather' && (
              <div className="h-full flex flex-col">
                  <div className="mb-2 flex justify-between font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{isTimedSession ? 'Session' : 'Current'}: {raceState.weather.toUpperCase()}</span>
                      <span>{isTimedSession ? 'Track evolution' : 'Rain'}: {Math.round(raceState.rainIntensityLevel)}%</span>
                  </div>
                  <div className="flex-1 min-h-[220px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
                        <LineChart data={weatherData}>
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="time"
                                type="number"
                                domain={[weatherWindowStart, weatherWindowEnd]}
                                stroke="#666"
                                tick={{fontSize: 10}}
                                tickFormatter={(val) => `+${Math.max(0, Math.round(val - weatherWindowStart))}`}
                                label={{ value: 'Mins (+)', position: 'insideBottomRight', offset: -5 }}
                            />
                            <YAxis stroke="#666" tick={{fontSize: 10}} domain={[0, 100]} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#222', borderColor: '#444', fontSize: '12px' }}
                                itemStyle={{ padding: 0 }}
                                labelFormatter={(val) => `+${Math.max(0, Number(val) - weatherWindowStart).toFixed(1)} min`}
                            />
                            <Legend verticalAlign="top" height={36}/>
                            <Line type="monotone" dataKey="rain" stroke="#0099ff" strokeWidth={2} dot={weatherData.length <= 2} isAnimationActive={false} connectNulls name="Rain %" />
                            <Line type="monotone" dataKey="cloudCover" stroke="#aaa" strokeWidth={2} dot={weatherData.length <= 2} isAnimationActive={false} connectNulls name="Clouds %" />
                        </LineChart>
                    </ResponsiveContainer>
                  </div>
              </div>
          )}

          {activeTab === 'speed' && (
              <div className="h-full flex flex-col">
                  <div className="mb-2 flex flex-col gap-2">
                      <div className="flex gap-2 items-center">
                          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center flex-1">
                              <span className="mr-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">SELECT:</span>
                              {raceState.vehicles.sort((a,b) => a.position - b.position).map(v => {
                                  const isSelected = activeDriverIds.includes(v.id);
                                  const driver = DRIVERS.find(d => d.id === v.id);
                                  const color = driver?.color || '#888';
                                  
                                  return (
                                    <button 
                                        key={v.id}
                                        onClick={() => toggleDriver(v.id)}
                                        className={`px-2 py-0.5 text-[10px] rounded border whitespace-nowrap transition-all ${
                                            isSelected
                                            ? 'bg-zinc-200 text-zinc-900 ring-1 dark:bg-zinc-800 dark:text-white'
                                            : 'border-zinc-300 bg-zinc-50 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500'
                                        }`}
                                        style={isSelected ? { borderColor: color, boxShadow: `0 0 5px ${color}40`, backgroundColor: 'rgba(24, 24, 27, 0.9)', color: '#ffffff' } : {}}
                                    >
                                        <span style={{color: isSelected ? color : 'inherit'}} className="font-bold mr-1">{v.position}</span>
                                        {v.id.toUpperCase()}
                                    </button>
                                  );
                              })}
                          </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 font-mono">
                          <span className="text-gray-500">LIVE:</span>
                          {liveSpeedReadouts.map(readout => (
                              <div key={readout.id} className="px-2 py-0.5 rounded border border-[#333] bg-[#141414]">
                                  <span style={{ color: readout.color }} className="font-bold mr-1">{readout.id.toUpperCase()}</span>
                                  {readout.speed} kph
                              </div>
                          ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 font-mono">
                          <span className="text-gray-500">SOURCE:</span>
                          <div className="px-2 py-0.5 rounded border border-[#333] bg-[#141414] text-gray-200">
                              {telemetrySourceLabel}
                          </div>
                          {telemetryCoverageLabel && (
                              <div className="px-2 py-0.5 rounded border border-[#333] bg-[#141414] text-gray-300">
                                  COV {telemetryCoverageLabel}
                              </div>
                          )}
                          {typeof telemetryMetadata?.lapCount === 'number' && telemetryMetadata.lapCount > 0 && (
                              <div className="px-2 py-0.5 rounded border border-[#333] bg-[#141414] text-gray-300">
                                  LAPS {telemetryMetadata.lapCount}
                              </div>
                          )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 font-mono">
                          <span className="text-gray-500">SMOOTH:</span>
                          {[
                              { id: 'p1', label: '1%' },
                              { id: 'p2', label: '2%' },
                              { id: 'p5', label: '5%' },
                              { id: 'sector', label: 'SECTOR' }
                          ].map(option => (
                              <button
                                  key={option.id}
                                  onClick={() => setSmoothMode(option.id as typeof smoothMode)}
                                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                      smoothMode === option.id ? 'bg-[#2a2a2a] text-white border-[#666]' : 'border-[#333] text-gray-400 hover:text-gray-200'
                                  }`}
                              >
                                  {option.label}
                              </button>
                          ))}
                          <span className="ml-2 text-gray-500">SHOW:</span>
                          <button
                              onClick={() => setShowOpenF1Raw(prev => !prev)}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                  showOpenF1Raw ? 'bg-[#2a2a2a] text-white border-[#666]' : 'border-[#333] text-gray-400 hover:text-gray-200'
                              }`}
                          >
                              OPENF1 RAW
                          </button>
                          <button
                              onClick={() => setShowOpenF1Smooth(prev => !prev)}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                  showOpenF1Smooth ? 'bg-[#2a2a2a] text-white border-[#666]' : 'border-[#333] text-gray-400 hover:text-gray-200'
                              }`}
                          >
                              OPENF1 SMOOTH
                          </button>
                          <button
                              onClick={() => setShowGame(prev => !prev)}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                  showGame ? 'bg-[#2a2a2a] text-white border-[#666]' : 'border-[#333] text-gray-400 hover:text-gray-200'
                              }`}
                          >
                              GAME
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 min-h-[220px] w-full min-w-0">
                    {showTelemetryUnavailableHint && (
                      <div className="mb-3 rounded border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-zinc-400">
                        Live synced telemetry traces are unavailable for remote viewers. Speed chart is limited to local traces or OpenF1 track data.
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
                        <LineChart data={speedChartData}>
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="dist" 
                                stroke="#666" 
                                tick={{fontSize: 10}} 
                                type="number" 
                                domain={['dataMin', 'dataMax']}
                                allowDataOverflow
                                tickFormatter={(val) => `${(val/1000).toFixed(1)}km`}
                            />
                            <YAxis 
                                stroke="#666" 
                                tick={{fontSize: 10}} 
                                domain={[0, 360]} 
                                unit="kph"
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#222', borderColor: '#444', fontSize: '12px' }}
                                labelFormatter={(val) => `Dist: ${val}m`}
                            />
                            <Legend />
                            {showOpenF1Raw && openF1Curve.length > 0 && (
                                <Line 
                                    data={openF1Curve}
                                    type="monotone" 
                                    dataKey="speed" 
                                    name="OPENF1 RAW"
                                    stroke="#f59e0b" 
                                    dot={false} 
                                    strokeWidth={2} 
                                    isAnimationActive={false}
                                />
                            )}
                            {showOpenF1Smooth && openF1SmoothCurve.length > 0 && (
                                <Line 
                                    data={openF1SmoothCurve}
                                    type="monotone" 
                                    dataKey="speed" 
                                    name="OPENF1 SMOOTH"
                                    stroke="#fbbf24" 
                                    dot={false} 
                                    strokeWidth={3} 
                                    isAnimationActive={false}
                                />
                            )}
                            {showGame && activeDriverIds.map(id => {
                                const vehicle = raceState.vehicles.find(v => v.id === id);
                                if (!vehicle) return null;
                                const currentLapTrace = vehicle.telemetry.currentLapSpeedTrace ?? [];
                                const lastLapTrace = vehicle.telemetry.lastLapSpeedTrace ?? [];
                                const simulatedData: SpeedSample[] = (currentLapTrace.length
                                    ? currentLapTrace
                                    : lastLapTrace
                                ).map(p => ({
                                    dist: Math.round(p.distance),
                                    speed: Math.round(p.speed * 3.6)
                                }));
                                if (simulatedData.length === 0) return null;
                                const style = getDriverStyle(id);
                                return (
                                    <Line
                                        key={id}
                                        data={simulatedData}
                                        type="monotone"
                                        dataKey="speed"
                                        name={`GAME ${id.toUpperCase()}`}
                                        stroke={style.stroke}
                                        strokeDasharray="6 4"
                                        dot={false}
                                        strokeWidth={1.5}
                                        isAnimationActive={false}
                                    />
                                );
                            })}
                        </LineChart>
                    </ResponsiveContainer>
                  </div>
              </div>
          )}

          {activeTab === 'psychology' && (
              <div className="flex flex-col gap-4 h-full">
                  {/* Top Section: Detailed Bars for Selected Drivers */}
                  <div className="flex-1 min-h-0 bg-[#1e1e1e] rounded p-4 border border-[#333] overflow-y-auto">
                        <h4 className="text-sm text-gray-300 mb-4 uppercase tracking-wider font-semibold border-b border-gray-700 pb-2">Driver Focus & Morale</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeDriverIds.map(id => {
                            const vehicle = raceState.vehicles.find(v => v.id === id);
                            const driver = DRIVERS.find(d => d.id === id);
                            if (!vehicle || !driver) return null;
                            
                            const morale = vehicle.morale || 0;
                            const concentration = vehicle.concentration !== undefined ? vehicle.concentration : 100;
                            
                            return (
                                <div key={id} className="bg-[#2a2a2a] p-3 rounded border border-[#444]">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold text-sm" style={{ color: driver.color }}>{driver.name}</span>
                                        <span className="text-xs text-gray-500">#{vehicle.position}</span>
                                    </div>
                                    
                                    {/* Morale Bar */}
                                    <div className="mb-3">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-gray-400">Confidence</span>
                                            <span className="text-gray-300">{Math.round(morale)}%</span>
                                        </div>
                                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                                            <div 
                                                className="h-full transition-all duration-300"
                                                style={{ 
                                                    width: `${morale}%`, 
                                                    backgroundColor: morale > 80 ? '#4ade80' : morale < 50 ? '#ef4444' : '#fbbf24'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Concentration Bar */}
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-gray-400">Focus</span>
                                            <span className="text-gray-300">{Math.round(concentration)}%</span>
                                        </div>
                                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                                            <div 
                                                className="h-full transition-all duration-300"
                                                style={{ 
                                                    width: `${concentration}%`, 
                                                    backgroundColor: concentration > 80 ? '#3b82f6' : concentration < 50 ? '#f97316' : '#60a5fa'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                  </div>

                  {/* Bottom Section: Chart (Optional or hidden if redundant) */}
                  {/* Keeping chart small at bottom or removing it? Let's keep it but smaller */}
                  <div className="h-1/3 min-h-[150px] bg-[#1e1e1e] rounded p-2 border border-[#333] w-full min-w-0">
                       <h4 className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Field Overview</h4>
                       <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                           <ComposedChart data={activeDriverIds.map(id => {
                               const v = raceState.vehicles.find(v => v.id === id);
                               const d = DRIVERS.find(d => d.id === id);
                               return {
                                   name: d?.name || id,
                                   morale: v?.morale || 0,
                                   concentration: v?.concentration || 0
                               };
                           })}>
                               <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                               <XAxis dataKey="name" stroke="#666" fontSize={10} />
                               <YAxis domain={[0, 100]} stroke="#666" fontSize={10} />
                               <Tooltip 
                                   contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                                   labelStyle={{ color: '#888' }}
                               />
                               <Legend />
                               <Bar dataKey="morale" fill="#4ade80" name="Morale" barSize={20} />
                               <Bar dataKey="concentration" fill="#3b82f6" name="Focus" barSize={20} />
                           </ComposedChart>
                       </ResponsiveContainer>
                  </div>
               </div>
           )}
      </div>
    </div>
  );
};
