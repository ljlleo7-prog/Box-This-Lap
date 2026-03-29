import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  action?: React.ReactNode;
  tags?: React.ReactNode;
  backgroundImage?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ 
  title, 
  subtitle, 
  description,
  action, 
  tags,
  backgroundImage 
}) => {
  return (
    <div className="relative mb-8 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0a]">
        {backgroundImage && (
          <img 
            src={backgroundImage} 
            alt="Header Background" 
            className="w-full h-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
      </div>

      <div className="relative z-10 p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
            {subtitle && (
            <div className="text-f1-red font-mono text-xs tracking-[0.2em] uppercase mb-2 pl-1">
                {subtitle}
            </div>
            )}
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none">
            {title}
            </h1>
            {description && (
              <p className="text-gray-400 mt-2 max-w-2xl text-lg">
                {description}
              </p>
            )}
            {tags && (
                <div className="flex flex-wrap gap-3 mt-4">
                    {tags}
                </div>
            )}
        </div>
        
        {action && (
            <div className="flex-shrink-0">
                {action}
            </div>
        )}
      </div>
    </div>
  );
};
