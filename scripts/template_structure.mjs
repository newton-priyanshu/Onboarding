// =============================================================================
// template_structure.mjs — Shared onboarding template structure
// =============================================================================
// Mirrors the hardcoded onboarding structure from worksheetConfigData.ts and
// weeklyWorksheets.ts. Used by:
//   - scripts/migrate_templates.mjs          (create custom campus templates)
//   - scripts/migrate_to_multi_tenant.mjs    (seed default template for Phase 9)
//
// Single source of truth for the programmatic structure so both scripts stay
// in sync with the Phase 0 SQL seed (supabase/migrations/20260727000001_*).
// =============================================================================

export const WEEKS = [
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

export const PHASES = [
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

export const GATE_ARTIFACTS = {
  w1_g1: [
    { label: "Operational checklist complete (Lakshita's list)", required: true },
    { label: '3 structured observation logs (TLAC-lens)', required: true },
    { label: 'Completed playbook scavenger sheet', required: true },
    { label: 'Written reflection #0 in why-we-reflect format', required: true },
    { label: 'Platform walkthrough verification complete', required: false },
  ],
  w2_g1: [
    { label: 'Question set (3 MCQ, 2 coding) created & peer-reviewed', required: true },
    { label: 'Peer reviews authored for another hire', required: true },
    { label: "Bloom's two-pens tagging sheet on real past questions", required: true },
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

// Build the full JSONB structure
export function buildStructure() {
  return {
    weeks: WEEKS,
    phases: PHASES,
    gateArtifacts: GATE_ARTIFACTS,
  };
}
