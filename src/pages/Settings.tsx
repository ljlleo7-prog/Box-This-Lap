import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../hooks/useTheme';
import { PAGE_BACKGROUND_OPTIONS, getPageBackgroundSettings, savePageBackgroundSettings } from '../lib/pageBackgroundSettings';

export const Settings: React.FC = () => {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [backgroundSettings, setBackgroundSettings] = useState(getPageBackgroundSettings());

  useEffect(() => {
    setBackgroundSettings(getPageBackgroundSettings());
  }, []);

  const updateBackgroundUrl = (pageKey: (typeof PAGE_BACKGROUND_OPTIONS)[number]['key'], url: string) => {
    const next = {
      ...backgroundSettings,
      pages: {
        ...backgroundSettings.pages,
        [pageKey]: url,
      },
    };
    setBackgroundSettings(next);
    savePageBackgroundSettings(next);
  };

  const updateOpacity = (opacity: number) => {
    const next = {
      ...backgroundSettings,
      opacity,
    };
    setBackgroundSettings(next);
    savePageBackgroundSettings(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('common.settings')} description={t('common.configureGamePreferences')} />
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-white">{t('common.generalSettings')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-300">{t('common.theme')}</span>
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}
              className="rounded border border-zinc-300 bg-zinc-50 px-3 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            >
              <option value="dark">{t('common.dark')}</option>
              <option value="light">{t('common.light')}</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-300">{t('common.notifications')}</span>
            <input type="checkbox" className="toggle" defaultChecked />
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">Page Backgrounds</h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Set a faint image URL for each page.</p>
        <div className="mb-5">
          <label className="mb-2 block text-sm text-zinc-600 dark:text-zinc-300">Background Opacity ({Math.round(backgroundSettings.opacity * 100)}%)</label>
          <input
            type="range"
            min="5"
            max="40"
            value={Math.round(backgroundSettings.opacity * 100)}
            onChange={(event) => updateOpacity(Number(event.target.value) / 100)}
            className="w-full"
          />
        </div>
        <div className="space-y-3">
          {PAGE_BACKGROUND_OPTIONS.map((item) => (
            <div key={item.key} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[180px,1fr]">
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{item.label}</div>
              <input
                type="url"
                value={backgroundSettings.pages[item.key] || ''}
                onChange={(event) => updateBackgroundUrl(item.key, event.target.value)}
                placeholder="https://example.com/background.jpg"
                className="rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
