import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';

export const Settings: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your game preferences" />
      <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
        <h3 className="text-lg font-bold text-white mb-4">General Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Theme</span>
            <select className="bg-[#222] border border-[#444] text-white rounded px-3 py-1">
              <option>Dark</option>
              <option>Light</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Notifications</span>
            <input type="checkbox" className="toggle" defaultChecked />
          </div>
        </div>
      </div>
    </div>
  );
};
