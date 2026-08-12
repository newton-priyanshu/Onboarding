#!/usr/bin/env node
/**
 * Applies the resubmit RLS fix to the live database via the Supabase
 * Management API: relaxes the "Insert own submissions" policy on
 * worksheet_submissions so the owner's revision resubmit (an upsert carrying
 * review_status='revision_submitted') is allowed.
 *
 * Fixes the bug caught by the browser-pass rejection round-trip: the owner's
 * resubmit upsert was rejected with 42501 (RLS policy violation) because the
 * INSERT policy's WITH CHECK only allowed review_status IN ('', 'pending_review').
 * Plain UPDATEs were already permitted (the "Update own submissions" policy is
 * auth.uid() = user_id), but the app saves via .upsert() (see useAutoSave.ts),
 * so the INSERT-side check is what actually gates the resubmit.
 *
 * Usage:
 *   SUPABASE_PAT=<token> node scripts/run_resubmit_rls_fix.cjs
 *
 * Get your Personal Access Token (PAT):
 *   Supabase Dashboard → Settings → API → Personal Access Tokens → "Generate New Token"
 * The token needs scope: "Database" or "All".
 */

const SUPABASE_PROJECT_REF = 'fuoqoryqndtdooujslee';
const MANAGEMENT_API = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`;

const pat = process.env.SUPABASE_PAT;
if (!pat) {
  console.error('');
  console.error('❌ SUPABASE_PAT environment variable is required.');
  console.error('');
  console.error('Get your Personal Access Token:');
  console.error('  Supabase Dashboard → Settings → API → Personal Access Tokens');
  console.error('');
  console.error('Then run:');
  console.error('  SUPABASE_PAT=<token> node scripts/run_resubmit_rls_fix.cjs');
  console.error('');
  process.exit(1);
}

// Canonical policy — kept in sync with db/schema.sql and the multi-tenant
// migrations ("Insert own submissions" WITH CHECK). Applied as ONE atomic
// DO block: a DROP followed by a failed CREATE would otherwise leave the live
// table with no insert policy at all (blocking every owner submission).
const APPLY_STMT = `DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Insert own submissions" ON public.worksheet_submissions';
  EXECUTE $pol$CREATE POLICY "Insert own submissions" ON public.worksheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND review_status IN ('', 'pending_review', 'revision_submitted') -- resubmit: owner upserts revision_submitted in the revision round-trip
    AND reviewed_by IS NULL
    AND (
      worksheet_submissions.campus_id IS NULL
      OR worksheet_submissions.campus_id = public.get_user_campus()
      OR public.is_super_admin()
    )
  )$pol$;
END $$;`;

// Read-only post-apply verification: assert the live policy now allows
// revision_submitted (the resubmit state).
const VERIFY_QUERY = `
  SELECT polname,
         pg_get_expr(polqual, polrelid) AS qual,
         pg_get_expr(polwithcheck, polrelid) AS with_check
  FROM pg_policy
  WHERE polrelid = 'public.worksheet_submissions'::regclass
    AND polname = 'Insert own submissions'`;

async function apply(stmt, label) {
  const response = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query: stmt }),
  });
  if (!response.ok) {
    const body = await response.text();
    if (/already exists|duplicate/i.test(body)) {
      console.log(`  ⚠️  Already exists (skipped): ${label}`);
      return true;
    }
    console.error(`  ❌ Error (${response.status}) [${label}]: ${body.substring(0, 300)}`);
    return false;
  }
  console.log(`  ✅ ${label}`);
  return true;
}

async function verify() {
  const response = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query: VERIFY_QUERY }),
  });
  if (!response.ok) {
    throw new Error(`verification query failed (${response.status}): ${(await response.text()).substring(0, 200)}`);
  }
  const rows = await response.json();
  const pol = rows?.[0];
  if (!pol) throw new Error('policy "Insert own submissions" not found on worksheet_submissions');
  const withCheck = String(pol.with_check || pol.qual || '');
  return {
    found: true,
    allowsRevisionSubmitted: withCheck.includes('revision_submitted'),
    allowsPendingReview: withCheck.includes('pending_review'),
    blocksReviewerWrites: withCheck.includes('reviewed_by IS NULL'),
    withCheck,
  };
}

async function run() {
  console.log('\n─── Resubmit RLS fix: allow owner upsert of revision_submitted ───\n');
  console.log('  Applying policy change to live DB (atomic DO block)...\n');

  const applied = await apply(APPLY_STMT, 'DROP + CREATE POLICY "Insert own submissions" (allows revision_submitted)');

  if (!applied) {
    console.error('\n⚠️  Policy apply FAILED. See errors above.\n');
    process.exitCode = 1;
    return;
  }

  console.log('\n─── Post-apply verification (read-only) ───');
  let checks;
  try {
    checks = await verify();
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`  ${checks.allowsRevisionSubmitted ? '✅' : '❌'} WITH CHECK allows revision_submitted`);
  console.log(`  ${checks.allowsPendingReview ? '✅' : '❌'} WITH CHECK still allows pending_review`);
  console.log(`  ${checks.blocksReviewerWrites ? '✅' : '❌'} WITH CHECK still requires reviewed_by IS NULL`);
  console.log(`  Policy: ${checks.withCheck.replace(/\s+/g, ' ').substring(0, 220)}...`);

  if (checks.allowsRevisionSubmitted && checks.allowsPendingReview && checks.blocksReviewerWrites) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🏁 Resubmit RLS fix applied AND verified. Run:');
    console.log('  node scripts/browser-pass.mjs');
    console.log('  → the STEP 6 rejection round-trip must now reach buddy_approved');
    console.log('═══════════════════════════════════════════════════════\n');
  } else {
    console.error('\n⚠️  Verification FAILED — live policy does not match the intended fix. Investigate.\n');
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
