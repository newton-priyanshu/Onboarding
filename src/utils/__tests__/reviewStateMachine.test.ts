import { describe, it, expect } from 'vitest';
import {
  computeSubmitReviewStatus,
  computeReviewTransition,
  type ReviewAction,
} from '../reviewStateMachine';
import { REVIEW_STATUS, SUBMISSION_STATUS } from '../../constants/status';
import type { UserRole } from '../../types/supabase';

// All review_status values the state machine can ever see.
const ALL_STATUSES: string[] = [
  REVIEW_STATUS.EMPTY,
  REVIEW_STATUS.PENDING_REVIEW,
  REVIEW_STATUS.NEEDS_REVISION,
  REVIEW_STATUS.REVISION_SUBMITTED,
  REVIEW_STATUS.BUDDY_APPROVED,
  REVIEW_STATUS.APPROVED,
];

// All roles that exist in the product.
const ALL_ROLES: UserRole[] = [
  'new_joinee',
  'lab_instructor',
  'lead_instructor',
  'academic_head',
  'onboarding_lead',
  'acad_ops',
  'progression_head',
  'ops_head',
  'campus_head',
];

const ACTIONS: ReviewAction[] = ['approve', 'request_revision'];

describe('computeSubmitReviewStatus (extracted from useAutoSave save())', () => {
  // This table is the exact behavior that used to live inline in
  // useAutoSave.ts's save(). It must not drift on refactor.
  it.each([
    // [submissionStatus, savedReviewStatus, expected]
    [SUBMISSION_STATUS.SUBMITTED, REVIEW_STATUS.NEEDS_REVISION, REVIEW_STATUS.REVISION_SUBMITTED],
    [SUBMISSION_STATUS.SUBMITTED, REVIEW_STATUS.BUDDY_APPROVED, REVIEW_STATUS.BUDDY_APPROVED],
    [SUBMISSION_STATUS.SUBMITTED, REVIEW_STATUS.EMPTY, REVIEW_STATUS.PENDING_REVIEW],
    [SUBMISSION_STATUS.SUBMITTED, REVIEW_STATUS.PENDING_REVIEW, REVIEW_STATUS.PENDING_REVIEW],
    [SUBMISSION_STATUS.SUBMITTED, REVIEW_STATUS.REVISION_SUBMITTED, REVIEW_STATUS.PENDING_REVIEW],
    [SUBMISSION_STATUS.SUBMITTED, REVIEW_STATUS.APPROVED, REVIEW_STATUS.PENDING_REVIEW],
    [SUBMISSION_STATUS.IN_PROGRESS, REVIEW_STATUS.APPROVED, REVIEW_STATUS.APPROVED],
    [SUBMISSION_STATUS.IN_PROGRESS, REVIEW_STATUS.BUDDY_APPROVED, REVIEW_STATUS.BUDDY_APPROVED],
    [SUBMISSION_STATUS.IN_PROGRESS, REVIEW_STATUS.EMPTY, REVIEW_STATUS.EMPTY],
    [SUBMISSION_STATUS.IN_PROGRESS, REVIEW_STATUS.PENDING_REVIEW, REVIEW_STATUS.EMPTY],
    [SUBMISSION_STATUS.IN_PROGRESS, REVIEW_STATUS.NEEDS_REVISION, REVIEW_STATUS.EMPTY],
  ])('submissionStatus=%s savedReviewStatus=%s -> %s', (submissionStatus, saved, expected) => {
    expect(computeSubmitReviewStatus(submissionStatus, saved)).toBe(expected);
  });
});

describe('computeReviewTransition — submit action', () => {
  it('is always structurally allowed (submit itself is not role-gated)', () => {
    for (const role of ALL_ROLES) {
      for (const status of ALL_STATUSES) {
        const result = computeReviewTransition('submit', status, role, {
          submissionStatus: SUBMISSION_STATUS.SUBMITTED,
        });
        expect(result.allowed).toBe(true);
      }
    }
  });

  // ── Hard security invariant (H38/H39): the worksheet OWNER can never, via
  // any submit, cause review_status to become 'approved'. ──
  it('owner (new_joinee) submit action NEVER yields review_status "approved", from any starting state', () => {
    for (const status of ALL_STATUSES) {
      for (const submissionStatus of [SUBMISSION_STATUS.SUBMITTED, SUBMISSION_STATUS.IN_PROGRESS]) {
        const result = computeReviewTransition('submit', status, 'new_joinee', { submissionStatus });
        expect(result.nextStatus).not.toBe(REVIEW_STATUS.APPROVED);
      }
    }
  });

  it('clamps an already-approved worksheet down to buddy_approved for the owner specifically (defense in depth)', () => {
    const result = computeReviewTransition('submit', REVIEW_STATUS.APPROVED, 'new_joinee', {
      submissionStatus: SUBMISSION_STATUS.IN_PROGRESS,
    });
    expect(result.nextStatus).toBe(REVIEW_STATUS.BUDDY_APPROVED);
  });

  it('does not clamp non-owner roles (submit is not the real code path for them, but the function stays a pure passthrough)', () => {
    for (const role of ALL_ROLES.filter(r => r !== 'new_joinee')) {
      const result = computeReviewTransition('submit', REVIEW_STATUS.APPROVED, role, {
        submissionStatus: SUBMISSION_STATUS.IN_PROGRESS,
      });
      expect(result.nextStatus).toBe(REVIEW_STATUS.APPROVED);
    }
  });
});

describe('computeReviewTransition — approve / request_revision (full role x status matrix)', () => {
  // The ONLY legal (action, fromStatus, role) edges in the whole system.
  // Everything else in the cross product below must be illegal.
  const LEGAL_EDGES: Array<{ action: ReviewAction; from: string; role: UserRole; to: string }> = [
    { action: 'approve', from: REVIEW_STATUS.PENDING_REVIEW, role: 'lead_instructor', to: REVIEW_STATUS.BUDDY_APPROVED },
    { action: 'approve', from: REVIEW_STATUS.REVISION_SUBMITTED, role: 'lead_instructor', to: REVIEW_STATUS.BUDDY_APPROVED },
    { action: 'request_revision', from: REVIEW_STATUS.PENDING_REVIEW, role: 'lead_instructor', to: REVIEW_STATUS.NEEDS_REVISION },
    { action: 'request_revision', from: REVIEW_STATUS.REVISION_SUBMITTED, role: 'lead_instructor', to: REVIEW_STATUS.NEEDS_REVISION },
    { action: 'approve', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'academic_head', to: REVIEW_STATUS.APPROVED },
    { action: 'request_revision', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'academic_head', to: REVIEW_STATUS.NEEDS_REVISION },
    // progression_head: same as academic_head (department head)
    { action: 'approve', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'progression_head', to: REVIEW_STATUS.APPROVED },
    { action: 'request_revision', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'progression_head', to: REVIEW_STATUS.NEEDS_REVISION },
    // ops_head: same as academic_head (department head)
    { action: 'approve', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'ops_head', to: REVIEW_STATUS.APPROVED },
    { action: 'request_revision', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'ops_head', to: REVIEW_STATUS.NEEDS_REVISION },
    // campus_head: same as academic_head (oversees all departments)
    { action: 'approve', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'campus_head', to: REVIEW_STATUS.APPROVED },
    { action: 'request_revision', from: REVIEW_STATUS.BUDDY_APPROVED, role: 'campus_head', to: REVIEW_STATUS.NEEDS_REVISION },
  ];

  function isLegal(action: ReviewAction, from: string, role: UserRole): { to: string } | null {
    const match = LEGAL_EDGES.find(e => e.action === action && e.from === from && e.role === role);
    return match ? { to: match.to } : null;
  }

  // Exhaustive cross product: 2 actions x 6 statuses x 9 roles = 108 edges.
  for (const action of ACTIONS) {
    for (const status of ALL_STATUSES) {
      for (const role of ALL_ROLES) {
        const legal = isLegal(action, status, role);
        const label = `${action} from "${status || '(empty)'}" as ${role}`;
        if (legal) {
          it(`LEGAL: ${label} -> ${legal.to}`, () => {
            const result = computeReviewTransition(action, status, role);
            expect(result.allowed).toBe(true);
            expect(result.nextStatus).toBe(legal.to);
            expect(result.reason).toBeUndefined();
          });
        } else {
          it(`ILLEGAL: ${label} is rejected`, () => {
            const result = computeReviewTransition(action, status, role);
            expect(result.allowed).toBe(false);
            // An illegal transition must never report a *different* status —
            // the status must be left exactly as it was found.
            expect(result.nextStatus).toBe(status);
            expect(result.reason).toBeTruthy();
          });
        }
      }
    }
  }

  // ── Explicit, named callouts for the invariant the task cares about most ──
  it('the owner (new_joinee) can never reach "approved" via approve, from any non-approved status', () => {
    // Excludes the trivially-already-approved starting state: a rejected
    // transition reports the status unchanged, so starting at 'approved'
    // would report 'approved' back without the actor having "reached" it.
    for (const status of ALL_STATUSES.filter(s => s !== REVIEW_STATUS.APPROVED)) {
      const result = computeReviewTransition('approve', status, 'new_joinee');
      expect(result.allowed).toBe(false);
      expect(result.nextStatus).not.toBe(REVIEW_STATUS.APPROVED);
    }
  });

  it('the owner (new_joinee) can never request_revision on any status', () => {
    for (const status of ALL_STATUSES) {
      const result = computeReviewTransition('request_revision', status, 'new_joinee');
      expect(result.allowed).toBe(false);
    }
  });

  it('a buddy (lead_instructor) can never approve straight to "approved" (only buddy_approved)', () => {
    for (const status of ALL_STATUSES.filter(s => s !== REVIEW_STATUS.APPROVED)) {
      const result = computeReviewTransition('approve', status, 'lead_instructor');
      expect(result.nextStatus).not.toBe(REVIEW_STATUS.APPROVED);
    }
  });

  it('a department head (academic_head / progression_head / ops_head / campus_head) cannot approve a worksheet that is not yet buddy_approved', () => {
    const deptHeadRoles: UserRole[] = ['academic_head', 'progression_head', 'ops_head', 'campus_head'];
    for (const role of deptHeadRoles) {
      for (const status of ALL_STATUSES.filter(s => s !== REVIEW_STATUS.BUDDY_APPROVED)) {
        const result = computeReviewTransition('approve', status, role);
        expect(result.allowed).toBe(false);
      }
    }
  });

  it('read-only roles (onboarding_lead) can never approve or request revision from any status', () => {
    for (const status of ALL_STATUSES) {
      expect(computeReviewTransition('approve', status, 'onboarding_lead').allowed).toBe(false);
      expect(computeReviewTransition('request_revision', status, 'onboarding_lead').allowed).toBe(false);
    }
  });
});

describe('computeReviewTransition — unknown action', () => {
  it('rejects an unrecognized action rather than silently allowing it', () => {
    // Cast through unknown to exercise the runtime guard against a value that
    // TypeScript itself would reject at compile time.
    const result = computeReviewTransition('delete_forever' as unknown as ReviewAction, REVIEW_STATUS.PENDING_REVIEW, 'academic_head');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unknown action');
  });
});
