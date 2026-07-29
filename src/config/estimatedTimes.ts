/**
 * ESTIMATED_TIMES — Estimated completion time per worksheet (in minutes).
 *
 * Used to display ⏱ badges on worksheet rows so users can mentally prepare
 * before starting. Estimates are intentionally generous — better to
 * under-promise and over-deliver.
 */
export const ESTIMATED_TIMES: Record<string, number> = {
  // ── Phase 1 — Legacy ──
  p1_w1: 5,  // Team Introduction & Stakeholder Mapping Log
  p1_w2: 8,  // Faculty Mentor Alignment & Weekly Sync Tracker
  p1_w3: 10, // NST Teaching Beliefs Reflection
  p1_w4: 8,  // Partner University Governance
  p1_w5: 15, // Platform Walkthrough
  p1_w6: 20, // TLAC Observation & Reflection
  p1_w7: 12, // Scope & Sequence
  p1_w8: 10, // Slack Historical Context

  // ── Phase 2 ──
  p2_w1: 15, // Lesson Plan 1
  p2_w2: 12, // Content Creation
  p2_w3: 10, // Assessment Design
  p2_w4: 8,  // Platform Content Setup

  // ── Phase 3 ──
  p3_w1: 15, // Independent Teaching Log
  p3_w2: 12, // Lesson Plan 2
  p3_w3: 10, // Assessment Blueprint
  p3_w4: 8,  // Pedagogical Frameworks Journal
  p3_w5: 10, // Capstone Improvement Proposal

  // ── Gates ──
  gc1: 5,  // Gate Control 1
  gc2: 5,  // Gate Control 2
  gc3: 5,  // Gate Control 3

  // ── FTP Weeks ──
  w1_o1: 8,  // O1 — Org Chart
  w1_e1: 10, // E1 — Expectations
  w1_o2: 8,  // O2 — Orientation 2
  w1_g1: 5,  // Week 1 Gate
  w2_e1: 10, // E1 — Event 1
  w2_c3: 12, // C3 — Content 3
  w2_d2: 10, // D2 — Demo 2
  w2_b1: 8,  // B1 — Brief 1
  w2_o1: 8,  // O1 — Operation 1
  w2_g1: 5,  // Week 2 Gate
  w3_d1: 15, // D1 — Demo 1
  w3_d2: 12, // D2 — Demo 2
  w3_e1: 10, // E1 — Event 1
  w3_b1: 8,  // B1 — Brief 1
  w3_g1: 5,  // Week 3 Gate
  w4_d2: 12, // D2 — Demo 2
  w4_e1: 10, // E1 — Event 1
  w4_o1: 8,  // O1 — Operation 1
  w4_b1: 8,  // B1 — Brief 1
  w4_g1: 5,  // Week 4 Gate

  // ── Progression Department ──
  pr_p1_w1: 8,  pr_p1_w2: 10, pr_p1_w3: 12, pr_p1_w4: 8,
  pr_p1_w5: 10, pr_p1_w6: 12, pr_gc1: 5,
  pr_p2_w1: 12, pr_p2_w2: 10, pr_p2_w3: 8,  pr_gc2: 5,
  pr_p3_w1: 12, pr_p3_w2: 10, pr_p3_w3: 8,  pr_p3_w4: 10, pr_gc3: 5,

  // ── Operations Department ──
  op_p1_w1: 8,  op_p1_w2: 10, op_p1_w3: 12, op_p1_w4: 8,
  op_p1_w5: 10, op_p1_w6: 12, op_gc1: 5,
  op_p2_w1: 12, op_p2_w2: 10, op_p2_w3: 8,  op_gc2: 5,
  op_p3_w1: 12, op_p3_w2: 10, op_p3_w3: 8,  op_p3_w4: 10, op_gc3: 5,
};

/**
 * Get the estimated time for a worksheet, formatted for display.
 */
export function getEstimatedTime(worksheetId: string): string {
  const minutes = ESTIMATED_TIMES[worksheetId];
  if (!minutes) return '';
  if (minutes < 60) return `⏱ ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `⏱ ${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
}
