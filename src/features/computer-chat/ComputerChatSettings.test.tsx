/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputerChatSettings } from './ComputerChatSettings';
import { useDurableWorkflowsStore as workflows } from '../../stores/durableWorkflows';

const setConfiguration = workflows.getState().setConfiguration;
const configure = vi.fn();
const onError = vi.fn();
beforeEach(() => {
  configure.mockReset().mockResolvedValue(undefined);
  onError.mockReset();
  workflows.setState({
    initialized: false,
    initializationError: null,
    engineUrl: 'https://fallback.example',
    apiKey: null,
    setConfiguration: configure,
  });
});
afterEach(() => {
  cleanup();
  workflows.setState({ setConfiguration, initialized: true, initializationError: null });
});
function openSettings() {
  render(<ComputerChatSettings tenantId="tenant" brandId="brand" onError={onError} />);
  fireEvent.click(screen.getByText('Chat settings'));
}
describe('computer chat credential status', () => {
  it.each([null, 'Saved settings could not be loaded.'])(
    'keeps workflow credentials and endpoint unknown before recovery (%s)',
    (initializationError) => {
      workflows.setState({ initializationError });
      openSettings();
      expect(screen.getByText(/Workflow connection not loaded/)).toBeVisible();
      expect(screen.queryByText(/https:\/\/fallback.example/)).not.toBeInTheDocument();
      const key = screen.getByLabelText('Workflow API key');
      expect(key).toHaveAttribute('placeholder', 'Key status unavailable');
      fireEvent.change(key, { target: { value: 'retained-key-draft' } });
      expect(screen.getByRole('button', { name: 'Save keys' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save keys' }));
      expect(configure).not.toHaveBeenCalled();
    }
  );

  it.each([null, 'saved-key'])(
    'preserves a key draft and saves against the restored endpoint (stored=%s)',
    async (apiKey) => {
      openSettings();
      const key = screen.getByLabelText('Workflow API key');
      fireEvent.change(key, { target: { value: 'retained-key-draft' } });
      act(() =>
        workflows.setState({
          initialized: true,
          initializationError: null,
          engineUrl: 'https://restored.example',
          apiKey,
        })
      );
      expect(screen.getByText(/Workflow engine: https:\/\/restored.example/)).toBeVisible();
      expect(screen.queryByText(/https:\/\/fallback.example/)).not.toBeInTheDocument();
      expect(key).toHaveValue('retained-key-draft');
      expect(key).toHaveAttribute('placeholder', apiKey ? 'Keep saved key' : 'Enter your API key');
      fireEvent.click(screen.getByRole('button', { name: 'Save keys' }));
      await waitFor(() =>
        expect(configure).toHaveBeenCalledWith('https://restored.example', 'retained-key-draft')
      );
      expect(onError).not.toHaveBeenCalled();
    }
  );
});
