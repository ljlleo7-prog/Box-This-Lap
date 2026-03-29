import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your career and active championships" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Placeholder cards */}
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-2">Active Championship</h3>
          <p className="text-gray-400">No active championship found.</p>
        </div>
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-2">Next Race</h3>
          <p className="text-gray-400">Schedule pending.</p>
        </div>
        <div className="bg-[#111] p-6 rounded-lg border border-[#333]">
          <h3 className="text-lg font-bold text-white mb-2">Team Status</h3>
          <p className="text-gray-400">Not signed to a team.</p>
        </div>
      </div>
    </div>
  );
};
