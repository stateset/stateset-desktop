import { describe, it, expect } from 'vitest';
import {
  isBuiltInPlatform,
  normalizeCustomPlatformId,
  normalizeConnectionInput,
  normalizeCredentials,
  hasMissingOAuthInput,
  hasMissingRequiredFields,
  buildCredentialsForSave,
  createCustomPlatformConfig,
  getPlatformConfig,
  isVaultNotConfigured,
} from './utils';
import { PLATFORMS } from './platforms';
import type { Platform } from './platforms';
import { CUSTOM_MCP_FIELDS } from './types';

describe('isBuiltInPlatform', () => {
  it('returns true for built-in platform ids', () => {
    expect(isBuiltInPlatform('shopify')).toBe(true);
    expect(isBuiltInPlatform('gorgias')).toBe(true);
    expect(isBuiltInPlatform('zendesk')).toBe(true);
    expect(isBuiltInPlatform('recharge')).toBe(true);
    expect(isBuiltInPlatform('klaviyo')).toBe(true);
    expect(isBuiltInPlatform('shipstation')).toBe(true);
  });

  it('returns false for unknown platform ids', () => {
    expect(isBuiltInPlatform('custom-server')).toBe(false);
    expect(isBuiltInPlatform('my-mcp')).toBe(false);
    expect(isBuiltInPlatform('')).toBe(false);
  });
});

describe('normalizeCustomPlatformId', () => {
  it('converts "My Server" to "my-server"', () => {
    expect(normalizeCustomPlatformId('My Server')).toBe('my-server');
  });

  it('strips special characters', () => {
    expect(normalizeCustomPlatformId('Hello World!@#$%')).toBe('hello-world');
  });

  it('trims whitespace', () => {
    expect(normalizeCustomPlatformId('  spaced  ')).toBe('spaced');
  });

  it('converts multiple spaces to single dash', () => {
    expect(normalizeCustomPlatformId('foo   bar')).toBe('foo-bar');
  });

  it('preserves hyphens and underscores', () => {
    expect(normalizeCustomPlatformId('my-server_v2')).toBe('my-server_v2');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeCustomPlatformId('')).toBe('');
    expect(normalizeCustomPlatformId('   ')).toBe('');
  });
});

describe('normalizeConnectionInput', () => {
  it('trims whitespace', () => {
    expect(normalizeConnectionInput('api_key', '  abc123  ')).toBe('abc123');
  });

  it('strips protocol for domain fields', () => {
    expect(normalizeConnectionInput('shop_domain', 'https://mystore.myshopify.com')).toBe(
      'mystore.myshopify.com'
    );
    expect(normalizeConnectionInput('domain', 'http://example.com/')).toBe('example.com');
    expect(normalizeConnectionInput('subdomain', 'HTTPS://MY-SUB.zendesk.com//')).toBe(
      'my-sub.zendesk.com'
    );
  });

  it('lowercases domain field values', () => {
    expect(normalizeConnectionInput('shop_domain', 'MyStore.MyShopify.COM')).toBe(
      'mystore.myshopify.com'
    );
  });

  it('strips trailing slashes from domain fields', () => {
    expect(normalizeConnectionInput('domain', 'example.com///')).toBe('example.com');
  });

  it('returns empty string for empty or whitespace input', () => {
    expect(normalizeConnectionInput('api_key', '')).toBe('');
    expect(normalizeConnectionInput('api_key', '   ')).toBe('');
    expect(normalizeConnectionInput('domain', '  ')).toBe('');
  });

  it('does not modify non-domain field values beyond trimming', () => {
    expect(normalizeConnectionInput('api_key', '  MyKey123  ')).toBe('MyKey123');
    expect(normalizeConnectionInput('email', ' User@Example.com ')).toBe('User@Example.com');
  });
});

describe('normalizeCredentials', () => {
  it('normalizes all entries', () => {
    const result = normalizeCredentials({
      shop_domain: '  https://store.myshopify.com/  ',
      api_key: '  key123  ',
    });
    expect(result).toEqual({
      shop_domain: 'store.myshopify.com',
      api_key: 'key123',
    });
  });
});

describe('hasMissingOAuthInput', () => {
  it('returns true when a field value is empty', () => {
    const fields = [{ key: 'domain', label: 'Domain', type: 'text' }];
    expect(hasMissingOAuthInput(fields, { domain: '' })).toBe(true);
    expect(hasMissingOAuthInput(fields, {})).toBe(true);
  });

  it('returns false when all fields have values', () => {
    const fields = [{ key: 'domain', label: 'Domain', type: 'text' }];
    expect(hasMissingOAuthInput(fields, { domain: 'example.com' })).toBe(false);
  });
});

describe('hasMissingRequiredFields', () => {
  const platform: Platform = {
    id: 'test',
    name: 'Test',
    description: 'Test platform',
    icon: 'T',
    color: 'bg-gray-600',
    requiredFields: [
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'note', label: 'Note', type: 'text', required: false },
    ],
  };

  it('returns true when a required field is empty', () => {
    expect(hasMissingRequiredFields(platform, { api_key: '', note: 'some note' })).toBe(true);
    expect(hasMissingRequiredFields(platform, { note: 'some note' })).toBe(true);
  });

  it('returns false when optional field (required: false) is empty', () => {
    expect(hasMissingRequiredFields(platform, { api_key: 'key123', note: '' })).toBe(false);
    expect(hasMissingRequiredFields(platform, { api_key: 'key123' })).toBe(false);
  });

  it('returns false when all required fields are present', () => {
    expect(hasMissingRequiredFields(platform, { api_key: 'key123', note: 'some note' })).toBe(
      false
    );
  });
});

describe('buildCredentialsForSave', () => {
  const platform: Platform = {
    id: 'test',
    name: 'Test',
    description: 'Test platform',
    icon: 'T',
    color: 'bg-gray-600',
    requiredFields: [
      { key: 'api_key', label: 'API Key', type: 'password' },
      { key: 'note', label: 'Note', type: 'text', required: false },
    ],
  };

  it('throws Error when a required field is missing', () => {
    expect(() => buildCredentialsForSave(platform, { api_key: '', note: 'test' })).toThrow(
      'Please provide api key.'
    );
    expect(() => buildCredentialsForSave(platform, { note: 'test' })).toThrow();
  });

  it('returns normalized, non-empty values', () => {
    const result = buildCredentialsForSave(platform, {
      api_key: '  mykey  ',
      note: '  some note  ',
    });
    expect(result).toEqual({
      api_key: 'mykey',
      note: 'some note',
    });
  });

  it('filters out empty optional values', () => {
    const result = buildCredentialsForSave(platform, {
      api_key: 'mykey',
      note: '',
    });
    expect(result).toEqual({ api_key: 'mykey' });
    expect(result).not.toHaveProperty('note');
  });

  it('normalizes domain fields', () => {
    const shopifyPlatform = PLATFORMS.find((p) => p.id === 'shopify')!;
    const result = buildCredentialsForSave(shopifyPlatform, {
      shop_domain: 'https://mystore.myshopify.com/',
      access_token: 'shpat_abc123',
    });
    expect(result.shop_domain).toBe('mystore.myshopify.com');
    expect(result.access_token).toBe('shpat_abc123');
  });
});

describe('createCustomPlatformConfig', () => {
  it('returns a Platform object with custom MCP fields', () => {
    const config = createCustomPlatformConfig('my-custom-server');
    expect(config.id).toBe('my-custom-server');
    expect(config.name).toBe('my-custom-server');
    expect(config.description).toBe('Custom MCP server');
    expect(config.requiredFields).toBe(CUSTOM_MCP_FIELDS);
  });
});

describe('getPlatformConfig', () => {
  it('returns PLATFORMS entry for built-in platform', () => {
    const config = getPlatformConfig('shopify');
    expect(config.id).toBe('shopify');
    expect(config.name).toBe('Shopify');
    expect(config).toBe(PLATFORMS.find((p) => p.id === 'shopify'));
  });

  it('creates custom config for unknown platform', () => {
    const config = getPlatformConfig('my-unknown-server');
    expect(config.id).toBe('my-unknown-server');
    expect(config.name).toBe('my-unknown-server');
    expect(config.description).toBe('Custom MCP server');
    expect(config.requiredFields).toBe(CUSTOM_MCP_FIELDS);
  });
});

describe('isVaultNotConfigured', () => {
  it('returns true for "vault not configured" error', () => {
    expect(isVaultNotConfigured(new Error('Vault is not configured for this tenant'))).toBe(true);
    expect(isVaultNotConfigured(new Error('vault not configured'))).toBe(true);
    expect(isVaultNotConfigured(new Error('The Vault service is Not Configured'))).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isVaultNotConfigured(new Error('Connection refused'))).toBe(false);
    expect(isVaultNotConfigured(new Error('Server error'))).toBe(false);
    expect(isVaultNotConfigured(new Error('not configured'))).toBe(false); // missing "vault"
    expect(isVaultNotConfigured(new Error('vault error'))).toBe(false); // missing "not configured"
  });

  it('returns false for non-error values', () => {
    expect(isVaultNotConfigured(null)).toBe(false);
    expect(isVaultNotConfigured(undefined)).toBe(false);
    expect(isVaultNotConfigured(42)).toBe(false);
  });
});
