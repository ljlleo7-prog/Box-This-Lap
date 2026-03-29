import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const GlassButton: React.FC<GlassButtonProps> = ({ 
  children, 
  className, 
  variant = 'primary', 
  isLoading,
  icon,
  disabled,
  ...props 
}) => {
  const baseStyles = "relative inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md font-bold uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 border";
  
  const variants = {
    primary: "bg-f1-red text-white border-transparent hover:bg-red-700 shadow-lg shadow-red-900/20",
    secondary: "bg-f1-carbon text-white border-white/20 hover:bg-white/10 hover:border-white/40",
    danger: "bg-red-900/80 text-white border-red-500/50 hover:bg-red-800",
    ghost: "text-gray-400 hover:text-white hover:bg-white/5 border-transparent"
  };

  return (
    <button 
      className={clsx(baseStyles, variants[variant], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin w-4 h-4" />}
      {!isLoading && icon}
      <span>{children}</span>
    </button>
  );
};
