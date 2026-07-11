import { SUBMISSION_STATUS, REVIEW_STATUS } from '../constants/status';

// ─── Types ──────────────────────────────────────────────

export interface StatusInfo {
  status: string | null;
  review_status: string | null;
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Check if a worksheet should be considered "complete" based on its status.
 * A worksheet is complete if it's submitted, approved, or buddy_approved.
 */
export function isWorksheetComplete(status: StatusInfo | undefined): boolean {
  if (!status) return false;
  return status.status === SUBMISSION_STATUS.SUBMITTED
    || status.review_status === REVIEW_STATUS.APPROVED
    || status.review_status === REVIEW_STATUS.BUDDY_APPROVED;
}

/**
 * Count how many worksheets in the given list are complete.
 */
export function countCompleted(
  worksheetIds: string[],
  statuses: Record<string, StatusInfo>
): number {
  return worksheetIds.filter(id => isWorksheetComplete(statuses[id])).length;
}

/**
 * Safely extract the `StatusInfo` record from an array of Supabase query rows.
 * Each row should have at least `worksheet_id`, `status`, and `review_status`.
 */
export function buildStatusMap(
  rows: Array<{ worksheet_id: string; status: string | null; review_status: string | null }> | null
): Record<string, StatusInfo> {
  const map: Record<string, StatusInfo> = {};
  if (rows) {
    rows.forEach(s => {
      map[s.worksheet_id] = { status: s.status, review_status: s.review_status };
    });
  }
  return map;
}
