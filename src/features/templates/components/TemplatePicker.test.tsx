/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../../test-utils';
import { TemplatePicker } from './TemplatePicker';
import type { AgentTemplate } from '../../../types';

const mockInitialize = vi.fn();
const mockGetAllTemplates = vi.fn();
const mockRemoveCustomTemplate = vi.fn();
let mockIsLoaded = true;

vi.mock('../../../stores/templates', () => ({
  useTemplatesStore: () => ({
    initialize: mockInitialize,
    getAllTemplates: mockGetAllTemplates,
    removeCustomTemplate: mockRemoveCustomTemplate,
    isLoaded: mockIsLoaded,
  }),
}));

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'tpl-general',
    name: 'General Agent',
    description: 'A general agent',
    icon: 'Bot',
    color: 'bg-brand-600',
    category: 'general',
    agentType: 'interactive',
    config: { mcp_servers: [] },
    ...overrides,
  };
}

const TEMPLATES: AgentTemplate[] = [
  makeTemplate(),
  makeTemplate({
    id: 'tpl-support',
    name: 'Support Agent',
    description: 'Handles tickets',
    category: 'support',
  }),
  makeTemplate({
    id: 'tpl-custom',
    name: 'My Custom Agent',
    description: 'User-defined',
    category: 'custom',
    isCustom: true,
  }),
];

describe('TemplatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoaded = true;
    mockGetAllTemplates.mockReturnValue(TEMPLATES);
  });

  it('renders nothing until the store is loaded', () => {
    mockIsLoaded = false;
    const { container } = render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(mockInitialize).toHaveBeenCalled();
  });

  it('initializes the store and renders all templates by default', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    expect(mockInitialize).toHaveBeenCalled();
    expect(screen.getByText('General Agent')).toBeInTheDocument();
    expect(screen.getByText('Support Agent')).toBeInTheDocument();
    expect(screen.getByText('My Custom Agent')).toBeInTheDocument();
  });

  it('marks the active category tab as pressed', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Support' }));

    expect(screen.getByRole('button', { name: 'Support' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters templates by category', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Support' }));

    expect(screen.getByText('Support Agent')).toBeInTheDocument();
    expect(screen.queryByText('General Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('My Custom Agent')).not.toBeInTheDocument();
  });

  it('shows custom templates with a count on the My Templates tab', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    const customTab = screen.getByRole('button', { name: 'My Templates (1)' });
    fireEvent.click(customTab);

    expect(screen.getByText('My Custom Agent')).toBeInTheDocument();
    expect(screen.queryByText('General Agent')).not.toBeInTheDocument();
  });

  it('hides the My Templates tab when there are no custom templates', () => {
    mockGetAllTemplates.mockReturnValue(TEMPLATES.filter((t) => !t.isCustom));
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /My Templates/ })).not.toBeInTheDocument();
  });

  it('shows an empty state for categories without templates', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Automation' }));

    expect(screen.getByText('No templates in this category')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked template', () => {
    const onSelect = vi.fn();
    render(<TemplatePicker selectedId="" onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Support Agent'));

    expect(onSelect).toHaveBeenCalledWith(TEMPLATES[1]);
  });

  it('removes a custom template via its delete button', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete template My Custom Agent' }));

    expect(mockRemoveCustomTemplate).toHaveBeenCalledWith('tpl-custom');
  });

  it('does not render delete buttons for built-in templates', () => {
    render(<TemplatePicker selectedId="" onSelect={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Delete template General Agent' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete template Support Agent' })
    ).not.toBeInTheDocument();
  });
});
