import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TCC_API } from '../lib/tcc-api';
import { TRACKS } from '../data/tracks';
import { Play, CheckCircle, Clock, ChevronLeft, MapPin, Calendar, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { PageHeader } from '../components/ui/PageHeader';
import { supabase } from '../lib/supabase';

export const WeekendDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [weekend, setWeekend] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [sessionSpeeds, setSessionSpeeds] = useState({ practice: 1 as 1 | 2 | 5 | 10, quali: 1 as 1 | 2 | 5 | 10, race: 1 as 1 | 2 | 5 | 10 });
  const [savingSessionSpeed, setSavingSessionSpeed] = useState<'practice' | 'quali' | 'race' | null>(null);
  const [canManageSessionSpeed, setCanManageSessionSpeed] = useState(false);

  useEffect(() => {
    if (id) loadWeekend();
  }, [id]);

  const loadWeekend = async () => {
    try {
      const { data, error } = await TCC_API.getWeekend(id!);
      if (error) throw error;
      setWeekend(data);
      setSessionSpeeds({
        practice: data.practice_speed_multiplier ?? data.speed_multiplier ?? 1,
        quali: data.quali_speed_multiplier ?? data.speed_multiplier ?? 1,
        race: data.race_speed_multiplier ?? data.speed_multiplier ?? 1,
      });

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setCanManageSessionSpeed(false);
      } else {
        const { data: membership } = await supabase
          .from('tcc_championship_members')
          .select('role')
          .eq('championship_id', data.championship_id)
          .eq('user_id', userId)
          .maybeSingle();
        setCanManageSessionSpeed(
          data.tcc_championships?.created_by === userId ||
          membership?.role === 'host' ||
          membership?.role === 'developer'
        );
      }
    } catch (err) {
      console.error('Failed to load weekend:', err);
    } finally {
      setLoading(false);
    }
  };

  const runSession = async (type: 'practice' | 'quali' | 'race') => {
    if (!id) return;
    setRunningSession(type);
    try {
      if (type === 'practice') await TCC_API.runPractice(id);
      if (type === 'quali') await TCC_API.runQuali(id);
      if (type === 'race') await TCC_API.runRace(id);

      // Reload data to show updated status
      await loadWeekend();
    } catch (err) {
      console.error(`Failed to run ${type}:`, err);
      alert(`Failed to run ${type}. Check console for details.`);
    } finally {
      setRunningSession(null);
    }
  };

  const setSessionSpeed = async (sessionType: 'practice' | 'quali' | 'race', speed: 1 | 2 | 5 | 10) => {
    if (!id) return;
    setSavingSessionSpeed(sessionType);
    try {
      const { data, error } = await TCC_API.setWeekendSessionSpeed(id, sessionType, speed);
      if (error) throw error;
      if (!data?.success) {
        alert(data?.message || 'Failed to update session speed');
        return;
      }
      setSessionSpeeds((prev) => ({ ...prev, [sessionType]: speed }));
      await loadWeekend();
    } catch (err: any) {
      console.error(`Failed to set ${sessionType} speed:`, err);
      alert(err?.message || err?.error_description || err?.details || 'Failed to update session speed');
    } finally {
      setSavingSessionSpeed(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
        <div className="text-f1-red animate-pulse font-mono tracking-widest">LOADING TELEMETRY...</div>
    </div>
  );

  if (!weekend) return (
    <div className="min-h-screen flex items-center justify-center p-8">
        <GlassCard className="max-w-md w-full text-center border-red-500/30">
            <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />
            <h2 className="text-xl font-bold text-white mb-2">Event Not Found</h2>
            <GlassButton onClick={() => navigate('/championships')} variant="secondary" className="mt-4">
                Return to Hub
            </GlassButton>
        </GlassCard>
    </div>
  );

  const track = TRACKS.find(t => t.id === weekend.track_id);

  const SessionCard = ({ 
    title, 
    type, 
    status, 
    onRun, 
    results 
  }: { 
    title: string; 
    type: 'practice' | 'quali' | 'race'; 
    status: string; 
    onRun: () => void;
    results?: any;
  }) => {
    const isCompleted = status === 'completed';
    // Logic for actionable state
    let isActionable = false;
    if (type === 'practice' && weekend.status === 'scheduled') isActionable = true;
    if (type === 'quali' && weekend.status === 'practice_complete') isActionable = true;
    if (type === 'race' && weekend.status === 'quali_complete') isActionable = true;

    return (
      <GlassCard 
        className={clsx(
            "flex flex-col h-full",
            isActionable ? "border-f1-red shadow-[0_0_20px_rgba(225,6,0,0.15)] bg-f1-red/20" : "opacity-80"
        )}
      >
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-2xl font-black text-white italic tracking-tighter">{title.toUpperCase()}</h3>
          {isCompleted ? (
            <span className="flex items-center gap-1 text-green-400 text-xs font-bold bg-green-500/10 px-2 py-1 rounded border border-green-500/30">
              <CheckCircle size={12} /> COMPLETE
            </span>
          ) : isActionable ? (
            <span className="flex items-center gap-1 text-[#00FFFF] text-xs font-bold bg-[#00FFFF]/10 px-2 py-1 rounded border border-[#00FFFF]/30 animate-pulse">
              <Clock size={12} /> READY
            </span>
          ) : (
            <span className="text-gray-500 text-xs font-bold bg-white/5 px-2 py-1 rounded border border-white/10">
              LOCKED
            </span>
          )}
        </div>

        <div className="flex-grow">
            {isCompleted ? (
            <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Session Report</p>
                <div className="text-sm font-mono text-[#00FFFF]">
                {type === 'race' ? `Winner: ${results?.[0]?.driver_name || 'Unknown'}` : 'Data Processing Complete'}
                </div>
            </div>
            ) : (
                <div className="text-gray-500 text-sm italic">
                    {isActionable ? "Session ready for simulation initialization." : "Waiting for previous session completion."}
                </div>
            )}
        </div>

        {!isCompleted && (
          <div className="mt-6">
            <GlassButton
              onClick={onRun}
              disabled={!isActionable || !!runningSession}
              variant={isActionable ? 'primary' : 'secondary'}
              className="w-full"
              icon={runningSession === type ? undefined : <Play size={16} />}
              isLoading={runningSession === type}
            >
              {runningSession === type ? 'SIMULATING...' : 'INITIALIZE SESSION'}
            </GlassButton>
          </div>
        )}
      </GlassCard>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <button 
        onClick={() => navigate(`/championships/${weekend.championship_id}`)}
        className="flex items-center gap-2 text-gray-400 hover:text-[#00FFFF] transition-colors group"
      >
        <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> 
        Back to Championship
      </button>

      <PageHeader 
        title={weekend.name || track?.name || 'Grand Prix'}
        subtitle={`ROUND ${weekend.round_number}`}
        backgroundImage="https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=2070&auto=format&fit=crop"
        tags={
            <>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm text-gray-300">
                    <MapPin size={14} className="text-[#00FFFF]" /> 
                    {track?.location ? `${track.location.lat.toFixed(2)}°, ${track.location.long.toFixed(2)}°` : 'Unknown Location'}
                </div>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm text-gray-300">
                    <Calendar size={14} className="text-[#00FFFF]" /> 
                    {new Date(weekend.scheduled_race_at_utc || weekend.start_time).toLocaleString()}
                </div>
                <div className="px-3 py-1 rounded-full text-sm border font-medium bg-gray-800 border-gray-700 text-gray-400 uppercase">
                   {weekend.status?.replace('_', ' ')}
                </div>
            </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['practice', 'quali', 'race'] as const).map((sessionType) => {
          const scheduledAt = sessionType === 'practice'
            ? weekend.scheduled_practice_at_utc
            : sessionType === 'quali'
              ? weekend.scheduled_quali_at_utc
              : weekend.scheduled_race_at_utc;
          const isLocked = scheduledAt ? Date.now() >= (new Date(scheduledAt).getTime() - 3 * 60 * 60 * 1000) : false;
          return (
            <GlassCard key={`speed-${sessionType}`} className="p-4">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">{sessionType} speed</div>
              <div className="text-sm text-gray-400 mb-3">
                {scheduledAt ? `Locks 3h before ${new Date(scheduledAt).toLocaleString()}` : 'No session time set'}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 5, 10].map((speed) => (
                  <button
                    key={`${sessionType}-${speed}`}
                    onClick={() => setSessionSpeed(sessionType, speed as 1 | 2 | 5 | 10)}
                    disabled={!canManageSessionSpeed || isLocked || savingSessionSpeed === sessionType}
                    className={clsx(
                      'px-3 py-1.5 rounded border text-xs font-mono font-bold transition-colors',
                      sessionSpeeds[sessionType] === speed
                        ? 'border-[#00FFFF] bg-[#00FFFF]/10 text-[#00FFFF]'
                        : 'border-white/10 bg-black/30 text-gray-400',
                      (!canManageSessionSpeed || isLocked) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {!canManageSessionSpeed ? 'Host only.' : isLocked ? 'Locked for this session.' : 'Host editable.'}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SessionCard 
          title="Practice" 
          type="practice" 
          status={weekend.status === 'scheduled' ? 'ready' : 'completed'} 
          onRun={() => runSession('practice')}
        />
        
        <SessionCard 
          title="Qualifying" 
          type="quali" 
          status={
            ['scheduled', 'practice_complete'].includes(weekend.status)
              ? (weekend.status === 'practice_complete' ? 'ready' : 'locked')
              : 'completed'
          } 
          onRun={() => runSession('quali')}
        />

        <SessionCard 
          title="Race" 
          type="race" 
          status={
            weekend.status === 'race_complete' ? 'completed' :
            weekend.status === 'quali_complete' ? 'ready' : 'locked'
          }
          onRun={() => navigate(`/race/${id}`)}
          results={weekend.tcc_race_results} 
        />
      </div>

      {weekend.status === 'race_complete' && (
        <GlassCard className="mt-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <CheckCircle className="text-green-400" /> Event Summary
            </h3>
            
            {weekend.tcc_race_results && weekend.tcc_race_results.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium">Pos</th>
                                <th className="p-4 font-medium">Driver</th>
                                <th className="p-4 font-medium">Team</th>
                                <th className="p-4 font-medium">Time/Status</th>
                                <th className="p-4 font-medium text-right">Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {weekend.tcc_race_results
                                .sort((a: any, b: any) => a.position - b.position)
                                .map((res: any) => (
                                <tr key={res.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 font-mono text-[#00FFFF] font-bold">
                                        {res.position}
                                    </td>
                                    <td className="p-4 font-bold text-white">
                                        {res.driver_name || `Driver ${res.driver_id.slice(0,4)}`}
                                    </td>
                                    <td className="p-4 text-gray-400">
                                        {res.team_id.slice(0,8)}...
                                    </td>
                                    <td className="p-4 font-mono text-gray-300 text-sm">
                                        {res.status === 'Finished' 
                                            ? (res.total_time ? `${(res.total_time/60000).toFixed(2)}m` : 'Finished') 
                                            : <span className="text-red-400">{res.status}</span>
                                        }
                                    </td>
                                    <td className="p-4 font-bold text-white text-right">
                                        {res.points > 0 ? <span className="text-[#00FFFF]">{res.points}</span> : <span className="text-gray-600">0</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-gray-400 italic">
                    Race completed. Telemetry processing... No classification data available yet.
                </p>
            )}
        </GlassCard>
      )}
    </div>
  );
};
