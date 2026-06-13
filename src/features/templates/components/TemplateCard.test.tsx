/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test-utils';
import { TemplateCard } from './TemplateCard';
import type { AgentTemplate } from '../../../types';

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'tpl-1',
    name: 'Support Agent',
    description: 'Handles support tickets',
    icon: 'HelpCircle',
    color: 'bg-purple-600',
    category: 'support',
    agentType: 'interactive',
    config: {
      mcp_servers: ['gorgias', 'shopify'],
      model: 'claude-sonnet-4-6',
      temperature: 0.5,
    },
    ...overrides,
  };
}

describe('TemplateCard', () => {
  it('renders name, description, and MCP server tags', () => {
    render(<TemplateCard template={makeTemplate()} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.getByText('Support Agent')).toBeInTheDocument();
    expect(screen.getByText('Handles support tickets')).toBeInTheDocument();
    expect(screen.getByText('gorgias')).toBeInTheDocument();
    expect(screen.getByText('shopify')).toBeInTheDocument();
  });

  it('omits MCP tags when there are no servers', () => {
    render(
      <TemplateCard
        template={makeTemplate({ config: { mcp_servers: [] } })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText('gorgias')).not.toBeInTheDocument();
  });

  it('applies selected styling when isSelected is true', () => {
    const { rerender } = render(
      <TemplateCard template={makeTemplate()} isSelected={true} onSelect={vi.fn()} />
    );

    const card = screen.getByRole('button', { name: /Support Agent/ });
    expect(card.className).toContain('border-brand-500');

    rerender(<TemplateCard template={makeTemplate()} isSelected={false} onSelect={vi.fn()} />);
    expect(card.className).toContain('border-gray-800');
  });

  it('calls onSelect when the card is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={makeTemplate()} isSelected={false} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Support Agent'));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('does not show the Custom badge or delete button for built-in templates', () => {
    render(
      <TemplateCard
        template={makeTemplate()}
        isSelected={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete template/ })).not.toBeInTheDocument();
  });

  it('shows the Custom badge for custom templates', () => {
    render(
      <TemplateCard
        template={makeTemplate({ isCustom: true })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('hides the delete button for custom templates without an onDelete handler', () => {
    render(
      <TemplateCard
        template={makeTemplate({ isCustom: true })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Delete template/ })).not.toBeInTheDocument();
  });

  it('calls onDelete without triggering onSelect when delete is clicked', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <TemplateCard
        template={makeTemplate({ isCustom: true })}
        isSelected={false}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete template Support Agent' }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('falls back to the Bot icon for unknown icon names without crashing', () => {
    render(
      <TemplateCard
        template={makeTemplate({ icon: 'TotallyUnknownIcon' })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Support Agent')).toBeInTheDocument();
  });
});
