#!/usr/bin/env node
/**
 * Standalone read-only verification that the canonical
 * `validate_review_transition` trigger is live on the Supabase database.
 *
 * Confirms the four security markers that close BUG-1 (owner self-approval)
 * and BUG-2 (manager skip-buddy approvals) from docs/E2E_BUG_REPORT.md:
 *   1. function exists (public.validate_review_transition)
 *   2. owner self-approval blocked (Illegal ... for the submission owner)
 *   3. service-role bypass present (IF actor IS NULL)
 *   4. trigger installed (validate_review_transition, non-internal)
 *
 * Read-only — does NOT re-apply the migration. Run
 * `scripts/run_review_trigger_fix.cjs` once to apply the fix, then use this
 * script on demand to check the live state without touching anything.
 *
 * Usage:
 *   SUPABASE_PAT=<token> node scripts/verify_review_trigger.mjs
 *
 * Exit code 0 = all checks pass, 1 = verification failed or query error.
 */

import { pathToFileURL } from 'node:url';

const SUPABASE_PROJECT_REF = 'fuoqoryqndtdooujslee';
const MANAGEMENT_API = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`;

const CHECK_QUERY = `
  SELECT
    pg_get_functiondef(p.oid) AS fn_def,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgname = 'validate_review_transition' AND NOT t.tgisinternal
    ) AS trigger_exists
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'validate_review_transition';
`;

/**
 * Query the live DB and evaluate the canonical-trigger checks.
 *
 * @param {{ pat: string, apiUrl?: string, print?: boolean }} opts
 * @returns {Promise<{ allPass: boolean, checks: Array<{label: string, ok: boolean}>, fnDef: string, triggerExists: boolean, error?: string }>}
 */
export async function verifyReviewTrigger({ pat, apiUrl = MANAGEMENT_API, print = true } = {}) {
  if (!pat) throw new Error('SUPABASE_PAT is required');

  let fnDef = '';
  let triggerExists = false;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query: CHECK_QUERY }),
    });
    if (!response.ok) {
      throw new Error(`verification query failed (${response.status}): ${(await response.text()).substring(0, 200)}`);
    }
    const rows = await response.json();
    fnDef = rows?.[0]?.fn_def || '';
    // Accept boolean true OR the string 'true' — the Management API could
    // serialize the Postgres boolean either way depending on response format.
    triggerExists = rows?.[0]?.trigger_exists === true || rows?.[0]?.trigger_exists === 'true';
  } catch (err) {
    return { allPass: false, checks: [], fnDef: '', triggerExists: false, error: err.message };
  }

  const checks = [
    { label: 'function exists (public.validate_review_transition)', ok: fnDef.length > 0 },
    {
      label: 'owner self-approval blocked (Illegal ... for the submission owner)',
      ok: fnDef.includes('Illegal review_status transition') && fnDef.includes('for the submission owner'),
    },
    { label: 'service-role bypass present (IF actor IS NULL)', ok: fnDef.includes('IF actor IS NULL') },
    { label: 'trigger installed (validate_review_transition)', ok: triggerExists },
  ];

  const allPass = checks.every(c => c.ok);

  if (print) {
    for (const c of checks) {
      console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}`);
    }
  }

  return { allPass, checks, fnDef, triggerExists };
}

async function main() {
  const pat = process.env.SUPABASE_PAT;
  if (!pat) {
    console.error('');
    console.error('❌ SUPABASE_PAT environment variable is required.');
    console.error('');
    console.error('Get your Personal Access Token:');
    console.error('  Supabase Dashboard → Settings → API → Personal Access Tokens');
    console.error('');
    console.error('Then run:');
    console.error('  SUPABASE_PAT=<token> node scripts/verify_review_trigger.mjs');
    console.error('');
    process.exit(1);
  }

  console.log('\n─── Verify canonical validate_review_transition trigger (read-only) ───');
  const result = await verifyReviewTrigger({ pat });

  if (result.error) {
    console.error(`  ❌ Verification query failed: ${result.error}`);
    console.error('\n⚠️  Could not verify — see error above.\n');
    process.exit(1);
  }

  if (!result.allPass) {
    console.error('\n⚠️  Verification FAILED — the live DB is NOT running the canonical trigger.');
    console.error('    Run scripts/run_review_trigger_fix.cjs first to apply the fix, then re-run this script.\n');
    process.exit(1);
  }

  console.log('  ✅ All checks passed — canonical trigger is live.\n');
}

// Run the CLI only when executed directly (not when imported by the runner).
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
  });
}
