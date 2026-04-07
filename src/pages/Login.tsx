import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { GlassButton } from '../components/ui/GlassButton';
import { useI18n } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/translations';

export const Login: React.FC = () => {
  const { locale, setLocale, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isDev = import.meta.env.DEV;
  const returnTo = useMemo(() => {
    const fromPath = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
    const relativePath = fromPath?.pathname
      ? `${fromPath.pathname}${fromPath.search ?? ''}${fromPath.hash ?? ''}`
      : '/';
    return new URL(relativePath, window.location.origin).toString();
  }, [location.state]);
  const homepageLoginUrl = useMemo(() => {
    const homepageOrigin = window.location.hostname.endsWith('geeksproductionstudio.com')
      ? 'https://geeksproductionstudio.com'
      : 'http://localhost:5173';
    return `${homepageOrigin}/login?redirect_to=${encodeURIComponent(returnTo)}`;
  }, [returnTo]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        navigate('/', { replace: true });
        return;
      }
      setCheckingSession(false);
    }).catch(() => {
      if (!active) return;
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        navigate('/', { replace: true });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: email.split('@')[0], // Default username
            },
          },
        });
        if (error) throw error;
        alert(t('login.checkEmailLink'));
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 p-4 dark:bg-zinc-950">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-f1-red blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900 blur-[150px] rounded-full" />
      </div>

      <GlassCard className="w-full max-w-md border-zinc-200 bg-white/85 p-8 text-zinc-900 dark:border-[#333] dark:bg-zinc-950/85 dark:text-white">
        <div className="text-center mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-wider text-zinc-900 dark:text-white">BOX THIS <span className="text-f1-red">LAP</span></h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('login.enterPaddock')}</p>
        </div>

        <div className="mb-6 flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <span className="text-xs uppercase tracking-wide text-gray-400">{t('common.language')}</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-[#444] dark:bg-[#222] dark:text-white"
          >
            <option value="en">EN</option>
            <option value="zh-CN">中文</option>
          </select>
        </div>

        {checkingSession ? (
          <div className="py-12 text-center text-gray-400">{t('login.checkingSharedSession')}</div>
        ) : (
          <>
            <div className="mb-6 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4">
              <div className="text-sm font-medium text-cyan-100">{t('login.sharedAccountTitle')}</div>
              <div className="mt-1 text-xs text-cyan-200/80">{t('login.sharedAccountSubtitle')}</div>
              <GlassButton
                type="button"
                className="mt-4 w-full justify-center"
                onClick={() => window.location.assign(homepageLoginUrl)}
              >
                {t('login.continueViaHomepage')}
              </GlassButton>
            </div>

            <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-gray-500">
              <div className="h-px flex-1 bg-white/10" />
              <span>{t('login.fallbackLogin')}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{t('login.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 transition-colors focus:border-f1-red focus:outline-none dark:border-[#444] dark:bg-[#222] dark:text-white"
                  placeholder={t('login.emailPlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{t('login.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 transition-colors focus:border-f1-red focus:outline-none dark:border-[#444] dark:bg-[#222] dark:text-white"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm">
                  {error}
                </div>
              )}

              <GlassButton
                type="submit"
                className="w-full justify-center py-3"
                disabled={loading}
              >
                {loading ? t('login.processing') : isSignUp ? t('login.register') : t('login.login')}
              </GlassButton>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-gray-400 hover:text-[#00FFFF] transition-colors"
              >
                {isSignUp ? t('login.alreadyHaveAccount') : t('login.noAccount')}
              </button>
            </div>
          </>
        )}

        {isDev && (
          <div className="mt-6">
            <GlassButton
              type="button"
              variant="secondary"
              className="w-full justify-center py-2 text-xs"
              onClick={() => navigate('/race-dev')}
            >
              {t('login.launchDevRaceControl')}
            </GlassButton>
          </div>
        )}
      </GlassCard>
    </div>
  );
};
