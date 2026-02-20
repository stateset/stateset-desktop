/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedList } from './VirtualizedList';

describe('VirtualizedList', () => {
  const getKey = (_item: string, index: number) => index;
  const renderItem = (item: string, _index: number) => <div>{item}</div>;

  it('shows emptyState when no items', () => {
    render(
      <VirtualizedList
        items={[]}
        itemHeight={40}
        renderItem={renderItem}
        getKey={getKey}
        emptyState={<div>Nothing here</div>}
      />
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders all items when below minItemsForVirtualization threshold', () => {
    const items = ['Alpha', 'Bravo', 'Charlie'];
    render(
      <VirtualizedList
        items={items}
        itemHeight={40}
        renderItem={renderItem}
        getKey={getKey}
        minItemsForVirtualization={20}
      />
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders all items when enabled is false (virtualization disabled)', () => {
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i}`);
    render(
      <VirtualizedList
        items={items}
        itemHeight={40}
        renderItem={renderItem}
        getKey={getKey}
        enabled={false}
      />
    );
    // Even though items exceed the default threshold, virtualization is disabled
    expect(screen.getByText('Item 0')).toBeInTheDocument();
    expect(screen.getByText('Item 29')).toBeInTheDocument();
  });

  it('applies className to container', () => {
    const items = ['One', 'Two'];
    const { container } = render(
      <VirtualizedList
        items={items}
        itemHeight={40}
        renderItem={renderItem}
        getKey={getKey}
        className="my-custom-class"
      />
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('does not show emptyState when there are items', () => {
    render(
      <VirtualizedList
        items={['One']}
        itemHeight={40}
        renderItem={renderItem}
        getKey={getKey}
        emptyState={<div>Nothing here</div>}
      />
    );
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    expect(screen.getByText('One')).toBeInTheDocument();
  });
});
