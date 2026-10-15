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

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'ui-button-primary',
  secondary: 'ui-button-secondary',
  danger: 'ui-button-danger',
  ghost: 'ui-button-ghost',
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
          'ui-button inline-flex items-center justify-center font-medium rounded-lg relative overflow-hidden',
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
            {Icon && iconPosition === 'left' && (
              <Icon className={iconSizeMap[size]} aria-hidden="true" />
            )}
            {children && <span>{children}</span>}
            {Icon && iconPosition === 'right' && (
              <Icon className={iconSizeMap[size]} aria-hidden="true" />
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
