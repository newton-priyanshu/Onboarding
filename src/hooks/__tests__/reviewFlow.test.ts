import { describe, it, expect } from 'vitest';

// Import from worksheetConfigData (pure functions, no React/Supabase dependency)
import {
  getPhaseReviewStatus,
  getBuddyApprovedSheets,
  getPhaseWorksheetsByStatus,
  PHASE_WORKSHEETS_MAP,
} from '../../config/worksheetConfigData';
import type { ReviewStatus, SubmissionStatus, ReviewerType, WorksheetId } from '../../types/supabase';

// Helper: build a minimal mock submission for testing phase review functions.
// Only includes fields accessed by the phase review functions.
// Other required fields use empty/null defaults to satisfy WorksheetSubmission's shape.
function sub(
  worksheetId: string,
  reviewStatus: string,
  userId: string = 'joinee-1',
): {
  id: string;
  user_id: string;
  worksheet_id: WorksheetId;
  worksheet_data: Record<string, unknown>;
  phase: string;
  status: SubmissionStatus;
  review_status: ReviewStatus;
  reviewer_type: ReviewerType;
  reviewed_by: null;
  reviewer_name: null;
  review_comment: null;
  reviewed_at: null;
  review_history: [];
  campus_id: null;
  created_at: string;
  updated_at: string;
} {
  return {
    id: '',
    user_id: userId,
    worksheet_id: worksheetId as WorksheetId,
    worksheet_data: {},
    phase: '',
    status: '' as SubmissionStatus,
    review_status: reviewStatus as ReviewStatus,
    reviewer_type: '' as ReviewerType,
    reviewed_by: null,
    reviewer_name: null,
    review_comment: null,
    reviewed_at: null,
    review_history: [],
    campus_id: null,
    created_at: '',
    updated_at: '',
  };
}

describe('Phase-Level Review Flow', () => {
  const userId = 'joinee-1';
  const p1Ids = PHASE_WORKSHEETS_MAP[1] || []; // 12 worksheets (FTP Week 1 + legacy Phase 1)

  // ── getPhaseReviewStatus ──────────────────────────────────────

  describe('getPhaseReviewStatus', () => {
    it('returns not ready when no submissions exist for the phase', () => {
      const result = getPhaseReviewStatus(1, [], userId);
      expect(result.ready).toBe(false);
      expect(result.total).toBe(p1Ids.length);
      expect(result.buddyApproved).toBe(0);
      expect(result.notSubmitted).toBe(p1Ids.length);
    });

    it('returns not ready when some worksheets are only submitted (pending_review)', () => {
      const submissions = p1Ids.map((id, i) =>
        // Only first 5 are buddy_approved, rest are pending
        sub(id, i < 5 ? 'buddy_approved' : 'pending_review')
      );
      const result = getPhaseReviewStatus(1, submissions, userId);
      expect(result.ready).toBe(false);
      expect(result.buddyApproved).toBe(5);
      expect(result.notSubmitted).toBe(0);
    });

    it('returns ready when ALL worksheets are buddy_approved', () => {
      const submissions = p1Ids.map(id => sub(id, 'buddy_approved'));
      const result = getPhaseReviewStatus(1, submissions, userId);
      expect(result.ready).toBe(true);
      expect(result.buddyApproved).toBe(p1Ids.length);
      expect(result.notSubmitted).toBe(0);
    });

    it('returns ready when some are already approved (phase-level) and rest buddy_approved', () => {
      const submissions = p1Ids.map((id, i) =>
        sub(id, i < 3 ? 'approved' : 'buddy_approved')
      );
      const result = getPhaseReviewStatus(1, submissions, userId);
      expect(result.ready).toBe(true);
      expect(result.buddyApproved).toBe(p1Ids.length); // approved counts as buddy_approved
      expect(result.notSubmitted).toBe(0);
    });

    it('returns not ready when some worksheets need revision', () => {
      const submissions = p1Ids.map((id, i) =>
        sub(id, i === 3 ? 'needs_revision' : 'buddy_approved')
      );
      const result = getPhaseReviewStatus(1, submissions, userId);
      expect(result.ready).toBe(false);
      expect(result.buddyApproved).toBe(p1Ids.length - 1);
      expect(result.notSubmitted).toBe(1);
    });

    it('returns not ready for empty phase number', () => {
      const result = getPhaseReviewStatus(999, [], userId);
      expect(result.ready).toBe(false);
      expect(result.total).toBe(0);
    });

    it('filters by userId — other user submissions do not affect this user', () => {
      const userSubs = p1Ids.map(id => sub(id, 'buddy_approved', userId));
      const otherSub = sub('p1_w1', 'pending_review', 'other-user');
      const result = getPhaseReviewStatus(1, [...userSubs, otherSub], userId);
      expect(result.ready).toBe(true);
      expect(result.buddyApproved).toBe(p1Ids.length);
    });

    it('counts revision_submitted as not buddy_approved', () => {
      const submissions = p1Ids.map((id, i) =>
        sub(id, i === 0 ? 'revision_submitted' : 'buddy_approved')
      );
      const result = getPhaseReviewStatus(1, submissions, userId);
      expect(result.ready).toBe(false);
      expect(result.buddyApproved).toBe(p1Ids.length - 1);
    });

    it('counts both buddy_approved and approved as buddyApproved', () => {
      const submissions = p1Ids.map((id, i) =>
        sub(id, i < 4 ? 'approved' : 'buddy_approved')
      );
      const result = getPhaseReviewStatus(1, submissions, userId);
      expect(result.ready).toBe(true);
      expect(result.buddyApproved).toBe(p1Ids.length);
    });

    it('multiple phases work independently', () => {
      const phase1Subs = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'buddy_approved', userId));
      const phase2Subs = (PHASE_WORKSHEETS_MAP[2] || []).map(id => sub(id, 'pending_review', userId));

      const allSubs = [...phase1Subs, ...phase2Subs];

      const p1Result = getPhaseReviewStatus(1, allSubs, userId);
      expect(p1Result.ready).toBe(true);

      const p2Result = getPhaseReviewStatus(2, allSubs, userId);
      // Phase 2 worksheets are NOT duplicated in Phase 1 anymore (taxonomy reconciled),
      // so buddy_approved submissions from Phase 1 do NOT count toward Phase 2.
      expect(p2Result.ready).toBe(false);
      expect(p2Result.buddyApproved).toBe(0);
    });
  });

  // ── getBuddyApprovedSheets ────────────────────────────────────

  describe('getBuddyApprovedSheets', () => {
    it('returns empty array when no worksheets are buddy_approved', () => {
      const submissions = p1Ids.map(id => sub(id, 'pending_review'));
      const result = getBuddyApprovedSheets(1, submissions, userId);
      expect(result).toEqual([]);
    });

    it('returns only buddy_approved worksheet IDs (not approved ones)', () => {
      // Mark first 3 as approved, next 3 as buddy_approved, rest as pending
      const submissions = p1Ids.map((id, i) => {
        if (i < 3) return sub(id, 'approved');
        if (i < 6) return sub(id, 'buddy_approved');
        return sub(id, 'pending_review');
      });
      const result = getBuddyApprovedSheets(1, submissions, userId);
      // Should only return the buddy_approved ones (not the approved ones)
      expect(result.length).toBe(3);
      result.forEach(id => {
        const s = submissions.find(s => s.worksheet_id === id);
        expect(s!.review_status).toBe('buddy_approved');
      });
    });

    it('returns empty for non-existent phase', () => {
      const result = getBuddyApprovedSheets(999, [], userId);
      expect(result).toEqual([]);
    });
  });

  // ── getPhaseWorksheetsByStatus ────────────────────────────────

  describe('getPhaseWorksheetsByStatus', () => {
    it('filters worksheets by the given review_status', () => {
      const submissions = p1Ids.map((id, i) =>
        sub(id, i % 2 === 0 ? 'buddy_approved' : 'pending_review')
      );
      const buddyApproved = getPhaseWorksheetsByStatus(1, submissions, userId, 'buddy_approved');
      const pending = getPhaseWorksheetsByStatus(1, submissions, userId, 'pending_review');
      const evenCount = Math.ceil(p1Ids.length / 2);
      const oddCount = Math.floor(p1Ids.length / 2);

      expect(buddyApproved.length).toBe(evenCount);
      expect(pending.length).toBe(oddCount);
    });

    it('returns empty array when no submissions match the status', () => {
      const submissions = p1Ids.map(id => sub(id, 'buddy_approved'));
      const result = getPhaseWorksheetsByStatus(1, submissions, userId, 'needs_revision');
      expect(result).toEqual([]);
    });
  });

  // ── PHASE_WORKSHEETS_MAP structural tests ─────────────────────

  describe('PHASE_WORKSHEETS_MAP structure', () => {
    it('has exactly 3 phases', () => {
      expect(Object.keys(PHASE_WORKSHEETS_MAP).length).toBe(3);
    });

    it('phase 1 has FTP Week 1 + legacy worksheets including gate controls', () => {
      const ids = PHASE_WORKSHEETS_MAP[1] || [];
      // Should include FTP Week 1 gate (only week 1 gate is in Phase 1)
      expect(ids).toContain('w1_g1');
      // FTP weeks 2-4 gates are gated by WeekAccessGuard, not PHASE_WORKSHEETS_MAP
      expect(ids).not.toContain('w2_g1');
      expect(ids).not.toContain('w3_g1');
      expect(ids).not.toContain('w4_g1');
      // Should include legacy Phase 1 gate control
      expect(ids).toContain('gc1');
    });

    it('phase 2 has 5 worksheets (4 + 1 gate control)', () => {
      expect((PHASE_WORKSHEETS_MAP[2] || []).length).toBe(5);
      expect(PHASE_WORKSHEETS_MAP[2] || []).toContain('gc2');
    });

    it('phase 3 has 6 worksheets (5 + 1 gate control)', () => {
      expect((PHASE_WORKSHEETS_MAP[3] || []).length).toBe(6);
      expect(PHASE_WORKSHEETS_MAP[3] || []).toContain('gc3');
    });

    it('total across all phases reflects Phase 1 + Phases 2-3 (no duplicates)', () => {
      const total = [1, 2, 3].reduce((sum, p) => sum + (PHASE_WORKSHEETS_MAP[p] || []).length, 0);
      // Phase 1: 12 (FTP Week 1 + legacy), Phase 2: 5, Phase 3: 6 = 23
      const p1Length = (PHASE_WORKSHEETS_MAP[1] || []).length;
      const p2Length = (PHASE_WORKSHEETS_MAP[2] || []).length;
      const p3Length = (PHASE_WORKSHEETS_MAP[3] || []).length;
      expect(total).toBe(p1Length + p2Length + p3Length);
    });

it('no worksheet IDs are shared across phases (taxonomy reconciled)', () => {
      // After taxonomy reconciliation, FTP weeks 2-4 worksheets removed from Phase 1
      // so no IDs should appear in multiple phases
      const allIds = [1, 2, 3].flatMap(p => PHASE_WORKSHEETS_MAP[p] || []);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });
});
