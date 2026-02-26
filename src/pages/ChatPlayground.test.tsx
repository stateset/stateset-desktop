/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatPlaygroundPage from './ChatPlayground';

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../features/chat-playground', () => ({
  ChatPlayground: () => <div data-testid="chat-playground">Chat Playground View</div>,
}));

describe('ChatPlayground page', () => {
  it('renders chat playground feature component', () => {
    render(<ChatPlaygroundPage />);
    expect(screen.getByTestId('chat-playground')).toBeInTheDocument();
  });
});
