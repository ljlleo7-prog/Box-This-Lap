import React, { useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Trophy, Users, Building2, Settings, User, Microscope, Flag, RadioTower, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { DRIVERS } from '../data/initialData';
import { supabase } from '../lib/supabase';
import { GlassButton } from './ui/GlassButton';
import { useI18n } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/translations';
import { getPageBackgroundChangeEventName, getPageBackgroundSettings, normalizeBackgroundImageUrl, resolveGamePageKey } from '../lib/pageBackgroundSettings';
import { useChampionshipStore } from '../store/championshipStore';
import { TCC_API } from '../lib/tcc-api';

const NAV_ITEMS = [
  { path: '/', labelKey: 'layout.nav.dashboard', icon: LayoutDashboard },
  { path: '/championships', labelKey: 'layout.nav.championship', icon: Trophy },
  { path: '/team-hub', labelKey: 'layout.nav.teamHub', icon: Users },
  { path: '/research', labelKey: 'layout.nav.research', icon: Microscope },
  { path: '/race-dev', labelKey: 'layout.nav.devRace', icon: Flag },
  { path: '/practice-quali-dev', labelKey: 'layout.nav.devWeekend', icon: RadioTower },
  { path: '/facilities', labelKey: 'layout.nav.facilities', icon: Building2 },
  { path: '/settings', labelKey: 'layout.nav.settings', icon: Settings },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, setLocale, t } = useI18n();
  const mode = useChampionshipStore((state) => state.mode);
  const championshipId = useChampionshipStore((state) => state.championshipId);
  const activeChampionshipName = useChampionshipStore((state) => state.activeChampionship?.name ?? null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageBackgroundStyle, setPageBackgroundStyle] = useState<{ url: string; opacity: number }>({ url: '', opacity: 0.16 });
  const [sidebarUsername, setSidebarUsername] = useState<string | null>(null);
  const [selectedChampionshipName, setSelectedChampionshipName] = useState<string | null>(null);
  const [walletSummary, setWalletSummary] = useState<{ cash: number; token: number } | null>(null);
  const [liveRaceAnnouncement, setLiveRaceAnnouncement] = useState<{
    championshipId: string;
    weekendId: string;
    championshipName: string | null;
    authorityUserId: string | null;
    authorityUsername: string | null;
    currentLap: number | null;
    lastSeenAt: string | null;
    playerDriverPositions: Array<{ driverId: string; position: number }>;
    availableSessions: Array<'practice' | 'quali' | 'race'>;
    defaultSession: 'practice' | 'quali' | 'race';
    hasLiveUsers: boolean;
    livePresenceCount: number;
    weekendStatus: string | null;
    roundNumber: number | null;
    trackId: string | null;
  } | null>(null);

  useEffect(() => {
    const syncBackground = () => {
      const settings = getPageBackgroundSettings();
      const pageKey = resolveGamePageKey(location.pathname);
      const pageBackgroundUrl = normalizeBackgroundImageUrl(settings.pages[pageKey] || '');
      setPageBackgroundStyle({
        url: pageBackgroundUrl,
        opacity: settings.opacity,
      });
    };
    syncBackground();
    const eventName = getPageBackgroundChangeEventName();
    window.addEventListener(eventName, syncBackground);
    return () => window.removeEventListener(eventName, syncBackground);
  }, [location.pathname]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isActive = true;
    const fetchSidebarProfile = async () => {
      if (!user?.id) {
        if (isActive) setSidebarUsername(null);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();
      if (!isActive) return;
      setSidebarUsername(data?.username || user.email?.split('@')[0] || null);
    };
    fetchSidebarProfile();
    return () => {
      isActive = false;
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    let isActive = true;
    const fetchChampionshipSidebarData = async () => {
      if (!championshipId) {
        if (isActive) {
          setSelectedChampionshipName(null);
          setWalletSummary(null);
        }
        return;
      }

      if (mode === 'local' && activeChampionshipName) {
        setSelectedChampionshipName(activeChampionshipName);
      } else {
        const { data } = await supabase
          .from('tcc_championships')
          .select('name')
          .eq('id', championshipId)
          .maybeSingle();
        if (!isActive) return;
        setSelectedChampionshipName(data?.name || championshipId);
      }

      if (mode !== 'online') {
        if (isActive) setWalletSummary(null);
        return;
      }

      const walletResult = await TCC_API.getWalletBalance(championshipId);
      if (!isActive) return;
      const cash = Number(walletResult.data?.wallet?.cash_balance ?? 0);
      const token = Number(walletResult.data?.wallet?.token_balance ?? 0);
      setWalletSummary({ cash, token });
    };
    fetchChampionshipSidebarData();
    return () => {
      isActive = false;
    };
  }, [championshipId, mode, activeChampionshipName]);

  useEffect(() => {
    let isActive = true;
    let intervalId: number | undefined;

    const fetchLiveRaceAnnouncement = async () => {
      if (!user?.id) {
        if (isActive) setLiveRaceAnnouncement(null);
        return;
      }

      try {
        const summary = await TCC_API.getLiveRaceSidebarSummary(user.id);
        if (!isActive) return;
        setLiveRaceAnnouncement(summary);
      } catch (error) {
        console.error('Failed to load live race announcement', error);
        if (isActive) setLiveRaceAnnouncement(null);
      }
    };

    fetchLiveRaceAnnouncement();
    intervalId = window.setInterval(fetchLiveRaceAnnouncement, 10000);

    return () => {
      isActive = false;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100 text-zinc-900 font-rajdhani dark:bg-zinc-950 dark:text-white">
      {/* Sidebar */}
      <nav className="flex w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
          <h1 className="text-xl font-orbitron font-bold tracking-wider italic text-zinc-900 dark:text-white">BOX THIS <span className="text-f1-red">LAP</span></h1>
        </div>

        <div className="flex-1 space-y-2 px-3 py-6">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 rounded-md px-4 py-3 transition-all",
                  isActive
                    ? "bg-f1-red text-white shadow-lg shadow-red-900/20"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                )}
              >
                <Icon size={20} />
                <span className="font-medium">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('common.language')}</span>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
                className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="en">EN</option>
                <option value="zh-CN">中文</option>
              </select>
            </div>
            {loading ? (
                <div className="animate-pulse text-xs text-zinc-500 dark:text-zinc-500">{t('common.loadingAuth')}</div>
            ) : user ? (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-900 dark:border-white/10 dark:bg-f1-carbon dark:text-white">
                            <User size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{user.email}</div>
                            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sidebarUsername || '—'}</div>
                        </div>
                    </div>
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      <div className="truncate">{selectedChampionshipName || 'No championship selected'}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span>CASH {walletSummary ? walletSummary.cash.toLocaleString() : '—'}</span>
                        <span>TKN {walletSummary ? walletSummary.token.toLocaleString() : '—'}</span>
                      </div>
                    </div>
                    {liveRaceAnnouncement && (
                      <div className="rounded-md border border-f1-red/30 bg-f1-red/10 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-100">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold uppercase tracking-wide text-f1-red">
                            {t('layout.liveRace.title')}
                          </div>
                          <span className="rounded-full border border-f1-red/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-f1-red">
                            {liveRaceAnnouncement.hasLiveUsers ? `LIVE ${liveRaceAnnouncement.livePresenceCount}` : 'AVAILABLE'}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-zinc-600 dark:text-zinc-300">
                          {liveRaceAnnouncement.championshipName || t('layout.liveRace.defaultChampionship')}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {liveRaceAnnouncement.roundNumber ? `Round ${liveRaceAnnouncement.roundNumber}` : 'Upcoming weekend'}
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                          <div>Authority: {liveRaceAnnouncement.authorityUsername || (liveRaceAnnouncement.hasLiveUsers ? 'TBD' : 'Offline')}</div>
                          <div>Lap: {liveRaceAnnouncement.currentLap ?? '—'}</div>
                          <div>Sessions: {liveRaceAnnouncement.availableSessions.map((session) => session.toUpperCase()).join(' • ')}</div>
                          <div>
                            Drivers:{' '}
                            {liveRaceAnnouncement.playerDriverPositions.length > 0
                              ? liveRaceAnnouncement.playerDriverPositions
                                  .map((entry) => {
                                    const driver = DRIVERS.find((candidate) => candidate.id === entry.driverId);
                                    return `${driver?.name ?? entry.driverId} P${entry.position}`;
                                  })
                                  .join(' • ')
                              : 'No tracked drivers'}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <Link
                            to={`/championships/${liveRaceAnnouncement.championshipId}`}
                            className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-zinc-700 hover:border-f1-red hover:text-f1-red dark:border-zinc-700 dark:text-zinc-200"
                          >
                            Championship
                          </Link>
                          <Link
                            to={`/weekends/${liveRaceAnnouncement.weekendId}`}
                            className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-zinc-700 hover:border-f1-red hover:text-f1-red dark:border-zinc-700 dark:text-zinc-200"
                          >
                            Weekend
                          </Link>
                          {liveRaceAnnouncement.availableSessions.map((session) => (
                            <Link
                              key={session}
                              to={`/race/${liveRaceAnnouncement.weekendId}?session=${session}`}
                              className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-zinc-700 hover:border-f1-red hover:text-f1-red dark:border-zinc-700 dark:text-zinc-200"
                            >
                              {session.toUpperCase()}
                            </Link>
                          ))}
                        </div>
                        <Link
                          to={`/race/${liveRaceAnnouncement.weekendId}?session=${liveRaceAnnouncement.defaultSession}`}
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-f1-red hover:text-red-400"
                        >
                          <span>{t('layout.liveRace.joinNow')}</span>
                          <ArrowRight size={12} />
                        </Link>
                      </div>
                    )}
                    <GlassButton
                        onClick={handleSignOut}
                        variant="ghost"
                        className="w-full justify-start pl-11 !py-1 text-xs text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300"
                    >
                        {t('common.signOut')}
                    </GlassButton>
                </div>
            ) : (
                <Link to="/login" className="text-sm text-f1-red transition-colors hover:text-zinc-900 hover:underline dark:hover:text-white">
                    {t('common.loginRegister')}
                </Link>
            )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950">
        {pageBackgroundStyle.url && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url("${pageBackgroundStyle.url}")`,
              opacity: pageBackgroundStyle.opacity,
            }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 opacity-10 mix-blend-overlay dark:opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative z-10 min-h-full p-8">
            {children}
        </div>
      </main>
    </div>
  );
};
