/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatPlaygroundPage from './ChatPlayground';

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../features/computer-chat/DurableComputerChat', () => ({
  DurableComputerChat: () => <div data-testid="chat-playground">Computer Chats View</div>,
}));

describe('ChatPlayground page', () => {
  it('renders chat playground feature component', () => {
    render(<ChatPlaygroundPage />);
    expect(screen.getByTestId('chat-playground')).toBeInTheDocument();
  });
});
