/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, mockElectronAPI } from '../test-utils';

// --- Mocks ---

const mockLogin = vi.fn();
const mockSetSandboxApiKey = vi.fn();

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    setSandboxApiKey: mockSetSandboxApiKey,
    clearSandboxApiKey: vi.fn(),
  }),
  normalizeSandboxApiKey: vi.fn((key: string | null) => key),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

const mockRegisterUser = vi.fn();

vi.mock('../lib/registration', () => ({
  registerUser: mockRegisterUser,
  isValidEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  validatePassword: (password: string) => {
    const errors: string[] = [];
    if (password.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('One number');
    return { valid: errors.length === 0, errors };
  },
}));

const loadRegister = async () => {
  const mod = await import('./Register');
  return mod.default;
};

describe('Register page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI();
  });

  it('renders the registration form with all fields', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Min. 8 characters')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Acme Inc.')).toBeInTheDocument();
  });

  it('renders the company field as optional', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('shows validation error when name is empty on submit', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    const submitButton = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitButton);

    expect(screen.getByText('Please enter your name')).toBeInTheDocument();
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('shows password strength indicators when password is typed', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    fireEvent.change(screen.getByPlaceholderText('Min. 8 characters'), {
      target: { value: 'ab', name: 'password' },
    });

    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
    expect(screen.getByText('One lowercase letter')).toBeInTheDocument();
    expect(screen.getByText('One number')).toBeInTheDocument();
  });

  it('does not show password requirements when password is empty', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    // Password requirements are only shown when password is non-empty
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
    expect(screen.queryByText('One uppercase letter')).not.toBeInTheDocument();
  });

  it('has a Create Account submit button', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('lists benefits of registration', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    expect(screen.getByText('Engine API key (auto-configured)')).toBeInTheDocument();
    expect(screen.getByText('Sandbox API key for Claude Code pods')).toBeInTheDocument();
    expect(screen.getByText('Default brand with MCP integrations')).toBeInTheDocument();
  });

  it('has a link to sign in page', async () => {
    const Register = await loadRegister();
    renderWithProviders(<Register />);

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Already have an account?')).toBeInTheDocument();
  });
});
