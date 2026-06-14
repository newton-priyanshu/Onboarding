// =====================================================
// Worksheet Reviewer Assignment Config
// Defines which role reviews each worksheet
// =====================================================

/**
 * Map of worksheet ID → reviewer type
 * buddy: Reviewed by the assigned buddy (day-to-day mentor)
 * manager: Reviewed by the assigned manager/lead instructor
 * onboarding_lead: Reviewed by the Onboarding Lead
 */
export const WORKSHEET_REVIEWER = {
  // Phase 1 — Orientation
  p1_w1: 'buddy',           // Team Introduction → Buddy (helps with introductions)
  p1_w2: 'buddy',           // Mentor Sync → Buddy (the mentor)
  p1_w3: 'manager',         // Teaching Philosophy → Manager (oversees teaching approach)
  p1_w4: 'onboarding_lead', // University Governance → Onboarding Lead (procedural)
  p1_w5: 'onboarding_lead', // Portal Walkthrough → Onboarding Lead (systems access)
  p1_w6: 'buddy',           // Observation Journal → Buddy (observed the classes)
  p1_w7: 'manager',         // Courseware Review → Manager (quality oversight)
  p1_w8: 'buddy',           // Slack Audit → Buddy (day-to-day communication)
  gc1: 'manager',           // Gate Control 1 → Manager (milestone sign-off)

  // Phase 2 — Contribution
  p2_w1: 'buddy',           // Doubt Resolution → Buddy (teaching practice)
  p2_w2: 'buddy',           // Lab Scorecard → Buddy (observed labs)
  p2_w3: 'manager',         // Content Ledger → Manager (content quality)
  p2_w4: 'onboarding_lead', // Portal Ops → Onboarding Lead (systems)
  gc2: 'manager',           // Gate Control 2 → Manager

  // Phase 3 — Independent Teaching
  p3_w1: 'manager',         // Lecture Delivery → Manager (teaching readiness)
  p3_w2: 'buddy',           // Cohort Profiling → Buddy (student relationships)
  p3_w3: 'manager',         // Assessment Blueprint → Manager (curriculum quality)
  p3_w4: 'buddy',           // Pedagogical Journal → Buddy (teaching development)
  p3_w5: 'manager',         // Course Proposal → Manager (final project)
  gc3: 'manager',           // Gate Control 3 → Manager
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
      { id: 'p1_w3', title: 'Teaching Philosophy Reflection', reviewer: 'manager', color: '#7D5260' },
      { id: 'p1_w4', title: 'University Governance & Semester Map', reviewer: 'onboarding_lead', color: '#625B71' },
      { id: 'p1_w5', title: 'Portal Walkthrough & Verification', reviewer: 'onboarding_lead', color: '#006494' },
      { id: 'p1_w6', title: 'Classroom Observation Journal', reviewer: 'buddy', color: '#E65100' },
      { id: 'p1_w7', title: 'Courseware Review Matrix', reviewer: 'manager', color: '#2E7D32' },
      { id: 'p1_w8', title: 'Slack Audit & Bottleneck Synthesis', reviewer: 'buddy', color: '#4A148C' },
      { id: 'gc1', title: 'Gate Control 1 — 30-Day Review', reviewer: 'manager', color: '#7D5260', isGate: true },
    ],
  },
  'Phase 2': {
    num: 2,
    sheets: [
      { id: 'p2_w1', title: 'Doubt Resolution & Errors Log', reviewer: 'buddy', color: '#006D40' },
      { id: 'p2_w2', title: 'Lab Facilitation Scorecard', reviewer: 'buddy', color: '#7D5260' },
      { id: 'p2_w3', title: 'Content Creation Ledger', reviewer: 'manager', color: '#625B71' },
      { id: 'p2_w4', title: 'Advanced Portal Operations Check', reviewer: 'onboarding_lead', color: '#006494' },
      { id: 'gc2', title: 'Gate Control 2 — 60-Day Review', reviewer: 'manager', color: '#7D5260', isGate: true },
    ],
  },
  'Phase 3': {
    num: 3,
    sheets: [
      { id: 'p3_w1', title: 'Independent Lecture Delivery Log', reviewer: 'manager', color: '#6750A4' },
      { id: 'p3_w2', title: 'Student Cohort Profiling', reviewer: 'buddy', color: '#006D40' },
      { id: 'p3_w3', title: 'Assessment Blueprint & Bloom\'s Grid', reviewer: 'manager', color: '#7D5260' },
      { id: 'p3_w4', title: 'Pedagogical Frameworks Journal', reviewer: 'buddy', color: '#625B71' },
      { id: 'p3_w5', title: 'Course Improvement Proposal', reviewer: 'manager', color: '#006494' },
      { id: 'gc3', title: 'Gate Control 3 — 90-Day Review', reviewer: 'manager', color: '#7D5260', isGate: true },
    ],
  },
};

/** Get the reviewer type for a worksheet. Falls back to 'manager' if not found. */
export function getReviewerType(worksheetId) {
  return WORKSHEET_REVIEWER[worksheetId] || 'manager';
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
  const type = WORKSHEET_REVIEWER[worksheetId] || 'manager';
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
