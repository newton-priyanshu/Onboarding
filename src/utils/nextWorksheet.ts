import { PHASE_WORKSHEETS_MAP } from '../config/worksheetConfigData';

export interface NextUpWorksheet {
  worksheetId: string;
  phaseNum: number;
}

/**
 * Picks the first unfinished worksheet in the earliest incomplete phase.
 */
export function pickNextWorksheet(
  submissions: Array<{ worksheet_id: string; review_status: string; status: string }>,
  phaseMap: Record<number, string[]> = PHASE_WORKSHEETS_MAP,
): NextUpWorksheet | null {
  for (const phaseNum of [1, 2, 3] as const) {
    const worksheetIds = phaseMap[phaseNum] || [];
    const nextWorksheet = worksheetIds.find((worksheetId) => {
      const submission = submissions.find((item) => item.worksheet_id === worksheetId);
      return !submission || (
        submission.review_status !== 'approved' &&
        submission.review_status !== 'buddy_approved'
      );
    });

    if (nextWorksheet) return { worksheetId: nextWorksheet, phaseNum };
  }

  return null;
}
