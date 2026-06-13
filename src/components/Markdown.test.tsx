/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Markdown } from './Markdown';

// Mock the lazily-loaded syntax highlighter so code block tests are deterministic
vi.mock('react-syntax-highlighter/dist/esm/prism-light', () => {
  const MockSyntaxHighlighter = Object.assign(
    ({ children }: { children?: React.ReactNode }) => (
      <pre data-testid="syntax-highlighter">
        <code>{children}</code>
      </pre>
    ),
    { registerLanguage: vi.fn() }
  );
  return { default: MockSyntaxHighlighter };
});
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/javascript', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/typescript', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/tsx', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/json', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/bash', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/python', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/yaml', () => ({ default: {} }));
vi.mock('react-syntax-highlighter/dist/esm/languages/prism/sql', () => ({ default: {} }));

describe('Markdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders paragraphs', () => {
    render(<Markdown content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders headings at the right levels', () => {
    render(<Markdown content={'# Title\n\n## Subtitle\n\n### Section'} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Subtitle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toBeInTheDocument();
  });

  it('renders emphasis and strong text', () => {
    render(<Markdown content="This is **bold** and *italic*" />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });

  it('renders unordered lists', () => {
    render(<Markdown content={'- one\n- two\n- three'} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders blockquotes', () => {
    const { container } = render(<Markdown content="> quoted wisdom" />);
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).not.toBeNull();
    expect(blockquote).toHaveTextContent('quoted wisdom');
  });

  it('renders GFM tables', () => {
    render(<Markdown content={'| Name | Count |\n| --- | --- |\n| Alpha | 3 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('renders GFM strikethrough', () => {
    const { container } = render(<Markdown content="~~removed~~" />);
    const del = container.querySelector('del');
    expect(del).not.toBeNull();
    expect(del).toHaveTextContent('removed');
  });

  it('renders safe external links with rel and target', () => {
    render(<Markdown content="[StateSet](https://stateset.com)" />);
    const link = screen.getByRole('link', { name: 'StateSet' });
    expect(link).toHaveAttribute('href', 'https://stateset.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render an anchor for unsafe link schemes', () => {
    render(<Markdown content="[bad](javascript:alert(1))" />);
    const text = screen.getByText('bad');
    expect(text.closest('a')).toBeNull();
  });

  it('allows mailto links', () => {
    render(<Markdown content="[email us](mailto:support@stateset.com)" />);
    expect(screen.getByRole('link', { name: 'email us' })).toHaveAttribute(
      'href',
      'mailto:support@stateset.com'
    );
  });

  it('renders fenced code blocks with a language badge and copy button', async () => {
    render(<Markdown content={'```js\nconst x = 1;\n```'} />);
    expect(await screen.findByText('const x = 1;')).toBeInTheDocument();
    expect(screen.getByText('js')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });

  it('upgrades supported languages to the syntax highlighter once loaded', async () => {
    render(<Markdown content={'```js\nconst y = 2;\n```'} />);
    expect(await screen.findByTestId('syntax-highlighter')).toHaveTextContent('const y = 2;');
  });

  it('copies code to the clipboard and announces the copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<Markdown content={'```js\nconst z = 3;\n```'} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }));

    expect(writeText).toHaveBeenCalledWith('const z = 3;');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('applies a custom className to the wrapper', () => {
    const { container } = render(<Markdown content="text" className="custom-class" />);
    expect((container.firstChild as HTMLElement).className).toContain('custom-class');
  });
});
