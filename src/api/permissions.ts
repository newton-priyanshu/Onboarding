/**
 * permissions.ts — RBAC permission checking utilities.
 *
 * Provides functions to check whether a given role (or user) has permission
 * to perform a specific action on a resource. Reads from the `permissions`
 * table, with a fallback to hardcoded system role defaults for backward
 * compatibility during the transition period.
 *
 * The permissions model is:
 *   Role → [Permission { resource, action, constraint_type }]
 *
 * `constraint_type` is 'allow' by default ('deny' can override).
 */

import { supabase } from './supabase';
import type { UserRole } from '../types/supabase';
import type { Permission } from '../types/supabase';

// ─── Cache ──────────────────────────────────────────────

const permissionsCache = new Map<string, { permissions: Permission[]; expiresAt: number }>();
const CACHE_TTL = 120_000; // 2 minutes

export function invalidatePermissionsCache(roleId: string): void {
  permissionsCache.delete(roleId);
}

// ─── Default Hardcoded Permissions (backward compat) ────

/**
 * Default allowed actions per system role, in case the permissions table
 * is not yet populated or the DB query fails.
 * This ensures backward compatibility during the migration period.
 */
const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, { resource: string; action: string }[]> = {
  super_admin: [
    { resource: '*', action: '*' },
  ],
  campus_admin: [
    { resource: 'user', action: 'create' },
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'approve' },
    { resource: 'template', action: 'read' },
    { resource: 'template', action: 'update' },
    { resource: 'analytics', action: 'read' },
  ],
  academic_head: [
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'approve' },
    { resource: 'analytics', action: 'read' },
  ],
  onboarding_lead: [
    { resource: 'user', action: 'read' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'analytics', action: 'read' },
  ],
  lead_instructor: [
    { resource: 'user', action: 'read' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'approve' },
  ],
  new_joinee: [
    { resource: 'worksheet', action: 'create' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'update' },
  ],
  lab_instructor: [
    { resource: 'worksheet', action: 'create' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'update' },
  ],
  acad_ops: [
    { resource: 'user', action: 'read' },
    { resource: 'worksheet', action: 'read' },
  ],
  progression_head: [
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'approve' },
    { resource: 'analytics', action: 'read' },
  ],
  ops_head: [
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'approve' },
    { resource: 'analytics', action: 'read' },
  ],
  campus_head: [
    { resource: 'user', action: 'create' },
    { resource: 'user', action: 'read' },
    { resource: 'user', action: 'update' },
    { resource: 'worksheet', action: 'read' },
    { resource: 'worksheet', action: 'approve' },
    { resource: 'template', action: 'read' },
    { resource: 'analytics', action: 'read' },
  ],
};

// ─── Fallback check using hardcoded defaults ────────────

/**
 * Check whether a system role has a permission based on hardcoded defaults.
 * Used as fallback when the DB permissions table is unavailable.
 */
export function checkDefaultPermission(
  role: UserRole,
  resource: string,
  action: string
): boolean {
  const perms = DEFAULT_ROLE_PERMISSIONS[role];
  if (!perms) return false;

  // super_admin has wildcard access
  return perms.some(p =>
    (p.resource === '*' || p.resource === resource) &&
    (p.action === '*' || p.action === action)
  );
}

// ─── DB-backed permission checks ────────────────────────

/**
 * Fetch all permissions for a given role from the database.
 * Results are cached in-memory.
 */
export async function getRolePermissions(roleId: string): Promise<Permission[]> {
  const cached = permissionsCache.get(roleId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.permissions;
  }

  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('role_id', roleId);

    if (error) {
      console.error(`[Permissions] Failed to fetch permissions for role ${roleId}:`, error?.message || error);
      return [];
    }

    const permissions = (data as Permission[]) || [];
    permissionsCache.set(roleId, { permissions, expiresAt: Date.now() + CACHE_TTL });
    return permissions;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Permissions] Failed to fetch permissions for role ${roleId}:`, msg);
    return [];
  }
}

/**
 * Check if a role has permission to perform a specific action on a resource.
 * Tries the DB-backed permissions table first, falls back to hardcoded defaults.
 */
export async function checkPermission(
  roleId: string,
  resource: string,
  action: string,
  fallbackRole?: UserRole
): Promise<boolean> {
  // Check DB permissions
  const permissions = await getRolePermissions(roleId);
  if (permissions.length > 0) {
    // Check for explicit allow
    const allow = permissions.some(
      p => p.resource === resource && p.action === action && p.constraint_type === 'allow'
    );
    if (allow) return true;

    // Check for explicit deny
    const deny = permissions.some(
      p => p.resource === resource && p.action === action && p.constraint_type === 'deny'
    );
    if (deny) return false;

    // Check wildcard allow
    const wildcardAllow = permissions.some(
      p => p.resource === '*' && p.action === action && p.constraint_type === 'allow'
    );
    if (wildcardAllow) return true;

    // No explicit match — deny
    return false;
  }

  // Fallback to hardcoded defaults
  if (fallbackRole) {
    return checkDefaultPermission(fallbackRole, resource, action);
  }

  return false;
}

/**
 * Check if a role has ANY of the specified actions on a resource.
 * Useful for UI rendering decisions (e.g. "can the user do anything with worksheets?").
 */
export async function hasAnyPermission(
  roleId: string,
  resource: string,
  actions: string[],
  fallbackRole?: UserRole
): Promise<boolean> {
  // Check DB permissions in batch
  const permissions = await getRolePermissions(roleId);
  if (permissions.length > 0) {
    return actions.some(action =>
      permissions.some(
        p => p.resource === resource && p.action === action && p.constraint_type === 'allow'
      )
    );
  }

  // Fallback to hardcoded defaults
  if (fallbackRole) {
    return actions.some(action => checkDefaultPermission(fallbackRole, resource, action));
  }

  return false;
}

/**
 * Check if a role has ALL of the specified actions on a resource.
 */
export async function hasAllPermissions(
  roleId: string,
  resource: string,
  actions: string[],
  fallbackRole?: UserRole
): Promise<boolean> {
  const permissions = await getRolePermissions(roleId);
  if (permissions.length > 0) {
    return actions.every(action =>
      permissions.some(
        p => p.resource === resource && p.action === action && p.constraint_type === 'allow'
      )
    );
  }

  if (fallbackRole) {
    return actions.every(action => checkDefaultPermission(fallbackRole, resource, action));
  }

  return false;
}
