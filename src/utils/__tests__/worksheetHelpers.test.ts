import { describe, it, expect } from 'vitest';
import { getWorksheetPath, isWorksheetComplete, countCompleted, buildStatusMap } from '../worksheetHelpers';

describe('getWorksheetPath — worksheet ID → route mapping', () => {
  // ── Legacy phase worksheets: pN_wM → /phase-N/worksheet-M ──────────────
  it('maps legacy phase worksheets to /phase-N/worksheet-M', () => {
    expect(getWorksheetPath('p1_w1')).toBe('/phase-1/worksheet-1');
    expect(getWorksheetPath('p1_w8')).toBe('/phase-1/worksheet-8');
    expect(getWorksheetPath('p2_w3')).toBe('/phase-2/worksheet-3');
    expect(getWorksheetPath('p3_w5')).toBe('/phase-3/worksheet-5');
  });

  it('handles multi-digit worksheet numbers', () => {
    expect(getWorksheetPath('p1_w10')).toBe('/phase-1/worksheet-10');
  });

  // ── FTP week worksheets: wN_xxx → /week-N/worksheet/{id} ──────────────
  it('maps FTP week worksheets to /week-N/worksheet/{id}', () => {
    expect(getWorksheetPath('w1_o1')).toBe('/week-1/worksheet/w1_o1');
    expect(getWorksheetPath('w1_e1')).toBe('/week-1/worksheet/w1_e1');
    expect(getWorksheetPath('w1_g1')).toBe('/week-1/worksheet/w1_g1');
    expect(getWorksheetPath('w2_c3')).toBe('/week-2/worksheet/w2_c3');
    expect(getWorksheetPath('w3_d2')).toBe('/week-3/worksheet/w3_d2');
    expect(getWorksheetPath('w4_b1')).toBe('/week-4/worksheet/w4_b1');
  });

  // ── Gate checks: gcN → null (no joinee-facing page) ───────────────────
  it('returns null for gate checks (no joinee-facing route)', () => {
    expect(getWorksheetPath('gc1')).toBeNull();
    expect(getWorksheetPath('gc2')).toBeNull();
    expect(getWorksheetPath('gc3')).toBeNull();
  });

  // ── Department worksheet IDs: pr_*/op_* → null (not on main dashboard) ─
  it('returns null for department (progression/operations) worksheet IDs', () => {
    expect(getWorksheetPath('pr_p1_w1')).toBeNull();
    expect(getWorksheetPath('pr_gc1')).toBeNull();
    expect(getWorksheetPath('op_p2_w1')).toBeNull();
    expect(getWorksheetPath('op_gc1')).toBeNull();
  });

  // ── Edge cases ────────────────────────────────────────────────────────
  it('returns null for empty / missing worksheet IDs', () => {
    expect(getWorksheetPath('')).toBeNull();
    expect(getWorksheetPath(null)).toBeNull();
    expect(getWorksheetPath(undefined)).toBeNull();
  });

  it('returns null for unrecognized ID shapes', () => {
    expect(getWorksheetPath('p1w1')).toBeNull();
    expect(getWorksheetPath('p1_w')).toBeNull();
    expect(getWorksheetPath('_w1')).toBeNull();
    expect(getWorksheetPath('w_01')).toBeNull();
    expect(getWorksheetPath('random')).toBeNull();
  });

  // ── Boundary: FTP-shaped IDs without a letter+digit suffix ────────────
  it('does not map FTP-shaped IDs that lack the letter+digit suffix', () => {
    expect(getWorksheetPath('w1_')).toBeNull();
    expect(getWorksheetPath('w1_ab')).toBeNull();
    expect(getWorksheetPath('w1_1')).toBeNull();
  });
});

describe('isWorksheetComplete — status completeness checks', () => {
  it('is complete when submitted, approved, or buddy_approved', () => {
    expect(isWorksheetComplete({ status: 'submitted', review_status: '' })).toBe(true);
    expect(isWorksheetComplete({ status: 'in_progress', review_status: 'approved' })).toBe(true);
    expect(isWorksheetComplete({ status: 'in_progress', review_status: 'buddy_approved' })).toBe(true);
  });

  it('is incomplete for in-progress, needs-revision, or missing statuses', () => {
    expect(isWorksheetComplete({ status: 'in_progress', review_status: '' })).toBe(false);
    expect(isWorksheetComplete({ status: '', review_status: 'needs_revision' })).toBe(false);
    expect(isWorksheetComplete(undefined)).toBe(false);
  });

  // Documented semantics: a worksheet is complete once submitted, even while
  // it is still awaiting review (status, not review_status, drives this).
  it('treats a submitted worksheet as complete even while under review', () => {
    expect(isWorksheetComplete({ status: 'submitted', review_status: 'pending_review' })).toBe(true);
    expect(isWorksheetComplete({ status: 'submitted', review_status: 'needs_revision' })).toBe(true);
  });
});

describe('countCompleted — counts complete worksheets', () => {
  it('counts only complete worksheets in the list', () => {
    const statuses: Record<string, { status: string | null; review_status: string | null }> = {
      p1_w1: { status: 'submitted', review_status: '' },
      p1_w2: { status: 'in_progress', review_status: 'buddy_approved' },
      p1_w3: { status: 'in_progress', review_status: '' },
      p1_w4: { status: null, review_status: null },
    };
    expect(countCompleted(['p1_w1', 'p1_w2', 'p1_w3', 'p1_w4'], statuses)).toBe(2);
    expect(countCompleted([], statuses)).toBe(0);
  });
});

describe('buildStatusMap — rows → status map', () => {
  it('builds a keyed map from query rows', () => {
    const map = buildStatusMap([
      { worksheet_id: 'p1_w1', status: 'submitted', review_status: '' },
      { worksheet_id: 'p1_w2', status: 'in_progress', review_status: 'pending_review' },
    ]);
    expect(map).toEqual({
      p1_w1: { status: 'submitted', review_status: '' },
      p1_w2: { status: 'in_progress', review_status: 'pending_review' },
    });
  });

  it('returns an empty map for null input', () => {
    expect(buildStatusMap(null)).toEqual({});
  });
});
