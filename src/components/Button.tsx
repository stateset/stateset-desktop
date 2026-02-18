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
  primary: 'bg-brand-600 hover:bg-brand-500 text-white',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-200',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-300',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
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
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-lg transition-colors',
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
