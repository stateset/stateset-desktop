import { describe, expect, it } from 'vitest';
import { presentEvent, selectTimeline, type WorkflowEvent } from './timeline';
const event = (kind: string, detail: unknown, id = 1): WorkflowEvent => ({
  id,
  kind,
  detail,
  at: 1,
});
describe('workflow event interpretation', () => {
  it.each([
    [
      'policy_evaluated',
      { phase: 'admission', verdict: 'allow' },
      'Before execution · Allowed',
      false,
    ],
    [
      'policy_evaluated',
      { phase: 'verification', verdict: 'deny' },
      'Output policy · Denied',
      true,
    ],
    [
      'policy_evaluated',
      { phase: 'admission', verdict: 'rewrite' },
      'Before execution · Replacement proposed',
      true,
    ],
    [
      'deliverables_evaluated',
      { outcome: 'verified' },
      'Acceptance checks passed for the recorded files.',
      false,
    ],
    [
      'deliverables_evaluated',
      { outcome: 'observed_only' },
      'Files observed without acceptance criteria.',
      false,
    ],
    ['deliverables_evaluated', { outcome: 'failed' }, 'Acceptance checks failed.', true],
    ['deliverables_evaluated', { verified: true }, 'Acceptance outcome unavailable.', false],
    ['action_completed', { name: 'execute', exit_code: 0 }, 'Run command · Exit code 0', false],
    ['action_completed', { name: 'execute', exit_code: 2 }, 'Run command · Exit code 2', true],
    [
      'action_completed',
      { name: 'execute', exit_code: null },
      'Run command · Exit code unavailable',
      false,
    ],
    ['computer_stopped', { confirmed: false }, 'Computer cleanup has not been confirmed.', true],
    ['computer_stopped', { confirmed: true }, 'Computer cleanup confirmed.', false],
  ] as const)('describes %s from recorded facts', (kind, detail, summary, attention) => {
    expect(presentEvent(event(kind, detail))).toMatchObject({ summary, attention });
  });
  it('does not infer a failure from words inside arbitrary evidence', () => {
    expect(
      presentEvent(
        event('action_completed', { name: 'execute', exit_code: 0, stdout: 'error count = 0' })
      ).attention
    ).toBe(false);
  });
  it.each([null, [], false, 42])(
    'handles malformed detail %j without inventing a result',
    (detail) => {
      expect(presentEvent(event('action_completed', detail)).summary).toBe('Exit code unavailable');
    }
  );
  it('treats unknown events and prototype property names as literal text', () => {
    expect(presentEvent(event('constructor', {})).label).toBe('constructor');
    expect(presentEvent(event('action_started', { name: '__proto__' })).summary).toBe('  proto  ');
    expect(presentEvent(event('policy_evaluated', { verdict: 'constructor' })).summary).toContain(
      'Decision unavailable'
    );
  });
  it('limits visible summaries while retaining full evidence for search', () => {
    const item = event('needs_attention', { message: 'x'.repeat(900) + ' evidence-needle' });
    expect(presentEvent(item).summary.length).toBe(601);
    expect(selectTimeline([item], 'all', 'evidence-needle')).toHaveLength(1);
  });
  it('searches all retained evidence, combines terms and sorts by workflow sequence', () => {
    const items = [
      event('policy_evaluated', { verdict: 'deny', action_hash: 'hash-needle' }, 2),
      event('artifact_collected', { path: '/workspace/report.txt' }, 3),
    ];
    expect(selectTimeline(items, 'all', '')).toMatchObject([
      { event: { id: 3 } },
      { event: { id: 2 } },
    ]);
    expect(selectTimeline(items, 'attention', 'HASH-NEEDLE denied')).toHaveLength(1);
    expect(selectTimeline(items, 'outputs', 'hash-needle')).toHaveLength(0);
  });
});
