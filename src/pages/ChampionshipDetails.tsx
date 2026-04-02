import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { TCC_API } from '../lib/tcc-api';
import { TRACKS } from '../data/tracks';
import { Calendar, Trophy, Users, Plus, MapPin, Clock, ArrowRight, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { PageHeader } from '../components/ui/PageHeader';
import { useChampionshipStore } from '../store/championshipStore';

type Tab = 'standings' | 'calendar' | 'teams';

export const ChampionshipDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setActiveOnlineContext = useChampionshipStore((state) => state.setActiveOnlineContext);
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [championship, setChampionship] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [weekends, setWeekends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myTeam, setMyTeam] = useState<any>(null);

  // Create Weekend Form State
  const [showCreateWeekend, setShowCreateWeekend] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(TRACKS[0].id);
  const [raceDateTime, setRaceDateTime] = useState('');
  const [fp1DateTime, setFp1DateTime] = useState('');
  const [qualiDateTime, setQualiDateTime] = useState('');
  const [practiceSpeedMultiplier, setPracticeSpeedMultiplier] = useState<1 | 2 | 5 | 10>(1);
  const [qualiSpeedMultiplier, setQualiSpeedMultiplier] = useState<1 | 2 | 5 | 10>(1);
  const [raceSpeedMultiplier, setRaceSpeedMultiplier] = useState<1 | 2 | 5 | 10>(1);
  const [creatingWeekend, setCreatingWeekend] = useState(false);

  useEffect(() => {
    if (id) {
      setActiveOnlineContext({ championshipId: id });
      loadData();
    }
  }, [id, setActiveOnlineContext]);

  const loadData = async () => {
    try {
      await TCC_API.ensurePlayerProfile();
      // Check if user has a team (is a participant)
      const { data: myTeamData } = await TCC_API.getMyTeam(id!);
      if (!myTeamData) {
        const { data: championshipsData } = await TCC_API.getChampionships();
        const matchedChampionship = championshipsData?.find((entry: any) => entry.id === id);
        const isCreator = matchedChampionship?.created_by === (await supabase.auth.getUser()).data.user?.id;
        if (isCreator) {
          setActiveOnlineContext({ championshipId: id! });
        } else {
          // Redirect to team selection if not a participant
          navigate(`/championships/${id}/select-team`);
          return;
        }
      } else {
        setMyTeam(myTeamData);
        setActiveOnlineContext({
          championshipId: id!,
          teamId: myTeamData.id,
          teamName: myTeamData.name,
        });
      }

      // 1. Get Championship
      const { data: champ, error: champError } = await supabase
        .from('tcc_championships')
        .select('*')
        .eq('id', id)
        .single();

      if (champError) throw champError;
      setChampionship(champ);

      // 2. Get Teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('tcc_teams')
        .select('*, owner:tcc_players!tcc_teams_owner_id_fkey(username)')
        .eq('championship_id', id);

      if (teamsError) throw teamsError;
      setTeams(teamsData || []);

      // 3. Get Weekends
      const { data: weekendsData, error: weekendsError } = await supabase
        .from('tcc_weekends')
        .select('*')
        .eq('championship_id', id)
        .order('round_number', { ascending: true });

      if (weekendsError) throw weekendsError;
      setWeekends(weekendsData || []);

    } catch (err: any) {
      console.error('Failed to load championship details:', JSON.stringify(err, null, 2));
      setError(err?.message || 'Failed to load data. Please check console.');
    } finally {
      setLoading(false);
    }
  };

  const isHalfHourSlot = (value: string) => {
    if (!value) return false;
    const date = new Date(value);
    return date.getSeconds() === 0 && date.getMinutes() % 30 === 0;
  };

  const derivePracticeTimeline = () => {
    if (!fp1DateTime) return null;
    const fp1 = new Date(fp1DateTime);
    const sessionMinutes = 60 / practiceSpeedMultiplier;
    const fp2 = new Date(fp1.getTime() + sessionMinutes * 60 * 1000);
    const fp3 = new Date(fp2.getTime() + sessionMinutes * 60 * 1000);
    const practiceEnd = new Date(fp3.getTime() + sessionMinutes * 60 * 1000);
    return { fp1, fp2, fp3, practiceEnd, sessionMinutes };
  };

  const scheduleValidationMessage = () => {
    if (!raceDateTime || !fp1DateTime || !qualiDateTime) return 'Set race, FP1, and qualifying times.';
    if (!isHalfHourSlot(raceDateTime) || !isHalfHourSlot(fp1DateTime) || !isHalfHourSlot(qualiDateTime)) {
      return 'All session times must be on whole half-hours.';
    }

    const race = new Date(raceDateTime);
    const fp1 = new Date(fp1DateTime);
    const quali = new Date(qualiDateTime);
    const practiceTimeline = derivePracticeTimeline();
    if (!practiceTimeline) return 'Practice timeline is missing.';

    if (race.getTime() < Date.now() + 48 * 60 * 60 * 1000) {
      return 'Race must be scheduled at least 2 days ahead.';
    }

    const raceDay = new Date(race);
    raceDay.setHours(0, 0, 0, 0);
    const requiredDay = new Date(raceDay.getTime() - 24 * 60 * 60 * 1000);
    const fp1Day = new Date(fp1);
    fp1Day.setHours(0, 0, 0, 0);
    const qualiDay = new Date(quali);
    qualiDay.setHours(0, 0, 0, 0);

    if (fp1Day.getTime() !== requiredDay.getTime() || qualiDay.getTime() !== requiredDay.getTime()) {
      return 'FP1 and qualifying must be on the day before the race.';
    }

    if (quali.getTime() < practiceTimeline.practiceEnd.getTime() + 30 * 60 * 1000) {
      return 'Qualifying must be at least 30 minutes after the practice block ends.';
    }

    if (weekends.some((weekend) => weekend.is_end_of_season && weekend.status !== 'cancelled')) {
      return 'Cannot add more races after the end-of-season race unless it is cancelled.';
    }

    return null;
  };

  const handleCreateWeekend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !raceDateTime || !fp1DateTime || !qualiDateTime) return;

    const validationMessage = scheduleValidationMessage();
    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    setCreatingWeekend(true);
    try {
      await TCC_API.ensurePlayerProfile();
      await TCC_API.createWeekend({
        championshipId: id,
        trackId: selectedTrackId,
        practiceSpeedMultiplier,
        qualiSpeedMultiplier,
        raceSpeedMultiplier,
        raceLocalDatetime: new Date(raceDateTime).toISOString(),
        fp1LocalDatetime: new Date(fp1DateTime).toISOString(),
        qualiLocalDatetime: new Date(qualiDateTime).toISOString(),
        weatherMode: 'realistic',
        realismPreset: 'standard'
      });

      setShowCreateWeekend(false);
      setRaceDateTime('');
      setFp1DateTime('');
      setQualiDateTime('');
      loadData();
    } catch (err: any) {
      console.error('Failed to create weekend:', err);
      alert(err?.message || err?.error?.message || err?.error || 'Failed to create weekend');
    } finally {
      setCreatingWeekend(false);
    }
  };

  const handleLeaveChampionship = async () => {
    if (!id) return;
    if (!confirm('Leave this championship and release your team?')) return;
    try {
      // Ensure player profile exists then leave
      await TCC_API.ensurePlayerProfile();
      const { data, error } = await TCC_API.leaveChampionship(id);
      if (error) throw error;
      if (data?.success) {
        navigate(`/championships/${id}/select-team`);
      } else {
        alert(data?.message || 'Failed to leave championship');
      }
    } catch (err) {
      console.error('Failed to leave championship:', err);
      alert('Error leaving championship');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
        <div className="text-f1-red animate-pulse font-mono tracking-widest">LOADING PADDOCK DATA...</div>
    </div>
  );

  if (error || !championship) return (
    <div className="min-h-screen flex items-center justify-center p-8">
        <GlassCard className="max-w-md w-full text-center border-red-500/30">
            <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
            <h2 className="text-xl font-bold text-white mb-2">Championship Not Found</h2>
            <p className="text-gray-400 mb-6">{error || 'The requested championship does not exist or you do not have permission to view it.'}</p>
            <GlassButton onClick={() => navigate('/championships')} variant="secondary">
                Return to Hub
            </GlassButton>
        </GlassCard>
    </div>
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      <PageHeader 
        title={championship.name}
        subtitle="OFFICIAL SERIES"
        backgroundImage="https://f1chronicle.com/wp-content/uploads/2024/01/SI202412010400-1920x1080.jpg"
        tags={
            <>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm text-gray-300">
                    <Users size={14} className="text-f1-red" /> {teams.length} Teams
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm text-gray-300">
                    <Calendar size={14} className="text-f1-red" /> {weekends.length} Rounds
                </div>
                <div className={clsx(
                  "px-3 py-1 rounded-full text-sm border font-medium",
                  championship.status === 'active' ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-gray-800 border-gray-700 text-gray-400"
                )}>
                   {championship.status?.toUpperCase()}
                </div>
              <GlassButton variant="secondary" onClick={handleLeaveChampionship}>
                Leave Championship
              </GlassButton>
            </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-black/20 backdrop-blur-sm rounded-xl w-fit border border-white/5">
        {[
          { id: 'calendar', label: 'Race Calendar', icon: Calendar },
          { id: 'standings', label: 'Standings', icon: Trophy },
          { id: 'teams', label: 'Teams', icon: Users },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={clsx(
                "flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all duration-300 font-medium text-sm",
                isActive 
                  ? "bg-f1-red text-white shadow-lg shadow-red-900/20" 
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white tracking-tight">Season Schedule</h3>
              <GlassButton 
                onClick={() => setShowCreateWeekend(!showCreateWeekend)}
                variant="secondary"
                icon={<Plus size={16} />}
                className="text-sm"
              >
                Schedule Race
              </GlassButton>
            </div>

            {showCreateWeekend && (
              <GlassCard className="mb-8 border-white/10">
                <h4 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Calendar className="text-f1-red" /> New Event Configuration
                </h4>
                <form onSubmit={handleCreateWeekend} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Circuit Selection</label>
                    <div className="relative">
                        <select
                        value={selectedTrackId}
                        onChange={(e) => setSelectedTrackId(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none appearance-none"
                        >
                        {TRACKS.map(track => (
                            <option key={track.id} value={track.id}>
                                {track.name} {track.location ? `(${track.location.lat.toFixed(1)}°, ${track.location.long.toFixed(1)}°)` : ''}
                            </option>
                        ))}
                        </select>
                        <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500">▼</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Race Time (Local)</label>
                    <input
                      type="datetime-local"
                      step="1800"
                      value={raceDateTime}
                      onChange={(e) => setRaceDateTime(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">FP1 Time (Local)</label>
                    <input
                      type="datetime-local"
                      step="1800"
                      value={fp1DateTime}
                      onChange={(e) => setFp1DateTime(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Qualifying Time (Local)</label>
                    <input
                      type="datetime-local"
                      step="1800"
                      value={qualiDateTime}
                      onChange={(e) => setQualiDateTime(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Practice Speed</label>
                    <select value={practiceSpeedMultiplier} onChange={(e) => setPracticeSpeedMultiplier(Number(e.target.value) as 1 | 2 | 5 | 10)} className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none">
                      {[1, 2, 5, 10].map((speed) => <option key={`practice-${speed}`} value={speed}>{speed}x</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Qualifying Speed</label>
                    <select value={qualiSpeedMultiplier} onChange={(e) => setQualiSpeedMultiplier(Number(e.target.value) as 1 | 2 | 5 | 10)} className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none">
                      {[1, 2, 5, 10].map((speed) => <option key={`quali-${speed}`} value={speed}>{speed}x</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Race Speed</label>
                    <select value={raceSpeedMultiplier} onChange={(e) => setRaceSpeedMultiplier(Number(e.target.value) as 1 | 2 | 5 | 10)} className="w-full bg-[#1a1a1a] border border-white/10 text-white p-3 rounded-xl focus:border-f1-red outline-none">
                      {[1, 2, 5, 10].map((speed) => <option key={`race-${speed}`} value={speed}>{speed}x</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2 xl:col-span-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs font-mono uppercase tracking-widest text-gray-400">Derived practice timeline</div>
                    {derivePracticeTimeline() ? (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-gray-300">
                        <div>FP1: <span className="text-white">{derivePracticeTimeline()!.fp1.toLocaleString()}</span></div>
                        <div>FP2: <span className="text-white">{derivePracticeTimeline()!.fp2.toLocaleString()}</span></div>
                        <div>FP3: <span className="text-white">{derivePracticeTimeline()!.fp3.toLocaleString()}</span></div>
                        <div>End: <span className="text-white">{derivePracticeTimeline()!.practiceEnd.toLocaleString()}</span></div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Set FP1 to preview FP2/FP3 timing.</div>
                    )}
                    {scheduleValidationMessage() && (
                      <div className="text-sm text-yellow-400">{scheduleValidationMessage()}</div>
                    )}
                  </div>
                  <div className="xl:col-span-4 flex justify-end">
                    <GlassButton
                      type="submit"
                      isLoading={creatingWeekend}
                      className="w-full md:w-auto"
                      disabled={!!scheduleValidationMessage()}
                    >
                      Confirm Schedule
                    </GlassButton>
                  </div>
                </form>
              </GlassCard>
            )}

            <div className="space-y-4">
              {weekends.map((weekend) => {
                const track = TRACKS.find(t => t.id === weekend.track_id);
                return (
                  <GlassCard 
                    key={weekend.id}
                    hoverEffect={true}
                    onClick={() => navigate(`/weekends/${weekend.id}`)}
                    className="flex items-center justify-between group !p-4"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white/5 rounded-xl flex flex-col items-center justify-center border border-white/10 group-hover:border-f1-red/30 transition-colors">
                        <span className="text-xs text-gray-500 font-mono">RND</span>
                        <span className="text-2xl font-bold text-white group-hover:text-f1-red">{weekend.round_number}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-lg group-hover:text-f1-red transition-colors">
                          {weekend.name || track?.name || 'Unknown GP'}
                        </h4>
                        <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                          <span className="flex items-center gap-1"><MapPin size={14} /> {track?.location ? `${track.location.lat.toFixed(2)}°, ${track.location.long.toFixed(2)}°` : 'Unknown Location'}</span>
                          <span className="flex items-center gap-1"><Clock size={14} /> {new Date(weekend.scheduled_race_at_utc || weekend.start_time).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-xs font-bold border tracking-wider",
                        weekend.status === 'completed' ? "bg-green-500/10 border-green-500/30 text-green-400" :
                        weekend.status === 'active' ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
                        "bg-gray-800/50 border-gray-700 text-gray-500"
                      )}>
                        {weekend.status?.toUpperCase().replace('_', ' ')}
                      </span>
                      <ArrowRight className="text-gray-600 group-hover:text-[#00FFFF] transition-colors transform group-hover:translate-x-1" />
                    </div>
                  </GlassCard>
                );
              })}
              {weekends.length === 0 && (
                <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <Calendar size={48} className="mx-auto mb-4 opacity-20 text-white" />
                  <p className="text-gray-400">No races scheduled yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map(team => (
              <GlassCard 
                key={team.id} 
                className={`!p-0 ${myTeam && team.id === myTeam.id ? 'border-[#00FFFF] shadow-[0_0_12px_rgba(0,255,255,0.3)]' : ''}`}
              >
                <div className="h-2 w-full" style={{ backgroundColor: team.color || '#333' }}></div>
                <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                    <div className="text-xs text-gray-500 font-mono tracking-widest">TEAM ID: {team.id.slice(0,4)}</div>
                    {myTeam && team.id === myTeam.id && (
                      <span className="px-2 py-0.5 rounded-full bg-[#00FFFF]/10 border border-[#00FFFF]/30 text-[#00FFFF] text-xs font-mono tracking-wider">YOUR TEAM</span>
                    )}
                    </div>
                    <h3 className="font-bold text-white text-2xl mb-2">{team.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                      <span className="uppercase tracking-wider">Owner:</span>
                      <span className="font-mono text-white">
                        {team.owner?.username ?? (myTeam && team.id === myTeam.id ? 'You' : (team.owner_id ? 'Assigned' : 'Unassigned'))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
                        <span>Budget:</span>
                        <span className="text-white font-mono">${((team.budget || 0)/1000000).toFixed(1)}M</span>
                    </div>
                    <GlassButton variant="secondary" className="w-full text-sm">View Garage</GlassButton>
                </div>
              </GlassCard>
            ))}
            {teams.length === 0 && (
              <div className="col-span-full text-center py-20 text-gray-500">
                No teams registered.
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="text-center py-20 text-gray-500">
            <Trophy size={48} className="mx-auto mb-4 opacity-20" />
            <p>Standings will be available after the first race.</p>
          </div>
        )}
      </div>
    </div>
  );
};
