// =============================================================================
// Migration: multi-tenant Phase 9 — data migration & backward compatibility
// =============================================================================
// Usage:
//   node scripts/migrate_to_multi_tenant.mjs               # run against Supabase
//   node scripts/migrate_to_multi_tenant.mjs --dry-run     # preview only
//
// What it does (all idempotent — safe to re-run):
//   1. Creates the default campus if it doesn't exist
//   2. Backfills campus_id on all user_profiles rows (→ default campus)
//   3. Backfills campus_id on worksheet_submissions rows (from user's profile)
//   4. Backfills campus_id on notifications rows (from user's profile)
//   5. Backfills campus_id on promotion_required_worksheets rows (→ default)
//   6. Seeds the default onboarding template from the shared structure module
//      (only if no default template exists for the default campus)
//   7. Writes audit_logs entries documenting the migration
//   8. Verifies data integrity — no rows left with NULL campus_id, and
//      reports any orphaned rows
//
// Requires VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (or service role
// key) in .env — same convention as the other scripts.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildStructure } from './template_structure.mjs';

// ─── Load .env ──────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// ─── Parse args ─────────────────────────────────────────
const args = process.argv.slice(2);
const DEFAULT_CAMPUS_SLUG = process.env.VITE_DEFAULT_CAMPUS_SLUG || 'default';
const DRY_RUN = args.includes('--dry-run');

// ─── Helpers ────────────────────────────────────────────
// name → primary-key column (promotion_required_worksheets uses worksheet_id)
const tables = [
  { name: 'user_profiles', idCol: 'id' },
  { name: 'worksheet_submissions', idCol: 'id' },
  { name: 'notifications', idCol: 'id' },
  { name: 'promotion_required_worksheets', idCol: 'worksheet_id' },
];

/** Format a PostgREST error including its structured fields. */
function errInfo(error) {
  if (!error) return 'unknown error';
  const parts = [error.message || 'no message'];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  return parts.join(' | ');
}

async function countNullCampus(client, table, idCol) {
  const { count, error } = await client
    .from(table)
    .select(idCol, { count: 'exact', head: true })
    .is('campus_id', null);
  if (error) throw new Error(`${table}: ${errInfo(error)}`);
  return count ?? 0;
}

async function countAll(client, table, idCol) {
  const { count, error } = await client
    .from(table)
    .select(idCol, { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${errInfo(error)}`);
  return count ?? 0;
}

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Multi-Tenant Phase 9 — Data Migration             ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
    process.exit(1);
  }

  /** Print an actionable hint when a write is blocked by RLS. */
  function exitWithHint(action, err) {
    const msg = errInfo(err);
    console.error(`❌ Failed to ${action}: ${msg}`);
    if (/row-level security|permission denied|rls/i.test(msg) && !serviceKey) {
      console.error('💡 This looks like an RLS block. Add VITE_SUPABASE_SERVICE_ROLE_KEY to .env and re-run — the script is idempotent.');
    }
    process.exit(1);
  }

  const supabase = createClient(url, key, { realtime: { transport: WebSocket } });
  const client = serviceKey
    ? createClient(url, serviceKey, { realtime: { transport: WebSocket } })
    : supabase;

  if (DRY_RUN) console.log('📋 DRY-RUN mode — no changes will be written\n');
  if (serviceKey) console.log('🔑 Using service-role client (bypasses RLS)\n');
  else {
    console.log('ℹ️  Using anon client — if updates fail with RLS errors, add VITE_SUPABASE_SERVICE_ROLE_KEY to .env\n');
    console.log('⚠️  NOTE: with the anon key, row counts are RLS-filtered (understated).\n    The backfill and verification below CANNOT confirm completeness —\n    re-run with VITE_SUPABASE_SERVICE_ROLE_KEY to trust the numbers.\n');
  }

  // ── Step 1: Ensure default campus exists ─────────────────────────
  console.log('── Step 1: Default campus ──');
  let { data: campus } = await client
    .from('campuses')
    .select('id, name, slug')
    .eq('slug', DEFAULT_CAMPUS_SLUG)
    .maybeSingle();

  if (campus) {
    console.log(`✅ Campus "${DEFAULT_CAMPUS_SLUG}" already exists (${campus.name})`);
  } else {
    if (DRY_RUN) {
      console.log(`📋 Would create campus "${DEFAULT_CAMPUS_SLUG}"`);
      campus = null;
    } else {
      const { data: newCampus, error: campusErr } = await client
        .from('campuses')
        .insert({
          name: 'Default Campus',
          slug: DEFAULT_CAMPUS_SLUG,
          branding: { name: 'NST BLR · AARAMBH', theme_color: '#D4A853', welcome_message: 'Welcome to NST BLR · AARAMBH' },
        })
        .select('id, name, slug')
        .single();
      if (campusErr) {
        exitWithHint('create campus', campusErr);
      }
      campus = newCampus;
      console.log(`✅ Created campus "${DEFAULT_CAMPUS_SLUG}" (${campus.name})`);
    }
  }

  if (!campus) {
    console.error('❌ Cannot proceed without a default campus. Run without --dry-run first.');
    process.exit(1);
  }
  const defaultCampusId = campus.id;

  // ── Step 2: Backfill campus_id on user_profiles ─────────────────
  console.log('\n── Step 2: user_profiles.campus_id ──');
  const profilesNull = await countNullCampus(client, 'user_profiles', 'id');
  const profilesTotal = await countAll(client, 'user_profiles', 'id');
  console.log(`   Rows missing campus_id: ${profilesNull} / ${profilesTotal}`);

  if (profilesNull > 0 && !DRY_RUN) {
    const { error: upErr } = await client
      .from('user_profiles')
      .update({ campus_id: defaultCampusId })
      .is('campus_id', null);
    if (upErr) {
      exitWithHint('backfill user_profiles', upErr);
    }
    console.log(`✅ Backfilled ${profilesNull} user_profiles → ${DEFAULT_CAMPUS_SLUG}`);
  } else if (profilesNull > 0) {
    console.log(`📋 Would backfill ${profilesNull} user_profiles → ${DEFAULT_CAMPUS_SLUG}`);
  }

  // ── Step 3+4: Backfill from user's profile campus ────────────────
  for (const table of ['worksheet_submissions', 'notifications']) {
    console.log(`\n── Step ${table === 'worksheet_submissions' ? '3' : '4'}: ${table}.campus_id ──`);
    const nullCount = await countNullCampus(client, table, 'id');
    const total = await countAll(client, table, 'id');
    console.log(`   Rows missing campus_id: ${nullCount} / ${total}`);

    if (nullCount > 0 && !DRY_RUN) {
      // Map each row's user_id → their profile's campus_id (fallback: default campus)
      const { data: rows, error: rowsErr } = await client
        .from(table)
        .select('id, user_id')
        .is('campus_id', null);
      if (rowsErr) {
        exitWithHint(`fetch NULL-campus ${table} rows`, rowsErr);
      }

      // Fetch campus ids for all affected users in one query
      const userIds = [...new Set((rows || []).map(r => r.user_id).filter(Boolean))];
      const campusByUser = new Map();
      if (userIds.length > 0) {
        const { data: profiles, error: profErr } = await client
          .from('user_profiles')
          .select('id, campus_id')
          .in('id', userIds);
        if (profErr) {
          exitWithHint('fetch user profiles', profErr);
        }
        for (const p of profiles || []) {
          if (p.campus_id) campusByUser.set(p.id, p.campus_id);
        }
      }

      // Batch updates — group rows by target campus_id to minimize requests
      const byCampus = new Map();
      for (const row of rows || []) {
        const targetCampus = campusByUser.get(row.user_id) || defaultCampusId;
        if (!byCampus.has(targetCampus)) byCampus.set(targetCampus, []);
        byCampus.get(targetCampus).push(row.id);
      }

      // PostgREST has a URL-length limit, so chunk id lists into batches
      const CHUNK_SIZE = 500;
      let updated = 0;
      for (const [targetCampus, ids] of byCampus) {
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          const { error: updErr } = await client
            .from(table)
            .update({ campus_id: targetCampus })
            .in('id', chunk);
          if (updErr) {
            exitWithHint(`backfill ${table}`, updErr);
          }
          updated += chunk.length;
        }
      }
      console.log(`✅ Backfilled ${updated} ${table} rows from user profile campuses`);
    } else if (nullCount > 0) {
      console.log(`📋 Would backfill ${nullCount} ${table} rows`);
    }
  }

  // ── Step 5: promotion_required_worksheets → default campus ───────
  console.log('\n── Step 5: promotion_required_worksheets.campus_id ──');
  const promNull = await countNullCampus(client, 'promotion_required_worksheets', 'worksheet_id');
  const promTotal = await countAll(client, 'promotion_required_worksheets', 'worksheet_id');
  console.log(`   Rows missing campus_id: ${promNull} / ${promTotal}`);

  if (promNull > 0 && !DRY_RUN) {
    const { error: promErr } = await client
      .from('promotion_required_worksheets')
      .update({ campus_id: defaultCampusId })
      .is('campus_id', null);
    if (promErr) {
      exitWithHint('backfill promotion_required_worksheets', promErr);
    }
    console.log(`✅ Backfilled ${promNull} promotion_required_worksheets → ${DEFAULT_CAMPUS_SLUG}`);
  } else if (promNull > 0) {
    console.log(`📋 Would backfill ${promNull} promotion_required_worksheets → ${DEFAULT_CAMPUS_SLUG}`);
  }

  // ── Step 6: Seed default onboarding template ─────────────────────
  console.log('\n── Step 6: Default onboarding template ──');
  const { data: existingTemplate } = await client
    .from('onboarding_templates')
    .select('id, name, is_default')
    .eq('campus_id', defaultCampusId)
    .eq('is_default', true)
    .maybeSingle();

  if (existingTemplate) {
    console.log(`✅ Default template already exists (${existingTemplate.name})`);
  } else {
    if (DRY_RUN) {
      console.log('📋 Would seed default onboarding template (4 weeks, 3 phases, 4 gates)');
    } else {
      const structure = buildStructure();
      const { error: tplErr } = await client
        .from('onboarding_templates')
        .insert({
          campus_id: defaultCampusId,
          name: 'Default Onboarding',
          description: 'The standard NST BLR · AARAMBH onboarding programme with 4 FTP weeks and 3 legacy phases.',
          structure,
          approval_chain: ['lead_instructor', 'academic_head'],
          is_active: true,
          is_default: true,
        });
      if (tplErr) {
        exitWithHint('seed default template', tplErr);
      }
      console.log('✅ Seeded default onboarding template (4 weeks, 3 phases, 4 gates)');
    }
  }

  // ── Step 7: Audit log entries ────────────────────────────────────
  console.log('\n── Step 7: Audit logs ──');
  if (!DRY_RUN) {
    const { error: auditErr } = await client
      .from('audit_logs')
      .insert({
        campus_id: defaultCampusId,
        user_id: null,
        action: 'data_migration.multi_tenant_backfill',
        resource_type: 'campus',
        resource_id: defaultCampusId,
        details: {
          default_campus_slug: DEFAULT_CAMPUS_SLUG,
          tables_backfilled: tables.map(t => t.name),
          ran_by: 'scripts/migrate_to_multi_tenant.mjs',
        },
      });
    if (auditErr) {
      console.error(`⚠️  Failed to write audit log (non-fatal): ${auditErr.message}`);
    } else {
      console.log('✅ Audit log entry written');
    }
  } else {
    console.log('📋 Would write audit log entry');
  }

  // ── Step 8: Verify integrity ─────────────────────────────────────
  console.log('\n── Step 8: Data integrity verification ──');
  let allClean = true;

  for (const table of tables) {
    // Same read-only check in both modes — dry-run just doesn't write anything
    const remaining = await countNullCampus(client, table.name, table.idCol);
    const status = remaining === 0 ? '✅' : '❌';
    if (remaining > 0) allClean = false;
    console.log(`   ${status} ${table.name}: ${remaining} row(s) with NULL campus_id`);
  }

  // Orphaned rows — submissions/notifications whose user has no profile
  for (const table of ['worksheet_submissions', 'notifications']) {
    const { data: rows, error: rowsErr } = await client
      .from(table)
      .select('user_id')
      .not('user_id', 'is', null);
    if (rowsErr) continue;

    const userIds = [...new Set((rows || []).map(r => r.user_id))];
    let orphans = 0;
    if (userIds.length > 0) {
      const { data: profiles } = await client
        .from('user_profiles')
        .select('id')
        .in('id', userIds);
      const profileIds = new Set((profiles || []).map(p => p.id));
      orphans = userIds.filter(id => !profileIds.has(id)).length;
    }
    if (orphans > 0) {
      allClean = false;
      console.log(`   ⚠️  ${table}: ${orphans} row(s) reference users with no profile (orphans)`);
    } else {
      console.log(`   ✅ ${table}: no orphaned rows`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  if (allClean) {
    console.log('🏁 Migration verified — all campus_ids assigned, no orphans.');
  } else {
    console.log('⚠️  Migration complete but some rows still need attention (see above).');
  }
  if (!serviceKey) {
    console.log('⚠️  Counts above were read with the anon key and are RLS-filtered.');
    console.log('    This verdict only confirms NO ERRORS occurred — add VITE_SUPABASE_SERVICE_ROLE_KEY to .env and re-run to verify real completeness.');
  }
  if (DRY_RUN) console.log('\n(DRY-RUN — nothing was written. Re-run without --dry-run to apply.)');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
