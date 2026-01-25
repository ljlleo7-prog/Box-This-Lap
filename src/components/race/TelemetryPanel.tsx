import React, { useState } from 'react';
import { RaceState } from '../../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, ComposedChart } from 'recharts';

interface TelemetryPanelProps {
  raceState: RaceState;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ raceState }) => {
  const [activeTab, setActiveTab] = useState<'weather' | 'speed'>('weather');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // Default to leader if no driver selected
  const targetDriverId = selectedDriverId || raceState.vehicles.find(v => v.position === 1)?.id;
  const targetVehicle = raceState.vehicles.find(v => v.id === targetDriverId);

  // Prepare Weather Data
  const weatherData = raceState.weatherForecast.map(item => ({
    time: Math.round(item.timeOffset / 60), // Mins
    cloudCover: Math.round(item.cloudCover),
    rain: Math.round(item.rainIntensity)
  })).filter(item => item.time >= Math.floor(raceState.elapsedTime / 60)); // Only future/current

  // Prepare Speed Data (Last Lap)
  // Downsample if needed? Recharts handles reasonable amount.
  const speedData = targetVehicle?.telemetry.lastLapSpeedTrace.map(p => ({
      dist: Math.round(p.distance),
      speed: Math.round(p.speed * 3.6) // m/s to kph
  })) || [];

  return (
    <div className="bg-[#111] rounded-xl border border-[#333] p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-gray-400 text-sm uppercase tracking-widest font-mono">Telemetry</h3>
        <div className="flex gap-2 bg-[#222] rounded p-1">
            <button 
                onClick={() => setActiveTab('weather')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'weather' ? 'bg-[#444] text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
                WEATHER
            </button>
            <button 
                onClick={() => setActiveTab('speed')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'speed' ? 'bg-[#444] text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
                SPEED
            </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
          {activeTab === 'weather' && (
              <div className="h-full flex flex-col">
                  <div className="mb-2 flex justify-between text-xs text-gray-400 font-mono">
                      <span>Current: {raceState.weather.toUpperCase()}</span>
                      <span>Rain: {Math.round(raceState.rainIntensityLevel)}%</span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={weatherData}>
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="time" stroke="#666" tick={{fontSize: 10}} label={{ value: 'Mins', position: 'insideBottomRight', offset: -5 }} />
                            <YAxis stroke="#666" tick={{fontSize: 10}} domain={[0, 100]} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#222', borderColor: '#444', fontSize: '12px' }}
                                itemStyle={{ padding: 0 }}
                            />
                            <Area type="monotone" dataKey="rain" stroke="#0099ff" fill="#0099ff" fillOpacity={0.3} name="Rain %" />
                            <Line type="monotone" dataKey="cloudCover" stroke="#aaa" dot={false} strokeWidth={2} name="Clouds %" />
                        </ComposedChart>
                    </ResponsiveContainer>
                  </div>
              </div>
          )}

          {activeTab === 'speed' && (
              <div className="h-full flex flex-col">
                  <div className="mb-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {raceState.vehicles.sort((a,b) => a.position - b.position).map(v => (
                          <button 
                            key={v.id}
                            onClick={() => setSelectedDriverId(v.id)}
                            className={`px-2 py-0.5 text-[10px] rounded border whitespace-nowrap ${
                                v.id === targetDriverId 
                                ? 'bg-[#00FFFF] text-black border-[#00FFFF]' 
                                : 'bg-[#222] text-gray-400 border-[#444] hover:border-[#666]'
                            }`}
                          >
                              {v.position}. {v.id}
                          </button>
                      ))}
                  </div>
                  
                  {speedData.length > 0 ? (
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={speedData}>
                                <CartesianGrid stroke="#333" strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="dist" 
                                    stroke="#666" 
                                    tick={{fontSize: 10}} 
                                    type="number" 
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={(val) => `${(val/1000).toFixed(1)}km`}
                                />
                                <YAxis 
                                    stroke="#666" 
                                    tick={{fontSize: 10}} 
                                    domain={[0, 350]} 
                                    unit="kph"
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#222', borderColor: '#444', fontSize: '12px' }}
                                    labelFormatter={(val) => `Dist: ${val}m`}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="speed" 
                                    stroke="#00FFFF" 
                                    dot={false} 
                                    strokeWidth={2} 
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                      </div>
                  ) : (
                      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                          No lap data available yet. Complete a lap to view telemetry.
                      </div>
                  )}
              </div>
          )}
      </div>
    </div>
  );
};
