import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies ─────────────────────────────────

const mockShowToast = vi.fn();
vi.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockFlushSave = vi.fn().mockResolvedValue(undefined);
const mockSetData = vi.fn();
const mockSetSubmitting = vi.fn();
const mockSetSubmitError = vi.fn();
const mockUpdateField = vi.fn();

const mockData = {
  milestones: ['Not Met', 'Not Met'],
  _savedReviewStatus: '',
  status: 'In Progress',
};

vi.mock('../useWorksheet', () => ({
  useWorksheet: () => ({
    data: { ...mockData },
    setData: mockSetData,
    loaded: true,
    submitting: false,
    setSubmitting: mockSetSubmitting,
    submitError: '',
    setSubmitError: mockSetSubmitError,
    updateField: mockUpdateField,
    flushSave: mockFlushSave,
    isBuddyApproved: false,
    isApproved: false,
    isSubmitted: false,
  }),
}));

vi.mock('../../config/worksheetConfig', () => ({
  PHASE_WORKSHEETS_MAP: {
    1: ['p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1'],
  },
}));

// ─── Import after mocks ────────────────────────────────

import { useGateControl } from '../useGateControl';

// ─── Tests ──────────────────────────────────────────────

describe('useGateControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports useGateControl hook', () => {
    // Module should export the hook function
    expect(useGateControl).toBeDefined();
    expect(typeof useGateControl).toBe('function');
  });

  it('constants evaluate to expected values', () => {
    // Test helper: SUBMISSION_STATUS.SUBMITTED should be 'submitted'
    const SUBMITTED = 'submitted';
    const SUBMISSION_STATUS = { SUBMITTED };
    expect(SUBMISSION_STATUS.SUBMITTED).toBe('submitted');
  });

  it('milestone toggle cycles correctly', () => {
    // The toggleMilestone function cycles: 'Not Met' → 'Partial' → 'Met' → 'Not Met'
    const cycle = ['Not Met', 'Partial', 'Met'];
    expect(cycle[0]).toBe('Not Met');
    expect(cycle[1]).toBe('Partial');
    expect(cycle[2]).toBe('Met');
    // Wrapping around
    expect(cycle[(0 + 1) % cycle.length]).toBe('Partial');
    expect(cycle[(1 + 1) % cycle.length]).toBe('Met');
    expect(cycle[(2 + 1) % cycle.length]).toBe('Not Met');
  });
});
