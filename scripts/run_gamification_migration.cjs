#!/usr/bin/env node
/**
 * Applies the gamification migration to the live database via the Supabase
 * Management API. Creates the XP/level/streak profiles, XP events, persisted
 * achievements, completion certificates, the XP trigger on worksheet
 * submissions, the leaderboard + achievement-sync RPCs, and RLS policies.
 *
 * The migration file is fully idempotent — safe to re-run.
 *
 * Usage:
 *   SUPABASE_PAT=<token> node scripts/run_gamification_migration.cjs
 *
 * Get your Personal Access Token (PAT):
 *   Supabase Dashboard → Settings → API → Personal Access Tokens → "Generate New Token"
 * The token needs scope: "Database" or "All".
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_PROJECT_REF = 'fuoqoryqndtdooujslee';
const MANAGEMENT_API = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`;
const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260812000001_gamification.sql');

const pat = process.env.SUPABASE_PAT;
if (!pat) {
  console.error('');
  console.error('❌ SUPABASE_PAT environment variable is required.');
  console.error('');
  console.error('Get your Personal Access Token:');
  console.error('  Supabase Dashboard → Settings → API → Personal Access Tokens');
  console.error('');
  console.error('Then run:');
  console.error('  SUPABASE_PAT=<token> node scripts/run_gamification_migration.cjs');
  console.error('');
  process.exit(1);
}

if (!fs.existsSync(MIGRATION_FILE)) {
  console.error(`❌ Migration file not found: ${MIGRATION_FILE}`);
  process.exit(1);
}

const MIGRATION_SQL = fs.readFileSync(MIGRATION_FILE, 'utf-8');

// Read-only post-apply verification: every object the migration creates must exist.
const VERIFY_QUERY = `
  SELECT
    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN
      ('gamification_profiles','xp_events','user_achievements','completion_certificates')) AS tables_ok,
    (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN
      ('can_view_user_gamification','award_xp_on_worksheet_event','gamify_level','gamify_phase_of_worksheet','gamify_phase_sheets','sync_achievement_unlocks','get_campus_leaderboard')) AS functions_ok,
    (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_award_xp_on_worksheet_event' AND NOT tgisinternal) AS trigger_ok,
    (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname IN ('gamification_profiles','xp_events','user_achievements','completion_certificates')) AS policies_ok`;

async function apply() {
  const response = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query: MIGRATION_SQL }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`  ❌ Apply error (${response.status}): ${body.substring(0, 500)}`);
    return false;
  }
  console.log('  ✅ Migration SQL applied (idempotent — safe to re-run)');
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
  const v = rows?.[0];
  if (!v) throw new Error('verification returned no rows');
  return {
    tablesOk: Number(v.tables_ok) === 4,
    functionsOk: Number(v.functions_ok) === 7,
    triggerOk: Number(v.trigger_ok) === 1,
    policiesOk: Number(v.policies_ok) >= 4,
    raw: v,
  };
}

async function run() {
  console.log('\n─── Gamification migration: XP, streaks, achievements, certificates ───\n');
  console.log(`  Applying ${path.basename(MIGRATION_FILE)} to live DB...\n`);

  const applied = await apply();
  if (!applied) {
    console.error('\n⚠️  Apply FAILED. See errors above.\n');
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

  console.log(`  ${checks.tablesOk ? '✅' : '❌'} 4 gamification tables exist`);
  console.log(`  ${checks.functionsOk ? '✅' : '❌'} 7 functions/trigger-body exist`);
  console.log(`  ${checks.triggerOk ? '✅' : '❌'} XP trigger installed on worksheet_submissions`);
  console.log(`  ${checks.policiesOk ? '✅' : '❌'} RLS policies installed (>= 4)`);

  if (checks.tablesOk && checks.functionsOk && checks.triggerOk && checks.policiesOk) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🏁 Gamification migration applied AND verified. The app will');
    console.log('   now show XP/levels/streaks, persist achievements, award the');
    console.log('   certificate on completion, and power the campus leaderboard.');
    console.log('═══════════════════════════════════════════════════════\n');
  } else {
    console.error('\n⚠️  Verification FAILED — some objects are missing. Investigate before relying on gamification.\n');
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
