import { describe, expect, it } from 'vitest';
import { pickNextWorksheet } from '../nextWorksheet';

describe('pickNextWorksheet', () => {
  const phaseMap = {
    1: ['p1_w1', 'p1_w2'],
    2: ['p2_w1'],
    3: ['p3_w1'],
  };

  it('returns the first unfinished worksheet in the earliest incomplete phase', () => {
    expect(pickNextWorksheet([
      { worksheet_id: 'p1_w1', review_status: 'buddy_approved', status: 'submitted' },
    ], phaseMap)).toEqual({ worksheetId: 'p1_w2', phaseNum: 1 });
  });

  it('moves to the next phase when the earlier phase is complete', () => {
    expect(pickNextWorksheet([
      { worksheet_id: 'p1_w1', review_status: 'approved', status: 'submitted' },
      { worksheet_id: 'p1_w2', review_status: 'buddy_approved', status: 'submitted' },
    ], phaseMap)).toEqual({ worksheetId: 'p2_w1', phaseNum: 2 });
  });

  it('returns null when every worksheet is approved', () => {
    expect(pickNextWorksheet(
      Object.values(phaseMap).flat().map((worksheet_id) => ({
        worksheet_id,
        review_status: 'approved',
        status: 'submitted',
      })),
      phaseMap,
    )).toBeNull();
  });
});
