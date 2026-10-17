/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useDurableWorkflowsStore as store,
  type DurableWorkflowBlueprint,
} from './durableWorkflows';

const nativeSet = vi.fn();
const at = '2026-10-17T10:00:00.000Z';

function blueprint(id = 'blueprint-original'): DurableWorkflowBlueprint {
  return {
    id,
    name: id,
    goal: 'Review inventory',
    definition: {
      steps: [['python3 /workspace/review.py']],
      activeWindowSeconds: 3600,
      maxFailures: 3,
      perCommandTimeoutSeconds: 300,
    },
    createdAt: at,
    updatedAt: at,
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
    blueprints: [blueprint()],
  });
});

describe('serialized blueprint persistence', () => {
  it('retains both concurrent saves without publishing either before its acknowledgement', async () => {
    const firstWrite = deferred<boolean>();
    const secondWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
    const firstBlueprint = blueprint('blueprint-first');
    const secondBlueprint = blueprint('blueprint-second');
    const first = store.getState().saveBlueprint(firstBlueprint);
    const second = store.getState().saveBlueprint(secondBlueprint);

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().blueprints).toEqual([blueprint()]);
    firstWrite.resolve(true);
    await first;
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledTimes(2));
    expect(store.getState().blueprints).toEqual([firstBlueprint, blueprint()]);
    expect(nativeSet.mock.calls[1]).toEqual([
      'durableWorkflowBlueprints',
      [secondBlueprint, firstBlueprint, blueprint()],
    ]);
    secondWrite.resolve(true);
    await second;
    expect(store.getState().blueprints).toEqual([secondBlueprint, firstBlueprint, blueprint()]);
  });

  it('applies a concurrent removal to the acknowledged save instead of an old collection', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const added = blueprint('blueprint-added');
    const saving = store.getState().saveBlueprint(added);
    const removing = store.getState().removeBlueprint('blueprint-original');

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().blueprints).toEqual([blueprint()]);
    firstWrite.resolve(true);
    await Promise.all([saving, removing]);
    expect(nativeSet.mock.calls[1]).toEqual(['durableWorkflowBlueprints', [added]]);
    expect(store.getState().blueprints).toEqual([added]);
  });

  it('snapshots nested queued inputs and preserves batch order and unrelated latest rows', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const blocker = blueprint('blueprint-blocker');
    const first = store.getState().saveBlueprint(blocker);
    const replacement = blueprint();
    replacement.name = 'Updated original';
    const added = blueprint('blueprint-added');
    const batch = [replacement, added];
    const expected = structuredClone(batch);
    const saving = store.getState().saveBlueprints(batch);
    replacement.name = 'Changed after enqueue';
    replacement.definition.steps[0][0] = 'export TOKEN=should-not-be-persisted';
    added.definition.steps.push(['changed-command']);
    batch.push(blueprint('blueprint-not-submitted'));

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    firstWrite.resolve(true);
    await Promise.all([first, saving]);
    expect(nativeSet.mock.calls[1]).toEqual(['durableWorkflowBlueprints', [...expected, blocker]]);
    expect(store.getState().blueprints).toEqual([...expected, blocker]);
  });

  it.each(['rejection', 'false acknowledgement'] as const)(
    'keeps a failed batch atomic after a %s and permits a retry without duplicates',
    async (failure) => {
      const original = blueprint();
      const unrelated = blueprint('blueprint-unrelated');
      store.setState({ blueprints: [original, unrelated] });
      const replacement = { ...original, name: 'Updated original' };
      const added = blueprint('blueprint-added');
      if (failure === 'rejection') nativeSet.mockRejectedValueOnce(new Error('Disk unavailable.'));
      else nativeSet.mockResolvedValueOnce(false);

      await expect(store.getState().saveBlueprints([replacement, added])).rejects.toThrow(
        failure === 'rejection' ? 'Disk unavailable.' : 'could not be saved'
      );
      expect(store.getState().blueprints).toEqual([original, unrelated]);
      expect(nativeSet).toHaveBeenCalledOnce();

      await store.getState().saveBlueprints([replacement, added]);
      expect(nativeSet).toHaveBeenCalledTimes(2);
      expect(store.getState().blueprints).toEqual([replacement, added, unrelated]);
    }
  );

  it('does not publish a failed deletion and continues with the next queued save', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const removing = store.getState().removeBlueprint('blueprint-original');
    const rejected = expect(removing).rejects.toThrow('could not be saved');
    const added = blueprint('blueprint-added');
    const saving = store.getState().saveBlueprint(added);

    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().blueprints).toEqual([blueprint()]);
    firstWrite.resolve(false);
    await rejected;
    await saving;
    expect(store.getState().blueprints).toEqual([added, blueprint()]);
    expect(nativeSet.mock.calls[1]).toEqual(['durableWorkflowBlueprints', [added, blueprint()]]);
  });

  it.each(['bridge', 'setter'] as const)(
    'requires a real native %s and recovers after storage is restored',
    async (missing) => {
      window.electronAPI = (missing === 'bridge' ? undefined : { store: {} }) as never;
      const added = blueprint('blueprint-added');
      await expect(store.getState().saveBlueprint(added)).rejects.toThrow('storage is unavailable');
      await expect(store.getState().removeBlueprint('blueprint-original')).rejects.toThrow(
        'storage is unavailable'
      );
      expect(store.getState().blueprints).toEqual([blueprint()]);
      expect(nativeSet).not.toHaveBeenCalled();

      installStorage();
      await store.getState().saveBlueprint(added);
      expect(store.getState().blueprints).toEqual([added, blueprint()]);
    }
  );

  it('supports an undefined acknowledgement from a real legacy setter', async () => {
    nativeSet.mockResolvedValue(undefined);
    const added = blueprint('blueprint-added');
    await store.getState().saveBlueprint(added);
    await store.getState().removeBlueprint('blueprint-original');
    expect(store.getState().blueprints).toEqual([added]);
    expect(nativeSet).toHaveBeenCalledTimes(2);
  });

  it('preserves saved rows and rejects a batch while initialization is untrusted', async () => {
    const saved = store.getState().blueprints;
    store.setState({
      initialized: false,
      initializationError: 'Saved settings could not be loaded.',
    });

    await expect(
      store.getState().saveBlueprints([blueprint('blueprint-imported')])
    ).rejects.toThrow('Saved workflow settings are not loaded');
    expect(nativeSet).not.toHaveBeenCalled();
    expect(store.getState().blueprints).toBe(saved);
  });

  it.each(['invalid', 'secret-bearing', 'duplicate'] as const)(
    'rejects a whole %s batch before writing any item',
    async (kind) => {
      const first = blueprint('blueprint-first');
      const second = blueprint('blueprint-second');
      if (kind === 'invalid') second.name = '';
      if (kind === 'secret-bearing') second.definition.steps[0][0] = 'export TOKEN=unsafe-value';
      if (kind === 'duplicate') second.id = first.id;

      await expect(store.getState().saveBlueprints([first, second])).rejects.toThrow(
        kind === 'invalid'
          ? 'invalid'
          : kind === 'secret-bearing'
            ? 'Inline credentials'
            : 'duplicate'
      );
      expect(nativeSet).not.toHaveBeenCalled();
      expect(store.getState().blueprints).toEqual([blueprint()]);
      await store.getState().saveBlueprint(first);
      expect(store.getState().blueprints).toEqual([first, blueprint()]);
    }
  );
});
