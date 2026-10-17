/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getScheduleIntentGeneration,
  getWorkflowConnectionGeneration,
  isWorkflowSchedule,
  useDurableWorkflowsStore as store,
  type DurableWorkflowSchedule,
  type PendingScheduledOccurrence,
  type TrackedDurableWorkflow,
} from './durableWorkflows';

const brandId = '8724c5be-075d-4ff9-8691-ad5398a667ca';
const requestId = 'fca22edb-7702-4e9a-91ea-a5f053c3beba';
const at = '2026-10-17T10:00:00.000Z';
const definition = {
  steps: [['python3 /workspace/review.py']],
  activeWindowSeconds: 3600,
  maxFailures: 3,
  perCommandTimeoutSeconds: 300,
};
const nativeSet = vi.fn();

function schedule(id = 'schedule-first'): DurableWorkflowSchedule {
  return {
    id,
    name: id,
    tenantId: 'tenant-original',
    brandId,
    goal: 'Review inventory',
    definition,
    frequency: 'once',
    nextRunAt: at,
    enabled: true,
    createdAt: at,
    updatedAt: at,
  };
}

function occurrence(submitted = false): PendingScheduledOccurrence {
  return {
    requestId,
    dueAt: at,
    engineUrl: 'https://original-engine.example',
    tenantId: 'tenant-original',
    brandId,
    goal: 'Review inventory',
    definition,
    claimedAt: at,
    workflowId: `active-horizon-agent-${brandId.replace(/-/g, '')}-${requestId.replace(/-/g, '')}`,
    submitted,
  };
}

function workflow(workflowId = 'workflow-first'): TrackedDurableWorkflow {
  return {
    workflowId,
    runId: 'run-original',
    requestId,
    tenantId: 'tenant-original',
    brandId,
    goal: 'Review inventory',
    status: 'running',
    createdAt: at,
    updatedAt: at,
  };
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
  window.electronAPI = {
    store: { get: vi.fn().mockResolvedValue(undefined), set: nativeSet },
    auth: { setDurableEngineApiKey: vi.fn().mockResolvedValue(true) },
  } as never;
  store.setState({
    initialized: true,
    initializationError: null,
    configuring: false,
    engineUrl: 'https://original-engine.example',
    apiKey: 'original-key',
    connectionRevision: null,
    schedules: [schedule(), schedule('schedule-second')],
    workflows: [],
  });
});

describe('serialized schedule persistence', () => {
  it('persists concurrent claims from the latest collection without dropping another schedule', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const first = store.getState().updateSchedule('schedule-first', (current) => ({
      ...current,
      pendingOccurrence: occurrence(),
    }));
    const second = store.getState().updateSchedule('schedule-second', (current) => ({
      ...current,
      pendingOccurrence: occurrence(),
    }));
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().schedules.every((item) => !item.pendingOccurrence)).toBe(true);
    firstWrite.resolve(true);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(store.getState().schedules.every((item) => item.pendingOccurrence)).toBe(true);
    expect(nativeSet.mock.calls[1][1]).toEqual(store.getState().schedules);
  });

  it('invalidates a claim immediately when a pause is enqueued during its write', async () => {
    const initial = schedule();
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const generation = getScheduleIntentGeneration(initial.id);
    const claiming = store.getState().updateSchedule(initial.id, (current) => ({
      ...current,
      pendingOccurrence: occurrence(),
    }));
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(getScheduleIntentGeneration(initial.id)).toBe(generation);
    const pausing = store.getState().saveSchedule({ ...initial, enabled: false });
    expect(getScheduleIntentGeneration(initial.id)).toBe(generation + 1);
    expect(nativeSet).toHaveBeenCalledOnce();
    firstWrite.resolve(true);
    await Promise.all([claiming, pausing]);
    expect(store.getState().schedules.find((item) => item.id === initial.id)).toMatchObject({
      enabled: false,
      pendingOccurrence: undefined,
    });
  });

  it('does not resurrect a deleted schedule through a queued edit or later internal update', async () => {
    const initial = schedule();
    const deletingWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(deletingWrite.promise);
    const generation = getScheduleIntentGeneration(initial.id);
    const deleting = store.getState().removeSchedule(initial.id);
    expect(getScheduleIntentGeneration(initial.id)).toBe(generation + 1);
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    const editing = store.getState().saveSchedule({ ...initial, name: 'Stale editor' });
    const rejectedEdit = expect(editing).rejects.toThrow(/removed/i);
    deletingWrite.resolve(true);
    await deleting;
    await rejectedEdit;
    expect(await store.getState().updateSchedule(initial.id, () => initial)).toBe(false);
    expect(store.getState().schedules.some((item) => item.id === initial.id)).toBe(false);
    expect(nativeSet).toHaveBeenCalledOnce();
  });

  it('preserves submitted identity and launch bookkeeping through stale public edits', async () => {
    const pendingOccurrence = occurrence(true);
    store.setState({
      schedules: [
        { ...schedule(), pendingOccurrence, lastWorkflowId: 'confirmed-previous', lastRunAt: at },
      ],
    });
    const edited = {
      ...schedule(),
      tenantId: 'tenant-edited',
      brandId: '165ce2b4-5100-4f48-932f-de9ebfe38b96',
      name: 'New future schedule',
      goal: 'Future goal',
      definition: { ...definition, steps: [['python3 /workspace/future.py']] },
    };
    await store.getState().saveSchedule(edited);
    expect(store.getState().schedules[0]).toMatchObject({
      ...edited,
      pendingOccurrence,
      lastWorkflowId: 'confirmed-previous',
      lastRunAt: at,
    });
    expect(isWorkflowSchedule(store.getState().schedules[0])).toBe(true);
    await expect(store.getState().removeSchedule(edited.id)).rejects.toThrow(/pending run/i);
    expect(store.getState().schedules).toHaveLength(1);
    expect(nativeSet).toHaveBeenCalledOnce();
  });

  it('does not let a stale public spread restore an unsubmitted occurrence', async () => {
    const claimed = { ...schedule(), pendingOccurrence: occurrence() };
    store.setState({ schedules: [claimed] });
    await store.getState().saveSchedule({ ...claimed, nextRunAt: '2026-10-18T10:00:00.000Z' });
    expect(store.getState().schedules[0].pendingOccurrence).toBeUndefined();
  });

  it('gives only one submitted-marker CAS a successful write without incrementing user intent', async () => {
    const claimed = { ...schedule(), pendingOccurrence: occurrence() };
    store.setState({ schedules: [claimed] });
    const generation = getScheduleIntentGeneration(claimed.id);
    const submit = () =>
      store
        .getState()
        .updateSchedule(claimed.id, (current) =>
          current.pendingOccurrence?.submitted
            ? null
            : { ...current, pendingOccurrence: { ...occurrence(), submitted: true } }
        );
    expect(await Promise.all([submit(), submit()])).toEqual([true, false]);
    expect(nativeSet).toHaveBeenCalledOnce();
    expect(getScheduleIntentGeneration(claimed.id)).toBe(generation);
  });

  it('rejects a false claim acknowledgement without publishing it and recovers the queue', async () => {
    nativeSet.mockResolvedValueOnce(false);
    const claim = () =>
      store.getState().updateSchedule('schedule-first', (current) => ({
        ...current,
        pendingOccurrence: occurrence(),
      }));
    await expect(claim()).rejects.toThrow(/could not be saved/i);
    expect(store.getState().schedules[0].pendingOccurrence).toBeUndefined();
    expect(await claim()).toBe(true);
    expect(store.getState().schedules[0].pendingOccurrence).toEqual(occurrence());
  });

  it.each([
    ['save', false],
    ['save', true],
    ['remove', false],
    ['remove', true],
  ] as const)(
    'does not publish a %s rejected by storage (throws=%s)',
    async (operation, throws) => {
      const previous = store.getState().schedules;
      if (throws) nativeSet.mockRejectedValueOnce(new Error('Storage unavailable'));
      else nativeSet.mockResolvedValueOnce(false);
      const result =
        operation === 'save'
          ? store.getState().saveSchedule({ ...schedule(), name: 'Not saved' })
          : store.getState().removeSchedule('schedule-first');
      await expect(result).rejects.toThrow(throws ? 'Storage unavailable' : /could not be saved/i);
      expect(store.getState().schedules).toEqual(previous);
    }
  );

  it('refuses a claim without a native persistence bridge', async () => {
    window.electronAPI = undefined;
    const previous = store.getState().schedules;
    await expect(
      store.getState().updateSchedule('schedule-first', (current) => ({
        ...current,
        pendingOccurrence: occurrence(),
      }))
    ).rejects.toThrow(/desktop storage.*unavailable/i);
    expect(store.getState().schedules).toEqual(previous);
    expect(nativeSet).not.toHaveBeenCalled();
  });

  it.each(['once', 'daily'] as const)(
    'does not restore a consumed %s occurrence when a user edit waits behind its acknowledgement',
    async (frequency) => {
      const claimed = { ...schedule(), frequency, pendingOccurrence: occurrence(true) };
      store.setState({ schedules: [claimed] });
      const ackWrite = deferred<boolean>();
      nativeSet.mockReturnValueOnce(ackWrite.promise);
      const nextRunAt = frequency === 'once' ? at : '2026-10-18T10:00:00.000Z';
      const acknowledging = store.getState().updateSchedule(claimed.id, (current) => ({
        ...current,
        pendingOccurrence: undefined,
        lastWorkflowId: occurrence().workflowId,
        lastRunAt: at,
        nextRunAt,
        enabled: frequency !== 'once',
      }));
      await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
      const visible = store.getState().schedules[0];
      const editing = store.getState().saveSchedule({
        ...visible,
        name: 'Renamed while acknowledgement waits',
        allowOverlap: true,
      });
      ackWrite.resolve(true);
      await Promise.all([acknowledging, editing]);
      expect(store.getState().schedules[0]).toMatchObject({
        name: 'Renamed while acknowledgement waits',
        allowOverlap: true,
        enabled: frequency !== 'once',
        nextRunAt,
        lastWorkflowId: occurrence().workflowId,
        lastRunAt: at,
      });
      expect(store.getState().schedules[0].pendingOccurrence).toBeUndefined();
      expect(nativeSet.mock.calls[1][1]).toEqual(store.getState().schedules);
    }
  );

  it('keeps explicit user scheduling changes while merging an acknowledgement', async () => {
    const claimed = { ...schedule(), enabled: false, pendingOccurrence: occurrence(true) };
    store.setState({ schedules: [claimed] });
    const ackWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(ackWrite.promise);
    const acknowledging = store.getState().updateSchedule(claimed.id, (current) => ({
      ...current,
      pendingOccurrence: undefined,
      lastWorkflowId: occurrence().workflowId,
      lastRunAt: at,
    }));
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    const editing = store.getState().saveSchedule({
      ...store.getState().schedules[0],
      enabled: true,
      frequency: 'weekly',
      nextRunAt: '2026-10-24T10:00:00.000Z',
    });
    ackWrite.resolve(true);
    await Promise.all([acknowledging, editing]);
    expect(store.getState().schedules[0]).toMatchObject({
      enabled: true,
      frequency: 'weekly',
      nextRunAt: '2026-10-24T10:00:00.000Z',
      lastWorkflowId: occurrence().workflowId,
    });
    expect(store.getState().schedules[0].pendingOccurrence).toBeUndefined();
  });

  it('runs an internal acknowledgement against the latest user edits', async () => {
    const pendingOccurrence = occurrence(true);
    store.setState({ schedules: [{ ...schedule(), pendingOccurrence }] });
    const editingWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(editingWrite.promise);
    const editing = store
      .getState()
      .saveSchedule({ ...schedule(), enabled: false, name: 'Edited' });
    const acknowledging = store.getState().updateSchedule('schedule-first', (current) => ({
      ...current,
      lastWorkflowId: pendingOccurrence.workflowId,
      pendingOccurrence: undefined,
    }));
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    editingWrite.resolve(true);
    await Promise.all([editing, acknowledging]);
    expect(store.getState().schedules[0]).toMatchObject({
      name: 'Edited',
      enabled: false,
      lastWorkflowId: pendingOccurrence.workflowId,
    });
    expect(store.getState().schedules[0].pendingOccurrence).toBeUndefined();
  });
});

describe('pending occurrence persistence validation', () => {
  it.each([
    { requestId: 'not-a-uuid' },
    { requestId: '00000000-0000-0000-0000-000000000000' },
    { brandId: 'not-a-uuid' },
    { workflowId: 'active-horizon-agent-other-identity' },
    { dueAt: 'not-a-date' },
    { claimedAt: 'not-a-date' },
    { engineUrl: 'http://remote-engine.example' },
    { engineUrl: 'https://user:password@engine.example' },
    { engineUrl: 'https://engine.example?token=private' },
    { engineUrl: 'https://engine.example#fragment' },
    { engineUrl: 'https://engine\n.example' },
    { submitted: 'true' },
    { needsAttention: 'true' },
    { definition: { steps: [] } },
    { tenantId: '' },
  ])('refuses unsafe or malformed persisted occurrence %j', (patch) => {
    expect(
      isWorkflowSchedule({ ...schedule(), pendingOccurrence: { ...occurrence(), ...patch } })
    ).toBe(false);
  });

  it.each([
    'https://engine.example',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://[::1]:8080',
  ])('accepts a retained valid identity for safe engine %s', (engineUrl) => {
    expect(
      isWorkflowSchedule({ ...schedule(), pendingOccurrence: { ...occurrence(), engineUrl } })
    ).toBe(true);
  });

  it('keeps saved claims untrusted until a malformed pending record is repaired', async () => {
    const valid = { ...schedule(), pendingOccurrence: occurrence(true) };
    const invalid = {
      ...schedule('schedule-invalid'),
      pendingOccurrence: { ...occurrence(true), workflowId: 'wrong' },
    };
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key: string) =>
      key === 'durableWorkflowSchedules' ? [valid, invalid] : undefined
    );
    store.setState({ initialized: false, schedules: [] });
    await store.getState().initialize();
    expect(store.getState()).toMatchObject({
      initialized: false,
      schedules: [],
      initializationError: expect.stringContaining('could not be loaded'),
    });
    expect(invalid.pendingOccurrence.workflowId).toBe('wrong');
    expect(nativeSet).not.toHaveBeenCalled();
    const repaired = schedule('schedule-invalid');
    vi.mocked(window.electronAPI!.store.get).mockImplementation(async (key: string) =>
      key === 'durableWorkflowSchedules' ? [valid, repaired] : undefined
    );
    await store.getState().initialize();
    expect(store.getState()).toMatchObject({ initialized: true, initializationError: null });
    expect(store.getState().schedules).toEqual([valid, repaired]);
    expect(nativeSet).not.toHaveBeenCalled();
  });
});

describe('workflow tracking acknowledgements', () => {
  it('keeps concurrent tracking and terminal updates instead of overwriting each other', async () => {
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const first = store.getState().track(workflow());
    const second = store.getState().track(workflow('workflow-second'));
    const finishing = store.getState().markStatus('workflow-first', 'completed');
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    expect(store.getState().workflows).toEqual([]);
    firstWrite.resolve(true);
    await Promise.all([first, second, finishing]);
    expect(store.getState().workflows).toHaveLength(2);
    expect(
      store.getState().workflows.find((item) => item.workflowId === 'workflow-first')?.status
    ).toBe('completed');
    expect(nativeSet.mock.calls[2][1]).toEqual(store.getState().workflows);
  });

  it('retains a terminal receipt when reconfirmation attempts to downgrade it', async () => {
    const terminal = { ...workflow(), status: 'completed', lastError: 'Retained receipt' };
    store.setState({ workflows: [terminal] });
    await store.getState().track({ ...workflow(), updatedAt: '2026-10-18T10:00:00.000Z' });
    expect(store.getState().workflows).toEqual([terminal]);
  });

  it('requires tracking acknowledgement before publishing a launch receipt', async () => {
    nativeSet.mockResolvedValueOnce(false);
    await expect(store.getState().track(workflow())).rejects.toThrow(
      /tracking.*could not be saved/i
    );
    expect(store.getState().workflows).toEqual([]);
    await store.getState().track(workflow());
    expect(store.getState().workflows).toEqual([workflow()]);
  });

  it('exposes connection generation changes immediately for queued A-to-B-to-A writes', async () => {
    const generation = getWorkflowConnectionGeneration();
    const firstWrite = deferred<boolean>();
    nativeSet.mockReturnValueOnce(firstWrite.promise);
    const first = store.getState().setConfiguration('https://other-engine.example');
    const second = store.getState().setConfiguration('https://original-engine.example');
    expect(getWorkflowConnectionGeneration()).toBe(generation + 2);
    await vi.waitFor(() => expect(nativeSet).toHaveBeenCalledOnce());
    firstWrite.resolve(true);
    await Promise.all([first, second]);
    expect(store.getState().engineUrl).toBe('https://original-engine.example');
  });
});
