#!/usr/bin/env node
/**
 * Supabase RLS Security Migration Runner (v2)
 *
 * Runs the CRITICAL RLS security fixes via the Supabase Management API.
 * Properly handles dollar-quoted function bodies ($$...$$) that contain semicolons.
 *
 * Usage:
 *   SUPABASE_PAT=<token> node scripts/run_rls_migration.cjs
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
  console.error('  SUPABASE_PAT=<token> node scripts/run_rls_migration.cjs');
  console.error('');
  process.exit(1);
}

/**
 * Split SQL text into individual top-level statements.
 * Handles dollar-quoted strings ($$...$$) that may contain semicolons inside function bodies.
 */
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
    const prev = sql[i - 1] || '';

    // Track line comments
    if (!inDollarQuote && !inSingleQuote && ch === '-' && next === '-') {
      inLineComment = true;
    }
    if (inLineComment && ch === '\n') {
      inLineComment = false;
    }

    // Track single quotes (simplified - doesn't handle escaped quotes)
    if (!inDollarQuote && !inLineComment && ch === "'") {
      inSingleQuote = !inSingleQuote;
    }

    // Track dollar quotes (both $$ and $tag$)
    if (!inSingleQuote && !inLineComment && ch === '$') {
      if (!inDollarQuote) {
        // Starting a dollar quote - find the tag
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
        // Maybe ending a dollar quote - check for $tag$
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

    // Split on semicolons (only when not inside any quoted context)
    if (!inDollarQuote && !inSingleQuote && !inLineComment && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  // Don't forget the last statement if no trailing semicolon
  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements.filter(s => !/^\s*(--|SELECT\s+cron\.|UPDATE\s+auth\.users)/i.test(s));
}

/**
 * Extract the first meaningful line of a statement for display
 */
function stmtPreview(stmt) {
  const firstLine = stmt.split('\n')[0] || '';
  return firstLine.substring(0, 100).trim();
}

async function run() {
  const fs = await import('fs');

  const MIGRATIONS = [
    {
      file: 'supabase_migration_fix_rls_security.sql',
      description: 'CRITICAL RLS security fixes — JWT role, WITH CHECK, signup, notifications, schema',
    },
  ];

  for (const migration of MIGRATIONS) {
    console.log(`\n─── ${migration.description} ───`);
    console.log(`  File: ${migration.file}\n`);

    const sql = fs.readFileSync(migration.file, 'utf-8');
    const statements = splitSqlStatements(sql);

    console.log(`  Found ${statements.length} top-level statement(s) to execute.\n`);

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
          // Ignore "already exists" errors — expected with IF NOT EXISTS / IF EXISTS
          if (
            errorBody.includes('already exists') ||
            errorBody.includes('duplicate') ||
            errorBody.includes('already')
          ) {
            console.log(`  ⚠️  Already exists (skipped): ${preview}`);
            successCount++;
          } else {
            console.error(`  ❌ Error (${response.status}): ${errorBody.substring(0, 200)}`);
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
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('🏁 RLS migration run complete!');
  console.log('');
  console.log('Verify the migration:');
  console.log('  1. Check all RLS policies:');
  console.log('     SELECT * FROM pg_policies WHERE tablename IN (');
  console.log("       'worksheet_submissions', 'notifications', 'user_profiles'");
  console.log('     );');
  console.log('');
  console.log('  2. Test the role function:');
  console.log('     SELECT public.get_user_role();');
  console.log('');
  console.log('  3. Check the trigger exists:');
  console.log("     SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';");
  console.log('');
  console.log('  4. Verify schema columns:');
  console.log("     SELECT column_name FROM information_schema.columns");
  console.log("     WHERE table_name = 'worksheet_submissions'");
  console.log("     AND column_name IN ('due_date', 'review_history');");
  console.log('═══════════════════════════════════════');
}

run().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
