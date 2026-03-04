import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Zap, Activity, Microscope, Wind, Gauge, Battery, Thermometer, Clock } from 'lucide-react';
import { TCC_API } from '../lib/tcc-api';
import { Team, TeamSpecs } from '../types';
import { TEAM_TEMPLATES } from '../data/teams';

type SpecKey = keyof TeamSpecs;

type FocusOption = {
  id: string;
  label: string;
  effects: Partial<TeamSpecs>;
};

type ResearchProject = {
  id: string;
  name: string;
  category: string;
  icon: React.ElementType;
  focusOptions: FocusOption[];
};

const SPEC_KEYS: SpecKey[] = [
  'acceleration',
  'braking',
  'drag_reduction',
  'cornering_low',
  'cornering_mid',
  'cornering_high',
  'ers_efficiency',
  'cooling',
  'lifespan',
  'drs_efficiency'
];

const FALLBACK_SPECS: TeamSpecs = {
  acceleration: 75,
  braking: 82,
  drag_reduction: 68,
  cornering_low: 70,
  cornering_mid: 75,
  cornering_high: 80,
  ers_efficiency: 85,
  cooling: 90,
  lifespan: 100,
  drs_efficiency: 78
};

const PROJECTS: ResearchProject[] = [
  {
    id: 'front-wing',
    name: 'Front Wing',
    category: 'Aerodynamics',
    icon: Wind,
    focusOptions: [
      { id: 'downforce', label: 'Downforce', effects: { cornering_high: 1.2, cornering_mid: 0.8, drag_reduction: -0.4 } },
      { id: 'balance', label: 'Balance', effects: { cornering_high: 0.6, cornering_mid: 0.6, cornering_low: 0.4 } },
      { id: 'efficiency', label: 'Efficiency', effects: { drag_reduction: 1.0, drs_efficiency: 0.6 } }
    ]
  },
  {
    id: 'floor',
    name: 'Floor',
    category: 'Ground Effect',
    icon: Activity,
    focusOptions: [
      { id: 'ground-effect', label: 'Ground Effect', effects: { cornering_mid: 1.1, cornering_low: 0.7, drag_reduction: -0.3 } },
      { id: 'stability', label: 'Stability', effects: { cornering_low: 0.8, braking: 0.4, cooling: 0.2 } },
      { id: 'efficiency', label: 'Efficiency', effects: { drag_reduction: 0.8, drs_efficiency: 0.4 } }
    ]
  },
  {
    id: 'rear-wing',
    name: 'Rear Wing',
    category: 'Aero Balance',
    icon: Gauge,
    focusOptions: [
      { id: 'high-downforce', label: 'High Downforce', effects: { cornering_high: 0.9, cornering_mid: 0.7, drag_reduction: -0.5 } },
      { id: 'low-drag', label: 'Low Drag', effects: { drag_reduction: 1.1, drs_efficiency: 0.6 } },
      { id: 'balance', label: 'Balance', effects: { cornering_mid: 0.6, braking: 0.4 } }
    ]
  },
  {
    id: 'suspension',
    name: 'Suspension',
    category: 'Mechanical Grip',
    icon: Activity,
    focusOptions: [
      { id: 'grip', label: 'Grip', effects: { cornering_low: 1.0, braking: 0.5 } },
      { id: 'tyre-life', label: 'Tyre Life', effects: { lifespan: 0.9, cooling: 0.4 } },
      { id: 'response', label: 'Response', effects: { cornering_mid: 0.6, cornering_high: 0.4 } }
    ]
  },
  {
    id: 'power-unit',
    name: 'Power Unit',
    category: 'Energy Delivery',
    icon: Zap,
    focusOptions: [
      { id: 'driveability', label: 'Driveability', effects: { acceleration: 1.0, cooling: 0.4 } },
      { id: 'efficiency', label: 'Efficiency', effects: { ers_efficiency: 0.8, drag_reduction: 0.3 } },
      { id: 'power', label: 'Power', effects: { acceleration: 1.2, drs_efficiency: 0.2 } }
    ]
  },
  {
    id: 'cooling',
    name: 'Cooling Package',
    category: 'Reliability',
    icon: Thermometer,
    focusOptions: [
      { id: 'thermal', label: 'Thermal Control', effects: { cooling: 1.2, lifespan: 0.6 } },
      { id: 'weight', label: 'Weight Saving', effects: { drag_reduction: 0.4, acceleration: 0.4, cooling: -0.3 } },
      { id: 'reliability', label: 'Reliability', effects: { lifespan: 1.0, braking: 0.3 } }
    ]
  },
  {
    id: 'energy-store',
    name: 'Energy Store',
    category: 'ERS',
    icon: Battery,
    focusOptions: [
      { id: 'capacity', label: 'Capacity', effects: { ers_efficiency: 1.1, cooling: 0.2 } },
      { id: 'deployment', label: 'Deployment', effects: { acceleration: 0.6, ers_efficiency: 0.6 } },
      { id: 'durability', label: 'Durability', effects: { lifespan: 0.7, cooling: 0.4 } }
    ]
  }
];

const roundUpTwo = (value: number) => Math.ceil(value * 100) / 100;
const MAX_PROJECTS = 4;
const MAX_MANUFACTURING = 4;

export const ResearchDevelopment: React.FC = () => {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTeamData = useCallback(async () => {
    try {
      const { data: championships } = await TCC_API.getChampionships();
      if (championships && championships.length > 0) {
        // Assume first championship for now or get from context/url
        const { data: myTeam } = await TCC_API.getMyTeam(championships[0].id);
        if (myTeam) {
            setTeam(myTeam);
        }
      }
    } catch (error) {
      console.error('Failed to load team data', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  const templateByName = useMemo(
    () => TEAM_TEMPLATES.reduce<Record<string, TeamSpecs>>((acc, template) => {
      acc[template.name] = template.specs;
      return acc;
    }, {}),
    []
  );

  const gridAverage = useMemo<TeamSpecs>(() => {
    const totals = SPEC_KEYS.reduce<Record<SpecKey, number>>((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<SpecKey, number>);

    TEAM_TEMPLATES.forEach(template => {
      SPEC_KEYS.forEach(key => {
        totals[key] += template.specs[key];
      });
    });

    const count = TEAM_TEMPLATES.length || 1;
    return SPEC_KEYS.reduce<TeamSpecs>((acc, key) => {
      acc[key] = totals[key] / count;
      return acc;
    }, { ...FALLBACK_SPECS });
  }, []);

  const baseSpecs = useMemo<TeamSpecs>(() => {
    const template = team?.name ? templateByName[team.name] : undefined;
    return template ?? team?.specs ?? FALLBACK_SPECS;
  }, [team, templateByName]);

  const [focusByProject, setFocusByProject] = useState<Record<string, string>>({});
  const [activeProjects, setActiveProjects] = useState<string[]>([]);
  const [manufacturingTasks, setManufacturingTasks] = useState<string[]>([]);

  const teamKey = team?.name || 'default';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-focus');
    const parsed = stored ? JSON.parse(stored) : {};
    const defaults = PROJECTS.reduce<Record<string, string>>((acc, project) => {
      acc[project.id] = '';
      return acc;
    }, {});
    const teamFocus = parsed[teamKey] || {};
    setFocusByProject({ ...defaults, ...teamFocus });
  }, [teamKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-projects');
    const parsed = stored ? JSON.parse(stored) : {};
    const teamProjects = parsed[teamKey] || [];
    setActiveProjects(teamProjects);
  }, [teamKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-manufacturing');
    const parsed = stored ? JSON.parse(stored) : {};
    const teamTasks = parsed[teamKey] || Array(MAX_MANUFACTURING).fill('');
    setManufacturingTasks(teamTasks);
  }, [teamKey]);

  const totalEffects = useMemo<Partial<TeamSpecs>>(() => {
    const totals = SPEC_KEYS.reduce<Record<SpecKey, number>>((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<SpecKey, number>);

    PROJECTS.forEach(project => {
      if (!activeProjects.includes(project.id)) return;
      const focusId = focusByProject[project.id];
      if (!focusId) return;
      const focus = project.focusOptions.find(option => option.id === focusId);
      if (!focus) return;
      Object.entries(focus.effects).forEach(([key, value]) => {
        totals[key as SpecKey] += value ?? 0;
      });
    });

    return totals;
  }, [focusByProject, activeProjects]);

  const effectiveSpecs = useMemo<TeamSpecs>(() => {
    return SPEC_KEYS.reduce<TeamSpecs>((acc, key) => {
      const nextValue = (baseSpecs[key] ?? 0) + (totalEffects[key] ?? 0);
      acc[key] = Math.max(0, Math.min(100, nextValue));
      return acc;
    }, { ...baseSpecs });
  }, [baseSpecs, totalEffects]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-team-specs');
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[teamKey] = effectiveSpecs;
    localStorage.setItem('rd-team-specs', JSON.stringify(parsed));
  }, [effectiveSpecs, teamKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-focus');
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[teamKey] = focusByProject;
    localStorage.setItem('rd-focus', JSON.stringify(parsed));
  }, [focusByProject, teamKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-projects');
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[teamKey] = activeProjects;
    localStorage.setItem('rd-projects', JSON.stringify(parsed));
  }, [activeProjects, teamKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('rd-manufacturing');
    const parsed = stored ? JSON.parse(stored) : {};
    parsed[teamKey] = manufacturingTasks;
    localStorage.setItem('rd-manufacturing', JSON.stringify(parsed));
  }, [manufacturingTasks, teamKey]);

  const renderSpecBar = (value: number, colorClass: string) => (
    <div className="h-2 bg-white/10 rounded-full overflow-hidden mt-2">
      <div 
        className={`h-full ${colorClass} transition-all duration-1000 ease-out`} 
        style={{ width: `${value}%` }}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-f1-red animate-pulse font-mono tracking-widest">LOADING R&D DATA...</div>
      </div>
    );
  }

  const formatValue = (value: number) => roundUpTwo(value).toFixed(2);

  const renderComparison = (value: number, avg: number) => {
    const delta = roundUpTwo(value - avg);
    const deltaLabel = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    return (
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>Grid Avg {formatValue(avg)}</span>
        <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>{deltaLabel}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="R&D" description="Research new technologies and develop car upgrades" />
      
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="border-t-4 border-t-blue-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400">
              <Wind size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Aerodynamics</h3>
              <p className="text-xs text-gray-400">Downforce & Drag</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Drag Reduction</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.drag_reduction)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.drag_reduction, gridAverage.drag_reduction)}
              {renderSpecBar(effectiveSpecs.drag_reduction, "bg-blue-500")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">DRS Efficiency</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.drs_efficiency)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.drs_efficiency, gridAverage.drs_efficiency)}
              {renderSpecBar(effectiveSpecs.drs_efficiency, "bg-blue-400")}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-t-4 border-t-purple-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-purple-500/20 rounded-lg text-purple-400">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Chassis</h3>
              <p className="text-xs text-gray-400">Handling & Balance</p>
            </div>
          </div>

          <div className="space-y-4">
             <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Low Speed Cornering</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cornering_low)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cornering_low, gridAverage.cornering_low)}
              {renderSpecBar(effectiveSpecs.cornering_low, "bg-purple-500")}
            </div>
             <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Mid Speed Cornering</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cornering_mid)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cornering_mid, gridAverage.cornering_mid)}
              {renderSpecBar(effectiveSpecs.cornering_mid, "bg-purple-400")}
            </div>
             <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">High Speed Cornering</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cornering_high)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cornering_high, gridAverage.cornering_high)}
              {renderSpecBar(effectiveSpecs.cornering_high, "bg-purple-300")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Braking</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.braking)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.braking, gridAverage.braking)}
              {renderSpecBar(effectiveSpecs.braking, "bg-red-400")}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-t-4 border-t-orange-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-orange-500/20 rounded-lg text-orange-400">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Powertrain</h3>
              <p className="text-xs text-gray-400">Engine & ERS</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Acceleration</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.acceleration)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.acceleration, gridAverage.acceleration)}
              {renderSpecBar(effectiveSpecs.acceleration, "bg-orange-500")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">ERS Efficiency</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.ers_efficiency)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.ers_efficiency, gridAverage.ers_efficiency)}
              {renderSpecBar(effectiveSpecs.ers_efficiency, "bg-yellow-400")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Cooling</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cooling)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cooling, gridAverage.cooling)}
              {renderSpecBar(effectiveSpecs.cooling, "bg-blue-400")}
            </div>
          </div>
        </GlassCard>
      </div>

       {/* Reliability Status */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard>
            <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-green-500/20 rounded-lg text-green-400">
                    <Clock size={24} />
                </div>
                <h3 className="text-xl font-bold text-white">Component Lifespan</h3>
            </div>
             <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Overall Reliability</span>
                <span className="text-2xl font-mono text-green-400">{formatValue(effectiveSpecs.lifespan)}%</span>
            </div>
            {renderComparison(effectiveSpecs.lifespan, gridAverage.lifespan)}
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-green-500 transition-all duration-1000 ease-out"
                    style={{ width: `${effectiveSpecs.lifespan}%` }}
                />
            </div>
             <p className="text-xs text-gray-500 mt-2">
                Components degrade over race weekends. Higher reliability reduces chance of mechanical failures.
            </p>
        </GlassCard>
        
        <GlassCard className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-f1-red/20 rounded-lg text-f1-red">
                    <Microscope size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Development Impact</h3>
                  <p className="text-xs text-gray-400">Live deltas from current research focus</p>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {SPEC_KEYS.map(key => {
                const delta = roundUpTwo((totalEffects[key] ?? 0) as number);
                if (delta === 0) return null;
                const label = key.replace('_', ' ').toUpperCase();
                return (
                  <div key={key} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <span className="text-gray-400">{label}</span>
                    <span className={delta > 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>
                      {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
        </GlassCard>
       </div>

       <GlassCard className="p-6">
         <div className="flex items-center justify-between mb-6">
           <div className="flex items-center gap-3">
             <div className="p-3 bg-white/5 rounded-lg text-white">
               <Microscope size={20} />
             </div>
             <div>
               <h3 className="text-xl font-bold text-white">Car Part Development</h3>
               <p className="text-xs text-gray-400">Select up to four active development projects</p>
             </div>
           </div>
           <div className="text-xs text-gray-500 font-mono uppercase tracking-widest">
             Active {activeProjects.length}/{MAX_PROJECTS}
           </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
           {PROJECTS.map(project => {
             const Icon = project.icon;
             const isActive = activeProjects.includes(project.id);
             const activeFocus = focusByProject[project.id] || '';
             const focus = project.focusOptions.find(option => option.id === activeFocus);
             return (
               <div key={project.id} className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-4">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-white/5 rounded-lg text-white">
                     <Icon size={18} />
                   </div>
                   <div>
                     <div className="text-sm font-bold text-white">{project.name}</div>
                     <div className="text-[10px] text-gray-500 uppercase tracking-widest">{project.category}</div>
                   </div>
                   <button
                     onClick={() => {
                       setActiveProjects(prev => {
                         if (prev.includes(project.id)) {
                           return prev.filter(id => id !== project.id);
                         }
                         if (prev.length >= MAX_PROJECTS) return prev;
                         return [...prev, project.id];
                       });
                     }}
                     className={`ml-auto px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest ${
                       isActive
                         ? "bg-f1-red/20 text-f1-red border-f1-red/40"
                         : "bg-black/40 text-gray-400 border-white/10 hover:text-white"
                     }`}
                   >
                     {isActive ? "Active" : "Start"}
                   </button>
                 </div>

                 <div className="space-y-2">
                   <div className="text-[10px] text-gray-500 uppercase tracking-widest">Research Focus</div>
                   <select
                     value={activeFocus}
                     onChange={(event) => setFocusByProject(prev => ({ ...prev, [project.id]: event.target.value }))}
                     className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                     disabled={!isActive}
                   >
                     <option value="">No focus</option>
                     {project.focusOptions.map(option => (
                       <option key={option.id} value={option.id}>
                         {option.label}
                       </option>
                     ))}
                   </select>
                 </div>

                 <div className="space-y-2">
                   <div className="text-[10px] text-gray-500 uppercase tracking-widest">Projected Effects</div>
                   {focus ? (
                     <div className="flex flex-wrap gap-2">
                       {Object.entries(focus.effects).map(([key, value]) => {
                         const numeric = roundUpTwo(value ?? 0);
                         const label = key.replace('_', ' ').toUpperCase();
                         return (
                           <span
                             key={key}
                             className={`px-2 py-1 rounded border text-[10px] font-mono ${
                               numeric >= 0 ? "border-green-500/30 text-green-300" : "border-red-500/30 text-red-300"
                             }`}
                           >
                             {label} {numeric >= 0 ? `+${numeric.toFixed(2)}` : numeric.toFixed(2)}
                           </span>
                         );
                       })}
                     </div>
                   ) : (
                     <div className="text-xs text-gray-500">No active focus selected.</div>
                   )}
                 </div>
               </div>
             );
           })}
         </div>
       </GlassCard>

       <GlassCard className="p-6">
         <div className="flex items-center justify-between mb-6">
           <div className="flex items-center gap-3">
             <div className="p-3 bg-white/5 rounded-lg text-white">
               <Clock size={20} />
             </div>
             <div>
               <h3 className="text-xl font-bold text-white">Manufacturing Tasks</h3>
               <p className="text-xs text-gray-400">Assign up to four upgrade builds</p>
             </div>
           </div>
           <div className="text-xs text-gray-500 font-mono uppercase tracking-widest">
             Slots {MAX_MANUFACTURING}
           </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {Array.from({ length: MAX_MANUFACTURING }).map((_, index) => {
             const value = manufacturingTasks[index] || '';
             return (
               <div key={index} className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
                 <div className="text-xs text-gray-500 uppercase tracking-widest">Slot {index + 1}</div>
                 <select
                   value={value}
                   onChange={(event) => {
                     const next = [...manufacturingTasks];
                     next[index] = event.target.value;
                     setManufacturingTasks(next);
                   }}
                   className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                 >
                   <option value="">No task</option>
                   {PROJECTS.map(project => (
                     <option key={project.id} value={project.id}>
                       {project.name}
                     </option>
                   ))}
                 </select>
               </div>
             );
           })}
         </div>
       </GlassCard>
    </div>
  );
};
