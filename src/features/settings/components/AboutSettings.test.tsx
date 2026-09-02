/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '../../../test-utils';
import { AboutSettings } from './AboutSettings';

describe('AboutSettings', () => {
  it('renders the version and platform', () => {
    renderWithProviders(<AboutSettings appVersion="1.2.3" platform="darwin" />);

    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('darwin')).toBeInTheDocument();
  });

  it('falls back to defaults when version and platform are empty', () => {
    renderWithProviders(<AboutSettings appVersion="" platform="" />);

    expect(screen.getByText('1.0.1')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders external links with correct hrefs', () => {
    renderWithProviders(<AboutSettings appVersion="1.2.3" platform="linux" />);

    const docs = screen.getByRole('link', { name: /Documentation/i });
    const issues = screen.getByRole('link', { name: /Report an Issue/i });
    const website = screen.getByRole('link', { name: /StateSet Website/i });

    expect(docs).toHaveAttribute('href', 'https://docs.stateset.dev');
    expect(issues).toHaveAttribute('href', 'https://github.com/stateset/stateset-desktop/issues');
    expect(website).toHaveAttribute('href', 'https://stateset.io');
  });

  it('opens links in a new window with safe rel attributes', () => {
    renderWithProviders(<AboutSettings appVersion="1.2.3" platform="linux" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});
