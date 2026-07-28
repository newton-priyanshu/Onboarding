// =============================================================================
// Migration: migrate hardcoded onboarding config to DB-backed templates
// =============================================================================
// Usage:  node scripts/migrate_templates.mjs
//
// Reads the hardcoded onboarding structure from worksheetConfigData.ts and
// inserts (or updates) it as JSONB in the onboarding_templates table.
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

// ─── Config sources (mirrors worksheetConfigData.ts) ─────
// Note: This script generates the JSONB structure programmatically
// rather than importing TypeScript files at runtime.

const WEEKS = [
  {
    num: 1,
    title: 'Anchor',
    subtitle: 'Observe begins',
    days: 'Week 1',
    theme: 'Context before content — functional means operational',
    worksheets: [
      { id: 'p1_w5', num: 1, title: 'Systems & Platform Walkthrough', reviewer: 'onboarding_lead', engineTag: 'K' },
      { id: 'p1_w6', num: 2, title: 'Structured Observation — Recorded Lectures', reviewer: 'buddy', engineTag: 'K' },
      { id: 'p1_w3', num: 3, title: 'Culture-in-Delivery Opening', reviewer: 'buddy', engineTag: 'B' },
      { id: 'w1_o1', num: 4, title: 'Day 1 Logistics & Access', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w1_e1', num: 5, title: 'Contest Guidelines V3 Pre-read', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w1_o2', num: 6, title: 'Playbook Scavenger Exercise', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w1_g1', num: 7, title: 'Gate 1 — Anchor Artifacts', reviewer: 'buddy', engineTag: 'K', isGate: true },
    ],
  },
  {
    num: 2,
    title: 'Co-create',
    subtitle: 'Observe deepens',
    days: 'Week 2',
    theme: 'Content creation to the zero-error standard',
    worksheets: [
      { id: 'p2_w3', num: 1, title: 'Question Creation Mechanics', reviewer: 'buddy', engineTag: 'K' },
      { id: 'p1_w7', num: 2, title: 'The Quality Standard', reviewer: 'buddy', engineTag: 'K' },
      { id: 'p1_w6', num: 3, title: 'Recorded Lectures — TLAC Lens', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w2_e1', num: 4, title: "Bloom's Two-Pens Session", reviewer: 'buddy', engineTag: 'K' },
      { id: 'w2_c3', num: 5, title: 'Create & Peer Review', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w2_d2', num: 6, title: 'Micro-Teach #1', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w2_b1', num: 7, title: 'Discipline Consistency', reviewer: 'buddy', engineTag: 'B' },
      { id: 'w2_o1', num: 8, title: 'Invigilation & Exam Formalities', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w2_g1', num: 9, title: 'Gate 2 — Co-create Artifacts', reviewer: 'buddy', engineTag: 'K', isGate: true },
    ],
  },
  {
    num: 3,
    title: 'Co-deliver',
    subtitle: 'Deliver under observation',
    days: 'Week 3',
    theme: 'The rubric enters the room',
    worksheets: [
      { id: 'p2_w1', num: 1, title: 'Engagement & Active Learning', reviewer: 'buddy', engineTag: 'K' },
      { id: 'p2_w2', num: 2, title: 'Demo Dry-Run', reviewer: 'buddy', engineTag: 'K' },
      { id: 'p2_w4', num: 3, title: 'Slot Creation & Attendance Flow', reviewer: 'onboarding_lead', engineTag: 'K' },
      { id: 'p3_w5', num: 4, title: 'Build Full Lecture Package', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w3_d1', num: 5, title: 'Classroom Tech Hands-on', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w3_d2', num: 6, title: 'Planning & Time Management', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w3_e1', num: 7, title: 'Design Mini-Contest', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w3_b1', num: 8, title: 'Student Dialoguing Rehearsal', reviewer: 'buddy', engineTag: 'B' },
      { id: 'w3_g1', num: 9, title: 'Gate 3 — Co-deliver Artifacts', reviewer: 'buddy', engineTag: 'K', isGate: true },
    ],
  },
  {
    num: 4,
    title: 'Independence Review',
    subtitle: 'Co-deliver closes',
    days: 'Week 4',
    theme: 'Feedback incorporated, real conditions rehearsed, release decided',
    worksheets: [
      { id: 'p3_w1', num: 1, title: 'Demo Final', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w4_d2', num: 2, title: 'Co-Teach / Mock Classroom', reviewer: 'buddy', engineTag: 'B' },
      { id: 'p3_w5', num: 3, title: 'Lecture Package v2 — Final Approval', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w4_e1', num: 4, title: 'Post-Contest Analysis & Calibration', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w4_o1', num: 5, title: 'Pre-Semester Checklist', reviewer: 'buddy', engineTag: 'K' },
      { id: 'w4_b1', num: 6, title: 'Why We Reflect', reviewer: 'buddy', engineTag: 'B' },
      { id: 'w4_g1', num: 7, title: 'Gate 4 — Independence Readiness', reviewer: 'buddy', engineTag: 'K', isGate: true },
    ],
  },
];

const PHASES = [
  {
    num: 1,
    title: 'Phase 1 — Orientation',
    days: 'Days 1–30',
    worksheets: ['p1_w5', 'p1_w6', 'p1_w3', 'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1', 'p1_w1', 'p1_w2', 'p1_w4', 'p1_w8', 'gc1'],
  },
  {
    num: 2,
    title: 'Phase 2 — Contribution',
    days: 'Days 31–60',
    worksheets: ['p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2'],
  },
  {
    num: 3,
    title: 'Phase 3 — Ownership',
    days: 'Days 61–90',
    worksheets: ['p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3'],
  },
];

const GATE_ARTIFACTS = {
  w1_g1: [
    { label: 'Operational checklist complete (Lakshita\'s list)', required: true },
    { label: '3 structured observation logs (TLAC-lens)', required: true },
    { label: 'Completed playbook scavenger sheet', required: true },
    { label: 'Written reflection #0 in why-we-reflect format', required: true },
    { label: 'Platform walkthrough verification complete', required: false },
  ],
  w2_g1: [
    { label: 'Question set (3 MCQ, 2 coding) created & peer-reviewed', required: true },
    { label: 'Peer reviews authored for another hire', required: true },
    { label: 'Bloom\'s two-pens tagging sheet on real past questions', required: true },
    { label: 'Class Discipline Customisation Sheet draft', required: true },
    { label: 'Micro-teach #1 completed with rubric-lite feedback', required: false },
  ],
  w3_g1: [
    { label: 'Demo dry-run delivered + rubric sheets filed', required: true },
    { label: 'Written response to demo feedback', required: true },
    { label: 'Lecture package v1 (slides + quiz + assignment + notes)', required: true },
    { label: 'Mini-contest paper with peer L1 pass', required: true },
    { label: 'Customisation Sheet complete and submitted', required: true },
  ],
  w4_g1: [
    { label: 'Demo final delivered — Course Lead signed rubric', required: true },
    { label: 'Lecture package v2 approved (20% rule applied)', required: true },
    { label: 'Own pre-semester checklist completed', required: true },
    { label: 'Reflection #1 filed', required: true },
    { label: 'Customisation Sheet signed by Course Lead', required: true },
  ],
};

// Build the full structure
function buildStructure() {
  return {
    weeks: WEEKS,
    phases: PHASES,
    gateArtifacts: GATE_ARTIFACTS,
  };
}

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
