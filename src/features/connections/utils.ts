import type { Platform } from './platforms';
import { PLATFORMS } from './platforms';
import { CUSTOM_MCP_FIELDS } from './types';
import { getErrorMessage } from '../../lib/errors';

const BUILT_IN_PLATFORM_IDS = new Set(PLATFORMS.map((p) => p.id));

export function isBuiltInPlatform(platformId: string): boolean {
  return BUILT_IN_PLATFORM_IDS.has(platformId);
}

export function normalizeCustomPlatformId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

export function normalizeConnectionInput(fieldKey: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (fieldKey === 'shop_domain' || fieldKey === 'domain' || fieldKey === 'subdomain') {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  return trimmed;
}

export function normalizeCredentials(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, normalizeConnectionInput(key, value)])
  );
}

export function hasMissingOAuthInput(
  fields: { key: string; label: string; type: string; placeholder?: string }[],
  values: Record<string, string>
): boolean {
  return fields.some((field) => !normalizeConnectionInput(field.key, values[field.key] || ''));
}

export function hasMissingRequiredFields(
  platform: Platform,
  values: Record<string, string>
): boolean {
  return platform.requiredFields.some(
    (field) =>
      field.required !== false && !normalizeConnectionInput(field.key, values[field.key] || '')
  );
}

export function buildCredentialsForSave(
  platform: Platform,
  values: Record<string, string>
): Record<string, string> {
  const normalizedValues = normalizeCredentials(values);
  const requiredFields = platform.requiredFields.filter((field) => field.required !== false);
  const missingField = requiredFields.find(
    (field) => !normalizeConnectionInput(field.key, normalizedValues[field.key] || '')
  );

  if (missingField) {
    throw new Error(`Please provide ${missingField.label.toLowerCase()}.`);
  }

  return Object.fromEntries(
    Object.entries(normalizedValues).filter(([, value]) => value.length > 0)
  );
}

export function createCustomPlatformConfig(platformId: string): Platform {
  return {
    id: platformId,
    name: platformId,
    description: 'Custom MCP server',
    icon: '\u{1F9E9}',
    color: 'bg-indigo-600',
    requiredFields: CUSTOM_MCP_FIELDS,
  };
}

export function getPlatformConfig(platformId: string): Platform {
  return (
    PLATFORMS.find((platform) => platform.id === platformId) ??
    createCustomPlatformConfig(platformId)
  );
}

export function isVaultNotConfigured(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('vault') && message.includes('not configured');
}
