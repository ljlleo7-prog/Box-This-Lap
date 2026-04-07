import React from 'react';
import { normalizeBackgroundImageUrl } from '../../lib/pageBackgroundSettings';

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
  const normalizedBackgroundImage = normalizeBackgroundImageUrl(backgroundImage);

  return (
    <div className="relative mb-8 overflow-hidden rounded-3xl border border-zinc-200 shadow-2xl dark:border-white/10">
      {/* Background */}
      <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-950">
        {normalizedBackgroundImage && (
          <img
            src={normalizedBackgroundImage}
            alt="Header Background"
            className="h-full w-full object-cover opacity-30 dark:opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/75 to-transparent dark:from-black/90 dark:via-black/60 dark:to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-end md:p-10">
        <div className="space-y-2">
            {subtitle && (
            <div className="mb-2 pl-1 font-mono text-xs uppercase tracking-[0.2em] text-f1-red">
                {subtitle}
            </div>
            )}
            <h1 className="text-4xl font-black leading-none tracking-tight text-zinc-900 dark:text-white md:text-5xl">
            {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
                {description}
              </p>
            )}
            {tags && (
                <div className="mt-4 flex flex-wrap gap-3">
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
