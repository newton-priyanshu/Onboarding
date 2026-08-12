import { describe, it, expect, vi } from 'vitest';
import {
  can,
  canAny,
  canAll,
  requirePermission,
  getEffectiveRole,
  hasRole,
  isSuperAdmin,
  isCampusAdmin,
  canReviewWorksheets,
  canManageUsers,
  canViewAnalytics,
} from '../rbac';
import type { UserProfile, UserRole } from '../../types/supabase';

// rbac.ts → permissions.ts imports supabase at module top-level; mock it so
// these pure checks are hermetic and never depend on env vars or a live client.
vi.mock('../../api/supabase', () => ({
  supabase: {},
}));

function profile(role: UserRole, campusId: string | null = 'campus-a'): UserProfile {
  return {
    id: `user-${role}`,
    email: `${role}@newton.edu`,
    full_name: role,
    role,
    department: null,
    assigned_lead_id: null,
    assigned_buddy_id: null,
    campus_id: campusId,
    assigned_template_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('can — core permission check', () => {
  it('denies everything for a missing profile', () => {
    expect(can(null, 'worksheet', 'read')).toBe(false);
    expect(can(undefined, 'user', 'create')).toBe(false);
  });

  it('super_admin has wildcard access to every resource and action', () => {
    const sa = profile('super_admin');
    for (const resource of ['user', 'worksheet', 'template', 'campus', 'analytics', 'role']) {
      for (const action of ['read', 'create', 'update', 'delete', 'approve']) {
        expect(can(sa, resource, action)).toBe(true);
      }
    }
    // Even unknown resources/actions pass — the wildcard is unconditional.
    expect(can(sa, 'anything', 'whatever')).toBe(true);
  });

  it('new_joinee can manage own worksheets but nothing else', () => {
    const j = profile('new_joinee');
    expect(can(j, 'worksheet', 'read')).toBe(true);
    expect(can(j, 'worksheet', 'create')).toBe(true);
    expect(can(j, 'worksheet', 'update')).toBe(true);
    expect(can(j, 'worksheet', 'approve')).toBe(false);
    expect(can(j, 'user', 'read')).toBe(false);
    expect(can(j, 'analytics', 'read')).toBe(false);
  });

  it('lead_instructor can read users and approve worksheets', () => {
    const li = profile('lead_instructor');
    expect(can(li, 'user', 'read')).toBe(true);
    expect(can(li, 'worksheet', 'read')).toBe(true);
    expect(can(li, 'worksheet', 'approve')).toBe(true);
    expect(can(li, 'user', 'update')).toBe(false);
    expect(can(li, 'analytics', 'read')).toBe(false);
  });

  it('academic_head can read/update users and approve worksheets', () => {
    const ah = profile('academic_head');
    expect(can(ah, 'user', 'read')).toBe(true);
    expect(can(ah, 'user', 'update')).toBe(true);
    expect(can(ah, 'worksheet', 'approve')).toBe(true);
    expect(can(ah, 'analytics', 'read')).toBe(true);
    expect(can(ah, 'user', 'create')).toBe(false);
    expect(can(ah, 'template', 'update')).toBe(false);
  });

  it('campus_admin can manage users, templates and approve worksheets', () => {
    const ca = profile('campus_admin');
    expect(can(ca, 'user', 'create')).toBe(true);
    expect(can(ca, 'user', 'read')).toBe(true);
    expect(can(ca, 'user', 'update')).toBe(true);
    expect(can(ca, 'template', 'read')).toBe(true);
    expect(can(ca, 'template', 'update')).toBe(true);
    expect(can(ca, 'worksheet', 'approve')).toBe(true);
    expect(can(ca, 'user', 'delete')).toBe(false);
  });

  it('onboarding_lead is read-only (user + worksheet + analytics)', () => {
    const ol = profile('onboarding_lead');
    expect(can(ol, 'user', 'read')).toBe(true);
    expect(can(ol, 'worksheet', 'read')).toBe(true);
    expect(can(ol, 'analytics', 'read')).toBe(true);
    expect(can(ol, 'worksheet', 'approve')).toBe(false);
    expect(can(ol, 'user', 'update')).toBe(false);
  });

  it('acad_ops is read-only on users and worksheets', () => {
    const ao = profile('acad_ops');
    expect(can(ao, 'user', 'read')).toBe(true);
    expect(can(ao, 'worksheet', 'read')).toBe(true);
    expect(can(ao, 'worksheet', 'approve')).toBe(false);
  });

  it('permission checks are independent of campus_id (RLS handles campus scoping, RBAC handles role scoping)', () => {
    // The same role in a different campus has identical RBAC permissions —
    // campus isolation is enforced by RLS policies, not the permission map.
    const a = profile('campus_admin', 'campus-a');
    const b = profile('campus_admin', 'campus-b');
    expect(can(a, 'user', 'create')).toBe(can(b, 'user', 'create'));
    expect(can(a, 'worksheet', 'approve')).toBe(can(b, 'worksheet', 'approve'));
  });
});

describe('canAny / canAll', () => {
  it('canAny returns true when any action is permitted', () => {
    const j = profile('new_joinee');
    expect(canAny(j, 'worksheet', ['approve', 'read'])).toBe(true);
    expect(canAny(j, 'worksheet', ['approve', 'delete'])).toBe(false);
  });

  it('canAny on a missing profile returns false', () => {
    expect(canAny(null, 'worksheet', ['read'])).toBe(false);
  });

  it('canAll returns true only when every action is permitted', () => {
    const ah = profile('academic_head');
    expect(canAll(ah, 'user', ['read', 'update'])).toBe(true);
    expect(canAll(ah, 'user', ['read', 'create'])).toBe(false);
  });
});

describe('requirePermission', () => {
  it('does not throw when the user has permission', () => {
    expect(() => requirePermission(profile('academic_head'), 'worksheet', 'approve')).not.toThrow();
  });

  it('throws a descriptive error when permission is missing', () => {
    expect(() => requirePermission(profile('new_joinee'), 'analytics', 'read')).toThrow(
      /Permission denied: user with role "new_joinee" cannot read "analytics"/
    );
  });
});

describe('role helpers', () => {
  it('getEffectiveRole returns the raw role', () => {
    expect(getEffectiveRole(profile('academic_head'))).toBe('academic_head');
    expect(getEffectiveRole(null)).toBeNull();
    expect(getEffectiveRole(undefined)).toBeNull();
  });

  it('hasRole matches any of the given roles', () => {
    const ah = profile('academic_head');
    expect(hasRole(ah, 'lead_instructor', 'academic_head')).toBe(true);
    expect(hasRole(ah, 'new_joinee')).toBe(false);
    expect(hasRole(null, 'academic_head')).toBe(false);
  });

  it('isSuperAdmin / isCampusAdmin', () => {
    expect(isSuperAdmin(profile('super_admin'))).toBe(true);
    expect(isSuperAdmin(profile('campus_admin'))).toBe(false);
    expect(isCampusAdmin(profile('campus_admin'))).toBe(true);
    expect(isCampusAdmin(profile('super_admin'))).toBe(false);
  });

  it('canReviewWorksheets gates on worksheet approve permission', () => {
    expect(canReviewWorksheets(profile('lead_instructor'))).toBe(true);
    expect(canReviewWorksheets(profile('academic_head'))).toBe(true);
    expect(canReviewWorksheets(profile('new_joinee'))).toBe(false);
  });

  it('canManageUsers gates on user create/update', () => {
    expect(canManageUsers(profile('campus_admin'))).toBe(true);
    expect(canManageUsers(profile('academic_head'))).toBe(true);
    expect(canManageUsers(profile('lead_instructor'))).toBe(false);
  });

  it('canViewAnalytics gates on analytics read', () => {
    expect(canViewAnalytics(profile('academic_head'))).toBe(true);
    expect(canViewAnalytics(profile('campus_admin'))).toBe(true);
    expect(canViewAnalytics(profile('lead_instructor'))).toBe(false);
  });
});
