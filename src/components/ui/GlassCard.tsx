import React from 'react';
import { clsx } from 'clsx';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className, 
  hoverEffect = false,
  onClick 
}) => {
  return (
    <div 
      onClick={onClick}
      className={clsx(
        "relative overflow-hidden rounded-lg border border-white/10 bg-f1-carbon/90 shadow-xl",
        hoverEffect && "transition-all duration-300 hover:border-f1-red/50 hover:shadow-[0_0_20px_rgba(225,6,0,0.15)] hover:-translate-y-1 cursor-pointer",
        className
      )}
    >
      {/* Carbon fiber texture overlay (optional, simulating via gradient for now) */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none opacity-50" />
      <div className="relative z-10 p-6">
        {children}
      </div>
    </div>
  );
};
