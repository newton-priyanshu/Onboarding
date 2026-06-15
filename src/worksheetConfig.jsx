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
//   3. Correct reviewer approves (→ approved) or requests revision (→ needs_revision)
//   4. If revision: Joinee sees comment, edits, resubmits (→ revision_submitted)
//   5. Reviewer re-reviews → approve or revision (repeat as needed)
//
// =====================================================

/**
 * Map of worksheet ID → reviewer type (for display/metadata only)
 * In the NEW flow: ALL worksheets are first approved by the buddy.
 * Manager only approves at the PHASE level (after all buddy_approved).
 * buddy: Display label — reviewed by buddy first
 * manager: Display label — ultimately approved by manager at phase level
 * onboarding_lead: Display label — reviewed by onboarding lead (read-only)
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

// ─── Phase-level Helper Functions (for new buddy-first, manager-phase-approval flow) ───

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
 * ReviewerBadge — Shows the reviewer type for a worksheet.
 * Use this in any component that displays worksheet review info.
 */
/**
 * ReviewerBadge — Shows the reviewer type for a worksheet.
 * Renders with Luxury/Editorial styling (0px radius, uppercase tracking).
 */
export function ReviewerBadge({ worksheetId, style: extraStyle = {} }) {
  const type = getReviewerType(worksheetId);
  const style = REVIEWER_STYLES[type];
  const label = REVIEWER_LABELS[type];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 0,
      border: '1px solid ' + style.color,
      color: style.color,
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)',
      ...extraStyle,
    }}>
      {label}
    </span>
  );
}

import Phase1Worksheet1 from './pages/worksheets/Phase1Worksheet1';
import Phase1Worksheet2 from './pages/worksheets/Phase1Worksheet2';
import Phase1Worksheet3 from './pages/worksheets/Phase1Worksheet3';
import Phase1Worksheet4 from './pages/worksheets/Phase1Worksheet4';
import Phase1Worksheet5 from './pages/worksheets/Phase1Worksheet5';
import Phase1Worksheet6 from './pages/worksheets/Phase1Worksheet6';
import Phase1Worksheet7 from './pages/worksheets/Phase1Worksheet7';
import Phase1Worksheet8 from './pages/worksheets/Phase1Worksheet8';
import Phase2Worksheet1 from './pages/worksheets/Phase2Worksheet1';
import Phase2Worksheet2 from './pages/worksheets/Phase2Worksheet2';
import Phase2Worksheet3 from './pages/worksheets/Phase2Worksheet3';
import Phase2Worksheet4 from './pages/worksheets/Phase2Worksheet4';
import Phase3Worksheet1 from './pages/worksheets/Phase3Worksheet1';
import Phase3Worksheet2 from './pages/worksheets/Phase3Worksheet2';
import Phase3Worksheet3 from './pages/worksheets/Phase3Worksheet3';
import Phase3Worksheet4 from './pages/worksheets/Phase3Worksheet4';
import Phase3Worksheet5 from './pages/worksheets/Phase3Worksheet5';
import GateControl1 from './pages/GateControl1';
import GateControl2 from './pages/GateControl2';
import GateControl3 from './pages/GateControl3';

export const WORKSHEET_COMPONENTS = {
  p1_w1: Phase1Worksheet1, p1_w2: Phase1Worksheet2, p1_w3: Phase1Worksheet3,
  p1_w4: Phase1Worksheet4, p1_w5: Phase1Worksheet5, p1_w6: Phase1Worksheet6,
  p1_w7: Phase1Worksheet7, p1_w8: Phase1Worksheet8, gc1: GateControl1,
  p2_w1: Phase2Worksheet1, p2_w2: Phase2Worksheet2, p2_w3: Phase2Worksheet3,
  p2_w4: Phase2Worksheet4, gc2: GateControl2,
  p3_w1: Phase3Worksheet1, p3_w2: Phase3Worksheet2, p3_w3: Phase3Worksheet3,
  p3_w4: Phase3Worksheet4, p3_w5: Phase3Worksheet5, gc3: GateControl3,
};
