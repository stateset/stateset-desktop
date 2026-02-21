/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagBadge, TagFilter } from './TagBadge';

describe('TagBadge', () => {
  it('should render the tag text', () => {
    render(<TagBadge tag="production" />);
    expect(screen.getByText('production')).toBeTruthy();
  });

  it('should apply known color class for known tags', () => {
    const { container } = render(<TagBadge tag="production" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('from-emerald-500/20');
    expect(badge.className).toContain('text-emerald-300');
  });

  it('should apply default color for unknown tags', () => {
    const { container } = render(<TagBadge tag="custom-tag" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-slate-800/60');
    expect(badge.className).toContain('text-slate-300');
  });

  it('should be case-insensitive for color lookup', () => {
    const { container } = render(<TagBadge tag="Production" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('from-emerald-500/20');
  });

  it('should show remove button when onRemove is provided', () => {
    const onRemove = vi.fn();
    render(<TagBadge tag="test" onRemove={onRemove} />);
    const removeBtn = screen.getByRole('button', { name: /remove tag test/i });
    expect(removeBtn).toBeTruthy();
  });

  it('should not show remove button when onRemove is not provided', () => {
    render(<TagBadge tag="test" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('should call onRemove and stop propagation when remove is clicked', () => {
    const onRemove = vi.fn();
    render(<TagBadge tag="test" onRemove={onRemove} />);
    const removeBtn = screen.getByRole('button', { name: /remove tag test/i });

    const clickEvent = new MouseEvent('click', { bubbles: true });
    const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
    fireEvent(removeBtn, clickEvent);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('should apply sm size by default', () => {
    const { container } = render(<TagBadge tag="test" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-[9px]');
  });

  it('should apply md size when specified', () => {
    const { container } = render(<TagBadge tag="test" size="md" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-xs');
  });
});

describe('TagFilter', () => {
  it('should render nothing when allTags is empty', () => {
    const { container } = render(
      <TagFilter allTags={[]} selectedTags={new Set()} onToggleTag={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('should render all tags as buttons', () => {
    render(
      <TagFilter
        allTags={['production', 'staging', 'test']}
        selectedTags={new Set()}
        onToggleTag={() => {}}
      />
    );
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.getByText('staging')).toBeTruthy();
    expect(screen.getByText('test')).toBeTruthy();
  });

  it('should apply selected styles to selected tags', () => {
    render(
      <TagFilter
        allTags={['production', 'staging']}
        selectedTags={new Set(['production'])}
        onToggleTag={() => {}}
      />
    );
    const prodBtn = screen.getByText('production');
    const stagingBtn = screen.getByText('staging');

    // Selected tag gets its brand color
    expect(prodBtn.className).toContain('text-emerald-300');
    // Unselected tag gets muted style
    expect(stagingBtn.className).toContain('text-gray-400');
  });

  it('should call onToggleTag when a tag is clicked', () => {
    const onToggleTag = vi.fn();
    render(
      <TagFilter
        allTags={['production', 'staging']}
        selectedTags={new Set()}
        onToggleTag={onToggleTag}
      />
    );
    fireEvent.click(screen.getByText('staging'));
    expect(onToggleTag).toHaveBeenCalledWith('staging');
  });
});
