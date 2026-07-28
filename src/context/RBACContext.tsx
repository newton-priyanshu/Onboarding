/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../api/supabase';
import { getRolePermissions, checkDefaultPermission } from '../api/permissions';
import type { Permission, UserRole } from '../types/supabase';

// ─── Types ──────────────────────────────────────────────

interface RBACContextValue {
  /** Whether the permissions are still loading */
  isLoading: boolean;
  /** Check if the current user has a specific permission */
  can: (resource: string, action: string) => boolean;
  /** Check if the current user has ANY of the specified actions on a resource */
  canAny: (resource: string, actions: string[]) => boolean;
  /** Check if the current user has ALL of the specified actions on a resource */
  canAll: (resource: string, actions: string[]) => boolean;
  /** Error message if permission loading failed */
  error: string | null;
}

// ─── Context ────────────────────────────────────────────

const RBACContext = createContext<RBACContextValue | null>(null);

// ─── Permission Resolution ──────────────────────────────

/**
 * Resolve a role name to a role UUID for DB permission lookup.
 * The `permissions` table references `roles.id` (UUID), not the role name.
 * We query the `roles` table to get the UUID for the given role name.
 * Returns null if the role is not found (will fall back to hardcoded defaults).
 */
async function roleNameToId(roleName: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .maybeSingle();
    return data?.id || null;
  } catch {
    return null;
  }
}

// ─── Provider ───────────────────────────────────────────

export function RBACProvider({ children }: { children: ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userRole = profile?.role as UserRole | undefined;

  // Fetch permissions when the user's role changes
  useEffect(() => {
    if (authLoading) return;

    // Capture the current role — guaranteed non-null by the guard below
    const currentRole = userRole;
    if (!currentRole) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPermissions() {
      setIsLoading(true);
      setError(null);

      try {
        // Try fetching from DB first — resolve role name to UUID
        // Non-null assertion is safe: the !currentRole guard above exits before this runs
        const roleId = await roleNameToId(currentRole!);

        if (cancelled) return;

        if (roleId) {
          const dbPerms = await getRolePermissions(roleId);
          if (cancelled) return;

          if (dbPerms.length > 0) {
            setPermissions(dbPerms);
            setIsLoading(false);
            return;
          }
        }

        // No DB permissions found — use hardcoded defaults via can() fallback
        setPermissions([]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[RBAC] Failed to load permissions:', msg);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPermissions();

    return () => { cancelled = true; };
  }, [userRole, authLoading]);

  // ── Permission checking ────────────────────────────────

  const can = useCallback((resource: string, action: string): boolean => {
    // super_admin has wildcard access
    if (userRole === 'super_admin') return true;

    // Check DB permissions first
    if (permissions.length > 0) {
      const allow = permissions.some(
        p => p.resource === resource && p.action === action && p.constraint_type === 'allow'
      );
      if (allow) return true;

      const deny = permissions.some(
        p => p.resource === resource && p.action === action && p.constraint_type === 'deny'
      );
      if (deny) return false;

      // Wildcard allow
      const wildcard = permissions.some(
        p => p.resource === '*' && p.action === action && p.constraint_type === 'allow'
      );
      if (wildcard) return true;

      return false;
    }

    // Fallback to hardcoded defaults
    if (userRole) {
      return checkDefaultPermission(userRole, resource, action);
    }

    return false;
  }, [permissions, userRole]);

  const canAny = useCallback((resource: string, actions: string[]): boolean => {
    return actions.some(action => can(resource, action));
  }, [can]);

  const canAll = useCallback((resource: string, actions: string[]): boolean => {
    return actions.every(action => can(resource, action));
  }, [can]);

  // ── Memoized context value ─────────────────────────────

  const value = useMemo<RBACContextValue>(() => ({
    isLoading: isLoading || authLoading,
    can,
    canAny,
    canAll,
    error,
  }), [isLoading, authLoading, can, canAny, canAll, error]);

  return (
    <RBACContext.Provider value={value}>
      {children}
    </RBACContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────

export function useRBAC(): RBACContextValue {
  const context = useContext(RBACContext);
  if (!context) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
}

/**
 * Convenience hook: check if the user has a specific permission.
 * Shorthand for useRBAC().can(resource, action).
 */
export function usePermission(resource: string, action: string): boolean {
  const { can, isLoading } = useRBAC();
  // Return false while loading to prevent flash of unauthorized content
  if (isLoading) return false;
  return can(resource, action);
}

/**
 * Convenience hook: check if the user has ANY of the specified actions.
 * Shorthand for useRBAC().canAny(resource, actions).
 */
export function useHasAnyPermission(resource: string, actions: string[]): boolean {
  const { canAny, isLoading } = useRBAC();
  if (isLoading) return false;
  return canAny(resource, actions);
}

/**
 * Convenience hook: check if the user has ALL of the specified actions.
 */
export function useHasAllPermissions(resource: string, actions: string[]): boolean {
  const { canAll, isLoading } = useRBAC();
  if (isLoading) return false;
  return canAll(resource, actions);
}
