#!/usr/bin/env node
/**
 * Applies supabase/migrations/20260807000000_fix_review_state_machine_trigger.sql
 * to the live database via the Supabase Management API.
 *
 * Fixes BUG-1/BUG-2 from docs/E2E_BUG_REPORT.md — the live DB runs a
 * divergent, weaker `validate_review_transition` trigger that allows owners to
 * self-approve worksheets and managers to approve without a buddy step.
 *
 * Usage:
 *   SUPABASE_PAT=<token> node scripts/run_review_trigger_fix.cjs
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
  console.error('  SUPABASE_PAT=<token> node scripts/run_review_trigger_fix.cjs');
  console.error('');
  process.exit(1);
}

/** Split SQL into top-level statements, respecting dollar-quoted bodies. */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let inSingleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] || '';

    if (!inDollarQuote && !inSingleQuote && ch === '-' && next === '-') inLineComment = true;
    if (inLineComment && ch === '\n') inLineComment = false;
    if (!inDollarQuote && !inLineComment && ch === "'") inSingleQuote = !inSingleQuote;

    if (!inSingleQuote && !inLineComment && ch === '$') {
      if (!inDollarQuote) {
        let tag = '';
        let j = i + 1;
        while (j < sql.length && sql[j] !== '$') {
          if (sql[j] === '\n' || sql[j] === '\r' || sql[j] === ' ') break;
          tag += sql[j];
          j++;
        }
        if (j < sql.length && sql[j] === '$') {
          inDollarQuote = true;
          dollarTag = tag;
          current += ch + tag + '$';
          i = j;
          continue;
        }
      } else {
        let j = i + 1;
        let tag = '';
        while (j < sql.length && sql[j] !== '$') {
          if (sql[j] === '\n' || sql[j] === '\r' || sql[j] === ' ') break;
          tag += sql[j];
          j++;
        }
        if (j < sql.length && sql[j] === '$' && tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
          current += '$' + tag + '$';
          i = j;
          continue;
        }
      }
    }

    if (!inDollarQuote && !inSingleQuote && !inLineComment && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements.filter(s => !/^\s*(--|SELECT\s+cron\.|UPDATE\s+auth\.users)/i.test(s));
}

function stmtPreview(stmt) {
  return (stmt.split('\n')[0] || '').substring(0, 100).trim();
}

async function run() {
  const fs = await import('fs');
  const file = 'supabase/migrations/20260807000000_fix_review_state_machine_trigger.sql';
  const sql = fs.readFileSync(file, 'utf-8');
  const statements = splitSqlStatements(sql);

  console.log(`\n─── BUG-1/BUG-2: Re-apply canonical validate_review_transition trigger ───`);
  console.log(`  File: ${file}`);
  console.log(`  Found ${statements.length} top-level statement(s).\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmtPreview(stmt);
    console.log(`  [${i + 1}/${statements.length}] ${preview}...`);
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
        if (errorBody.includes('already exists') || errorBody.includes('duplicate')) {
          console.log(`  ⚠️  Already exists (skipped): ${preview}`);
          successCount++;
        } else {
          console.error(`  ❌ Error (${response.status}): ${errorBody.substring(0, 300)}`);
          failCount++;
        }
      } else {
        console.log(`  ✅ OK`);
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ Network error: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n  → ${successCount} succeeded, ${failCount} failed`);
  if (failCount > 0) {
    console.error('\n⚠️  Some statements failed. See above for details.\n');
    process.exitCode = 1;
    return;
  }

  const { verifyReviewTrigger } = await import('./verify_review_trigger.mjs');
  console.log('\n─── Post-apply verification ───');
  const verified = await verifyReviewTrigger({ pat, apiUrl: MANAGEMENT_API });

  if (verified.error) {
    console.error(`  ❌ Verification query failed: ${verified.error}`);
    process.exitCode = 1;
    return;
  }

  if (!verified.allPass) {
    console.error('\n⚠️  Verification FAILED — the live DB is still running the weak/divergent trigger. Investigate before re-running the full-flow test.\n');
    process.exitCode = 1;
    return;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🏁 Trigger fix applied AND verified. Run:');
  console.log('  node scripts/full-flow-test.mjs');
  console.log('  → the "joinee cannot self-approve" check must flip to ✅');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
