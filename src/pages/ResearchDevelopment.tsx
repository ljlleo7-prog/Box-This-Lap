import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { Zap, Activity, Wind, Gauge, Battery, Thermometer, Plus, X, Calendar } from 'lucide-react';
import { TCC_API } from '../lib/tcc-api';
import type { Team, TeamSpecs, ResearchDepartmentState, PartDesign, PartCategory, CarId, ManufacturingMode, ManufacturingOrder } from '../types';
import { TEAM_TEMPLATES } from '../data/teams';
import {
  type ResearchProjectDefinition,
  buildNextDesignCode,
  calculateProjectedEffects,
  calculateDevelopmentTimeWeeks,
  calculateManufacturingOrder,
  normalizeBiasAllocations,
  getAtrCapsForStanding,
  deriveInstalledTeamSpecs,
} from '../lib/researchDevelopment';
import {
  loadResearchStateScoped,
  saveResearchStateScoped,
  deriveAndSaveResearchTeamSpecsScoped,
  loadSaveGame,
  saveSaveGame,
} from '../lib/localSaves';
import { useChampionshipStore } from '../store/championshipStore';

type TrackCharacteristic = {
  trackName: string;
  round: number;
  keyStats: Array<{ stat: keyof TeamSpecs; label: string; importance: 1 | 2 | 3 | 4 | 5 }>;
};

const MOCK_CALENDAR: TrackCharacteristic[] = [
  {
    trackName: 'Monza',
    round: 14,
    keyStats: [
      { stat: 'drag_reduction', label: 'Drag Reduction', importance: 5 },
      { stat: 'drs_efficiency', label: 'DRS Efficiency', importance: 5 },
      { stat: 'acceleration', label: 'Acceleration', importance: 4 },
      { stat: 'cornering_high', label: 'High Speed Corners', importance: 3 },
    ],
  },
  {
    trackName: 'Silverstone',
    round: 15,
    keyStats: [
      { stat: 'cornering_high', label: 'High Speed Corners', importance: 5 },
      { stat: 'lifespan', label: 'Tire Degradation', importance: 5 },
      { stat: 'cornering_mid', label: 'Mid Speed Corners', importance: 4 },
      { stat: 'cooling', label: 'Cooling', importance: 3 },
    ],
  },
  {
    trackName: 'Monaco',
    round: 16,
    keyStats: [
      { stat: 'cornering_low', label: 'Low Speed Corners', importance: 5 },
      { stat: 'braking', label: 'Braking', importance: 5 },
      { stat: 'ers_efficiency', label: 'ERS Efficiency', importance: 4 },
      { stat: 'cooling', label: 'Cooling', importance: 3 },
    ],
  },
  {
    trackName: 'Spa',
    round: 17,
    keyStats: [
      { stat: 'cornering_high', label: 'High Speed Corners', importance: 5 },
      { stat: 'drag_reduction', label: 'Drag Reduction', importance: 4 },
      { stat: 'lifespan', label: 'Reliability', importance: 4 },
      { stat: 'acceleration', label: 'Acceleration', importance: 3 },
    ],
  },
  {
    trackName: 'Singapore',
    round: 18,
    keyStats: [
      { stat: 'cornering_low', label: 'Low Speed Corners', importance: 5 },
      { stat: 'cooling', label: 'Cooling', importance: 5 },
      { stat: 'lifespan', label: 'Reliability', importance: 4 },
      { stat: 'braking', label: 'Braking', importance: 3 },
    ],
  },
];

const PROJECTS: ResearchProjectDefinition[] = [
  {
    id: 'front-wing',
    name: 'Front Wing',
    category: 'Aerodynamics',
    codePrefix: 'FW',
    baseDurationWeeks: 8,
    baseManufacturingDays: 4,
    baseManufacturingCost: 50000,
    partSize: 'medium',
    moneyScale: 1.0,
    focusOptions: [
      { id: 'downforce', label: 'Downforce', effects: { cornering_high: 1.2, cornering_mid: 0.8, drag_reduction: -0.4 } },
      { id: 'balance', label: 'Balance', effects: { cornering_high: 0.6, cornering_mid: 0.6, cornering_low: 0.4 } },
      { id: 'efficiency', label: 'Efficiency', effects: { drag_reduction: 1.0, drs_efficiency: 0.6 } },
    ],
  },
  {
    id: 'floor',
    name: 'Floor',
    category: 'Ground Effect',
    codePrefix: 'FL',
    baseDurationWeeks: 10,
    baseManufacturingDays: 6,
    baseManufacturingCost: 80000,
    partSize: 'large',
    moneyScale: 1.2,
    focusOptions: [
      { id: 'ground-effect', label: 'Ground Effect', effects: { cornering_mid: 1.1, cornering_low: 0.7, drag_reduction: -0.3 } },
      { id: 'stability', label: 'Stability', effects: { cornering_low: 0.8, braking: 0.4, cooling: 0.2 } },
      { id: 'efficiency', label: 'Efficiency', effects: { drag_reduction: 0.8, drs_efficiency: 0.4 } },
    ],
  },
  {
    id: 'rear-wing',
    name: 'Rear Wing',
    category: 'Aero Balance',
    codePrefix: 'RW',
    baseDurationWeeks: 7,
    baseManufacturingDays: 4,
    baseManufacturingCost: 45000,
    partSize: 'medium',
    moneyScale: 0.9,
    focusOptions: [
      { id: 'high-downforce', label: 'High Downforce', effects: { cornering_high: 0.9, cornering_mid: 0.7, drag_reduction: -0.5 } },
      { id: 'low-drag', label: 'Low Drag', effects: { drag_reduction: 1.1, drs_efficiency: 0.6 } },
      { id: 'balance', label: 'Balance', effects: { cornering_mid: 0.6, braking: 0.4 } },
    ],
  },
  {
    id: 'suspension',
    name: 'Suspension',
    category: 'Mechanical Grip',
    codePrefix: 'SU',
    baseDurationWeeks: 6,
    baseManufacturingDays: 3,
    baseManufacturingCost: 40000,
    partSize: 'small',
    moneyScale: 0.8,
    focusOptions: [
      { id: 'grip', label: 'Grip', effects: { cornering_low: 1.0, braking: 0.5 } },
      { id: 'tyre-life', label: 'Tyre Life', effects: { lifespan: 0.9, cooling: 0.4 } },
      { id: 'response', label: 'Response', effects: { cornering_mid: 0.6, cornering_high: 0.4 } },
    ],
  },
  {
    id: 'power-unit',
    name: 'Power Unit',
    category: 'Energy Delivery',
    codePrefix: 'PU',
    baseDurationWeeks: 12,
    baseManufacturingDays: 8,
    baseManufacturingCost: 120000,
    partSize: 'large',
    moneyScale: 1.5,
    focusOptions: [
      { id: 'driveability', label: 'Driveability', effects: { acceleration: 1.0, cooling: 0.4 } },
      { id: 'efficiency', label: 'Efficiency', effects: { ers_efficiency: 0.8, drag_reduction: 0.3 } },
      { id: 'power', label: 'Power', effects: { acceleration: 1.2, drs_efficiency: 0.2 } },
    ],
  },
  {
    id: 'cooling',
    name: 'Cooling Package',
    category: 'Reliability',
    codePrefix: 'CP',
    baseDurationWeeks: 5,
    baseManufacturingDays: 3,
    baseManufacturingCost: 35000,
    partSize: 'small',
    moneyScale: 0.7,
    focusOptions: [
      { id: 'thermal', label: 'Thermal Control', effects: { cooling: 1.2, lifespan: 0.6 } },
      { id: 'weight', label: 'Weight Saving', effects: { drag_reduction: 0.4, acceleration: 0.4, cooling: -0.3 } },
      { id: 'reliability', label: 'Reliability', effects: { lifespan: 1.0, braking: 0.3 } },
    ],
  },
  {
    id: 'energy-store',
    name: 'Energy Store',
    category: 'ERS',
    codePrefix: 'ES',
    baseDurationWeeks: 9,
    baseManufacturingDays: 5,
    baseManufacturingCost: 70000,
    partSize: 'medium',
    moneyScale: 1.1,
    focusOptions: [
      { id: 'capacity', label: 'Capacity', effects: { ers_efficiency: 1.1, cooling: 0.2 } },
      { id: 'deployment', label: 'Deployment', effects: { acceleration: 0.6, ers_efficiency: 0.6 } },
      { id: 'durability', label: 'Durability', effects: { lifespan: 0.7, cooling: 0.4 } },
    ],
  },
];

const ICON_MAP: Record<PartCategory, React.ElementType> = {
  'front-wing': Wind,
  'floor': Activity,
  'rear-wing': Gauge,
  'suspension': Activity,
  'power-unit': Zap,
  'cooling': Thermometer,
  'energy-store': Battery,
};

export const ResearchDevelopment: React.FC = () => {
  const mode = useChampionshipStore((state) => state.mode);
  const championshipId = useChampionshipStore((state) => state.championshipId);
  const teamId = useChampionshipStore((state) => state.teamId);
  const teamName = useChampionshipStore((state) => state.teamName);
  const activeLocalChampionship = useChampionshipStore((state) => state.activeChampionship);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [researchState, setResearchState] = useState<ResearchDepartmentState | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showManufactureModal, setShowManufactureModal] = useState(false);
  const [selectedDesignForManufacture, setSelectedDesignForManufacture] = useState<PartDesign | null>(null);

  // Modal state
  const [selectedProject, setSelectedProject] = useState<ResearchProjectDefinition | null>(null);
  const [biasWeights, setBiasWeights] = useState<Record<string, number>>({});
  const [money, setMoney] = useState(100000);
  const [windTunnel, setWindTunnel] = useState(10);
  const [cfd, setCfd] = useState(50);
  const [customName, setCustomName] = useState('');

  // Manufacturing modal state
  const [manufactureQuantity, setManufactureQuantity] = useState(1);
  const [manufactureMode, setManufactureMode] = useState<ManufacturingMode>('normal');

  const loadTeamData = useCallback(async () => {
    setLoading(true);

    try {
      if (mode === 'online') {
        if (!championshipId) {
          setTeam(null);
          setResearchState(null);
          return;
        }

        const { data: myTeam } = await TCC_API.getMyTeam(championshipId);
        if (myTeam) {
          setTeam(myTeam);
        } else {
          setTeam(null);
          setResearchState(null);
        }
        return;
      }

      if (mode === 'local' && activeLocalChampionship) {
        const playerTeam = activeLocalChampionship.teams.find(
          (entry) => entry.teamId === activeLocalChampionship.selectedTeamId
        );
        if (playerTeam) {
          setTeam({
            id: playerTeam.teamId,
            name: playerTeam.teamName,
            color: playerTeam.color,
            budget: 0,
            reputation: 0,
            token_cost: 0,
            performance: {
              car: 0,
              industry: 0,
              drivers: 0,
            },
            specs: playerTeam.specs,
            championship_id: activeLocalChampionship.id,
          } as Team);
          return;
        }
      }

      setTeam(null);
      setResearchState(null);
    } catch (error) {
      console.error('Failed to load team data', error);
    } finally {
      setLoading(false);
    }
  }, [activeLocalChampionship, championshipId, mode]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  const teamKey = team?.name || teamName || 'default';
  const scopedStorageContext = useMemo(() => {
    if (!mode || !championshipId || !teamId) return null;
    return {
      mode,
      championshipId,
      teamId,
    };
  }, [championshipId, mode, teamId]);

  const baseSpecs = useMemo<TeamSpecs>(() => {
    const template = TEAM_TEMPLATES.find((t) => t.name === team?.name);
    return template?.specs ?? team?.specs ?? {
      acceleration: 75, braking: 82, drag_reduction: 68, cornering_low: 70,
      cornering_mid: 75, cornering_high: 80, ers_efficiency: 85, cooling: 90,
      lifespan: 100, drs_efficiency: 78,
    };
  }, [team]);

  useEffect(() => {
    if (mode === 'online') {
      if (!scopedStorageContext) return;
      const state = loadResearchStateScoped(scopedStorageContext, teamKey, 5);
      setResearchState(state);
      return;
    }

    if (mode === 'local' && activeLocalChampionship) {
      const playerTeam = activeLocalChampionship.teams.find(
        (entry) => entry.teamId === activeLocalChampionship.selectedTeamId
      );
      setResearchState(playerTeam?.researchDepartment ?? null);
      return;
    }

    setResearchState(null);
  }, [activeLocalChampionship, mode, scopedStorageContext, teamKey]);

  useEffect(() => {
    if (!researchState) return;

    if (mode === 'online') {
      if (!scopedStorageContext) return;
      saveResearchStateScoped(scopedStorageContext, researchState);
      deriveAndSaveResearchTeamSpecsScoped(scopedStorageContext, baseSpecs, researchState);
      return;
    }

    if (mode === 'local') {
      const saveGame = loadSaveGame();
      if (!saveGame.championship) return;

      const updatedTeams = saveGame.championship.teams.map((entry) => {
        if (entry.teamId === saveGame.championship?.selectedTeamId) {
          return { ...entry, researchDepartment: researchState };
        }
        return entry;
      });
      saveGame.championship = {
        ...saveGame.championship,
        teams: updatedTeams,
        updatedAt: new Date().toISOString(),
      };
      saveSaveGame(saveGame);
    }
  }, [baseSpecs, mode, researchState, scopedStorageContext]);

  const normalizedBiases = useMemo(() => {
    if (!selectedProject) return [];
    const allocations = selectedProject.focusOptions.map((opt) => ({
      focusId: opt.id,
      weight: biasWeights[opt.id] || 0,
    }));
    return normalizeBiasAllocations(allocations);
  }, [selectedProject, biasWeights]);

  const projectedEffects = useMemo(() => {
    if (!selectedProject) return {};
    return calculateProjectedEffects(selectedProject, normalizedBiases, money, windTunnel, cfd);
  }, [selectedProject, normalizedBiases, money, windTunnel, cfd]);

  const projectedDuration = useMemo(() => {
    if (!selectedProject) return 0;
    return calculateDevelopmentTimeWeeks(selectedProject, money, windTunnel, cfd);
  }, [selectedProject, money, windTunnel, cfd]);

  const handleStartProject = () => {
    if (!selectedProject || !researchState) return;

    const newDesign: PartDesign = {
      id: `design-${Date.now()}`,
      partCategory: selectedProject.id,
      code: buildNextDesignCode(
        [...researchState.activeDesignProjects, ...researchState.completedDesigns],
        selectedProject.codePrefix
      ),
      displayName: customName || selectedProject.name,
      customName: customName || undefined,
      status: 'in_design',
      biasAllocations: normalizedBiases,
      projectedEffects,
      actualEffects: projectedEffects,
      investment: { money },
      aero: { windTunnelHours: windTunnel, cfdHours: cfd },
      startedAt: new Date().toISOString(),
      projectedDurationWeeks: projectedDuration,
      stock: 0,
    };

    setResearchState({
      ...researchState,
      activeDesignProjects: [...researchState.activeDesignProjects, newDesign],
      atr: {
        ...researchState.atr,
        windTunnelHoursUsed: researchState.atr.windTunnelHoursUsed + windTunnel,
        cfdHoursUsed: researchState.atr.cfdHoursUsed + cfd,
      },
    });

    setShowStartModal(false);
    setSelectedProject(null);
    setBiasWeights({});
    setCustomName('');
  };

  const handleCompleteProject = (designId: string) => {
    if (!researchState) return;
    const design = researchState.activeDesignProjects.find((d) => d.id === designId);
    if (!design) return;

    setResearchState({
      ...researchState,
      activeDesignProjects: researchState.activeDesignProjects.filter((d) => d.id !== designId),
      completedDesigns: [
        ...researchState.completedDesigns,
        { ...design, status: 'ready_for_manufacturing', completedAt: new Date().toISOString(), stock: 1 },
      ],
    });
  };

  const handleInstallPart = (carId: CarId, partCategory: PartCategory, designId: string) => {
    if (!researchState) return;
    const design = researchState.completedDesigns.find((d) => d.id === designId);
    if (!design || design.stock < 1) return;

    const updatedAssignments = researchState.carAssignments.map((assignment) => {
      if (assignment.carId !== carId) return assignment;
      return {
        ...assignment,
        installedDesignByPart: {
          ...assignment.installedDesignByPart,
          [partCategory]: designId,
        },
      };
    });

    setResearchState({
      ...researchState,
      carAssignments: updatedAssignments,
    });
  };

  const handleAddStock = (designId: string, quantity: number) => {
    if (!researchState) return;
    const updatedDesigns = researchState.completedDesigns.map((design) => {
      if (design.id !== designId) return design;
      return { ...design, stock: design.stock + quantity };
    });

    setResearchState({
      ...researchState,
      completedDesigns: updatedDesigns,
    });
  };

  const handleStartManufacture = () => {
    if (!selectedDesignForManufacture || !researchState) return;

    const projectDef = PROJECTS.find((p) => p.id === selectedDesignForManufacture.partCategory);
    if (!projectDef) return;

    const { durationDays, cost } = calculateManufacturingOrder(
      projectDef,
      manufactureQuantity,
      manufactureMode
    );

    const newOrder: ManufacturingOrder = {
      id: `mfg-${Date.now()}`,
      designId: selectedDesignForManufacture.id,
      quantity: manufactureQuantity,
      mode: manufactureMode,
      targetCars: [],
      status: 'building',
      cost,
      durationDays,
      startedAt: new Date().toISOString(),
    };

    setResearchState({
      ...researchState,
      manufacturingQueue: [...researchState.manufacturingQueue, newOrder],
    });

    setShowManufactureModal(false);
    setSelectedDesignForManufacture(null);
    setManufactureQuantity(1);
    setManufactureMode('normal');
  };

  const handleCompleteManufacture = (orderId: string) => {
    if (!researchState) return;
    const order = researchState.manufacturingQueue.find((o) => o.id === orderId);
    if (!order) return;

    const updatedDesigns = researchState.completedDesigns.map((design) => {
      if (design.id !== order.designId) return design;
      return { ...design, stock: design.stock + order.quantity };
    });

    setResearchState({
      ...researchState,
      manufacturingQueue: researchState.manufacturingQueue.filter((o) => o.id !== orderId),
      completedDesigns: updatedDesigns,
    });
  };

  if (loading || !researchState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-f1-red animate-pulse font-mono tracking-widest">LOADING R&D...</div>
      </div>
    );
  }

  const effectiveSpecs = deriveInstalledTeamSpecs(baseSpecs, researchState);

  const gridAverage: TeamSpecs = {
    acceleration: 87.5, braking: 86.5, drag_reduction: 85.8, cornering_low: 85.2,
    cornering_mid: 86.8, cornering_high: 88.4, ers_efficiency: 86.9, cooling: 87.3,
    lifespan: 85.1, drs_efficiency: 86.7,
  };

  const formatValue = (value: number) => Math.ceil(value * 100) / 100;

  const renderSpecBar = (value: number, colorClass: string) => (
    <div className="h-2 bg-white/10 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full ${colorClass} transition-all duration-1000 ease-out`}
        style={{ width: `${value}%` }}
      />
    </div>
  );

  const renderComparison = (value: number, avg: number) => {
    const delta = formatValue(value - avg);
    const deltaLabel = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    return (
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>Grid Avg {formatValue(avg).toFixed(2)}</span>
        <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>{deltaLabel}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="R&D" description="Develop car parts and manage installations" />

      {/* Current Performance Overview */}
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
                <span className="text-white font-mono">{formatValue(effectiveSpecs.drag_reduction).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.drag_reduction, gridAverage.drag_reduction)}
              {renderSpecBar(effectiveSpecs.drag_reduction, "bg-blue-500")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">DRS Efficiency</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.drs_efficiency).toFixed(2)}/100</span>
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
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cornering_low).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cornering_low, gridAverage.cornering_low)}
              {renderSpecBar(effectiveSpecs.cornering_low, "bg-purple-500")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Mid Speed Cornering</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cornering_mid).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cornering_mid, gridAverage.cornering_mid)}
              {renderSpecBar(effectiveSpecs.cornering_mid, "bg-purple-400")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">High Speed Cornering</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cornering_high).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cornering_high, gridAverage.cornering_high)}
              {renderSpecBar(effectiveSpecs.cornering_high, "bg-purple-300")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Braking</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.braking).toFixed(2)}/100</span>
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
                <span className="text-white font-mono">{formatValue(effectiveSpecs.acceleration).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.acceleration, gridAverage.acceleration)}
              {renderSpecBar(effectiveSpecs.acceleration, "bg-orange-500")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">ERS Efficiency</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.ers_efficiency).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.ers_efficiency, gridAverage.ers_efficiency)}
              {renderSpecBar(effectiveSpecs.ers_efficiency, "bg-yellow-400")}
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Cooling</span>
                <span className="text-white font-mono">{formatValue(effectiveSpecs.cooling).toFixed(2)}/100</span>
              </div>
              {renderComparison(effectiveSpecs.cooling, gridAverage.cooling)}
              {renderSpecBar(effectiveSpecs.cooling, "bg-blue-400")}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Reliability Status */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-green-500/20 rounded-lg text-green-400">
            <Thermometer size={24} />
          </div>
          <h3 className="text-xl font-bold text-white">Component Lifespan</h3>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400">Overall Reliability</span>
          <span className="text-2xl font-mono text-green-400">{formatValue(effectiveSpecs.lifespan).toFixed(2)}%</span>
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

      {/* Upcoming Races Calendar */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-f1-red/20 rounded-lg text-f1-red">
            <Calendar size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Upcoming Races</h3>
            <p className="text-xs text-gray-400">Key performance areas for next circuits</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_CALENDAR.map((race) => (
            <div key={race.trackName} className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-white">{race.trackName}</h4>
                  <p className="text-xs text-gray-500">Round {race.round}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-400 mb-2">Key Stats:</div>
                {race.keyStats.map((stat) => {
                  const currentValue = effectiveSpecs[stat.stat];
                  const avgValue = gridAverage[stat.stat];
                  const delta = currentValue - avgValue;
                  const isStrong = delta >= 0;

                  return (
                    <div
                      key={stat.stat}
                      className={`flex items-center justify-between p-2 rounded ${
                        isStrong ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex items-center">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span
                              key={i}
                              className={`text-xs ${
                                i < stat.importance ? 'text-yellow-400' : 'text-gray-600'
                              }`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                        <span className={`text-xs ${isStrong ? 'text-green-300 font-medium' : 'text-gray-300'}`}>
                          {stat.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono ${isStrong ? 'text-white font-bold' : 'text-gray-400'}`}>
                          {formatValue(currentValue).toFixed(1)}
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            isStrong ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {isStrong ? '✓' : '✗'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Competitive Stats:</span>
                  <span
                    className={`font-bold ${
                      race.keyStats.filter((s) => effectiveSpecs[s.stat] >= gridAverage[s.stat]).length >=
                      race.keyStats.filter((s) => s.importance >= 4).length
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }`}
                  >
                    {race.keyStats.filter((s) => effectiveSpecs[s.stat] >= gridAverage[s.stat]).length}/
                    {race.keyStats.length}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          <span className="text-yellow-400">★★★★★</span> = Critical importance for this circuit
          <span className="ml-4 inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 bg-green-500/10 border border-green-500/30 rounded" />
            Above average (competitive)
          </span>
        </p>
      </GlassCard>


      {/* ATR Overview */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">ATR Resources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Wind Tunnel Hours</span>
              <span className="text-white font-mono">
                {researchState.atr.windTunnelHoursUsed} / {researchState.atr.windTunnelHoursCap}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(researchState.atr.windTunnelHoursUsed / researchState.atr.windTunnelHoursCap) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">CFD Hours</span>
              <span className="text-white font-mono">
                {researchState.atr.cfdHoursUsed} / {researchState.atr.cfdHoursCap}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${(researchState.atr.cfdHoursUsed / researchState.atr.cfdHoursCap) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Constructor Standing: P{researchState.atr.constructorStanding} · {researchState.atr.periodLabel}
        </p>
      </GlassCard>

      {/* Active Projects */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Active Development Projects</h3>
          <GlassButton onClick={() => setShowStartModal(true)} icon={<Plus size={16} />}>
            Start Project
          </GlassButton>
        </div>
        {researchState.activeDesignProjects.length === 0 ? (
          <p className="text-gray-400 text-sm">No active projects. Start a new development project.</p>
        ) : (
          <div className="space-y-3">
            {researchState.activeDesignProjects.map((design) => {
              const Icon = ICON_MAP[design.partCategory];
              return (
                <div key={design.id} className="bg-black/40 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg text-white">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{design.displayName}</div>
                      <div className="text-xs text-gray-500">{design.code}</div>
                    </div>
                    <div className="text-xs text-gray-400">{design.projectedDurationWeeks}w</div>
                    <GlassButton
                      onClick={() => handleCompleteProject(design.id)}
                      variant="secondary"
                      className="text-xs px-3 py-1"
                    >
                      Complete
                    </GlassButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Completed Designs */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Completed Designs & Stock</h3>
        {researchState.completedDesigns.length === 0 ? (
          <p className="text-gray-400 text-sm">No completed designs yet.</p>
        ) : (
          <div className="space-y-3">
            {researchState.completedDesigns.map((design) => {
              const Icon = ICON_MAP[design.partCategory];
              return (
                <div key={design.id} className="bg-black/40 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-white/5 rounded-lg text-white">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{design.displayName}</div>
                      <div className="text-xs text-gray-500">{design.code}</div>
                    </div>
                    <div className="text-xs text-gray-400">Stock: {design.stock}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {Object.entries(design.actualEffects).map(([key, value]) => {
                      if (value === 0) return null;
                      return (
                        <div key={key} className="flex justify-between bg-white/5 rounded px-2 py-1">
                          <span className="text-gray-400">{key.replace('_', ' ')}:</span>
                          <span className={value > 0 ? 'text-green-400' : 'text-red-400'}>
                            {value > 0 ? '+' : ''}{value.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <GlassButton
                      onClick={() => {
                        setSelectedDesignForManufacture(design);
                        setShowManufactureModal(true);
                      }}
                      variant="secondary"
                      className="text-xs px-3 py-1 flex-1"
                    >
                      Manufacture
                    </GlassButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Manufacturing Queue */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Manufacturing Queue</h3>
        {researchState.manufacturingQueue.length === 0 ? (
          <p className="text-gray-400 text-sm">No active manufacturing orders.</p>
        ) : (
          <div className="space-y-3">
            {researchState.manufacturingQueue.map((order) => {
              const design = researchState.completedDesigns.find((d) => d.id === order.designId);
              const Icon = design ? ICON_MAP[design.partCategory] : Activity;
              return (
                <div key={order.id} className="bg-black/40 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg text-white">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{design?.displayName || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">
                        {order.quantity}x · {order.mode} mode · {order.durationDays} days · ${order.cost.toLocaleString()}
                      </div>
                    </div>
                    <GlassButton
                      onClick={() => handleCompleteManufacture(order.id)}
                      variant="secondary"
                      className="text-xs px-3 py-1"
                    >
                      Complete
                    </GlassButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Car Installations */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Car Installations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {researchState.carAssignments.map((assignment) => (
            <div key={assignment.carId} className="bg-black/40 border border-white/10 rounded-lg p-4">
              <h4 className="text-sm font-bold text-white mb-3">{assignment.carId === 'car-1' ? 'Car 1' : 'Car 2'}</h4>
              <div className="space-y-3">
                {PROJECTS.map((proj) => {
                  const designId = assignment.installedDesignByPart[proj.id];
                  const design = researchState.completedDesigns.find((d) => d.id === designId);
                  const availableDesigns = researchState.completedDesigns.filter(
                    (d) => d.partCategory === proj.id && d.stock > 0
                  );

                  return (
                    <div key={proj.id}>
                      <label className="block text-xs text-gray-400 mb-1">{proj.name}</label>
                      <select
                        value={designId || ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleInstallPart(assignment.carId, proj.id, e.target.value);
                          }
                        }}
                        className="w-full bg-[#111] border border-white/10 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-f1-red"
                      >
                        <option value="">Base Spec</option>
                        {availableDesigns.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} - {d.displayName} (Stock: {d.stock})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Start Development Modal */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/20 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#0a0a0a]">
              <h2 className="text-2xl font-bold text-white">Start Development Project</h2>
              <button
                onClick={() => {
                  setShowStartModal(false);
                  setSelectedProject(null);
                  setBiasWeights({});
                  setCustomName('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {!selectedProject ? (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-3">Select Part Category</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PROJECTS.map((proj) => {
                        const Icon = ICON_MAP[proj.id];
                        return (
                          <button
                            key={proj.id}
                            onClick={() => {
                              setSelectedProject(proj);
                              const initial = proj.focusOptions.reduce<Record<string, number>>((acc, opt) => {
                                acc[opt.id] = 100 / proj.focusOptions.length;
                                return acc;
                              }, {});
                              setBiasWeights(initial);
                            }}
                            className="bg-black/40 border border-white/10 hover:border-f1-red/50 rounded-lg p-4 text-left transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-white/5 rounded-lg text-white">
                                <Icon size={20} />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-white">{proj.name}</div>
                                <div className="text-xs text-gray-500">{proj.category}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Part: {selectedProject.name}</label>
                    <input
                      type="text"
                      placeholder={`Custom name (optional, default: ${buildNextDesignCode(
                        [...(researchState?.activeDesignProjects || []), ...(researchState?.completedDesigns || [])],
                        selectedProject.codePrefix
                      )})`}
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-3">Design Bias Allocation (Total: 100%)</label>
                    <div className="space-y-4">
                      {selectedProject.focusOptions.map((opt) => {
                        const normalized = normalizedBiases.find((b) => b.focusId === opt.id);
                        return (
                          <div key={opt.id}>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-white">{opt.label}</span>
                              <span className="text-gray-400 font-mono">{normalized?.weight.toFixed(1) || 0}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={biasWeights[opt.id] || 0}
                              onChange={(e) => setBiasWeights({ ...biasWeights, [opt.id]: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Investment ($)</label>
                      <input
                        type="number"
                        min="10000"
                        step="10000"
                        value={money}
                        onChange={(e) => setMoney(Number(e.target.value))}
                        className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Wind Tunnel (hrs)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={windTunnel}
                        onChange={(e) => setWindTunnel(Number(e.target.value))}
                        className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">CFD (hrs)</label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={cfd}
                        onChange={(e) => setCfd(Number(e.target.value))}
                        className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                      />
                    </div>
                  </div>

                  <div className="bg-black/40 border border-white/10 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-3">Projected Outcomes</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Duration:</span>
                        <span className="text-white font-mono">{projectedDuration.toFixed(1)} weeks</span>
                      </div>
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-2">Stat Effects:</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(projectedEffects).map(([key, value]) => {
                            if (value === 0) return null;
                            return (
                              <div key={key} className="flex justify-between text-xs">
                                <span className="text-gray-400">{key.replace('_', ' ')}:</span>
                                <span className={value > 0 ? 'text-green-400' : 'text-red-400'}>
                                  {value > 0 ? '+' : ''}{value.toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <GlassButton
                      onClick={() => {
                        setSelectedProject(null);
                        setBiasWeights({});
                        setCustomName('');
                      }}
                      variant="secondary"
                      className="flex-1"
                    >
                      Back
                    </GlassButton>
                    <GlassButton onClick={handleStartProject} className="flex-1">
                      Start Development
                    </GlassButton>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manufacturing Modal */}
      {showManufactureModal && selectedDesignForManufacture && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-white/20 rounded-xl max-w-2xl w-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Manufacture Parts</h2>
              <button
                onClick={() => {
                  setShowManufactureModal(false);
                  setSelectedDesignForManufacture(null);
                  setManufactureQuantity(1);
                  setManufactureMode('normal');
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <div className="text-sm text-gray-400 mb-2">Design</div>
                <div className="text-lg font-bold text-white">{selectedDesignForManufacture.displayName}</div>
                <div className="text-xs text-gray-500">{selectedDesignForManufacture.code}</div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={manufactureQuantity}
                  onChange={(e) => setManufactureQuantity(Number(e.target.value))}
                  className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-f1-red"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-3">Manufacturing Mode</label>
                <div className="space-y-3">
                  {(['normal', 'intense', 'urgent'] as ManufacturingMode[]).map((mode) => {
                    const projectDef = PROJECTS.find((p) => p.id === selectedDesignForManufacture.partCategory);
                    if (!projectDef) return null;

                    const { durationDays, cost } = calculateManufacturingOrder(
                      projectDef,
                      manufactureQuantity,
                      mode
                    );

                    const modeLabels = {
                      normal: { label: 'Normal', desc: '3-6 days/part', color: 'text-blue-400' },
                      intense: { label: 'Intense', desc: '2-4 days/part', color: 'text-yellow-400' },
                      urgent: { label: 'Urgent', desc: 'Instant delivery', color: 'text-red-400' },
                    };

                    return (
                      <button
                        key={mode}
                        onClick={() => setManufactureMode(mode)}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          manufactureMode === mode
                            ? 'bg-white/10 border-f1-red'
                            : 'bg-black/40 border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-3 h-3 rounded-full ${
                                manufactureMode === mode ? 'bg-f1-red' : 'bg-gray-600'
                              }`}
                            />
                            <span className={`font-bold ${modeLabels[mode].color}`}>
                              {modeLabels[mode].label}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{modeLabels[mode].desc}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Duration:</span>
                          <span className="text-white font-mono">{durationDays} days</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Cost:</span>
                          <span className="text-white font-mono">${cost.toLocaleString()}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <GlassButton
                  onClick={() => {
                    setShowManufactureModal(false);
                    setSelectedDesignForManufacture(null);
                    setManufactureQuantity(1);
                    setManufactureMode('normal');
                  }}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </GlassButton>
                <GlassButton onClick={handleStartManufacture} className="flex-1">
                  Start Manufacturing
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
