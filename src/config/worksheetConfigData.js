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

/**
 * Map of worksheet ID → reviewer type (for display/metadata only)
 * In the NEW flow: ALL worksheets are first approved by the buddy.
 * Manager only approves at the PHASE level (after all buddy_approved).
 */
export const WORKSHEET_REVIEWER = {
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
};

/** Human-readable reviewer labels */
export const REVIEWER_LABELS = {
  buddy: 'Buddy / Mentor',
  manager: 'Manager',
  onboarding_lead: 'Onboarding Lead',
};

/** Review badge styles */
export const REVIEWER_STYLES = {
  buddy: { bg: '#E8DEF8', color: '#381E72', border: '#D0BCFF' },
  manager: { bg: '#FFF8E1', color: '#E65100', border: '#FFE082' },
  onboarding_lead: { bg: '#E0F2FE', color: '#0369A1', border: '#7DD3FC' },
};

/** Review icons — brief text labels for reviewer type badges */
export const REVIEWER_ICONS = {
  buddy: '',
  manager: '',
  onboarding_lead: '',
};

/** All worksheets grouped by phase with reviewer info */
export const ALL_WORKSHEETS = {
  'Phase 1': {
    num: 1,
    sheets: [
      { id: 'p1_w1', title: 'Team Introduction & Stakeholder Mapping', reviewer: 'buddy', color: '#6750A4' },
      { id: 'p1_w2', title: 'Faculty Mentor Weekly Sync', reviewer: 'buddy', color: '#006D40' },
      { id: 'p1_w3', title: 'Teaching Philosophy Reflection', reviewer: 'buddy', color: '#7D5260' },
      { id: 'p1_w4', title: 'University Governance & Semester Map', reviewer: 'onboarding_lead', color: '#625B71' },
      { id: 'p1_w5', title: 'Portal Walkthrough & Verification', reviewer: 'onboarding_lead', color: '#006494' },
      { id: 'p1_w6', title: 'Classroom Observation Journal', reviewer: 'buddy', color: '#E65100' },
      { id: 'p1_w7', title: 'Courseware Review Matrix', reviewer: 'buddy', color: '#2E7D32' },
      { id: 'p1_w8', title: 'Slack Audit & Bottleneck Synthesis', reviewer: 'buddy', color: '#4A148C' },
      { id: 'gc1', title: 'Gate Control 1 — 30-Day Review', reviewer: 'buddy', color: '#7D5260', isGate: true },
    ],
  },
  'Phase 2': {
    num: 2,
    sheets: [
      { id: 'p2_w1', title: 'Doubt Resolution & Errors Log', reviewer: 'buddy', color: '#006D40' },
      { id: 'p2_w2', title: 'Lab Facilitation Scorecard', reviewer: 'buddy', color: '#7D5260' },
      { id: 'p2_w3', title: 'Content Creation Ledger', reviewer: 'buddy', color: '#625B71' },
      { id: 'p2_w4', title: 'Advanced Portal Operations Check', reviewer: 'onboarding_lead', color: '#006494' },
      { id: 'gc2', title: 'Gate Control 2 — 60-Day Review', reviewer: 'buddy', color: '#7D5260', isGate: true },
    ],
  },
  'Phase 3': {
    num: 3,
    sheets: [
      { id: 'p3_w1', title: 'Independent Lecture Delivery Log', reviewer: 'buddy', color: '#6750A4' },
      { id: 'p3_w2', title: 'Student Cohort Profiling', reviewer: 'buddy', color: '#006D40' },
      { id: 'p3_w3', title: 'Assessment Blueprint & Bloom\'s Grid', reviewer: 'buddy', color: '#7D5260' },
      { id: 'p3_w4', title: 'Pedagogical Frameworks Journal', reviewer: 'buddy', color: '#625B71' },
      { id: 'p3_w5', title: 'Course Improvement Proposal', reviewer: 'buddy', color: '#006494' },
      { id: 'gc3', title: 'Gate Control 3 — 90-Day Review', reviewer: 'buddy', color: '#7D5260', isGate: true },
    ],
  },
};

/** Get the reviewer type for a worksheet. Falls back to 'buddy' since ALL worksheets go through buddy first. */
export function getReviewerType(worksheetId) {
  return WORKSHEET_REVIEWER[worksheetId] || 'buddy';
}

// ─── Phase-level Helper Functions ──────────────────────────────

/** Map of phase number → worksheet IDs */
export const PHASE_WORKSHEETS_MAP = {
  1: ['p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1'],
  2: ['p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2'],
  3: ['p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3'],
};

/**
 * Check if a phase is ready for manager approval (all worksheets buddy_approved).
 * @param {number} phaseNum - 1, 2, or 3
 * @param {Array} submissions - Array of worksheet submission objects from ALL users
 * @param {string} userId - The joinee's user ID
 * @returns {{ ready: boolean, total: number, buddyApproved: number, notSubmitted: number }}
 */
export function getPhaseReviewStatus(phaseNum, submissions, userId) {
  const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  const total = wsList.length;
  let buddyApproved = 0;
  let notSubmitted = 0;

  wsList.forEach(wsId => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    if (!sub || (sub.review_status !== 'buddy_approved' && sub.review_status !== 'approved')) {
      if (!sub || sub.review_status === '' || sub.review_status === 'needs_revision') {
        notSubmitted++;
      }
    }
    if (sub?.review_status === 'buddy_approved' || sub?.review_status === 'approved') {
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
export function getBuddyApprovedSheets(phaseNum, submissions, userId) {
  const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  return wsList.filter(wsId => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    return sub?.review_status === 'buddy_approved';
  });
}

/**
 * Get worksheet IDs in a phase filtered by review status.
 */
export function getPhaseWorksheetsByStatus(phaseNum, submissions, userId, status) {
  const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
  const userSubs = submissions.filter(s => s.user_id === userId);
  return wsList.filter(wsId => {
    const sub = userSubs.find(s => s.worksheet_id === wsId);
    return sub?.review_status === status;
  });
}

/** Get all worksheet IDs assigned to a specific reviewer type */
export function getWorksheetsForReviewer(reviewerType) {
  return Object.entries(WORKSHEET_REVIEWER)
    .filter(([, type]) => type === reviewerType)
    .map(([id]) => id);
}

/** Get reviewer label for a worksheet */
export function getReviewerLabel(worksheetId) {
  const type = getReviewerType(worksheetId);
  return REVIEWER_LABELS[type] || 'Manager';
}

/**
 * WORKSHEET_INFO — Full worksheet titles and phase info.
 * Single source of truth (was duplicated across WorksheetReview.jsx and PhaseReview.jsx).
 */
export const WORKSHEET_INFO = {
  p1_w1: { title: 'Team Introduction & Stakeholder Mapping Log', phase: 'Phase 1' },
  p1_w2: { title: 'Faculty Mentor Alignment & Weekly Sync Tracker', phase: 'Phase 1' },
  p1_w3: { title: 'Organisational Culture & Teaching Philosophy Reflection', phase: 'Phase 1' },
  p1_w4: { title: 'Partner University Governance & Semester Architecture Map', phase: 'Phase 1' },
  p1_w5: { title: 'Core Learning Portal Practical Walkthrough', phase: 'Phase 1' },
  p1_w6: { title: 'Classroom & Laboratory Live Observation Journal', phase: 'Phase 1' },
  p1_w7: { title: 'Existing Courseware & Question Bank Review Matrix', phase: 'Phase 1' },
  p1_w8: { title: 'Slack Historical Context & Student Bottleneck Audit', phase: 'Phase 1' },
  gc1: { title: 'Gate Control 1 — 30-Day Milestone Review', phase: 'Phase 1' },
  p2_w1: { title: 'Student Doubt Resolution & Common Errors Diagnostic Log', phase: 'Phase 2' },
  p2_w2: { title: 'Independent Lab Facilitation Scorecard', phase: 'Phase 2' },
  p2_w3: { title: 'Courseware Content Creation Ledger', phase: 'Phase 2' },
  p2_w4: { title: 'Advanced Portal Operations & Quiz Configuration Check', phase: 'Phase 2' },
  gc2: { title: 'Gate Control 2 — 60-Day Milestone Review', phase: 'Phase 2' },
  p3_w1: { title: 'Independent Lecture Delivery Log & Pacing Post-Mortem', phase: 'Phase 3' },
  p3_w2: { title: 'Student Cohort Profiling & High/Low Performer Mapping', phase: 'Phase 3' },
  p3_w3: { title: "Assessment Design Blueprint & Bloom's Taxonomy Grid", phase: 'Phase 3' },
  p3_w4: { title: 'Pedagogical Frameworks Application Journal', phase: 'Phase 3' },
  p3_w5: { title: 'Continuous Course Improvement Proposal', phase: 'Phase 3' },
  gc3: { title: 'Gate Control 3 — 90-Day Final Readiness Assessment', phase: 'Phase 3' },
};
