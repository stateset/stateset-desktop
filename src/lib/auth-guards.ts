/**
 * Runtime guards for tenant/brand/session IDs.
 * Use these instead of non-null assertions (!) to get descriptive errors.
 */

export function requireTenantId(tenant: { id: string } | null | undefined): string {
  if (!tenant?.id) throw new Error('No tenant selected. Please log in again.');
  return tenant.id;
}

export function requireBrandId(brand: { id: string } | null | undefined): string {
  if (!brand?.id) throw new Error('No brand selected. Please select a brand from the sidebar.');
  return brand.id;
}

export function requireSessionId(sessionId: string | undefined): string {
  if (!sessionId) throw new Error('No session ID provided.');
  return sessionId;
}
