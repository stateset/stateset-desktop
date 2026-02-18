/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';

// --- Mocks ---

const mockLogin = vi.fn();
const mockClearError = vi.fn();
const mockInitialize = vi.fn();
let mockIsAuthenticated = false;
let mockAuthError: { code: string; message: string } | null = null;

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    setSandboxApiKey: vi.fn(),
    initialize: mockInitialize,
    isAuthenticated: mockIsAuthenticated,
    error: mockAuthError,
    clearError: mockClearError,
  }),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../lib/registration', () => ({
  loginWithEmail: vi.fn().mockResolvedValue({ credentials: null }),
}));

// Lazy-load the component after mocks are set up
const loadLogin = async () => {
  const mod = await import('./Login');
  return mod.default;
};

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockAuthError = null;
    mockElectronAPI();
  });

  it('renders the login form with email fields by default', async () => {
    const Login = await loadLogin();
    renderWithProviders(<Login />);

    expect(screen.getByText('StateSet')).toBeInTheDocument();
    // Actual placeholders: "you@company.com" and "Your password"
    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your password')).toBeInTheDocument();
  });

  it('switches to API key tab', async () => {
    const Login = await loadLogin();
    renderWithProviders(<Login />);

    const apiKeyTab = screen.getByText('API Key');
    fireEvent.click(apiKeyTab);

    // Actual placeholder: "sk-..."
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
  });

  it('shows error message when auth error is set', async () => {
    mockAuthError = { code: 'INVALID_API_KEY', message: 'Invalid credentials' };
    const Login = await loadLogin();
    renderWithProviders(<Login />);

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('has a sign in button', async () => {
    const Login = await loadLogin();
    renderWithProviders(<Login />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
