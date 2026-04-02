import React, { useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Trophy, Users, Building2, Settings, User, Microscope, Flag, RadioTower } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';
import { GlassButton } from './ui/GlassButton';
import { useI18n } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/translations';

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
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-[#1C1C1C] text-white font-rajdhani overflow-hidden">
      {/* Sidebar */}
      <nav className="w-64 bg-[#111111] border-r border-[#333] flex flex-col">
        <div className="p-6 border-b border-[#333]">
          <h1 className="text-xl font-orbitron font-bold text-white tracking-wider italic">BOX THIS <span className="text-f1-red">LAP</span></h1>
        </div>
        
        <div className="flex-1 py-6 px-3 space-y-2">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-md transition-all",
                  isActive 
                    ? "bg-f1-red text-white shadow-lg shadow-red-900/20" 
                    : "text-gray-400 hover:bg-[#222] hover:text-white"
                )}
              >
                <Icon size={20} />
                <span className="font-medium">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
        
        <div className="p-4 border-t border-[#333] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">{t('common.language')}</span>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as Locale)}
                className="bg-[#222] border border-[#444] text-white rounded px-2 py-1 text-xs"
              >
                <option value="en">EN</option>
                <option value="zh-CN">中文</option>
              </select>
            </div>
            {loading ? (
                <div className="text-xs text-gray-500 animate-pulse">{t('common.loadingAuth')}</div>
            ) : user ? (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 text-sm text-gray-300">
                        <div className="w-8 h-8 rounded-full bg-f1-carbon border border-white/10 flex items-center justify-center text-white">
                            <User size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{user.email}</div>
                        </div>
                    </div>
                    <GlassButton 
                        onClick={handleSignOut}
                        variant="ghost"
                        className="w-full justify-start text-xs text-red-400 hover:text-red-300 pl-11 !py-1"
                    >
                        {t('common.signOut')}
                    </GlassButton>
                </div>
            ) : (
                <Link to="/login" className="text-sm text-f1-red hover:text-white hover:underline transition-colors">
                    {t('common.loginRegister')}
                </Link>
            )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#0a0a0a] relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
        <div className="relative z-10 p-8 min-h-full">
            {children}
        </div>
      </main>
    </div>
  );
};
