import { memo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { usePreferencesStore } from '../stores/preferences';
import clsx from 'clsx';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle = memo(function ThemeToggle({
  className,
  showLabel = false,
}: ThemeToggleProps) {
  const { theme, setTheme } = usePreferencesStore();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        'flex items-center gap-2 p-2 rounded-lg transition-colors',
        'hover:bg-gray-800 text-gray-400 hover:text-gray-200',
        className
      )}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      {showLabel && <span className="text-sm">{theme === 'dark' ? 'Light' : 'Dark'} Mode</span>}
    </button>
  );
});

// Animated version with smoother transition
export const AnimatedThemeToggle = memo(function AnimatedThemeToggle({
  className,
}: ThemeToggleProps) {
  const { theme, setTheme } = usePreferencesStore();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className={clsx(
        'relative w-14 h-8 rounded-full transition-colors duration-200',
        theme === 'dark' ? 'bg-gray-700' : 'bg-blue-100',
        className
      )}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      role="switch"
      aria-checked={theme === 'light'}
    >
      <span
        className={clsx(
          'absolute top-1 w-6 h-6 rounded-full transition-all duration-200 flex items-center justify-center',
          theme === 'dark' ? 'left-1 bg-gray-900' : 'left-7 bg-white shadow-md'
        )}
      >
        {theme === 'dark' ? (
          <Moon className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-500" />
        )}
      </span>
    </button>
  );
});
