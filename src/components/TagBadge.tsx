import { X } from 'lucide-react';
import clsx from 'clsx';

const TAG_COLORS: Record<string, { bg: string; text: string; border: string; shadow: string }> = {
  production: {
    bg: 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    shadow: 'shadow-emerald-500/10',
  },
  staging: {
    bg: 'bg-gradient-to-r from-amber-500/20 to-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    shadow: 'shadow-amber-500/10',
  },
  development: {
    bg: 'bg-gradient-to-r from-blue-500/20 to-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    shadow: 'shadow-blue-500/10',
  },
  priority: {
    bg: 'bg-gradient-to-r from-rose-500/20 to-rose-500/10',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    shadow: 'shadow-rose-500/10',
  },
  test: {
    bg: 'bg-gradient-to-r from-purple-500/20 to-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    shadow: 'shadow-purple-500/10',
  },
};

const DEFAULT_COLOR = {
  bg: 'bg-slate-800/60',
  text: 'text-slate-300',
  border: 'border-slate-700/60',
  shadow: '',
};

function getTagColor(tag: string) {
  return TAG_COLORS[tag.toLowerCase()] || DEFAULT_COLOR;
}

interface TagBadgeProps {
  tag: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function TagBadge({ tag, onRemove, size = 'sm' }: TagBadgeProps) {
  const color = getTagColor(tag);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border font-medium backdrop-blur-sm shadow-sm transition-all duration-150 hover:scale-[1.03]',
        color.bg,
        color.text,
        color.border,
        color.shadow,
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px] uppercase tracking-widest' : 'px-2.5 py-1 text-xs'
      )}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 hover:scale-110 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded"
          aria-label={`Remove tag ${tag}`}
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

interface TagFilterProps {
  allTags: string[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
}

export function TagFilter({ allTags, selectedTags, onToggleTag }: TagFilterProps) {
  if (allTags.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {allTags.map((tag) => {
        const color = getTagColor(tag);
        const isSelected = selectedTags.has(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggleTag(tag)}
            className={clsx(
              'px-2.5 py-1 text-xs font-medium rounded-lg border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 backdrop-blur-sm',
              isSelected
                ? `${color.bg} ${color.text} ${color.border} ${color.shadow} shadow-sm scale-[1.03]`
                : 'bg-slate-800/40 text-gray-400 border-slate-700/50 hover:bg-slate-800/60 hover:text-gray-200 hover:scale-[1.02] shadow-sm'
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
