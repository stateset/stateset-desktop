/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DurableAgentProfile } from '../lib/durableAgentProfiles';
import { useDurableWorkflowsStore as store } from './durableWorkflows';

const nativeSet = vi.fn();

function profile(id = 'custom-original'): DurableAgentProfile {
  return {
    id,
    name: id,
    description: 'Review inventory with bounded tools.',
    provider: 'openai',
    connectorKey: 'openai-primary',
    model: 'gpt-5.4',
    systemPrompt: 'Inspect the inventory and report missing evidence.',
    maxIterations: 8,
    allowedExecutables: ['rg', 'jq', 'cat'],
    maxTokens: 1024,
    maxTotalTokens: 8192,
  };
}

function installStorage() {
  window.electronAPI = {
    store: { get: vi.fn().mockResolvedValue(undefined), set: nativeSet },
  } as never;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

beforeEach(() => {
  nativeSet.mockReset().mockResolvedValue(true);
  installStorage();
  store.setState({
    initialized: true,
    initializationError: null,
    customAgents: [profile()],
  });
});

describe('serialized custom agent persistence', () => {
  it.each(['systemPrompt', 'model', 'connectorKey'] as const)(
    'rejects an engine-bound %s byte overflow before writing and keeps the queue usable',
    async (field) => {
      const invalid = profile('custom-oversized');
      invalid[field] = '界'.repeat(field === 'systemPrompt' ? 4001 : 43);
      await expect(store.getState().saveCustomAgent(invalid)).rejects.toThrow('UTF-8 bytes');
      expect(nativeSet).not.toHaveBeenCalled();
      expect(store.getState().customAgents).toEqual([profile()]);
      const valid = profile('custom-valid');
      await store.getState().saveCustomAgent(valid);
      expect(store.getState().customAgents).toEqual([valid, profile()]);
    }
  );

  it('retains concurrent saves and publishes each profile only after its acknowledgement', async () => {
    const firstWrite = deferred<boolean>();
    const secondWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
    const firstProfile = profile('custom-first');
    const secondProfile = profile('custom-second');
    const first = store.getState().saveCustomAgent(firstProfile);
    const second = store.getState().saveCustomAgent(secondProfile);

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().customAgents).toEqual([profile()]);
    firstWrite.resolve(true);
    await first;
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledTimes(2));
    expect(store.getState().customAgents).toEqual([firstProfile, profile()]);
    expect(nativeSet.mock.calls[1]).toEqual([
      'durableCustomAgentProfiles',
      [secondProfile, firstProfile, profile()],
    ]);
    secondWrite.resolve(true);
    await second;
    expect(store.getState().customAgents).toEqual([secondProfile, firstProfile, profile()]);
  });

  it('removes from the latest acknowledged collection without discarding a concurrent save', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const added = profile('custom-added');
    const saving = store.getState().saveCustomAgent(added);
    const removing = store.getState().removeCustomAgent('custom-original');

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().customAgents).toEqual([profile()]);
    firstWrite.resolve(true);
    await Promise.all([saving, removing]);
    expect(nativeSet.mock.calls[1]).toEqual(['durableCustomAgentProfiles', [added]]);
    expect(store.getState().customAgents).toEqual([added]);
  });

  it('preserves the submitted identity and tool snapshot while a save waits in the queue', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const blocker = profile('custom-blocker');
    const first = store.getState().saveCustomAgent(blocker);
    const submitted = profile('custom-submitted');
    const expected = structuredClone(submitted);
    const saving = store.getState().saveCustomAgent(submitted);
    submitted.id = 'operations';
    submitted.name = 'Changed after enqueue';
    submitted.allowedExecutables.splice(0, submitted.allowedExecutables.length, 'bash');
    submitted.systemPrompt = 'Changed after enqueue';

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    firstWrite.resolve(true);
    await Promise.all([first, saving]);
    expect(nativeSet.mock.calls[1]).toEqual([
      'durableCustomAgentProfiles',
      [expected, blocker, profile()],
    ]);
    expect(store.getState().customAgents).toEqual([expected, blocker, profile()]);
    expect(store.getState().customAgents[0].allowedExecutables).not.toBe(
      submitted.allowedExecutables
    );
  });

  it.each(['rejection', 'false acknowledgement'] as const)(
    'preserves the collection on save %s and permits the next save',
    async (failure) => {
      const replacement = { ...profile(), name: 'Updated original' };
      if (failure === 'rejection') nativeSet.mockRejectedValueOnce(new Error('Disk unavailable.'));
      else nativeSet.mockResolvedValueOnce(false);

      await expect(store.getState().saveCustomAgent(replacement)).rejects.toThrow(
        failure === 'rejection' ? 'Disk unavailable.' : 'could not be saved'
      );
      expect(store.getState().customAgents).toEqual([profile()]);
      await store.getState().saveCustomAgent(replacement);
      expect(store.getState().customAgents).toEqual([replacement]);
      expect(nativeSet).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['rejection', 'false acknowledgement'] as const)(
    'retains a profile on remove %s and recovers the already queued save',
    async (failure) => {
      const firstWrite = deferred<boolean>();
      nativeSet.mockImplementationOnce(() =>
        firstWrite.promise.then((acknowledgement) => {
          if (failure === 'rejection') throw new Error('Disk unavailable.');
          return acknowledgement;
        })
      );
      const removing = store.getState().removeCustomAgent('custom-original');
      const rejected = expect(removing).rejects.toThrow(
        failure === 'rejection' ? 'Disk unavailable.' : 'could not be saved'
      );
      const added = profile('custom-added');
      const saving = store.getState().saveCustomAgent(added);

      await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
      expect(store.getState().customAgents).toEqual([profile()]);
      firstWrite.resolve(false);
      await rejected;
      await saving;
      expect(store.getState().customAgents).toEqual([added, profile()]);
      expect(nativeSet.mock.calls[1]).toEqual(['durableCustomAgentProfiles', [added, profile()]]);
    }
  );

  it.each(['bridge', 'setter'] as const)(
    'requires a real native %s and permits retry after storage is restored',
    async (missing) => {
      window.electronAPI = (missing === 'bridge' ? undefined : { store: {} }) as never;
      const added = profile('custom-added');
      await expect(store.getState().saveCustomAgent(added)).rejects.toThrow(
        'storage is unavailable'
      );
      await expect(store.getState().removeCustomAgent('custom-original')).rejects.toThrow(
        'storage is unavailable'
      );
      expect(store.getState().customAgents).toEqual([profile()]);
      expect(nativeSet).not.toHaveBeenCalled();

      installStorage();
      await store.getState().saveCustomAgent(added);
      expect(store.getState().customAgents).toEqual([added, profile()]);
    }
  );

  it('supports a legacy undefined acknowledgement from a real setter', async () => {
    nativeSet.mockResolvedValue(undefined);
    const added = profile('custom-added');
    await store.getState().saveCustomAgent(added);
    await store.getState().removeCustomAgent('custom-original');
    expect(store.getState().customAgents).toEqual([added]);
    expect(nativeSet).toHaveBeenCalledTimes(2);
  });

  it('rejects mutations while settings are untrusted without clearing saved agents', async () => {
    const saved = store.getState().customAgents;
    store.setState({
      initialized: false,
      initializationError: 'Saved settings could not be loaded.',
    });

    await expect(store.getState().saveCustomAgent(profile('custom-added'))).rejects.toThrow(
      'Saved workflow settings are not loaded'
    );
    await expect(store.getState().removeCustomAgent('custom-original')).rejects.toThrow(
      'Saved workflow settings are not loaded'
    );
    expect(nativeSet).not.toHaveBeenCalled();
    expect(store.getState().customAgents).toBe(saved);
  });

  it.each(['built-in identity', 'unsupported executable'] as const)(
    'rejects a profile with an %s before persistence',
    async (invalid) => {
      const unsafe = profile('custom-unsafe');
      if (invalid === 'built-in identity') unsafe.id = 'operations';
      else unsafe.allowedExecutables.push('bash');

      await expect(store.getState().saveCustomAgent(unsafe)).rejects.toThrow('invalid');
      expect(nativeSet).not.toHaveBeenCalled();
      expect(store.getState().customAgents).toEqual([profile()]);
      const added = profile('custom-added');
      await store.getState().saveCustomAgent(added);
      expect(store.getState().customAgents).toEqual([added, profile()]);
    }
  );
});
