import { describe, it, expect } from 'vitest';
// Vite `?raw` imports — same pattern as reviewTriggerMigration.test.ts /
// auditLogs.test.ts: asserts against the canonical migration SQL in the repo.
import schemaSql from '../../../db/schema.sql?raw';
import rls060Sql from '../../../supabase/migrations/20260710000006_row_level_security.sql?raw';
import allInOneSql from '../../../supabase/migrations/20260727000000_multi_tenant_all_in_one.sql?raw';
import phase3RlsSql from '../../../supabase/migrations/20260727000002_multi_tenant_phase3_rls.sql?raw';

// campusScoped: the two multi-tenant files add the campus-scope block to the
// INSERT policy WITH CHECK; the older snapshots (schema.sql / 20260710000006)
// predate that and keep the owner-only core. Assert the shared resubmit
// markers on every copy, and campus scope only where it exists.
const canonicalFiles = [
  { label: 'db/schema.sql (canonical snapshot)', sql: schemaSql, campusScoped: false },
  { label: '20260710000006_row_level_security.sql', sql: rls060Sql, campusScoped: false },
  { label: '20260727000000_multi_tenant_all_in_one.sql', sql: allInOneSql, campusScoped: true },
  { label: '20260727000002_multi_tenant_phase3_rls.sql', sql: phase3RlsSql, campusScoped: true },
];

/**
 * Guards the resubmit RLS fix against drift: the owner's revision resubmit is
 * an upsert carrying review_status='revision_submitted' (useAutoSave.ts), so
 * the "Insert own submissions" policy must allow that state — otherwise the
 * needs_revision → revision_submitted → buddy_approved round-trip 403s with a
 * 42501 RLS violation (caught by the browser-pass rejection round-trip).
 */
describe('worksheet_submissions "Insert own submissions" policy — resubmit marker', () => {
  for (const file of canonicalFiles) {
    describe(file.label, () => {
      it('INSERT policy allows the owner resubmit state revision_submitted', () => {
        expect(file.sql).toContain('CREATE POLICY "Insert own submissions" ON public.worksheet_submissions');
        expect(file.sql).toContain('auth.uid() = user_id');
        expect(file.sql).toContain("AND review_status IN ('', 'pending_review', 'revision_submitted')");
        expect(file.sql).toContain('AND reviewed_by IS NULL');
        if (file.campusScoped) {
          expect(file.sql).toContain('worksheet_submissions.campus_id = public.get_user_campus()');
        }
      });

      it('owner can still never insert an approved/buddy_approved row', () => {
        // The relaxed set must NOT silently allow terminal states — the state
        // machine trigger only guards UPDATE transitions, so the INSERT policy
        // is the sole guard against owner-forged approvals. Scope to the policy
        // block and match any ordering, so even appending a terminal state to
        // the end of the allowed list is caught.
        const policyBlock = file.sql.match(/CREATE POLICY "Insert own submissions"[\s\S]*?;\n/)?.[0] || '';
        expect(policyBlock).not.toMatch(/review_status IN \([^)]*(approved|buddy_approved)[^)]*\)/);
      });
    });
  }
});
