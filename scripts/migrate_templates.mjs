// =============================================================================
// Migration: migrate hardcoded onboarding config to DB-backed templates
// =============================================================================
// Usage:  node scripts/migrate_templates.mjs
//
// Reads the hardcoded onboarding structure from the shared template_structure
// module (mirrors worksheetConfigData.ts) and inserts it as JSONB in the
// onboarding_templates table.
//
// This is a one-time migration script for campus administrators to create
// custom templates. The default template is already seeded by Phase 0
// migration (20260727000001_multi_tenant_phase0.sql).
//
// Options:
//   --campus <slug>   Campus slug to assign template to (default: 'default')
//   --name <name>     Template name (default: 'Custom Onboarding')
//   --dry-run         Print JSON without inserting
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
const CAMPUS_SLUG = args.includes('--campus') ? args[args.indexOf('--campus') + 1] : 'default';
const TEMPLATE_NAME = args.includes('--name') ? args[args.indexOf('--name') + 1] : 'Custom Onboarding';
const DRY_RUN = args.includes('--dry-run');

// ─── Config source ──────────────────────────────────────
// The onboarding structure is defined in ./template_structure.mjs (shared with
// migrate_to_multi_tenant.mjs) so both scripts stay in sync.
// buildStructure() returns { weeks, phases, gateArtifacts }.

// ─── Main ───────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Template Migration Script                 ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const structure = buildStructure();

  if (DRY_RUN) {
    console.log(`📋 Dry-run: JSON structure for "${TEMPLATE_NAME}"`);
    console.log(`   Campus: ${CAMPUS_SLUG}`);
    console.log(`   Approval chain: lead_instructor → academic_head\n`);
    console.log(JSON.stringify(structure, null, 2));
    console.log('\n✅ Dry-run complete. (Use --dry-run to preview; omit to insert.)\n');
    return;
  }

  // Connect to Supabase
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(url, key, { realtime: { transport: WebSocket } });
  const serviceClient = serviceKey
    ? createClient(url, serviceKey, { realtime: { transport: WebSocket } })
    : null;

  // Get campus ID
  const { data: campus, error: campusError } = await supabase
    .from('campuses')
    .select('id, name')
    .eq('slug', CAMPUS_SLUG)
    .single();

  if (campusError || !campus) {
    console.error(`❌ Campus "${CAMPUS_SLUG}" not found:`, campusError?.message || 'No data');
    console.error('   Available campuses:');
    const { data: allCampuses } = await supabase.from('campuses').select('slug, name');
    if (allCampuses) {
      for (const c of allCampuses) {
        console.error(`   - ${c.slug} (${c.name})`);
      }
    }
    process.exit(1);
  }

  console.log(`📍 Campus: ${campus.name} (${CAMPUS_SLUG})`);

  // Build the template object
  const templatePayload = {
    campus_id: campus.id,
    name: TEMPLATE_NAME,
    description: `Custom onboarding template for ${campus.name}`,
    structure: structure,
    approval_chain: ['lead_instructor', 'academic_head'],
    is_active: true,
    is_default: false,
  };

  // Insert using service client if available (bypasses RLS)
  const client = serviceClient || supabase;

  console.log(`\n📝 Inserting template "${TEMPLATE_NAME}"...`);

  const { data: result, error: insertError } = await client
    .from('onboarding_templates')
    .insert(templatePayload)
    .select()
    .single();

  if (insertError) {
    console.error(`❌ Failed to insert template:`, insertError.message);

    if (!serviceClient && insertError.message?.includes('row-level security')) {
      console.error('\n💡 RLS policy blocked the insert. Options:');
      console.error('   1. Run with VITE_SUPABASE_SERVICE_ROLE_KEY set in .env');
      console.error('   2. Use the Supabase SQL Editor to insert manually');
      console.error('   3. Log in as super_admin and use the admin UI');
    }
    process.exit(1);
  }

  console.log(`✅ Template created successfully!`);
  console.log(`   ID: ${result.id}`);
  console.log(`   Name: ${result.name}`);
  console.log(`   Weeks: ${structure.weeks.length}`);
  console.log(`   Phases: ${structure.phases.length}`);
  console.log(`   Gate artifacts: ${Object.keys(structure.gateArtifacts).length}`);
  console.log(`   Approval chain: lead_instructor → academic_head`);

  // Print a summary of worksheets
  const totalWorksheets = structure.weeks.reduce((sum, w) => sum + w.worksheets.length, 0);
  console.log(`\n📊 Summary:`);
  console.log(`   Total worksheets (all weeks): ${totalWorksheets}`);
  console.log(`   Legacy phase worksheets: ${structure.phases.reduce((s, p) => s + p.worksheets.length, 0)}`);
  console.log(`\n✅ Migration complete.\n`);
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
