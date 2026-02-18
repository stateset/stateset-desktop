import { describe, it, expect } from 'vitest';
import { validateAgentConfig, importAgentConfig } from './import';

/** Minimal File shim for the node environment (avoids jsdom worker issues). */
class MockFile {
  private content: string;
  name: string;
  type: string;
  constructor(parts: string[], name: string, opts?: { type?: string }) {
    this.content = parts.join('');
    this.name = name;
    this.type = opts?.type ?? '';
  }
  async text(): Promise<string> {
    return this.content;
  }
}

describe('validateAgentConfig', () => {
  it('should accept a valid full config', () => {
    const result = validateAgentConfig({
      agent_type: 'support',
      loop_interval_ms: 1000,
      max_iterations: 50,
      iteration_timeout_secs: 30,
      pause_on_error: true,
      custom_instructions: 'Be helpful',
      mcp_servers: ['server-a', 'server-b'],
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should accept an empty object', () => {
    const result = validateAgentConfig({});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject null', () => {
    const result = validateAgentConfig(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Config must be a non-null object');
  });

  it('should reject arrays', () => {
    const result = validateAgentConfig([1, 2, 3]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Config must be a non-null object');
  });

  it('should reject primitives', () => {
    expect(validateAgentConfig('string').valid).toBe(false);
    expect(validateAgentConfig(42).valid).toBe(false);
    expect(validateAgentConfig(true).valid).toBe(false);
    expect(validateAgentConfig(undefined).valid).toBe(false);
  });

  it('should warn on unknown keys', () => {
    const result = validateAgentConfig({ foo: 'bar', baz: 123 });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('foo');
    expect(result.warnings[1]).toContain('baz');
  });

  describe('field validation', () => {
    it('should reject non-string agent_type', () => {
      const result = validateAgentConfig({ agent_type: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('agent_type must be a string');
    });

    it('should reject loop_interval_ms < 100', () => {
      const result = validateAgentConfig({ loop_interval_ms: 50 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('loop_interval_ms must be >= 100');
    });

    it('should reject non-finite loop_interval_ms', () => {
      const result = validateAgentConfig({ loop_interval_ms: Infinity });
      expect(result.valid).toBe(false);
    });

    it('should reject non-integer max_iterations', () => {
      const result = validateAgentConfig({ max_iterations: 1.5 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('max_iterations must be a positive integer');
    });

    it('should reject max_iterations < 1', () => {
      const result = validateAgentConfig({ max_iterations: 0 });
      expect(result.valid).toBe(false);
    });

    it('should reject iteration_timeout_secs <= 0', () => {
      const result = validateAgentConfig({ iteration_timeout_secs: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('iteration_timeout_secs must be > 0');
    });

    it('should reject non-boolean pause_on_error', () => {
      const result = validateAgentConfig({ pause_on_error: 'yes' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('pause_on_error must be a boolean');
    });

    it('should reject non-string custom_instructions', () => {
      const result = validateAgentConfig({ custom_instructions: 42 });
      expect(result.valid).toBe(false);
    });

    it('should reject non-array mcp_servers', () => {
      const result = validateAgentConfig({ mcp_servers: 'server' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('mcp_servers must be an array');
    });

    it('should reject mcp_servers with non-string items', () => {
      const result = validateAgentConfig({ mcp_servers: ['ok', 123] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('mcp_servers must be an array of strings');
    });

    it('should reject empty model string', () => {
      const result = validateAgentConfig({ model: '  ' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('model must not be empty');
    });

    it('should reject temperature out of range', () => {
      expect(validateAgentConfig({ temperature: -0.1 }).valid).toBe(false);
      expect(validateAgentConfig({ temperature: 2.1 }).valid).toBe(false);
    });

    it('should accept boundary temperature values', () => {
      expect(validateAgentConfig({ temperature: 0 }).valid).toBe(true);
      expect(validateAgentConfig({ temperature: 2 }).valid).toBe(true);
    });
  });

  it('should collect multiple errors', () => {
    const result = validateAgentConfig({
      agent_type: 123,
      max_iterations: -1,
      temperature: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('importAgentConfig', () => {
  function makeFile(content: string): File {
    return new MockFile([content], 'config.json', { type: 'application/json' }) as unknown as File;
  }

  it('should import a valid config', async () => {
    const file = makeFile(
      JSON.stringify({ model: 'claude-sonnet-4-5-20250929', temperature: 0.5 })
    );
    const result = await importAgentConfig(file);
    expect(result.config.model).toBe('claude-sonnet-4-5-20250929');
    expect(result.config.temperature).toBe(0.5);
    expect(result.warnings).toEqual([]);
  });

  it('should strip unknown keys and return warnings', async () => {
    const file = makeFile(JSON.stringify({ model: 'gpt-4', extra_field: true }));
    const result = await importAgentConfig(file);
    expect(result.config.model).toBe('gpt-4');
    expect(result.config).not.toHaveProperty('extra_field');
    expect(result.warnings).toHaveLength(1);
  });

  it('should throw on invalid JSON', async () => {
    const file = makeFile('not json at all');
    await expect(importAgentConfig(file)).rejects.toThrow('File is not valid JSON');
  });

  it('should throw on validation failure', async () => {
    const file = makeFile(JSON.stringify({ temperature: 99 }));
    await expect(importAgentConfig(file)).rejects.toThrow('Invalid agent config');
  });
});
