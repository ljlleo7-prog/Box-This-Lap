import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flag, BarChart2, MessageSquare, Users, Settings } from 'lucide-react';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { path: '/', label: 'Race Control', icon: Flag },
  { path: '/strategy', label: 'Strategy', icon: BarChart2 },
  { path: '/narrative', label: 'Narrative', icon: MessageSquare },
  { path: '/team', label: 'Team', icon: Users },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-[#1C1C1C] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <nav className="w-64 bg-[#111111] border-r border-[#333] flex flex-col">
        <div className="p-6 border-b border-[#333]">
          <h1 className="text-xl font-bold text-[#00FFFF] tracking-wider">BOX THIS LAP</h1>
        </div>
        
        <div className="flex-1 py-6 px-3 space-y-2">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  isActive 
                    ? "bg-[#004225] text-[#00FFFF] shadow-[0_0_10px_rgba(0,255,255,0.2)]" 
                    : "text-gray-400 hover:bg-[#222] hover:text-white"
                )}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
        
        <div className="p-4 border-t border-[#333] text-xs text-gray-500">
          v0.1.0 Alpha
        </div>
      </nav>
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#2a2a2a] to-[#1C1C1C]">
        {children}
      </main>
    </div>
  );
};
