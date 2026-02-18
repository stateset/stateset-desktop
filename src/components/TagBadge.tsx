import { X } from 'lucide-react';
import clsx from 'clsx';

const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  production: { bg: 'bg-green-900/30', text: 'text-green-400', border: 'border-green-800' },
  staging: { bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-800' },
  development: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-800' },
  priority: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-800' },
  test: { bg: 'bg-purple-900/30', text: 'text-purple-400', border: 'border-purple-800' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-800', text: 'text-gray-300', border: 'border-gray-700' };

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
        'inline-flex items-center gap-1 rounded border',
        color.bg,
        color.text,
        color.border,
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
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
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove tag ${tag}`}
        >
          <X className="w-3 h-3" />
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
              'px-2 py-0.5 text-xs rounded border transition-all',
              isSelected
                ? `${color.bg} ${color.text} ${color.border}`
                : 'bg-gray-800/50 text-gray-500 border-gray-700 hover:text-gray-300'
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
