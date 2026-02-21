import { forwardRef } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-gradient-to-b from-brand-500 to-brand-600 border border-brand-500/50 text-white shadow-md shadow-brand-500/25 hover:from-brand-400 hover:to-brand-500 hover:border-brand-400/60 hover:shadow-lg hover:shadow-brand-500/30',
  secondary:
    'bg-slate-800/80 backdrop-blur-sm border border-slate-700/80 text-gray-200 shadow-sm hover:bg-slate-700/80 hover:border-slate-600/80',
  danger:
    'bg-gradient-to-b from-rose-500 to-rose-600 border border-rose-500/50 text-white shadow-md shadow-rose-500/25 hover:from-rose-400 hover:to-rose-500 hover:border-rose-400/60 hover:shadow-lg hover:shadow-rose-500/30',
  ghost:
    'bg-transparent border border-transparent text-gray-400 hover:text-gray-200 hover:bg-slate-800/60 hover:border-slate-700/50',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-xl',
  lg: 'px-6 py-3 text-base gap-2.5 rounded-xl',
};

const iconSizeMap: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const Spinner = ({ size }: { size: string }) => (
  <div
    className={clsx(
      'border-2 border-current/30 border-t-current rounded-full animate-spin',
      iconSizeMap[size]
    )}
  />
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon: Icon,
      iconPosition = 'left',
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isIconOnly = Icon && !children;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-lg relative overflow-hidden',
          'transition-all duration-200',
          'active:translate-y-px active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          isIconOnly ? (size === 'sm' ? 'p-1' : size === 'lg' ? 'p-2.5' : 'p-2') : sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <Spinner size={size} />
            {children && <span>{children}</span>}
          </>
        ) : (
          <>
            {Icon && iconPosition === 'left' && <Icon className={iconSizeMap[size]} />}
            {children && <span>{children}</span>}
            {Icon && iconPosition === 'right' && <Icon className={iconSizeMap[size]} />}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
