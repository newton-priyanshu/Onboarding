/**
 * rbac.ts — Standalone RBAC utility functions.
 *
 * Provides sync permission-checking helpers that can be used outside of React
 * components (e.g., in hooks, utils, or config files).
 *
 * These functions use the hardcoded DEFAULT_ROLE_PERMISSIONS map as the
 * primary check, making them suitable for UI rendering decisions and quick
 * role-based gating without needing the RBACProvider context.
 *
 * For async DB-backed checks, use the functions in src/api/permissions.ts
 * directly (checkPermission, hasAnyPermission, hasAllPermissions).
 */

import type { UserProfile, UserRole } from '../types/supabase';
import { checkDefaultPermission } from '../api/permissions';

/**
 * Check if a user has permission to perform an action on a resource.
 * Uses hardcoded defaults — suitable for sync UI checks.
 *
 * @example
 *   if (can(userProfile, 'worksheet', 'approve')) { ... }
 *   if (can(profile, 'user', 'create')) { ... }
 */
export function can(
  profile: UserProfile | null | undefined,
  resource: string,
  action: string
): boolean {
  if (!profile) return false;

  // super_admin has wildcard access
  if (profile.role === 'super_admin') return true;

  return checkDefaultPermission(profile.role as UserRole, resource, action);
}

/**
 * Check if a user has ANY of the specified actions on a resource.
 *
 * @example
 *   if (canAny(profile, 'worksheet', ['create', 'approve'])) { ... }
 */
export function canAny(
  profile: UserProfile | null | undefined,
  resource: string,
  actions: string[]
): boolean {
  if (!profile) return false;
  return actions.some(action => can(profile, resource, action));
}

/**
 * Check if a user has ALL of the specified actions on a resource.
 *
 * @example
 *   if (canAll(profile, 'worksheet', ['read', 'approve'])) { ... }
 */
export function canAll(
  profile: UserProfile | null | undefined,
  resource: string,
  actions: string[]
): boolean {
  if (!profile) return false;
  return actions.every(action => can(profile, resource, action));
}

/**
 * Require a permission — throws an error if the user lacks it.
 * Useful for async functions that need to guard operations.
 *
 * @throws Error if the user lacks the required permission
 */
export function requirePermission(
  profile: UserProfile | null | undefined,
  resource: string,
  action: string
): void {
  if (!can(profile, resource, action)) {
    const role = profile?.role || 'unauthenticated';
    throw new Error(
      `Permission denied: user with role "${role}" cannot ${action} "${resource}"`
    );
  }
}

/**
 * Get the effective role for permission checking, accounting for campus context.
 *
 * - super_admin always returns 'super_admin' (global access)
 * - campus_admin returns 'campus_admin' (scoped to their campus)
 * - All other roles return their role name directly
 *
 * This is useful for UI that needs to display or check the user's active role
 * when multiple roles might be possible in the future.
 */
export function getEffectiveRole(profile: UserProfile | null | undefined): UserRole | null {
  if (!profile) return null;
  return profile.role as UserRole;
}

/**
 * Check if a user has a specific role.
 * Shorthand for profile?.role === roleName.
 */
export function hasRole(
  profile: UserProfile | null | undefined,
  ...roles: UserRole[]
): boolean {
  if (!profile) return false;
  return roles.includes(profile.role as UserRole);
}

/**
 * Check if a user is a super_admin.
 */
export function isSuperAdmin(profile: UserProfile | null | undefined): boolean {
  return profile?.role === 'super_admin';
}

/**
 * Check if a user is a campus_admin.
 */
export function isCampusAdmin(profile: UserProfile | null | undefined): boolean {
  return profile?.role === 'campus_admin';
}

/**
 * Check if a user can review worksheets (buddy/mentor or higher).
 */
export function canReviewWorksheets(profile: UserProfile | null | undefined): boolean {
  return can(profile, 'worksheet', 'approve');
}

/**
 * Check if a user can manage users (admin or higher).
 */
export function canManageUsers(profile: UserProfile | null | undefined): boolean {
  return can(profile, 'user', 'update') || can(profile, 'user', 'create');
}

/**
 * Check if a user can view analytics.
 */
export function canViewAnalytics(profile: UserProfile | null | undefined): boolean {
  return can(profile, 'analytics', 'read');
}
