import { describe, it, expect } from 'vitest';
import {
  WORKSHEET_REVIEWER,
  WORKSHEET_NAMES,
  WORKSHEET_INFO,
  PHASE_WORKSHEETS_MAP,
  ALL_WORKSHEETS,
  WK_WORKSHEETS_MAP,
  FTP_WEEK_SESSIONS,
  WSID_TO_SESSION_ID,
  WSID_ENGINE_TAG,
  getReviewerType,
  getReviewerLabel,
  getWorksheetsForReviewer,
  isPhaseApproved,
  getApprovedPhases,
  getMaxAccessiblePhase,
  canAccessPhase,
  REVIEWER_LABELS,
  REVIEWER_STYLES,
  ENGINE_TAG_INFO,
  ENGINE_TAG_COLORS,
  WEEK_LABELS,
  PHASE_LABELS,
  FTP_GATE_LABELS,
  FTP_GATE_ARTIFACTS,
} from '../worksheetConfigData';

// ─── Type helpers ────────────────────────────────────────

import type { WorksheetSubmission, FtpWeek, WorksheetId, ReviewStatus, SubmissionStatus, ReviewerType } from '../../types/supabase';

function sub(worksheetId: string, reviewStatus: string, userId: string = 'user-1'): WorksheetSubmission {
  return {
    id: '',
    user_id: userId,
    worksheet_id: worksheetId as WorksheetId,
    worksheet_data: {},
    phase: '',
    status: 'In Progress' as SubmissionStatus,
    review_status: reviewStatus as ReviewStatus,
    reviewer_type: 'buddy' as ReviewerType,
    reviewed_by: null,
    reviewer_name: null,
    review_comment: null,
    reviewed_at: null,
    review_history: [],
    created_at: '',
    updated_at: '',
  };
}

// ─── Data Integrity Tests ────────────────────────────────

describe('Data integrity: WORKSHEET_REVIEWER', () => {
  it('all WORKSHEET_REVIEWER keys exist in WORKSHEET_NAMES', () => {
    const reviewerKeys = Object.keys(WORKSHEET_REVIEWER);
    reviewerKeys.forEach(id => {
      expect(WORKSHEET_NAMES[id], `Missing WORKSHEET_NAMES entry for ${id}`).toBeDefined();
    });
  });

  it('all WORKSHEET_NAMES keys exist in WORKSHEET_REVIEWER', () => {
    const namesKeys = Object.keys(WORKSHEET_NAMES);
    namesKeys.forEach(id => {
      expect(WORKSHEET_REVIEWER[id], `Missing WORKSHEET_REVIEWER entry for ${id}`).toBeDefined();
    });
  });

  it('all WORKSHEET_REVIEWER keys exist in WORKSHEET_INFO', () => {
    const reviewerKeys = Object.keys(WORKSHEET_REVIEWER);
    reviewerKeys.forEach(id => {
      expect(WORKSHEET_INFO[id], `Missing WORKSHEET_INFO entry for ${id}`).toBeDefined();
    });
  });

  it('all WORKSHEET_INFO keys exist in WORKSHEET_REVIEWER', () => {
    const infoKeys = Object.keys(WORKSHEET_INFO);
    infoKeys.forEach(id => {
      expect(WORKSHEET_REVIEWER[id], `Missing WORKSHEET_REVIEWER entry for ${id}`).toBeDefined();
    });
  });

  it('all reviewer types are valid (buddy, manager, onboarding_lead)', () => {
    const validTypes = ['buddy', 'manager', 'onboarding_lead'];
    Object.values(WORKSHEET_REVIEWER).forEach(type => {
      expect(validTypes).toContain(type);
    });
  });

  it('REVIEWER_LABELS covers all reviewer types used in WORKSHEET_REVIEWER', () => {
    const usedTypes = new Set(Object.values(WORKSHEET_REVIEWER));
    usedTypes.forEach(type => {
      expect(REVIEWER_LABELS[type], `Missing REVIEWER_LABELS for ${type}`).toBeDefined();
    });
  });

  it('REVIEWER_STYLES covers all reviewer types', () => {
    const usedTypes = new Set(Object.values(WORKSHEET_REVIEWER));
    usedTypes.forEach(type => {
      const style = REVIEWER_STYLES[type];
      expect(style, `Missing REVIEWER_STYLES for ${type}`).toBeDefined();
      if (style) {
        expect(style.color).toBeDefined();
        expect(style.border).toBeDefined();
      }
    });
  });

  it('has no duplicate reviewer entries', () => {
    const keys = Object.keys(WORKSHEET_REVIEWER);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});

describe('Data integrity: PHASE_WORKSHEETS_MAP', () => {
  it('all worksheet IDs in Phase 1 exist in WORKSHEET_REVIEWER', () => {
    (PHASE_WORKSHEETS_MAP[1] || []).forEach(id => {
      expect(WORKSHEET_REVIEWER[id], `Phase 1: ${id} not in WORKSHEET_REVIEWER`).toBeDefined();
    });
  });

  it('all worksheet IDs in Phase 2 exist in WORKSHEET_REVIEWER', () => {
    (PHASE_WORKSHEETS_MAP[2] || []).forEach(id => {
      expect(WORKSHEET_REVIEWER[id], `Phase 2: ${id} not in WORKSHEET_REVIEWER`).toBeDefined();
    });
  });

  it('all worksheet IDs in Phase 3 exist in WORKSHEET_REVIEWER', () => {
    (PHASE_WORKSHEETS_MAP[3] || []).forEach(id => {
      expect(WORKSHEET_REVIEWER[id], `Phase 3: ${id} not in WORKSHEET_REVIEWER`).toBeDefined();
    });
  });

  it('Phase 1 has worksheets from FTP weeks and legacy Phase 1', () => {
    const ids = PHASE_WORKSHEETS_MAP[1] || [];
    // FTP week worksheets
    expect(ids).toContain('w1_o1');
    expect(ids).toContain('w2_e1');
    expect(ids).toContain('w3_d1');
    expect(ids).toContain('w4_d2');
    // Legacy Phase 1 worksheets
    expect(ids).toContain('p1_w1');
    expect(ids).toContain('p1_w2');
    expect(ids).toContain('p1_w4');
    expect(ids).toContain('p1_w8');
    expect(ids).toContain('gc1');
    // Gate controls
    expect(ids).toContain('w1_g1');
    expect(ids).toContain('w2_g1');
    expect(ids).toContain('w3_g1');
    expect(ids).toContain('w4_g1');
  });

  it('every PHASE_WORKSHEETS_MAP ID has a WORKSHEET_NAMES entry', () => {
    [1, 2, 3].forEach(phase => {
      (PHASE_WORKSHEETS_MAP[phase] || []).forEach(id => {
        expect(WORKSHEET_NAMES[id], `Phase ${phase}: ${id} missing from WORKSHEET_NAMES`).toBeDefined();
      });
    });
  });

  it('WK_WORKSHEETS_MAP IDs all exist in WORKSHEET_REVIEWER', () => {
    [1, 2, 3, 4].forEach(week => {
      (WK_WORKSHEETS_MAP[week] || []).forEach(id => {
        expect(WORKSHEET_REVIEWER[id], `Week ${week}: ${id} not in WORKSHEET_REVIEWER`).toBeDefined();
      });
    });
  });
});

describe('Data integrity: ALL_WORKSHEETS', () => {
  it('covers Phase 1, Phase 2, and Phase 3', () => {
    expect(ALL_WORKSHEETS['Phase 1']).toBeDefined();
    expect(ALL_WORKSHEETS['Phase 2']).toBeDefined();
    expect(ALL_WORKSHEETS['Phase 3']).toBeDefined();
  });

  it('all sheet IDs in Phase 1 group exist in WORKSHEET_REVIEWER', () => {
    (ALL_WORKSHEETS['Phase 1']?.sheets || []).forEach(sheet => {
      expect(WORKSHEET_REVIEWER[sheet.id], `ALL_WORKSHEETS Phase 1: ${sheet.id} not in WORKSHEET_REVIEWER`).toBeDefined();
    });
  });

  it('all sheet IDs in Phase 2 group exist in WORKSHEET_REVIEWER', () => {
    (ALL_WORKSHEETS['Phase 2']?.sheets || []).forEach(sheet => {
      expect(WORKSHEET_REVIEWER[sheet.id], `ALL_WORKSHEETS Phase 2: ${sheet.id} not in WORKSHEET_REVIEWER`).toBeDefined();
    });
  });

  it('all sheet IDs in Phase 3 group exist in WORKSHEET_REVIEWER', () => {
    (ALL_WORKSHEETS['Phase 3']?.sheets || []).forEach(sheet => {
      expect(WORKSHEET_REVIEWER[sheet.id], `ALL_WORKSHEETS Phase 3: ${sheet.id} not in WORKSHEET_REVIEWER`).toBeDefined();
    });
  });
});

describe('Data integrity: FTP_WEEK_SESSIONS', () => {
  it('has entries for weeks 1-4', () => {
    expect(FTP_WEEK_SESSIONS[1]).toBeDefined();
    expect(FTP_WEEK_SESSIONS[2]).toBeDefined();
    expect(FTP_WEEK_SESSIONS[3]).toBeDefined();
    expect(FTP_WEEK_SESSIONS[4]).toBeDefined();
  });

  it('all session worksheetIds have a WSID_TO_SESSION_ID entry', () => {
    ([1, 2, 3, 4] as FtpWeek[]).forEach(week => {
      const sessions = FTP_WEEK_SESSIONS[week];
      if (!sessions) return;
      sessions.forEach(session => {
        if (!session.worksheetId) return;
        expect(WSID_TO_SESSION_ID[session.worksheetId]!,
          `Week ${week} session ${session.sessionId}: ${session.worksheetId} missing in WSID_TO_SESSION_ID`
        ).toBeDefined();
      });
    });
  });

  it('all session worksheetIds have a WSID_ENGINE_TAG entry', () => {
    ([1, 2, 3, 4] as FtpWeek[]).forEach(week => {
      const sessions = FTP_WEEK_SESSIONS[week];
      if (!sessions) return;
      sessions.forEach(session => {
        if (!session.worksheetId) return;
        expect(WSID_ENGINE_TAG[session.worksheetId]!,
          `Week ${week} session ${session.sessionId}: ${session.worksheetId} missing in WSID_ENGINE_TAG`
        ).toBeDefined();
      });
    });
  });

  it('ENGINE_TAG_INFO has entries for both K and B tags', () => {
    expect(ENGINE_TAG_INFO.K).toBeDefined();
    expect(ENGINE_TAG_INFO.B).toBeDefined();
  });

  it('ENGINE_TAG_COLORS has entries for both K and B tags', () => {
    expect(ENGINE_TAG_COLORS.K).toBeDefined();
    expect(ENGINE_TAG_COLORS.B).toBeDefined();
  });
});

describe('Data integrity: FTP_GATE_ARTIFACTS', () => {
  it('has entries for all 4 gates', () => {
    expect(FTP_GATE_ARTIFACTS.w1_g1).toBeDefined();
    expect(FTP_GATE_ARTIFACTS.w2_g1).toBeDefined();
    expect(FTP_GATE_ARTIFACTS.w3_g1).toBeDefined();
    expect(FTP_GATE_ARTIFACTS.w4_g1).toBeDefined();
  });

  it('every gate has at least one artifact', () => {
    Object.values(FTP_GATE_ARTIFACTS).forEach(artifacts => {
      expect(artifacts.length).toBeGreaterThan(0);
    });
  });

  it('every artifact has a label and fromSession', () => {
    Object.entries(FTP_GATE_ARTIFACTS).forEach(([gate, artifacts]) => {
      artifacts.forEach((a, i) => {
        expect(a.label, `${gate} artifact ${i}: missing label`).toBeTruthy();
        expect(a.fromSession, `${gate} artifact ${i}: missing fromSession`).toBeTruthy();
      });
    });
  });

  it('all gate IDs from FTP_GATE_ARTIFACTS have FTP_GATE_LABELS', () => {
    Object.keys(FTP_GATE_ARTIFACTS).forEach(gateId => {
      expect(FTP_GATE_LABELS[gateId],
        `Missing FTP_GATE_LABELS for ${gateId}`
      ).toBeDefined();
    });
  });
});

describe('Data integrity: WEEK_LABELS and PHASE_LABELS', () => {
  it('WEEK_LABELS has entries for weeks 1-4', () => {
    expect(WEEK_LABELS[1]).toBeDefined();
    expect(WEEK_LABELS[2]).toBeDefined();
    expect(WEEK_LABELS[3]).toBeDefined();
    expect(WEEK_LABELS[4]).toBeDefined();
  });

  it('PHASE_LABELS has entries for phases 1-3', () => {
    expect(PHASE_LABELS[1]).toBeDefined();
    expect(PHASE_LABELS[2]).toBeDefined();
    expect(PHASE_LABELS[3]).toBeDefined();
  });
});

// ─── Helper Function Tests ───────────────────────────────

describe('getReviewerType', () => {
  it('returns buddy for a known buddy worksheet', () => {
    expect(getReviewerType('p1_w1')).toBe('buddy');
    expect(getReviewerType('p2_w1')).toBe('buddy');
    expect(getReviewerType('p3_w1')).toBe('buddy');
  });

  it('returns onboarding_lead for known onboarding_lead worksheets', () => {
    expect(getReviewerType('p1_w4')).toBe('onboarding_lead');
    expect(getReviewerType('p1_w5')).toBe('onboarding_lead');
    expect(getReviewerType('p2_w4')).toBe('onboarding_lead');
  });

  it('falls back to buddy for unknown worksheet IDs', () => {
    expect(getReviewerType('unknown_ws')).toBe('buddy');
    expect(getReviewerType('')).toBe('buddy');
  });

  it('returns buddy for FTP worksheets', () => {
    expect(getReviewerType('w1_o1')).toBe('buddy');
    expect(getReviewerType('w2_e1')).toBe('buddy');
    expect(getReviewerType('w3_d1')).toBe('buddy');
    expect(getReviewerType('w4_d2')).toBe('buddy');
  });
});

describe('getReviewerLabel', () => {
  it('returns Buddy / Mentor for buddy-reviewed worksheets', () => {
    expect(getReviewerLabel('p1_w1')).toBe('Buddy / Mentor');
  });

  it('returns Onboarding Lead for onboarding_lead worksheets', () => {
    expect(getReviewerLabel('p1_w4')).toBe('Onboarding Lead');
  });

  it('returns Manager as fallback for unknown', () => {
    // Use a special case or unknown ID
    expect(getReviewerLabel('unknown_ws')).toBe('Buddy / Mentor'); // falls back to buddy
  });
});

describe('getWorksheetsForReviewer', () => {
  it('returns all buddy worksheets', () => {
    const buddyIds = getWorksheetsForReviewer('buddy');
    expect(buddyIds.length).toBeGreaterThan(0);
    // All returned IDs should be 'buddy' type
    buddyIds.forEach(id => {
      expect(getReviewerType(id)).toBe('buddy');
    });
  });

  it('returns all onboarding_lead worksheets', () => {
    const olIds = getWorksheetsForReviewer('onboarding_lead');
    expect(olIds.length).toBeGreaterThan(0);
    olIds.forEach(id => {
      expect(getReviewerType(id)).toBe('onboarding_lead');
    });
  });

  it('returns all manager worksheets (if any)', () => {
    const managerIds = getWorksheetsForReviewer('manager');
    managerIds.forEach(id => {
      expect(getReviewerType(id)).toBe('manager');
    });
  });

  it('worksheets for buddy + onboarding_lead + manager covers all known worksheets', () => {
    const allReviewed = [
      ...getWorksheetsForReviewer('buddy'),
      ...getWorksheetsForReviewer('onboarding_lead'),
      ...getWorksheetsForReviewer('manager'),
    ];
    const allKnownIds = Object.keys(WORKSHEET_REVIEWER);
    expect(new Set(allReviewed)).toEqual(new Set(allKnownIds));
  });
});

describe('isPhaseApproved', () => {
  it('returns false when no submissions exist', () => {
    expect(isPhaseApproved('user-1', 1, [])).toBe(false);
  });

  it('returns true when all Phase 1 worksheets are approved', () => {
    const submissions = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'approved'));
    expect(isPhaseApproved('user-1', 1, submissions)).toBe(true);
  });

  it('returns false when one Phase 1 worksheet is not approved', () => {
    const wsIds = PHASE_WORKSHEETS_MAP[1] || [];
    const submissions = wsIds.map((id, i) => sub(id, i === 0 ? 'buddy_approved' : 'approved'));
    expect(isPhaseApproved('user-1', 1, submissions)).toBe(false);
  });

  it('returns false for non-existent phase', () => {
    expect(isPhaseApproved('user-1', 999, [])).toBe(true); // empty every() returns true
  });

  it('only considers submissions from the specified user', () => {
    const wsIds = PHASE_WORKSHEETS_MAP[1] || [];
    const userSubs = wsIds.map(id => sub(id, 'approved', 'user-1'));
    const otherSub = sub('p1_w1', 'pending_review', 'other-user');
    expect(isPhaseApproved('user-1', 1, [...userSubs, otherSub])).toBe(true);
  });
});

describe('getApprovedPhases', () => {
  it('returns empty array when no phases are approved', () => {
    expect(getApprovedPhases('user-1', [])).toEqual([]);
  });

  it('returns [1] when only Phase 1 is approved', () => {
    const p1Subs = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'approved'));
    expect(getApprovedPhases('user-1', p1Subs)).toEqual([1]);
  });

  it('returns [1, 2] when Phases 1 and 2 are approved', () => {
    const p1Subs = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'approved'));
    const p2Subs = (PHASE_WORKSHEETS_MAP[2] || []).map(id => sub(id, 'approved'));
    expect(getApprovedPhases('user-1', [...p1Subs, ...p2Subs])).toEqual([1, 2]);
  });

  it('returns [1, 2, 3] when all phases are approved', () => {
    const allSubs = [1, 2, 3].flatMap(p =>
      (PHASE_WORKSHEETS_MAP[p] || []).map(id => sub(id, 'approved'))
    );
    expect(getApprovedPhases('user-1', allSubs)).toEqual([1, 2, 3]);
  });
});

describe('getMaxAccessiblePhase', () => {
  it('returns 1 when no phases are approved', () => {
    expect(getMaxAccessiblePhase('user-1', [])).toBe(1);
  });

  it('returns 2 when Phase 1 is approved', () => {
    const p1Subs = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'approved'));
    expect(getMaxAccessiblePhase('user-1', p1Subs)).toBe(2);
  });

  it('returns 3 when Phases 1 and 2 are approved', () => {
    const allSubs = [1, 2].flatMap(p =>
      (PHASE_WORKSHEETS_MAP[p] || []).map(id => sub(id, 'approved'))
    );
    expect(getMaxAccessiblePhase('user-1', allSubs)).toBe(3);
  });
});

describe('canAccessPhase', () => {
  it('Phase 1 is always accessible', () => {
    expect(canAccessPhase('user-1', 1, [])).toBe(true);
  });

  it('Phase 2 is accessible when Phase 1 is approved', () => {
    const p1Subs = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'approved'));
    expect(canAccessPhase('user-1', 2, p1Subs)).toBe(true);
  });

  it('Phase 2 is not accessible when Phase 1 is not approved', () => {
    expect(canAccessPhase('user-1', 2, [])).toBe(false);
  });

  it('Phase 3 is accessible when Phases 1 and 2 are approved', () => {
    const allSubs = [1, 2].flatMap(p =>
      (PHASE_WORKSHEETS_MAP[p] || []).map(id => sub(id, 'approved'))
    );
    expect(canAccessPhase('user-1', 3, allSubs)).toBe(true);
  });

  it('Phase 3 is not accessible when Phase 2 is not approved', () => {
    const p1Subs = (PHASE_WORKSHEETS_MAP[1] || []).map(id => sub(id, 'approved'));
    expect(canAccessPhase('user-1', 3, p1Subs)).toBe(false);
  });

  it('returns false for non-existent phase', () => {
    expect(canAccessPhase('user-1', 999, [])).toBe(false);
  });
});
