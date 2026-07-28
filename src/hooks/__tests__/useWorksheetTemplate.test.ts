/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as templatesApi from '../../api/templates';
import * as authContext from '../../context/AuthContext';
import type { OnboardingTemplate } from '../../types/supabase';
import { useWorksheetTemplate } from '../useWorksheetTemplate';

// ─── Mocks ──────────────────────────────────────────────

vi.mock('../../api/templates', () => ({
  getCampusTemplate: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────

function createMockTemplate(overrides: Partial<OnboardingTemplate> = {}): OnboardingTemplate {
  return {
    id: 'test-template-1',
    campus_id: 'campus-1',
    name: 'Test Template',
    description: null,
    structure: {
      weeks: [],
      phases: [
        { num: 1, title: 'Phase 1 — Orientation', days: 'Days 1–30', worksheets: ['p1_w1', 'p1_w2'] },
        { num: 2, title: 'Phase 2 — Contribution', days: 'Days 31–60', worksheets: ['p2_w1', 'p2_w2'] },
      ],
      gateArtifacts: {},
    },
    approval_chain: ['lead_instructor', 'academic_head'],
    is_active: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('useWorksheetTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null template when user has no campus_id', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      profile: { campus_id: null },
    } as ReturnType<typeof authContext.useAuth>);

    const { result } = renderHook(() => useWorksheetTemplate());

    expect(result.current.template).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(templatesApi.getCampusTemplate).not.toHaveBeenCalled();
  });

  it('returns null template when profile is null', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      profile: null,
    } as ReturnType<typeof authContext.useAuth>);

    const { result } = renderHook(() => useWorksheetTemplate());

    expect(result.current.template).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(templatesApi.getCampusTemplate).not.toHaveBeenCalled();
  });

  it('fetches and returns the campus template when campus_id is set', async () => {
    const mockTemplate = createMockTemplate({ campus_id: 'campus-success' });
    vi.mocked(templatesApi.getCampusTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(authContext.useAuth).mockReturnValue({
      profile: { campus_id: 'campus-success' },
    } as ReturnType<typeof authContext.useAuth>);

    const { result } = renderHook(() => useWorksheetTemplate());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.template).toBeNull();

    // Wait for the template to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.template).toEqual(mockTemplate);
    expect(result.current.error).toBeNull();
    expect(templatesApi.getCampusTemplate).toHaveBeenCalledWith('campus-success');
  });

  it('handles fetch errors gracefully', async () => {
    vi.mocked(templatesApi.getCampusTemplate).mockRejectedValue(new Error('Network error'));
    vi.mocked(authContext.useAuth).mockReturnValue({
      profile: { campus_id: 'campus-error' },
    } as ReturnType<typeof authContext.useAuth>);

    const { result } = renderHook(() => useWorksheetTemplate());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.template).toBeNull();
    expect(result.current.error).toContain('Network error');
  });

  it('handles null template response (no template configured)', async () => {
    vi.mocked(templatesApi.getCampusTemplate).mockResolvedValue(null);
    vi.mocked(authContext.useAuth).mockReturnValue({
      profile: { campus_id: 'campus-null' },
    } as ReturnType<typeof authContext.useAuth>);

    const { result } = renderHook(() => useWorksheetTemplate());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.template).toBeNull();
    expect(result.current.error).toBeNull();
    expect(templatesApi.getCampusTemplate).toHaveBeenCalledWith('campus-null');
  });
});
