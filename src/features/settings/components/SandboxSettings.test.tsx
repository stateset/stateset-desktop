/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test-utils';
import { useAuthStore } from '../../../stores/auth';
import { sandboxApi } from '../../../lib/sandbox';
import { SandboxSettings } from './SandboxSettings';

vi.mock('../../../lib/sandbox', () => ({
  sandboxApi: {
    health: vi.fn(),
    create: vi.fn(),
  },
}));

const mockHealth = vi.mocked(sandboxApi.health);
const mockCreate = vi.mocked(sandboxApi.create);
const mockSetSandboxApiKey = vi.fn().mockResolvedValue(undefined);
const mockClearSandboxApiKey = vi.fn().mockResolvedValue(undefined);

const SANDBOX_KEY = 'sk_test_1234567890abcd';

function setSandboxKey(key: string | null) {
  useAuthStore.setState({
    sandboxApiKey: key,
    setSandboxApiKey: mockSetSandboxApiKey,
    clearSandboxApiKey: mockClearSandboxApiKey,
  });
}

describe('SandboxSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHealth.mockResolvedValue({ status: 'healthy', database: 'ok' });
  });

  describe('without a sandbox API key', () => {
    beforeEach(() => {
      setSandboxKey(null);
    });

    it('renders the key input with a disabled Save button', () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      expect(screen.getByText('Sandbox API')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('sk_test_...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('enables Save when a key is typed and saves the trimmed key', async () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      const input = screen.getByPlaceholderText('sk_test_...');
      fireEvent.change(input, { target: { value: `  ${SANDBOX_KEY}  ` } });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeEnabled();

      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockSetSandboxApiKey).toHaveBeenCalledWith(SANDBOX_KEY);
      });
      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    it('keeps Save disabled for whitespace-only input', () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      fireEvent.change(screen.getByPlaceholderText('sk_test_...'), { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('shows a warning when secure storage is unavailable', () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={false} />);

      expect(screen.getByText(/Secure storage is unavailable/)).toBeInTheDocument();
    });
  });

  describe('with a sandbox API key', () => {
    beforeEach(() => {
      setSandboxKey(SANDBOX_KEY);
    });

    it('shows the masked key and tests the connection on mount', async () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      expect(screen.getByText('sk_tes...abcd')).toBeInTheDocument();
      await waitFor(() => {
        expect(mockHealth).toHaveBeenCalled();
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('shows a failure status and message when the health check fails', async () => {
      mockHealth.mockRejectedValue(new Error('ECONNREFUSED'));
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
        expect(screen.getByText('ECONNREFUSED')).toBeInTheDocument();
      });
    });

    it('shows error status when health responds unhealthy', async () => {
      mockHealth.mockResolvedValue({ status: 'degraded', database: 'down' });
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });
    });

    it('re-tests the connection when Test Connection is clicked', async () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);
      await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Test sandbox connection' }));

      await waitFor(() => {
        expect(mockHealth).toHaveBeenCalledTimes(2);
      });
    });

    it('copies the sandbox key to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      });
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      fireEvent.click(screen.getByRole('button', { name: 'Copy sandbox API key' }));

      expect(writeText).toHaveBeenCalledWith(SANDBOX_KEY);
      await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
    });

    it('removes the key when the remove button is clicked', async () => {
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      fireEvent.click(screen.getByRole('button', { name: 'Remove sandbox API key' }));

      await waitFor(() => {
        expect(mockClearSandboxApiKey).toHaveBeenCalled();
      });
    });

    it('disables Create Sandbox until the connection is healthy', async () => {
      mockHealth.mockRejectedValue(new Error('down'));
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);

      await waitFor(() => expect(screen.getByText('Connection failed')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Create sandbox' })).toBeDisabled();
    });

    it('creates a sandbox and shows the result details', async () => {
      mockCreate.mockResolvedValue({
        sandbox_id: 'sb-123',
        org_id: 'org-1',
        session_id: 'sess-1',
        status: 'running',
        pod_ip: '10.0.0.5',
        created_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-01-02T00:00:00Z',
        startup_metrics: { total_ms: 1234, pod_creation_ms: 500, pod_ready_ms: 734, phases: [] },
      });
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);
      await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Create sandbox' }));

      await waitFor(() => {
        expect(
          screen.getByText('Created sandbox sb-123 (10.0.0.5) - startup: 1234ms')
        ).toBeInTheDocument();
      });
    });

    it('shows an error message when sandbox creation fails', async () => {
      mockCreate.mockRejectedValue(new Error('quota exceeded'));
      renderWithProviders(<SandboxSettings secureStorageAvailable={true} />);
      await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Create sandbox' }));

      await waitFor(() => {
        expect(screen.getByText('Error: quota exceeded')).toBeInTheDocument();
      });
    });
  });
});
