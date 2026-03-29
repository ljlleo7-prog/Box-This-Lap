import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';

export const TeamHub: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Team Hub" description="Manage your team roster and staff" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-4">Drivers</h3>
          <p className="text-gray-400">Driver roster and contracts will appear here.</p>
        </div>
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-4">Staff</h3>
          <p className="text-gray-400">Engineering and Pit Crew management.</p>
        </div>
      </div>
    </div>
  );
};
