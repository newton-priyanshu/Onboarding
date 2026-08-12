/**
 * Audit log creation — SQL contract tests.
 *
 * Audit log entries are created SERVER-SIDE via Postgres triggers defined in
 * the multi-tenant migration (there is no client-side insert path — the app
 * only reads audit_logs for the super-admin view). These tests lock the
 * creation contract in place so a migration edit can never silently remove
 * the table, triggers, or insert policies:
 *
 *   1. log_worksheet_review_action  — AFTER UPDATE OF review_status
 *   2. log_profile_change           — AFTER UPDATE OF role / assignments
 *   3. log_campus_change            — AFTER INSERT OR UPDATE OR DELETE
 *   4. RLS: users can INSERT audit logs; only super admins can SELECT/UPDATE/DELETE
 */
import { describe, it, expect } from 'vitest';
// Vite `?raw` import — loads the migration SQL as a string at transform time.
// (Deliberately avoids node:fs/process so the test needs no @types/node.)
// The all_in_one migration is the canonical consolidated file (the split
// phase0/phase3 files are alternative versions of the same definitions).
import sql from '../../../supabase/migrations/20260727000000_multi_tenant_all_in_one.sql?raw';

/** Assert that a block of SQL exists verbatim (normalized whitespace-insensitively). */
function expectSqlContains(fragment: string, description: string): void {
  const normalized = sql.replace(/\s+/g, ' ');
  const needle = fragment.replace(/\s+/g, ' ').trim();
  expect(normalized, description).toContain(needle);
}

describe('audit_logs table contract', () => {
  it('defines the audit_logs table with the expected columns', () => {
    expectSqlContains(
      `CREATE TABLE IF NOT EXISTS public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campus_id UUID,
        user_id UUID,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      'audit_logs table definition',
    );
  });

  it('indexes audit logs by campus, user, and created_at', () => {
    expectSqlContains('CREATE INDEX IF NOT EXISTS idx_audit_campus ON public.audit_logs (campus_id);', 'campus index');
    expectSqlContains('CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_logs (user_id);', 'user index');
    expectSqlContains('CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);', 'created_at index');
  });
});

describe('log_worksheet_review_action trigger', () => {
  it('logs review status changes on worksheet_submissions', () => {
    expectSqlContains(
      `CREATE OR REPLACE FUNCTION public.log_worksheet_review_action()
       RETURNS TRIGGER
       LANGUAGE plpgsql
       SECURITY DEFINER`,
      'trigger function definition',
    );
    expectSqlContains(
      `IF OLD.review_status IS DISTINCT FROM NEW.review_status THEN`,
      'fires only when review_status actually changes',
    );
    expectSqlContains(
      `'worksheet_submissions.review_status_changed'`,
      'records the review_status_changed action',
    );
    expectSqlContains(
      `AFTER UPDATE OF review_status ON public.worksheet_submissions`,
      'trigger timing: AFTER UPDATE OF review_status',
    );
    expectSqlContains(
      `EXECUTE FUNCTION public.log_worksheet_review_action();`,
      'trigger is wired to the function',
    );
  });

  it('captures old/new status and reviewer in the details payload', () => {
    expectSqlContains(`'old_status', OLD.review_status`, 'old status captured');
    expectSqlContains(`'new_status', NEW.review_status`, 'new status captured');
    expectSqlContains(`'reviewer_name', NEW.reviewer_name`, 'reviewer captured');
  });
});

describe('log_profile_change trigger', () => {
  it('logs role and assignment changes on user_profiles', () => {
    expectSqlContains(
      `AFTER UPDATE OF role, assigned_lead_id, assigned_buddy_id ON public.user_profiles`,
      'trigger timing: AFTER UPDATE OF role/assignments',
    );
    expectSqlContains(`EXECUTE FUNCTION public.log_profile_change();`, 'trigger wired to function');
  });

  it('builds a changes JSONB and picks the most specific action', () => {
    expectSqlContains(`'user_profiles.role_changed'`, 'role change action');
    expectSqlContains(`'user_profiles.lead_assigned'`, 'lead assignment action');
    expectSqlContains(`'user_profiles.buddy_assigned'`, 'buddy assignment action');
    expectSqlContains(`WHEN (OLD.* IS DISTINCT FROM NEW.*)`, 'skips no-op updates');
  });
});

describe('log_campus_change trigger', () => {
  it('logs campus CRUD operations', () => {
    expectSqlContains(
      `AFTER INSERT OR UPDATE OR DELETE ON public.campuses`,
      'trigger timing: AFTER INSERT OR UPDATE OR DELETE',
    );
    expectSqlContains(`'campus.created'`, 'create action');
    expectSqlContains(`'campus.updated'`, 'update action');
    expectSqlContains(`'campus.deleted'`, 'delete action');
  });

  it('skips campus updates that changed nothing', () => {
    expectSqlContains(`IF v_details IS NOT NULL AND v_details <> '{}'::jsonb THEN`, 'no-op update guard');
  });
});

describe('audit_logs RLS policies', () => {
  it('lets authenticated users INSERT audit logs (client-driven logging path)', () => {
    expectSqlContains(
      `CREATE POLICY "Users can insert audit logs" ON public.audit_logs
       FOR INSERT WITH CHECK (auth.role() = 'authenticated');`,
      'insert policy',
    );
  });

  it('restricts read/update/delete to super admins', () => {
    expectSqlContains(
      `CREATE POLICY "Super admin manage audit logs" ON public.audit_logs
       FOR ALL USING (public.is_super_admin());`,
      'super-admin-only management policy',
    );
  });

  it('enables row-level security on audit_logs', () => {
    expectSqlContains('ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;', 'RLS enabled');
  });
});

describe('audit log data-flow integrity', () => {
  it('every trigger writes into public.audit_logs with the same column set', () => {
    // All three triggers must insert with the identical column list.
    const insertFragments = sql.match(/INSERT INTO public\.audit_logs \(\s*[\s\S]*?\)/g) || [];
    const expectedColumns =
      'campus_id, user_id, action, resource_type, resource_id, details';
    for (const frag of insertFragments) {
      expect(frag.replace(/\s+/g, ' ')).toContain(expectedColumns);
    }
    // There are exactly 3 trigger insert sites (review, profile, campus).
    // Contract note: adding a NEW audit trigger requires updating this count.
    expect(insertFragments.length).toBe(3);
  });
});
