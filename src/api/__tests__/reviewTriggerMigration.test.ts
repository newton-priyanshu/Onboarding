/**
 * Review state-machine trigger — SQL contract regression tests.
 *
 * The live DB was once found running a DIVERGENT, weaker
 * `validate_review_transition` trigger whose error text ("Invalid
 * review_status transition") exists in NO migration file — it allowed the
 * submission owner to self-approve worksheets and managers to approve without
 * a buddy step (BUG-1/BUG-2 in docs/E2E_BUG_REPORT.md). These tests lock the
 * CANONICAL definition from
 * supabase/migrations/20260807000000_fix_review_state_machine_trigger.sql in
 * place so a future migration edit can never silently weaken it again:
 *
 *   1. Service-role bypass (IF actor IS NULL) — seeding/admin must pass through
 *   2. Owner self-approval blocked (Illegal ... for the submission owner)
 *   3. Reviewer transitions scoped by role (buddy vs. manager), fail closed
 *   4. review_history is append-only and server-written
 *   5. Trigger wired BEFORE UPDATE, idempotent re-install
 *   6. Drift guard: the divergent weak error text must NOT appear in the code
 */
import { describe, it, expect } from 'vitest';
// Vite `?raw` import — loads the migration SQL as a string at transform time.
// (Deliberately avoids node:fs/process so the test needs no @types/node.)
import sql from '../../../supabase/migrations/20260807000000_fix_review_state_machine_trigger.sql?raw';

/** Normalized once at module scope — every assertion shares the same view of the file. */
const normalizedSql = sql.replace(/\s+/g, ' ');

/** Assert that a block of SQL exists verbatim (normalized whitespace-insensitively). */
function expectSqlContains(fragment: string, description: string): void {
  const needle = fragment.replace(/\s+/g, ' ').trim();
  expect(normalizedSql, description).toContain(needle);
}

/**
 * Executable SQL with ALL comments stripped — line (`--`) and block (`/* ... *\/`).
 * Comments may legitimately quote the weak error text for documentation, so
 * drift guards must inspect the code only.
 */
const codeOnly = sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\n]*/g, ' ');

describe('validate_review_transition function contract', () => {
  it('defines the canonical trigger function as SECURITY DEFINER plpgsql', () => {
    expectSqlContains(
      `CREATE OR REPLACE FUNCTION public.validate_review_transition()
       RETURNS TRIGGER
       LANGUAGE plpgsql
       SECURITY DEFINER`,
      'trigger function definition',
    );
  });

  it('bypasses trusted server-side contexts (service_role / SQL editor / seeds)', () => {
    // Combined block assertion — a restructured or weakened bypass (e.g. one
    // that no longer short-circuits) must fail this, not just individual lines.
    expectSqlContains(
      'IF actor IS NULL THEN RETURN NEW; END IF;',
      'service-role bypass block short-circuits the whole trigger',
    );
  });
});

describe('owner self-approval is blocked', () => {
  it('rejects owner writes to reviewer-only states', () => {
    expectSqlContains(
      `RAISE EXCEPTION 'Illegal review_status transition % -> % for the submission owner'`,
      'canonical owner self-approval error text',
    );
  });

  it('prevents the owner from mutating an already-reviewed worksheet', () => {
    expectSqlContains(
      `RAISE EXCEPTION 'This worksheet has already been reviewed and can no longer be changed by its owner'`,
      'already-reviewed guard',
    );
  });

  it('freezes reviewer-identity columns even when the owner edits other fields', () => {
    expectSqlContains('NEW.reviewed_by := OLD.reviewed_by;', 'reviewed_by preserved');
    expectSqlContains('NEW.reviewed_at := OLD.reviewed_at;', 'reviewed_at preserved');
    expectSqlContains('NEW.reviewer_name := OLD.reviewer_name;', 'reviewer_name preserved');
  });
});

describe('reviewer transitions are scoped by role', () => {
  it('lets a buddy reviewer approve for revision only from pending states', () => {
    expectSqlContains(
      `OLD.review_status IN ('pending_review', 'revision_submitted') AND NEW.review_status = 'buddy_approved'`,
      'buddy approve transition',
    );
    expectSqlContains(
      `OLD.review_status IN ('pending_review', 'revision_submitted', 'buddy_approved') AND NEW.review_status = 'needs_revision'`,
      'buddy needs_revision transition',
    );
  });

  it('lets a manager approve only from buddy_approved', () => {
    expectSqlContains(
      `OLD.review_status = 'buddy_approved' AND NEW.review_status = 'approved'`,
      'manager approve transition',
    );
  });

  it('fails closed for every other role', () => {
    expectSqlContains(
      `RAISE EXCEPTION 'Role % is not permitted to change review_status'`,
      'fail-closed error for non-reviewer roles',
    );
  });
});

describe('review_history is append-only and server-written', () => {
  it('never trusts the client copy of review_history', () => {
    expectSqlContains('NEW.review_history := OLD.review_history;', 'history starts from persisted value');
  });

  it('appends a history entry on reviewer transitions', () => {
    expectSqlContains(
      `NEW.review_history := OLD.review_history || jsonb_build_array(jsonb_build_object(`,
      'history append on reviewer action',
    );
  });
});

describe('trigger wiring', () => {
  it('installs a BEFORE UPDATE row trigger on worksheet_submissions', () => {
    expectSqlContains(
      `BEFORE UPDATE ON public.worksheet_submissions`,
      'trigger timing: BEFORE UPDATE',
    );
    expectSqlContains('FOR EACH ROW', 'per-row trigger');
    expectSqlContains(
      `EXECUTE FUNCTION public.validate_review_transition();`,
      'trigger wired to the function',
    );
  });

  it('is idempotent — drops any prior trigger before re-creating', () => {
    expectSqlContains(
      `DROP TRIGGER IF EXISTS validate_review_transition ON public.worksheet_submissions;`,
      'drop-then-create makes re-runs safe',
    );
  });
});

describe('drift guard — no regression to the divergent weak trigger', () => {
  it('contains the canonical "Illegal ... for the submission owner" marker', () => {
    expect(normalizedSql).toContain(
      "'Illegal review_status transition % -> % for the submission owner'",
    );
  });

  it('does NOT emit the weak error text in executable SQL', () => {
    // The header comment quotes the weak text for context, so strip ALL
    // comments (line + block) and assert on the executable code only.
    expect(codeOnly, 'weak error text must never appear outside comments').not.toContain(
      'Invalid review_status transition',
    );
  });

  it('references the weak text exactly once — only in the header documentation comment', () => {
    // Pins the documentation: the divergent text is allowed to appear ONLY as
    // the single header-comment reference. A second occurrence anywhere (code
    // or comment) signals the canonical definition has drifted toward the weak
    // trigger that shipped to the live DB.
    const occurrences = sql.match(/Invalid review_status transition/g)?.length ?? 0;
    expect(occurrences).toBe(1);
  });
});
