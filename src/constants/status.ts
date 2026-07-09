/**
 * Shared status constants for worksheet/review/notification status values.
 * 
 * Every file that reads or writes status/review_status/notification-type
 * strings should import from here instead of using inline string literals.
 * This prevents casing drift (e.g. 'Submitted' vs 'submitted') and makes
 * cross-file refactoring safe.
 */

// ─── Worksheet Submission Status ─────────────────────────
export const SUBMISSION_STATUS = {
  /** User is actively editing — not yet submitted */
  IN_PROGRESS: 'In Progress',
  /** User has clicked "Submit" */
  SUBMITTED: 'submitted',
  /** Not yet started */
  NOT_STARTED: 'Not Started',
} as const;

// ─── Review Status ──────────────────────────────────────
export const REVIEW_STATUS = {
  /** New submission, waiting for buddy review */
  PENDING_REVIEW: 'pending_review',
  /** Buddy approved — waiting for manager phase approval */
  BUDDY_APPROVED: 'buddy_approved',
  /** Manager approved — final state */
  APPROVED: 'approved',
  /** Buddy requested changes */
  NEEDS_REVISION: 'needs_revision',
  /** Joinee re-submitted after revision */
  REVISION_SUBMITTED: 'revision_submitted',
  /** Not started / empty */
  EMPTY: '',
} as const;

// ─── Notification Types ─────────────────────────────────
export const NOTIFICATION_TYPE = {
  SUBMITTED: 'submitted',
  REVISION_SUBMITTED: 'revision_submitted',
  BUDDY_APPROVED: 'buddy_approved',
  APPROVED: 'approved',
  NEEDS_REVISION: 'needs_revision',
} as const;

// ─── Helper: check if a submission is "complete" for gating ──
const COMPLETE_STATUSES: ReadonlySet<string> = new Set([
  REVIEW_STATUS.BUDDY_APPROVED,
  REVIEW_STATUS.APPROVED,
]);

export function isCompleteReviewStatus(status: string): boolean {
  return COMPLETE_STATUSES.has(status);
}

// ─── Helper: check from front-end worksheet status ──────
export function isWorksheetSubmitted(status: string): boolean {
  return status === SUBMISSION_STATUS.SUBMITTED;
}
