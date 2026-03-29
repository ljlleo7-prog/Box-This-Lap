import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { Trophy, Calendar, Users, Zap, ArrowRight } from 'lucide-react';
import { loadSaveGame, saveSaveGame } from '../lib/localSaves';
import { createLocalChampionship, advanceChampionshipRound } from '../lib/championshipHelpers';
import { TRACKS } from '../data/tracks';
import type { OfflineChampionship } from '../types';

export const Championship: React.FC = () => {
  const navigate = useNavigate();
  const [championship, setChampionship] = useState<OfflineChampionship | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saveGame = loadSaveGame();
    setChampionship(saveGame.championship);
    setLoading(false);
  }, []);

  const handleCreateChampionship = () => {
    // For now, hardcode a simple setup - later this can be a modal
    const newChampionship = createLocalChampionship('McLaren', ['norris', 'piastri'], 2025);

    const saveGame = loadSaveGame();
    saveGame.championship = newChampionship;
    saveGame.lastOpenedAt = new Date().toISOString();
    saveSaveGame(saveGame);

    setChampionship(newChampionship);
  };

  const handleAdvanceRound = () => {
    if (!championship) return;

    const updatedChampionship = advanceChampionshipRound(championship);

    const saveGame = loadSaveGame();
    saveGame.championship = updatedChampionship;
    saveSaveGame(saveGame);

    setChampionship(updatedChampionship);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-f1-red animate-pulse font-mono tracking-widest">LOADING...</div>
      </div>
    );
  }

  if (!championship) {
    return (
      <div className="space-y-6">
        <PageHeader title="Championship" description="Start your racing career" />

        <GlassCard className="p-12 text-center">
          <Trophy size={64} className="mx-auto mb-6 text-f1-red" />
          <h2 className="text-2xl font-bold text-white mb-4">No Active Championship</h2>
          <p className="text-gray-400 mb-8">Create a new championship to begin your journey</p>
          <GlassButton onClick={handleCreateChampionship}>
            Create Championship
          </GlassButton>
        </GlassCard>
      </div>
    );
  }

  const playerTeam = championship.teams.find((t) => t.teamId === championship.selectedTeamId);
  const currentTrackId = championship.trackOrder[championship.currentRound - 1];
  const currentTrack = TRACKS.find((t) => t.id === currentTrackId);
  const nextTrackId = championship.trackOrder[championship.currentRound];
  const nextTrack = TRACKS.find((t) => t.id === nextTrackId);

  const playerStanding = championship.constructorStandings.find(
    (s) => s.entityId === championship.selectedTeamId
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={championship.name}
        description={`Round ${championship.currentRound} of ${championship.trackOrder.length}`}
      />

      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="border-t-4 border-t-f1-red">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-f1-red/20 rounded-lg text-f1-red">
              <Trophy size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Championship</h3>
              <p className="text-xs text-gray-400">Constructor Standing</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">P{playerStanding?.entityId ? '1' : '-'}</div>
            <div className="text-sm text-gray-400">{playerStanding?.points || 0} points</div>
          </div>
        </GlassCard>

        <GlassCard className="border-t-4 border-t-blue-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400">
              <Calendar size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Current Round</h3>
              <p className="text-xs text-gray-400">Race Weekend</p>
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-white">{currentTrack?.name || 'Unknown'}</div>
            <div className="text-sm text-gray-400">Round {championship.currentRound}</div>
          </div>
        </GlassCard>

        <GlassCard className="border-t-4 border-t-purple-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-purple-500/20 rounded-lg text-purple-400">
              <Users size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Team</h3>
              <p className="text-xs text-gray-400">Your Drivers</p>
            </div>
          </div>
          <div className="space-y-1">
            {playerTeam?.drivers.map((d) => (
              <div key={d.driverId} className="text-sm text-white">{d.driverId}</div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Quick Actions */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassButton
            onClick={() => navigate('/research')}
            variant="secondary"
            className="justify-start"
            icon={<Zap size={20} />}
          >
            R&D Department
          </GlassButton>
          <GlassButton
            onClick={() => navigate('/race-control')}
            variant="secondary"
            className="justify-start"
            icon={<ArrowRight size={20} />}
          >
            Race Weekend
          </GlassButton>
          <GlassButton
            onClick={handleAdvanceRound}
            variant="secondary"
            className="justify-start"
            icon={<Calendar size={20} />}
          >
            Advance to Next Round
          </GlassButton>
        </div>
      </GlassCard>

      {/* Next Race */}
      {nextTrack && (
        <GlassCard className="p-6">
          <h3 className="text-xl font-bold text-white mb-4">Next Race</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">{nextTrack.name}</div>
              <div className="text-sm text-gray-400">Round {championship.currentRound + 1}</div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
