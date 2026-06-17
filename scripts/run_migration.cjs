/**
 * Supabase Migration Runner
 *
 * Runs migration SQL files via the Supabase Management API.
 * Uses the pg_query endpoint to execute raw SQL statements.
 *
 * Usage:
 *   SUPABASE_PAT=<token> node scripts/run_migration.cjs
 *
 * Get your Personal Access Token (PAT):
 *   Supabase Dashboard → Settings → API → Personal Access Tokens → "Generate New Token"
 *
 * The token needs scope: "Database" or "All"
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
  console.error('  SUPABASE_PAT=<token> node scripts/run_migration.cjs');
  console.error('');
  process.exit(1);
}

// The migrations to run, in order
const MIGRATIONS = [
  {
    file: 'scripts/setup/__migration_notifications_dates.sql',
    description: 'Notifications table + due_date column + review_status constraint',
  },
  {
    file: 'scripts/setup/__due_date_notifications.sql',
    description: 'Automated due_soon/overdue notification function',
  },
];

async function run() {
  const fs = await import('fs');

  for (const migration of MIGRATIONS) {
    console.log(`\n─── ${migration.description} ───`);
    console.log(`  File: ${migration.file}`);

    const sql = fs.readFileSync(migration.file, 'utf-8');

    // Split into individual statements (semicolons, skip empty/comment lines)
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Skip commented-out pg_cron lines
      if (stmt.startsWith('--') || stmt.startsWith('SELECT cron.')) continue;

      console.log(`  Running statement ${i + 1}/${statements.length}...`);

      try {
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
          const errorBody = await response.text();
          // Ignore "already exists" errors — these are expected with IF NOT EXISTS / IF EXISTS
          if (errorBody.includes('already exists') || errorBody.includes('duplicate')) {
            console.log(`  ⚠️  Already exists (skipped): ${stmt.substring(0, 60)}...`);
            successCount++;
          } else {
            console.error(`  ❌ Error (${response.status}):`, errorBody.substring(0, 200));
            failCount++;
          }
        } else {
          console.log(`  ✅ OK: ${stmt.substring(0, 60)}...`);
          successCount++;
        }
      } catch (err) {
        console.error(`  ❌ Network error:`, err.message);
        failCount++;
      }
    }

    console.log(`  → ${successCount} succeeded, ${failCount} failed`);

    if (failCount > 0) {
      console.error('\n⚠️  Some statements failed. Continuing with next migration...\n');
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('🏁 Migration run complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Enable pg_cron in Supabase Dashboard:');
  console.log('     Database → Extensions → search "pg_cron" → Enable');
  console.log('  2. Schedule the due_date notification job:');
  console.log('     Run this in Supabase SQL Editor:');
  console.log('');
  console.log('     SELECT cron.schedule(');
  console.log("       'check-due-date-notifications',");
  console.log("       '30 2 * * *',");
  console.log("       $$SELECT check_due_date_notifications()$$");
  console.log('     );');
  console.log('');
  console.log('  3. Test the notification function:');
  console.log('     SELECT * FROM check_due_date_notifications();');
  console.log('');
  console.log('  4. Verify the notifications table:');
  console.log('     SELECT * FROM notifications LIMIT 5;');
  console.log('═══════════════════════════════════════');
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
