// =====================================================
// Flow & Access Control Overview
// =====================================================
//
// ┌─────────────────────────────────────────────────────────────┐
// │  4 ROLES (selectable at signup)                            │
// ├─────────────────────────────────────────────────────────────┤
// │  new_joinee        → New Joiner (fills worksheets)         │
// │  lead_instructor   → Buddy / Mentor (reviews buddy sheets) │
// │  onboarding_lead   → Onboarding Lead (reviews procedures)  │
// │                     Can also be assigned as a buddy        │
// │  academic_head     → Manager / Academic Head (reviews all) │
// └─────────────────────────────────────────────────────────────┘
//
// SUBMITTER  → new_joinee & lab_instructor only
//              (enforced by ProtectedRoute in App.jsx)
//
// REVIEWER   → Determined by WORKSHEET_REVIEWER map below:
//   buddy:           lead_instructor (Buddy/Mentor)
//   manager:         academic_head (Manager)
//   onboarding_lead: onboarding_lead
//
// OVERRIDE   → academic_head (Manager) can review ANY worksheet
//              (enforced in WorksheetReview.jsx)
//
// ASSIGNMENT → Only academic_head can assign buddy/mentor to joinee
//              (enforced in AdminDashboard.jsx)
//              Buddy candidates include lead_instructor & onboarding_lead
//
// FLOW:
//   1. Manager assigns a buddy to the new joinee
//   2. Joinee fills worksheets & submits (→ pending_review)
//   3. Buddy approves (→ buddy_approved)
//   4. Manager approves entire phase (→ approved) after all buddy_approved
//   5. If revision: Joinee sees comment, edits, resubmits (→ revision_submitted)
//   6. Reviewer re-reviews → approve or revision (repeat as needed)
//   7. All 3 phases approved → auto-promote joinee to lead_instructor
//
// =====================================================
// This file contains ONLY pure data/config and helper functions.
// React components that depend on worksheet config (ReviewerBadge,
// WORKSHEET_COMPONENTS) are in worksheetConfig.jsx.
// =====================================================

import { t } from './theme';
import { REVIEW_STATUS } from '../constants/status';
import type { WorksheetId, ReviewerType, WorksheetSubmission, EngineTag, FtpWeek, FtpSession } from '../types/supabase';

// ─── FTP 4-Week Curriculum Structure ─────────────────────
// Maps each FTP session to an existing or new worksheet.

/**
 * FTP_WEEK_SESSIONS — The complete FTP curriculum structure.
 * Each entry maps an FTP session to a worksheet ID.
 * Existing worksheets use their original ID; new FTP-only
 * sessions get new IDs (w1_a1, w2_e1, etc.).
 * isNew: true means a component template needs to be created.
 */
export const FTP_WEEK_SESSIONS: Record<FtpWeek, FtpSession[]> = {
  1: [
    {
      sessionId: 'W1-A1', week: 1, track: 'Culture', engineTag: 'B',
      title: 'Culture-in-Delivery Opening',
      subtitle: 'What NST believes about teaching — no student left behind, friction not character, the sacrosanct standard',
      worksheetId: 'p1_w3', suggestedFacilitator: 'Abhishek + leadership guest',
      artifacts: ['Written reflection on NST teaching beliefs', 'Personal commitment statement'],
    },
    {
      sessionId: 'W1-P1', week: 1, track: 'Product', engineTag: 'K',
      title: 'Systems, Topic Tree, Platform Architecture Walkthrough',
      subtitle: 'Product orientation — how the platform works end-to-end',
      worksheetId: 'p1_w5', suggestedFacilitator: 'Priyanshu',
      artifacts: ['Platform walkthrough verification checklist'],
    },
    {
      sessionId: 'W1-O1', week: 1, track: 'Operations', engineTag: 'K',
      title: 'Day 1 Logistics, Access, Buddy Assignment, Comms Policy',
      subtitle: 'Getting set up — all operational basics',
      worksheetId: 'w1_o1', isNew: true, suggestedFacilitator: 'Acad Ops',
      artifacts: ['Access verification log', 'Buddy contact confirmed', 'Comms channels joined'],
    },
    {
      sessionId: 'W1-D1', week: 1, track: 'Delivery', engineTag: 'K',
      title: 'Structured Observation — Recorded Lectures',
      subtitle: '3 recorded lectures with TLAC-lens observation sheet',
      worksheetId: 'p1_w6', suggestedFacilitator: 'Self-paced (Aadarsh sets up)',
    },
    {
      sessionId: 'W1-D2', week: 1, track: 'Delivery', engineTag: 'K',
      title: 'Live Model Lesson — Debriefed',
      subtitle: 'Senior delivers demo lesson, debriefed against observation sheet',
      worksheetId: 'p1_w6', suggestedFacilitator: 'Abhishek delivers, Aadarsh debriefs',
    },
    {
      sessionId: 'W1-E1', week: 1, track: 'Evaluation', engineTag: 'K',
      title: 'Contest Guidelines Pre-read (V3)',
      subtitle: 'Read Contest Guidelines V3 — receptivity build for W2-E1',
      worksheetId: 'w1_e1', isNew: true, suggestedFacilitator: 'Self-paced, Aadarsh checks',
      artifacts: ['V3 completion verification', '1-2 reflection questions answered'],
    },
    {
      sessionId: 'W1-O2', week: 1, track: 'Operations', engineTag: 'K',
      title: 'Playbook Scavenger Exercise',
      subtitle: 'Find-the-answer sheet across Playbook §1 to §5',
      worksheetId: 'w1_o2', isNew: true, suggestedFacilitator: 'Aadarsh',
      artifacts: ['Completed scavenger sheet'],
    },
    {
      sessionId: 'W1-C1', week: 1, track: 'Culture', engineTag: 'B',
      title: 'Commitment Hygiene',
      subtitle: 'How we say we\'ll do things here — scrum, MOM, the ledger',
      worksheetId: 'p1_w3', suggestedFacilitator: 'Aadarsh',
    },
  ],
  2: [
    {
      sessionId: 'W2-E1', week: 2, track: 'Evaluation', engineTag: 'K',
      title: "Bloom's Two-Pens Session",
      subtitle: 'Reuse Gyaanvaar Bloom v4 + workbook exactly as built',
      worksheetId: 'w2_e1', isNew: true, suggestedFacilitator: 'Any trained facilitator',
      artifacts: ['Completed Bloom tagging sheet on real past questions'],
    },
    {
      sessionId: 'W2-C1', week: 2, track: 'Content', engineTag: 'K',
      title: 'Question Creation Mechanics',
      subtitle: 'MCQ, coding, components, playgrounds — how to build them',
      worksheetId: 'p2_w3', suggestedFacilitator: 'Course Leads (subject breakouts)',
    },
    {
      sessionId: 'W2-C2', week: 2, track: 'Content', engineTag: 'K',
      title: 'The Quality Standard',
      subtitle: 'Solved-by-creator, peer review, the silent error vs the loud error',
      worksheetId: 'p1_w7', suggestedFacilitator: 'Abhishek',
    },
    {
      sessionId: 'W2-C3', week: 2, track: 'Content', engineTag: 'K',
      title: 'Create & Peer Review',
      subtitle: '3 MCQs + 2 coding questions; review a peer\'s set to the same standard',
      worksheetId: 'w2_c3', isNew: true, suggestedFacilitator: 'Course Lead reviews',
      artifacts: ['Question set (3 MCQ, 2 coding)', 'Peer review authored for another hire'],
    },
    {
      sessionId: 'W2-D1', week: 2, track: 'Delivery', engineTag: 'K',
      title: 'Recorded Lectures — TLAC Lens',
      subtitle: '2 more recorded lectures, now technique-spotting with TLAC 3.0',
      worksheetId: 'p1_w6', suggestedFacilitator: 'Self-paced, Aadarsh debriefs',
    },
    {
      sessionId: 'W2-D2', week: 2, track: 'Delivery', engineTag: 'K',
      title: 'Micro-Teach #1',
      subtitle: '10-minute segment to 3 peers — low stakes, rubric-lite feedback',
      worksheetId: 'w2_d2', isNew: true, suggestedFacilitator: 'Aadarsh coordinates',
      artifacts: ['Micro-teach rubric-lite feedback sheet'],
    },
    {
      sessionId: 'W2-B1', week: 2, track: 'Culture', engineTag: 'B',
      title: 'Discipline Consistency Session',
      subtitle: 'A rule enforced once and skipped twice is a suggestion — mirror plus rehearsal',
      worksheetId: 'w2_b1', isNew: true,
      suggestedFacilitator: 'Payal + Aadarsh co-design',
      artifacts: ['Class Discipline Customisation Sheet draft'],
    },
    {
      sessionId: 'W2-O1', week: 2, track: 'Operations', engineTag: 'K',
      title: 'Invigilation & Exam Formalities',
      subtitle: 'Policy plus scenario sheet',
      worksheetId: 'w2_o1', isNew: true, suggestedFacilitator: 'Acad Ops',
      artifacts: ['Completed invigilation scenario sheet'],
    },
  ],
  3: [
    {
      sessionId: 'W3-D1', week: 3, track: 'Delivery', engineTag: 'K',
      title: 'Classroom Tech Hands-on',
      subtitle: 'Projectors, pentabs, portal joining, recording setup',
      worksheetId: 'w3_d1', isNew: true, suggestedFacilitator: 'Acad Ops',
      artifacts: ['Tech proficiency self-assessment'],
    },
    {
      sessionId: 'W3-D2', week: 3, track: 'Delivery', engineTag: 'K',
      title: '10-Minute Window Planning & Time Management',
      subtitle: 'Pacing, transitions, timeboxing for the classroom',
      worksheetId: 'w3_d2', isNew: true, suggestedFacilitator: 'Aadarsh',
    },
    {
      sessionId: 'W3-D3', week: 3, track: 'Delivery', engineTag: 'K',
      title: 'Engagement & Active Learning',
      subtitle: 'Including the "did you understand" anti-pattern (mirror moment inside a K session)',
      worksheetId: 'p2_w1', suggestedFacilitator: 'Abhishek',
    },
    {
      sessionId: 'W3-D4', week: 3, track: 'Delivery', engineTag: 'K',
      title: 'Demo Dry-Run',
      subtitle: '30–40 minutes to a peer classroom, observed on TLAC-based rubric',
      worksheetId: 'p2_w2', suggestedFacilitator: 'Course Lead panel',
      artifacts: ['Peer observation rubric sheets', 'Written response to feedback'],
    },
    {
      sessionId: 'W3-C1', week: 3, track: 'Content', engineTag: 'K',
      title: 'Build Full Lecture Package',
      subtitle: 'Slides, in-class quiz, post-class assignment, notes — for first real week',
      worksheetId: 'p3_w5', suggestedFacilitator: 'Course Lead reviews',
      artifacts: ['Lecture package v1 (slides + quiz + assignment + notes)'],
    },
    {
      sessionId: 'W3-E1', week: 3, track: 'Evaluation', engineTag: 'K',
      title: 'Design Mini-Contest',
      subtitle: 'Balanced 12-question mini-contest against V3 + Bloom distribution',
      worksheetId: 'w3_e1', isNew: true, suggestedFacilitator: 'Course Lead L2',
      artifacts: ['Mini-contest paper with peer L1 pass'],
    },
    {
      sessionId: 'W3-B1', week: 3, track: 'Culture', engineTag: 'B',
      title: 'Student Dialoguing Rehearsal',
      subtitle: 'At-risk 1:1, publicly challenged rule, "this is basic" moment — small groups, timer, forced position-taking',
      worksheetId: 'w3_b1', isNew: true, suggestedFacilitator: 'Payal',
      artifacts: ['Dialoguing reflection sheet'],
    },
    {
      sessionId: 'W3-O1', week: 3, track: 'Operations', engineTag: 'K',
      title: 'Lecture Slot Creation & Attendance Flow',
      subtitle: 'Hands-on with scheduling and attendance systems',
      worksheetId: 'p2_w4', suggestedFacilitator: 'Acad Ops',
    },
  ],
  4: [
    {
      sessionId: 'W4-D1', week: 4, track: 'Delivery', engineTag: 'K',
      title: 'Demo Final',
      subtitle: 'Feedback incorporated, Course Lead sign-off per A.7',
      worksheetId: 'p3_w1', suggestedFacilitator: 'Course Lead panel',
      artifacts: ['Signed demo rubric', 'Course Lead sign-off'],
    },
    {
      sessionId: 'W4-D2', week: 4, track: 'Delivery', engineTag: 'B',
      title: 'Co-Teach Slot / Mock Classroom',
      subtitle: 'Either live co-teach or mock classroom with edge-case scenarios (late arrival, phone, basic question)',
      worksheetId: 'w4_d2', isNew: true, suggestedFacilitator: 'Abhishek runs mock',
      artifacts: ['Co-teach/mock observation notes'],
    },
    {
      sessionId: 'W4-C1', week: 4, track: 'Content', engineTag: 'K',
      title: 'Lecture Package v2 — Final Approval',
      subtitle: '20% rule: if reviewer edits more than 20%, fix the checklist',
      worksheetId: 'p3_w5', suggestedFacilitator: 'Course Lead',
      artifacts: ['Lecture package v2 (Course Lead approved)'],
    },
    {
      sessionId: 'W4-E1', week: 4, track: 'Evaluation', engineTag: 'K',
      title: 'Post-Contest Analysis & Calibration',
      subtitle: 'Analyze real past dataset: predict solve rates, compare to actuals, write calibration note',
      worksheetId: 'w4_e1', isNew: true, suggestedFacilitator: 'Course Lead',
      artifacts: ['Completed calibration note'],
    },
    {
      sessionId: 'W4-O1', week: 4, track: 'Operations', engineTag: 'K',
      title: 'Pre-Semester Checklist Walkthrough',
      subtitle: 'Each hire completes T-2-week checklist for their own first teaching week',
      worksheetId: 'w4_o1', isNew: true, suggestedFacilitator: 'Acad Ops + Course Lead',
      artifacts: ['Completed pre-semester checklist'],
    },
    {
      sessionId: 'W4-B1', week: 4, track: 'Culture', engineTag: 'B',
      title: 'Why We Reflect',
      subtitle: 'The note, then reflection cycle #1 for real — each hire names one commitment aloud',
      worksheetId: 'w4_b1', isNew: true, suggestedFacilitator: 'Aadarsh',
      artifacts: ['Reflection #1 filed'],
    },
  ],
};

// ─── FTP Gate Artifacts ─────────────────────────────────
// Each gate has required artifacts per the FTP spec.

export const FTP_GATE_ARTIFACTS: Record<string, { label: string; required: boolean; fromSession: string }[]> = {
  w1_g1: [
    { label: 'Operational checklist complete (Lakshita\'s list)', required: true, fromSession: 'W1-O1' },
    { label: '3 structured observation logs (TLAC-lens)', required: true, fromSession: 'W1-D1' },
    { label: 'Completed playbook scavenger sheet', required: true, fromSession: 'W1-O2' },
    { label: 'Written reflection #0 in why-we-reflect format', required: true, fromSession: 'W1-A1' },
    { label: 'Platform walkthrough verification complete', required: false, fromSession: 'W1-P1' },
  ],
  w2_g1: [
    { label: 'Question set (3 MCQ, 2 coding) created & peer-reviewed', required: true, fromSession: 'W2-C3' },
    { label: 'Peer reviews authored for another hire', required: true, fromSession: 'W2-C3' },
    { label: "Bloom's two-pens tagging sheet on real past questions", required: true, fromSession: 'W2-E1' },
    { label: 'Class Discipline Customisation Sheet draft', required: true, fromSession: 'W2-B1' },
    { label: 'Micro-teach #1 completed with rubric-lite feedback', required: false, fromSession: 'W2-D2' },
  ],
  w3_g1: [
    { label: 'Demo dry-run delivered + rubric sheets filed', required: true, fromSession: 'W3-D4' },
    { label: 'Written response to demo feedback', required: true, fromSession: 'W3-D4' },
    { label: 'Lecture package v1 (slides + quiz + assignment + notes)', required: true, fromSession: 'W3-C1' },
    { label: 'Mini-contest paper with peer L1 pass', required: true, fromSession: 'W3-E1' },
    { label: 'Customisation Sheet complete and submitted', required: true, fromSession: 'W2-B1' },
  ],
  w4_g1: [
    { label: 'Demo final delivered — Course Lead signed rubric', required: true, fromSession: 'W4-D1' },
    { label: 'Lecture package v2 approved (20% rule applied)', required: true, fromSession: 'W4-C1' },
    { label: 'Own pre-semester checklist completed', required: true, fromSession: 'W4-O1' },
    { label: 'Reflection #1 filed', required: true, fromSession: 'W4-B1' },
    { label: 'Customisation Sheet signed by Course Lead', required: true, fromSession: 'W2-B1' },
  ],
};

/** FTP_GATE_ARTIFACTS_LABEL — Display labels for each gate */
export const FTP_GATE_LABELS: Record<string, { week: number; title: string; subtitle: string }> = {
  w1_g1: { week: 1, title: 'Gate 1 — Week 1 Artifacts', subtitle: 'Anchor Phase Completion Review' },
  w2_g1: { week: 2, title: 'Gate 2 — Week 2 Artifacts', subtitle: 'Co-Create Phase Completion Review' },
  w3_g1: { week: 3, title: 'Gate 3 — Week 3 Artifacts', subtitle: 'Co-Deliver Phase Completion Review' },
  w4_g1: { week: 4, title: 'Gate 4 — Week 4 Artifacts', subtitle: 'Independence Readiness Review' },
};

/**
 * Map worksheet IDs to their FTP session IDs.
 */
export const WSID_TO_SESSION_ID: Partial<Record<string, string>> = {
  p1_w3: 'W1-A1',
  p1_w5: 'W1-P1',
  w1_o1: 'W1-O1',
  p1_w6: 'W1-D1',
  w1_e1: 'W1-E1',
  w1_o2: 'W1-O2',
  w2_e1: 'W2-E1',
  p2_w3: 'W2-C1',
  p1_w7: 'W2-C2',
  w2_c3: 'W2-C3',
  w2_d2: 'W2-D2',
  w2_b1: 'W2-B1',
  w2_o1: 'W2-O1',
  w3_d1: 'W3-D1',
  w3_d2: 'W3-D2',
  p2_w1: 'W3-D3',
  p2_w2: 'W3-D4',
  p3_w5: 'W3-C1',
  w3_e1: 'W3-E1',
  w3_b1: 'W3-B1',
  p2_w4: 'W3-O1',
  p3_w1: 'W4-D1',
  w4_d2: 'W4-D2',
  w4_e1: 'W4-E1',
  w4_o1: 'W4-O1',
  w4_b1: 'W4-B1',
};

/**
 * Map worksheet IDs to their engine tag (K = Knowledge, B = Behaviour).
 */
export const WSID_ENGINE_TAG: Partial<Record<string, EngineTag>> = {
  p1_w3: 'B',
  p1_w5: 'K',
  w1_o1: 'K',
  p1_w6: 'K',
  w1_e1: 'K',
  w1_o2: 'K',
  w2_e1: 'K',
  p2_w3: 'K',
  p1_w7: 'K',
  w2_c3: 'K',
  w2_d2: 'K',
  w2_b1: 'B',
  w2_o1: 'K',
  w3_d1: 'K',
  w3_d2: 'K',
  p2_w1: 'K',
  p2_w2: 'K',
  p3_w5: 'K',
  w3_e1: 'K',
  w3_b1: 'B',
  p2_w4: 'K',
  p3_w1: 'K',
  w4_d2: 'B',
  w4_e1: 'K',
  w4_o1: 'K',
  w4_b1: 'B',
};

/**
 * Engine tag display info.
 */
export const ENGINE_TAG_INFO: Record<EngineTag, { label: string; description: string }> = {
  K: { label: 'Knowledge Gap', description: 'Worldbuilder arc · Frame shift · Rooting' },
  B: { label: 'Behaviour Gap', description: 'Culture engine · Mirror · Rehearsal · Witnessed commitment' },
};

/**
 * WEEK_LABELS — FTP week display labels.
 */
export const WEEK_LABELS: Record<number, { num: number; title: string; subtitle: string; days: string; theme: string }> = {
  1: { num: 1, title: 'Anchor', subtitle: 'Observe begins', days: 'Week 1', theme: 'Context before content — functional means operational' },
  2: { num: 2, title: 'Co-create', subtitle: 'Observe deepens', days: 'Week 2', theme: 'Content creation to the zero-error standard' },
  3: { num: 3, title: 'Co-deliver', subtitle: 'Deliver under observation', days: 'Week 3', theme: 'The rubric enters the room' },
  4: { num: 4, title: 'Independence Review', subtitle: 'Co-deliver closes', days: 'Week 4', theme: 'Feedback incorporated, real conditions rehearsed, release decided' },
};

/**
 * WK_WORKSHEETS_MAP — Map week number → list of worksheet IDs.
 * Parallel to PHASE_WORKSHEETS_MAP but for the 4-week FTP structure.
 */
export const WK_WORKSHEETS_MAP: Record<number, WorksheetId[]> = {
  1: ['p1_w5', 'p1_w6', 'p1_w3', 'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1'],
  2: ['p2_w3', 'p1_w7', 'p1_w6', 'w2_e1', 'w2_c3', 'w2_d2', 'w2_b1', 'w2_o1', 'w2_g1'],
  3: ['p2_w1', 'p2_w2', 'p2_w4', 'p3_w5', 'w3_d1', 'w3_d2', 'w3_e1', 'w3_b1', 'w3_g1'],
  4: ['p3_w1', 'p3_w5', 'w4_d2', 'w4_e1', 'w4_o1', 'w4_b1', 'w4_g1'],
};

/**
 * ENGINE_TAG_COLORS — Visual colors for engine tags.
 */
export const ENGINE_TAG_COLORS: Record<EngineTag, { bg: string; color: string; border: string }> = {
  K: { bg: 'rgba(0, 100, 148, 0.08)', color: '#006494', border: '#7DC8E8' },
  B: { bg: 'rgba(198, 40, 40, 0.06)', color: '#C62828', border: '#EF9A9A' },
};

// ─── Legacy Support ─────────────────────────────────────
// Keep WORKSHEET_REVIEWER for backward compatibility.
// New FTP worksheet IDs default to 'buddy'.

export const WORKSHEET_REVIEWER: Record<string, ReviewerType> = {
  // Phase 1 — Orientation
  p1_w1: 'buddy',           // Team Introduction → Buddy
  p1_w2: 'buddy',           // Mentor Sync → Buddy
  p1_w3: 'buddy',           // Teaching Philosophy → Buddy first
  p1_w4: 'onboarding_lead', // University Governance → Onboarding Lead
  p1_w5: 'onboarding_lead', // Portal Walkthrough → Onboarding Lead
  p1_w6: 'buddy',           // Observation Journal → Buddy
  p1_w7: 'buddy',           // Courseware Review → Buddy first
  p1_w8: 'buddy',           // Slack Audit → Buddy
  gc1: 'buddy',             // Gate Control 1 → Buddy first

  // Phase 2 — Contribution
  p2_w1: 'buddy',           // Doubt Resolution → Buddy
  p2_w2: 'buddy',           // Lab Scorecard → Buddy
  p2_w3: 'buddy',           // Content Ledger → Buddy first
  p2_w4: 'onboarding_lead', // Portal Ops → Onboarding Lead
  gc2: 'buddy',             // Gate Control 2 → Buddy first

  // Phase 3 — Independent Teaching
  p3_w1: 'buddy',           // Lecture Delivery → Buddy first
  p3_w2: 'buddy',           // Cohort Profiling → Buddy
  p3_w3: 'buddy',           // Assessment Blueprint → Buddy first
  p3_w4: 'buddy',           // Pedagogical Journal → Buddy
  p3_w5: 'buddy',           // Course Proposal → Buddy first
  gc3: 'buddy',             // Gate Control 3 → Buddy first

  // FTP Week 1 - new worksheets
  w1_o1: 'buddy',
  w1_e1: 'buddy',
  w1_o2: 'buddy',
  w1_g1: 'buddy',

  // FTP Week 2 - new worksheets
  w2_e1: 'buddy',
  w2_c3: 'buddy',
  w2_d2: 'buddy',
  w2_b1: 'buddy',
  w2_o1: 'buddy',
  w2_g1: 'buddy',

  // FTP Week 3 - new worksheets
  w3_d1: 'buddy',
  w3_d2: 'buddy',
  w3_e1: 'buddy',
  w3_b1: 'buddy',
  w3_g1: 'buddy',

  // FTP Week 4 - new worksheets
  w4_d2: 'buddy',
  w4_e1: 'buddy',
  w4_o1: 'buddy',
  w4_b1: 'buddy',
  w4_g1: 'buddy',
};

/** Human-readable reviewer labels */
export const REVIEWER_LABELS: Record<string, string> = {
  buddy: 'Buddy / Mentor',
  manager: 'Manager',
  onboarding_lead: 'Onboarding Lead',
};

/** Review badge styles */
export const REVIEWER_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  buddy: { bg: '#E8DEF8', color: t.purple, border: '#D0BCFF' },
  manager: { bg: '#FFF8E1', color: t.warning, border: '#FFE082' },
  onboarding_lead: { bg: '#E0F2FE', color: '#0369A1', border: '#7DD3FC' },
};

/** Review icons — brief text labels for reviewer type badges */
export const REVIEWER_ICONS: Record<string, string> = {
  buddy: '',
  manager: '',
  onboarding_lead: '',
};

interface WorksheetSheet {
  id: string;
  title: string;
  reviewer: string;
  color: string;
  isGate?: boolean;
}

interface PhaseGroup {
  num: number;
  sheets: WorksheetSheet[];
}

/** All worksheets grouped by phase with reviewer info */
export const ALL_WORKSHEETS: Record<string, PhaseGroup> = {
  'Phase 1': {
    num: 1,
    sheets: [
      { id: 'p1_w1', title: 'Team Introduction & Stakeholder Mapping', reviewer: 'buddy', color: '#6750A4' },
      { id: 'p1_w2', title: 'Faculty Mentor Weekly Sync', reviewer: 'buddy', color: '#006D40' },
      { id: 'p1_w3', title: 'Teaching Philosophy Reflection', reviewer: 'buddy', color: t.pending },
      { id: 'p1_w4', title: 'University Governance & Semester Map', reviewer: 'onboarding_lead', color: '#625B71' },
      { id: 'p1_w5', title: 'Portal Walkthrough & Verification', reviewer: 'onboarding_lead', color: '#006494' },
      { id: 'p1_w6', title: 'Classroom Observation Journal', reviewer: 'buddy', color: t.warning },
      { id: 'p1_w7', title: 'Courseware Review Matrix', reviewer: 'buddy', color: '#2E7D32' },
      { id: 'p1_w8', title: 'Slack Audit & Bottleneck Synthesis', reviewer: 'buddy', color: '#4A148C' },
      { id: 'gc1', title: 'Gate Control 1 — 30-Day Review', reviewer: 'buddy', color: t.pending, isGate: true },
    ],
  },
  'Phase 2': {
    num: 2,
    sheets: [
      { id: 'p2_w1', title: 'Doubt Resolution & Errors Log', reviewer: 'buddy', color: '#006D40' },
      { id: 'p2_w2', title: 'Lab Facilitation Scorecard', reviewer: 'buddy', color: t.pending },
      { id: 'p2_w3', title: 'Content Creation Ledger', reviewer: 'buddy', color: '#625B71' },
      { id: 'p2_w4', title: 'Advanced Portal Operations Check', reviewer: 'onboarding_lead', color: '#006494' },
      { id: 'gc2', title: 'Gate Control 2 — 60-Day Review', reviewer: 'buddy', color: t.pending, isGate: true },
    ],
  },
  'Phase 3': {
    num: 3,
    sheets: [
      { id: 'p3_w1', title: 'Independent Lecture Delivery Log', reviewer: 'buddy', color: '#6750A4' },
      { id: 'p3_w2', title: 'Student Cohort Profiling', reviewer: 'buddy', color: '#006D40' },
      { id: 'p3_w3', title: "Assessment Blueprint & Bloom's Grid", reviewer: 'buddy', color: t.pending },
      { id: 'p3_w4', title: 'Pedagogical Frameworks Journal', reviewer: 'buddy', color: '#625B71' },
      { id: 'p3_w5', title: 'Course Improvement Proposal', reviewer: 'buddy', color: '#006494' },
      { id: 'gc3', title: 'Gate Control 3 — 90-Day Review', reviewer: 'buddy', color: t.pending, isGate: true },
    ],
  },
};

/** Get the reviewer type for a worksheet. Falls back to 'buddy' since ALL worksheets go through buddy first. */
export function getReviewerType(worksheetId: string): string {
  return WORKSHEET_REVIEWER[worksheetId] || 'buddy';
}

// ─── Phase-level Helper Functions ──────────────────────────────

/**
 * Map of phase number → worksheet IDs.
 *
 * Phase 1 = FTP Week 1 (Anchor) + legacy Phase 1 worksheets.
 * Phase 2 = legacy Phase 2 worksheets (gated behind Phase 1 approval).
 * Phase 3 = legacy Phase 3 worksheets (gated behind Phase 1 + 2 approval).
 *
 * FTP Weeks 2-4 are gated by WeekAccessGuard (sequential week completion),
 * not by phase gating. This avoids circular deadlock where FTP weeks 2-4
 * worksheets appeared in BOTH Phase 1 AND Phase 2/3 maps.
 */
export const PHASE_WORKSHEETS_MAP: Record<number, WorksheetId[]> = {
  1: [
    // FTP Week 1 — Anchor
    'p1_w5', 'p1_w6', 'p1_w3', 'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1',
    // Legacy Phase 1
    'p1_w1', 'p1_w2', 'p1_w4', 'p1_w8', 'gc1',
  ],
  2: ['p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2'],
  3: ['p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3'],
};

interface PhaseReviewResult {
  ready: boolean;
  total: number;
  buddyApproved: number;
  notSubmitted: number;
}

/**
 * Check if a phase is ready for manager approval (all worksheets buddy_approved).
 */
export function getPhaseReviewStatus(
  phaseNum: number,
  submissions: WorksheetSubmission[],
  userId: string
): PhaseReviewResult {
  const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  const total = wsList.length;
  let buddyApproved = 0;
  let notSubmitted = 0;

  wsList.forEach(wsId => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    if (!sub || (sub.review_status !== REVIEW_STATUS.BUDDY_APPROVED && sub.review_status !== REVIEW_STATUS.APPROVED)) {
      if (!sub || sub.review_status === REVIEW_STATUS.EMPTY || sub.review_status === REVIEW_STATUS.NEEDS_REVISION) {
        notSubmitted++;
      }
    }
    if (sub?.review_status === REVIEW_STATUS.BUDDY_APPROVED || sub?.review_status === REVIEW_STATUS.APPROVED) {
      buddyApproved++;
    }
  });

  return {
    ready: buddyApproved === total && total > 0,
    total,
    buddyApproved,
    notSubmitted,
  };
}

/**
 * Get buddy_approved worksheet IDs for a phase (ready for manager approval).
 */
export function getBuddyApprovedSheets(
  phaseNum: number,
  submissions: WorksheetSubmission[],
  userId: string
): string[] {
  const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  return wsList.filter((wsId: string) => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    return sub?.review_status === REVIEW_STATUS.BUDDY_APPROVED;
  });
}

/**
 * Get worksheet IDs in a phase filtered by review status.
 */
export function getPhaseWorksheetsByStatus(
  phaseNum: number,
  submissions: WorksheetSubmission[],
  userId: string,
  status: string
): string[] {
  const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  return wsList.filter((wsId: string) => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    return sub?.review_status === status;
  });
}

/** Get all worksheet IDs assigned to a specific reviewer type */
export function getWorksheetsForReviewer(reviewerType: string): string[] {
  return Object.entries(WORKSHEET_REVIEWER)
    .filter(([, type]) => type === reviewerType)
    .map(([id]) => id);
}

/** Get reviewer label for a worksheet */
export function getReviewerLabel(worksheetId: string): string {
  const type = getReviewerType(worksheetId);
  return REVIEWER_LABELS[type] || 'Manager';
}

/**
 * Check if a specific phase has been fully approved by the manager.
 * A phase is "approved" when ALL its worksheets have review_status === 'approved'.
 */
export function isPhaseApproved(
  userId: string,
  phaseNum: number,
  submissions: WorksheetSubmission[]
): boolean {
  const wsIds = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  return wsIds.every((wsId: string) => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    return sub?.review_status === REVIEW_STATUS.APPROVED;
  });
}

/**
 * For a given user, get all phases that are fully manager-approved.
 */
export function getApprovedPhases(userId: string, submissions: WorksheetSubmission[]): number[] {
  return [1, 2, 3].filter(p => isPhaseApproved(userId, p, submissions));
}

/**
 * Get the highest phase number a joinee can access.
 * - Phase 1 is always accessible.
 * - Phase 2 requires Phase 1 to be manager-approved.
 * - Phase 3 requires Phase 1 AND Phase 2 to be manager-approved.
 */
export function getMaxAccessiblePhase(userId: string, submissions: WorksheetSubmission[]): number {
  const approved = getApprovedPhases(userId, submissions);
  if (approved.includes(1) && approved.includes(2)) return 3;
  if (approved.includes(1)) return 2;
  return 1;
}

/**
 * Check if a joinee can access a specific phase.
 */
export function canAccessPhase(
  userId: string,
  phaseNum: number,
  submissions: WorksheetSubmission[]
): boolean {
  if (phaseNum === 1) return true; // Phase 1 always accessible
  if (phaseNum === 2) return isPhaseApproved(userId, 1, submissions);
  if (phaseNum === 3) return isPhaseApproved(userId, 1, submissions) && isPhaseApproved(userId, 2, submissions);
  return false;
}

/**
 * WORKSHEET_NAMES — Short display names for worksheet cards/lists.
 */
export const WORKSHEET_NAMES: Record<string, string> = {
  // Legacy
  p1_w1: 'Team Introduction', p1_w2: 'Faculty Mentor Sync', p1_w3: 'Teaching Philosophy',
  p1_w4: 'University Governance', p1_w5: 'Portal Walkthrough', p1_w6: 'Observation Journal',
  p1_w7: 'Courseware Review', p1_w8: 'Slack Audit',
  p2_w1: 'Doubt Resolution', p2_w2: 'Lab Scorecard', p2_w3: 'Content Ledger', p2_w4: 'Portal Ops',
  p3_w1: 'Lecture Delivery', p3_w2: 'Cohort Profiling', p3_w3: 'Assessment Blueprint',
  p3_w4: 'Pedagogical Journal', p3_w5: 'Course Proposal',
  gc1: 'Gate Control 1', gc2: 'Gate Control 2', gc3: 'Gate Control 3',
  // FTP Week 1
  w1_o1: 'Day 1 Logistics', w1_e1: 'Contest Pre-read', w1_o2: 'Playbook Scavenger',
  w1_g1: 'Gate 1 - Anchor',
  // FTP Week 2
  w2_e1: "Bloom's Two-Pens", w2_c3: 'Create & Peer Review',
  w2_d2: 'Micro-Teach #1', w2_b1: 'Discipline Session', w2_o1: 'Invigilation',
  w2_g1: 'Gate 2 - Co-create',
  // FTP Week 3
  w3_d1: 'Classroom Tech', w3_d2: 'Planning & Time', w3_e1: 'Mini-Contest Design',
  w3_b1: 'Student Dialoguing', w3_g1: 'Gate 3 - Co-deliver',
  // FTP Week 4
  w4_d2: 'Co-Teach / Mock', w4_e1: 'Post-Contest Analysis',
  w4_o1: 'Pre-Semester Checklist', w4_b1: 'Why We Reflect',
  w4_g1: 'Gate 4 - Independence',
};

/**
 * PHASE_LABELS — Phase header info for review/admin pages.
 */
export const PHASE_LABELS: Record<number, { title: string; days: string }> = {
  1: { title: 'Phase 1 — Orientation', days: 'Days 1–30' },
  2: { title: 'Phase 2 — Contribution', days: 'Days 31–60' },
  3: { title: 'Phase 3 — Ownership', days: 'Days 61–90' },
};

/**
 * WORKSHEET_INFO — Full worksheet titles and phase info.
 */
export const WORKSHEET_INFO: Record<string, { title: string; phase: string }> = {
  // Legacy Phase 1
  p1_w1: { title: 'Team Introduction & Stakeholder Mapping Log', phase: 'Phase 1' },
  p1_w2: { title: 'Faculty Mentor Alignment & Weekly Sync Tracker', phase: 'Phase 1' },
  p1_w3: { title: 'Culture & Teaching Philosophy Reflection', phase: 'Phase 1 / Week 1' },
  p1_w4: { title: 'Partner University Governance & Semester Architecture Map', phase: 'Phase 1' },
  p1_w5: { title: 'Core Learning Portal Practical Walkthrough', phase: 'Phase 1 / Week 1' },
  p1_w6: { title: 'Classroom & Laboratory Live Observation Journal', phase: 'Phase 1 / Week 1-2' },
  p1_w7: { title: 'Existing Courseware & Question Bank Review Matrix', phase: 'Phase 1 / Week 2' },
  p1_w8: { title: 'Slack Historical Context & Student Bottleneck Audit', phase: 'Phase 1' },
  gc1: { title: 'Gate Control 1 — 30-Day Milestone Review', phase: 'Phase 1' },
  // Legacy Phase 2
  p2_w1: { title: 'Student Doubt Resolution & Common Errors Log', phase: 'Phase 2 / Week 3' },
  p2_w2: { title: 'Independent Lab Facilitation Scorecard', phase: 'Phase 2 / Week 3' },
  p2_w3: { title: 'Courseware Content Creation Ledger', phase: 'Phase 2 / Week 2' },
  p2_w4: { title: 'Advanced Portal Operations & Quiz Config Check', phase: 'Phase 2 / Week 3' },
  gc2: { title: 'Gate Control 2 — 60-Day Milestone Review', phase: 'Phase 2' },
  // Legacy Phase 3
  p3_w1: { title: 'Independent Lecture Delivery Log & Pacing Post-Mortem', phase: 'Phase 3 / Week 4' },
  p3_w2: { title: 'Student Cohort Profiling & High/Low Performer Mapping', phase: 'Phase 3' },
  p3_w3: { title: "Assessment Design Blueprint & Bloom's Taxonomy Grid", phase: 'Phase 3' },
  p3_w4: { title: 'Pedagogical Frameworks Application Journal', phase: 'Phase 3' },
  p3_w5: { title: 'Continuous Course Improvement Proposal', phase: 'Phase 3 / Week 3-4' },
  gc3: { title: 'Gate Control 3 — 90-Day Final Readiness Assessment', phase: 'Phase 3' },
  // FTP Week 1
  w1_o1: { title: 'Day 1 Logistics, Access & Buddy Assignment', phase: 'Week 1 — Anchor' },
  w1_e1: { title: 'Contest Guidelines V3 Pre-read & Reflection', phase: 'Week 1 — Anchor' },
  w1_o2: { title: 'Playbook Scavenger Exercise', phase: 'Week 1 — Anchor' },
  w1_g1: { title: 'Gate 1 — Anchor Phase Artifact Review', phase: 'Week 1 — Anchor' },
  // FTP Week 2
  w2_e1: { title: "Bloom's Two-Pens Taxonomy Tagging Session", phase: 'Week 2 — Co-create' },
  w2_c3: { title: 'Create & Peer Review — 3 MCQ + 2 Coding', phase: 'Week 2 — Co-create' },
  w2_d2: { title: 'Micro-Teach #1 — 10-Minute Peer Segment', phase: 'Week 2 — Co-create' },
  w2_b1: { title: 'Discipline Consistency & Classroom Culture', phase: 'Week 2 — Co-create' },
  w2_o1: { title: 'Invigilation & Exam Formalities', phase: 'Week 2 — Co-create' },
  w2_g1: { title: 'Gate 2 — Co-create Artifact Review', phase: 'Week 2 — Co-create' },
  // FTP Week 3
  w3_d1: { title: 'Classroom Technology Hands-on Proficiency', phase: 'Week 3 — Co-deliver' },
  w3_d2: { title: '10-Minute Window Planning & Time Management', phase: 'Week 3 — Co-deliver' },
  w3_e1: { title: 'Mini-Contest Design — 12 Questions vs V3', phase: 'Week 3 — Co-deliver' },
  w3_b1: { title: 'Student Dialoguing Rehearsal', phase: 'Week 3 — Co-deliver' },
  w3_g1: { title: 'Gate 3 — Co-deliver Artifact Review', phase: 'Week 3 — Co-deliver' },
  // FTP Week 4
  w4_d2: { title: 'Co-Teach / Mock Classroom Edge Cases', phase: 'Week 4 — Independence' },
  w4_e1: { title: 'Post-Contest Analysis & Calibration', phase: 'Week 4 — Independence' },
  w4_o1: { title: 'Pre-Semester Checklist & Sign-off', phase: 'Week 4 — Independence' },
  w4_b1: { title: 'Why We Reflect — Commitment Ceremony', phase: 'Week 4 — Independence' },
  w4_g1: { title: 'Gate 4 — Independence Readiness Assessment', phase: 'Week 4 — Independence' },
};
