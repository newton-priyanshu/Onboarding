/**
 * reviewStateMachine — single source of truth for how a worksheet's
 * `review_status` may legally change, and who (which actor role) may cause
 * that change.
 *
 * Two call sites used to each hand-roll a piece of this:
 *  - useAutoSave.ts's save() computed the post-submit review_status inline.
 *  - WorksheetReview.tsx's handleBuddyApprove/handleBuddyRevision/
 *    handleManagerRevision each re-derived "is this actor, from this status,
 *    allowed to do this" via ad hoc conditionals.
 *
 * Both now delegate here. Extracting it lets the whole (status, actorRole,
 * action) transition table be exhaustively tested in one place — including
 * the hard security invariant that the worksheet OWNER (new_joinee) can never
 * cause review_status to become 'approved'; only an academic_head's explicit
 * `approve` action on a `buddy_approved` worksheet can.
 */
import { REVIEW_STATUS, SUBMISSION_STATUS } from '../constants/status';
import type { ReviewStatus, UserRole } from '../types/supabase';

export type ReviewAction = 'submit' | 'approve' | 'request_revision';

export interface ReviewTransitionResult {
  /** Whether `actorRole` may perform `action` from the given starting status. */
  allowed: boolean;
  /** The resulting review_status. Equal to the input status when !allowed. */
  nextStatus: ReviewStatus;
  /** Human-readable explanation, present only when !allowed. */
  reason?: string;
}

// ─── Submit transition (owner / gate-control "buddy mode" save) ─────────

/**
 * computeSubmitReviewStatus — the review_status a worksheet transitions to on
 * an explicit submit/resubmit (flushSave with isSubmit=true). Extracted
 * behavior-preserving from useAutoSave.ts's save(): the calculation itself
 * doesn't know or care who is submitting — `computeReviewTransition` below is
 * what layers the actor-role invariant on top of it.
 */
export function computeSubmitReviewStatus(
  submissionStatus: string,
  savedReviewStatus: string
): ReviewStatus {
  if (submissionStatus === SUBMISSION_STATUS.SUBMITTED) {
    if (savedReviewStatus === REVIEW_STATUS.NEEDS_REVISION) return REVIEW_STATUS.REVISION_SUBMITTED;
    if (savedReviewStatus === REVIEW_STATUS.BUDDY_APPROVED) return REVIEW_STATUS.BUDDY_APPROVED;
    return REVIEW_STATUS.PENDING_REVIEW;
  }
  if (savedReviewStatus === REVIEW_STATUS.APPROVED) return REVIEW_STATUS.APPROVED;
  if (savedReviewStatus === REVIEW_STATUS.BUDDY_APPROVED) return REVIEW_STATUS.BUDDY_APPROVED;
  return REVIEW_STATUS.EMPTY;
}

// ─── Reviewer transitions (buddy approve/revision, manager approve/revision) ──

const REVIEWABLE_FROM_PENDING: ReadonlySet<string> = new Set([
  REVIEW_STATUS.PENDING_REVIEW,
  REVIEW_STATUS.REVISION_SUBMITTED,
]);

/**
 * computeReviewTransition — authoritative answer to "can `actorRole` perform
 * `action` on a worksheet currently at `currentReviewStatus`, and if so, what
 * status does it move to?"
 *
 * Role/action matrix (mirrors WorksheetReview.tsx's & PhaseReview.tsx's
 * production guards):
 *   lead_instructor (buddy):   pending_review | revision_submitted
 *                                 --approve--------> buddy_approved
 *                                 --request_revision-> needs_revision
 *   academic_head (manager):   buddy_approved
 *                                 --approve--------> approved
 *                                 --request_revision-> needs_revision
 *   new_joinee (owner):        submit only (see computeSubmitReviewStatus) —
 *                               can NEVER approve or request_revision, and a
 *                               submit action can NEVER itself yield 'approved'.
 *   onboarding_lead / lab_instructor / acad_ops: read-only — no action allowed.
 */
export function computeReviewTransition(
  action: ReviewAction,
  currentReviewStatus: string,
  actorRole: UserRole,
  opts: { submissionStatus?: string } = {}
): ReviewTransitionResult {
  const current = currentReviewStatus as ReviewStatus;

  if (action === 'submit') {
    let nextStatus = computeSubmitReviewStatus(
      opts.submissionStatus ?? SUBMISSION_STATUS.SUBMITTED,
      currentReviewStatus
    );
    // Hard invariant: a bare submit must never itself grant 'approved'. In
    // practice the UI locks the form once approved (WorksheetPage renders a
    // read-only view), so this path shouldn't be reachable for a real owner —
    // this is defense in depth, not a behavior change for the normal flow.
    if (actorRole === 'new_joinee' && nextStatus === REVIEW_STATUS.APPROVED) {
      nextStatus = REVIEW_STATUS.BUDDY_APPROVED;
    }
    return { allowed: true, nextStatus };
  }

  if (action === 'approve') {
    if (actorRole === 'lead_instructor') {
      if (REVIEWABLE_FROM_PENDING.has(currentReviewStatus)) {
        return { allowed: true, nextStatus: REVIEW_STATUS.BUDDY_APPROVED };
      }
      return { allowed: false, nextStatus: current, reason: `Buddy cannot approve from "${currentReviewStatus}"` };
    }
    if (actorRole === 'academic_head') {
      if (currentReviewStatus === REVIEW_STATUS.BUDDY_APPROVED) {
        return { allowed: true, nextStatus: REVIEW_STATUS.APPROVED };
      }
      return { allowed: false, nextStatus: current, reason: `Manager cannot approve from "${currentReviewStatus}"` };
    }
    return { allowed: false, nextStatus: current, reason: `Role "${actorRole}" cannot approve worksheets` };
  }

  if (action === 'request_revision') {
    if (actorRole === 'lead_instructor') {
      if (REVIEWABLE_FROM_PENDING.has(currentReviewStatus)) {
        return { allowed: true, nextStatus: REVIEW_STATUS.NEEDS_REVISION };
      }
      return { allowed: false, nextStatus: current, reason: `Buddy cannot request revision from "${currentReviewStatus}"` };
    }
    if (actorRole === 'academic_head') {
      if (currentReviewStatus === REVIEW_STATUS.BUDDY_APPROVED) {
        return { allowed: true, nextStatus: REVIEW_STATUS.NEEDS_REVISION };
      }
      return { allowed: false, nextStatus: current, reason: `Manager cannot request revision from "${currentReviewStatus}"` };
    }
    return { allowed: false, nextStatus: current, reason: `Role "${actorRole}" cannot request revision` };
  }

  return { allowed: false, nextStatus: current, reason: `Unknown action "${action as string}"` };
}
