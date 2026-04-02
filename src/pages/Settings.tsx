import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';

export const Settings: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <PageHeader title={t('common.settings')} description={t('common.configureGamePreferences')} />
      <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
        <h3 className="text-lg font-bold text-white mb-4">{t('common.generalSettings')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">{t('common.theme')}</span>
            <select className="bg-[#222] border border-[#444] text-white rounded px-3 py-1">
              <option>{t('common.dark')}</option>
              <option>{t('common.light')}</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">{t('common.notifications')}</span>
            <input type="checkbox" className="toggle" defaultChecked />
          </div>
        </div>
      </div>
    </div>
  );
};
