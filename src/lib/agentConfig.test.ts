import { describe, it, expect } from 'vitest';
import { DEFAULT_AGENT_CONFIG, normalizeAgentConfig } from './agentConfig';

describe('normalizeAgentConfig', () => {
  it('returns defaults when config is empty', () => {
    expect(normalizeAgentConfig({})).toEqual({
      ...DEFAULT_AGENT_CONFIG,
      sandbox_api_key: undefined,
    });
  });

  it('clamps and normalizes numeric fields', () => {
    const result = normalizeAgentConfig({
      loop_interval_ms: -5 as unknown as number,
      max_iterations: 0,
      iteration_timeout_secs: 0,
      temperature: 9,
    });

    expect(result.loop_interval_ms).toBe(100);
    expect(result.max_iterations).toBe(1);
    expect(result.iteration_timeout_secs).toBe(1);
    expect(result.temperature).toBe(1);
  });

  it('normalizes strings and arrays', () => {
    const result = normalizeAgentConfig({
      model: '  custom-model  ',
      custom_instructions: '  do this  ',
      mcp_servers: [' one ', '', 'two', '   '] as unknown as string[],
    });

    expect(result.model).toBe('custom-model');
    expect(result.custom_instructions).toBe('do this');
    expect(result.mcp_servers).toEqual(['one', 'two']);
  });

  it('uses fallback values for invalid numbers', () => {
    const result = normalizeAgentConfig({
      loop_interval_ms: 'not-a-number' as unknown as number,
      max_iterations: Number.NaN,
      iteration_timeout_secs: Number.POSITIVE_INFINITY,
      temperature: Number.NaN,
    });

    expect(result.loop_interval_ms).toBe(DEFAULT_AGENT_CONFIG.loop_interval_ms);
    expect(result.max_iterations).toBe(DEFAULT_AGENT_CONFIG.max_iterations);
    expect(result.iteration_timeout_secs).toBe(DEFAULT_AGENT_CONFIG.iteration_timeout_secs);
    expect(result.temperature).toBe(DEFAULT_AGENT_CONFIG.temperature);
  });

  it('merges with a base config', () => {
    const base = {
      ...DEFAULT_AGENT_CONFIG,
      loop_interval_ms: 1500,
      model: 'base-model',
    };

    const result = normalizeAgentConfig(
      {
        max_iterations: 10,
      },
      base
    );

    expect(result.loop_interval_ms).toBe(1500);
    expect(result.max_iterations).toBe(10);
    expect(result.model).toBe('base-model');
  });

  it('normalizes pause_on_error and sandbox_api_key values', () => {
    const result = normalizeAgentConfig({
      pause_on_error: 1 as unknown as boolean,
      sandbox_api_key: 12345 as unknown as string,
    });
    expect(result.pause_on_error).toBe(true);
    expect(result.sandbox_api_key).toBe('12345');

    const noSandbox = normalizeAgentConfig({
      sandbox_api_key: null,
    });
    expect(noSandbox.sandbox_api_key).toBeUndefined();
  });
});
