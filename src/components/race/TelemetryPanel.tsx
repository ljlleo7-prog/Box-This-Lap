import React, { useState } from 'react';
import { RaceState } from '../../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, ComposedChart, Legend, Bar } from 'recharts';
import { DRIVERS } from '../../data/initialData';

interface TelemetryPanelProps {
  raceState: RaceState;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ raceState }) => {
  const [activeTab, setActiveTab] = useState<'weather' | 'speed' | 'psychology'>('weather');
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);

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

  // Prepare Weather Data
  const currentPoint = {
      time: 0,
      cloudCover: Math.round(raceState.cloudCover),
      rain: Math.round(raceState.rainIntensityLevel)
  };
  
  const futurePoints = raceState.weatherForecast
      .filter(item => item.timeOffset > raceState.elapsedTime)
      .map(item => ({
          time: (item.timeOffset - raceState.elapsedTime) / 60, // Relative Mins
          cloudCover: Math.round(item.cloudCover),
          rain: Math.round(item.rainIntensity)
      }));
      
  const weatherData = [currentPoint, ...futurePoints].sort((a, b) => a.time - b.time); 
  // Removed strict filtering to prevent line disappearing when between data points
  // .filter(item => item.time >= Math.floor(raceState.elapsedTime / 60));

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
            <button 
                onClick={() => setActiveTab('psychology')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'psychology' ? 'bg-[#444] text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
                PSYCHOLOGY
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
                  <div className="flex-1 min-h-0" key="weather-chart-container">
                    <ResponsiveContainer width="100%" height="100%" key={`weather-chart-${activeTab}`}>
                        <ComposedChart data={weatherData}>
                            <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                            <XAxis 
                                dataKey="time" 
                                type="number"
                                domain={[0, 30]}
                                stroke="#666" 
                                tick={{fontSize: 10}} 
                                label={{ value: 'Mins (+)', position: 'insideBottomRight', offset: -5 }} 
                            />
                            <YAxis stroke="#666" tick={{fontSize: 10}} domain={[0, 100]} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#222', borderColor: '#444', fontSize: '12px' }}
                                itemStyle={{ padding: 0 }}
                                labelFormatter={(val) => `+${val} min`}
                            />
                            <Legend verticalAlign="top" height={36}/>
                            <Line type="monotone" dataKey="rain" stroke="#0099ff" strokeWidth={2} dot={false} name="Rain %" />
                            <Line type="monotone" dataKey="cloudCover" stroke="#aaa" strokeWidth={2} dot={false} name="Clouds %" />
                        </ComposedChart>
                    </ResponsiveContainer>
                  </div>
              </div>
          )}

          {activeTab === 'speed' && (
              <div className="h-full flex flex-col">
                  {/* Driver Selector Bar */}
                  <div className="mb-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center">
                      <span className="text-[10px] text-gray-500 font-mono mr-1">SELECT:</span>
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
                                    ? `bg-[#222] text-white border-[${color}] ring-1 ring-[${color}]`
                                    : 'bg-[#111] text-gray-500 border-[#333] hover:border-[#555]'
                                }`}
                                style={isSelected ? { borderColor: color, boxShadow: `0 0 5px ${color}40` } : {}}
                            >
                                <span style={{color: isSelected ? color : 'inherit'}} className="font-bold mr-1">{v.position}</span>
                                {v.id.toUpperCase()}
                            </button>
                          );
                      })}
                  </div>
                  
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart>
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
                            {activeDriverIds.map(id => {
                                const vehicle = raceState.vehicles.find(v => v.id === id);
                                if (!vehicle) return null;
                                const data = vehicle.telemetry.lastLapSpeedTrace.map(p => ({
                                    dist: Math.round(p.distance),
                                    speed: Math.round(p.speed * 3.6)
                                }));
                                
                                if (data.length === 0) return null;
                                const style = getDriverStyle(id);

                                return (
                                    <Line 
                                        key={id}
                                        data={data}
                                        type="monotone" 
                                        dataKey="speed" 
                                        name={id.toUpperCase()}
                                        stroke={style.stroke} 
                                        strokeDasharray={style.strokeDasharray}
                                        dot={false} 
                                        strokeWidth={2} 
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
                  <div className="h-1/3 min-h-[150px] bg-[#1e1e1e] rounded p-2 border border-[#333]">
                       <h4 className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Field Overview</h4>
                       <ResponsiveContainer width="100%" height="100%">
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
