/**
 * Template-driven worksheet loading — integration test (Phase 10, 12.2).
 *
 * Verifies the full data path end-to-end with a mocked supabase layer:
 *
 *   supabase.onboarding_templates  →  getCampusTemplate()  →  bridge functions
 *   in worksheetConfigData (getPhaseWorksheetIds / getWorksheetName /
 *   getReviewerType / getWeekWorksheetIds)
 *
 * A campus template with a custom structure MUST win over the hardcoded
 * config; when the template is absent (or lacks an entry), the hardcoded
 * config must be used (backward compatibility).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OnboardingTemplate } from '../../types/supabase';
import { getCampusTemplate, invalidateTemplateCache } from '../templates';
import {
  getPhaseWorksheetIds,
  getWorksheetName,
  getReviewerType,
  getWeekWorksheetIds,
  PHASE_WORKSHEETS_MAP,
  WORKSHEET_NAMES,
  WK_WORKSHEETS_MAP,
} from '../../config/worksheetConfigData';

// ─── Mocks ──────────────────────────────────────────────

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('../supabase', () => ({
  supabase: { from: mockFrom },
}));

// ─── Fixtures ───────────────────────────────────────────

/** Template with CUSTOM worksheet IDs/titles/reviewers — must override hardcoded config. */
function buildCustomTemplate(overrides: Partial<OnboardingTemplate> = {}): OnboardingTemplate {
  return {
    id: 'tpl-custom',
    campus_id: 'campus-tpl',
    name: 'Custom Template',
    description: null,
    structure: {
      weeks: [
        {
          num: 1,
          title: 'Week 1 — Custom',
          subtitle: 'sub',
          days: 'Week 1',
          theme: 'theme',
          worksheets: [
            { id: 'tpl_p1_a', num: 1, title: 'Template Alpha WS', reviewer: 'manager', engineTag: 'K', isGate: false },
            { id: 'tpl_p1_b', num: 2, title: 'Template Beta WS', reviewer: 'buddy' },
          ],
        },
      ],
      phases: [
        { num: 1, title: 'Phase 1 — Template', days: 'Days 1–30', worksheets: ['tpl_p1_a', 'tpl_p1_b'] },
      ],
      gateArtifacts: { w1_g1: [{ label: 'Artifact', required: true }] },
    },
    approval_chain: ['lead_instructor', 'academic_head'],
    is_active: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Mock the onboarding_templates query chain: select('*') → eq() x2 →
 * maybeSingle() resolves sequentially (active first, then default fallback).
 */
function mockTemplateQuery(active: OnboardingTemplate | null, def: OnboardingTemplate | null) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValueOnce({ data: active, error: null })
    .mockResolvedValueOnce({ data: def, error: null });
  const chain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const select = vi.fn(() => chain);
  mockFrom.mockReturnValue({ select });
  return { select, eq: chain.eq, maybeSingle };
}

// ─── Tests ──────────────────────────────────────────────

describe('template-driven worksheet loading (integration)', () => {
  // templates.ts caches per-campus for 120s — unique campus per test to avoid
  // cross-test cache pollution (same pattern as tenant.test.ts).
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    invalidateTemplateCache('campus-tpl');
    invalidateTemplateCache('campus-tpl-default');
    invalidateTemplateCache('campus-tpl-none');
  });

  it('fetches the active template for a campus (active row wins)', async () => {
    mockTemplateQuery(buildCustomTemplate(), null);

    const template = await getCampusTemplate('campus-tpl');

    expect(template?.name).toBe('Custom Template');
    expect(mockFrom).toHaveBeenCalledWith('onboarding_templates');
  });

  it('falls back to the default template when no active template exists', async () => {
    const def = buildCustomTemplate({ is_active: false, is_default: true });
    mockTemplateQuery(null, def);

    const template = await getCampusTemplate('campus-tpl-default');

    expect(template?.is_default).toBe(true);
    expect(template?.id).toBe('tpl-custom');
  });

  it('returns null when neither an active nor a default template exists', async () => {
    mockTemplateQuery(null, null);

    const template = await getCampusTemplate('campus-tpl-none');

    expect(template).toBeNull();
  });

  it('template phase worksheets override the hardcoded PHASE_WORKSHEETS_MAP', () => {
    const template = buildCustomTemplate();
    const custom = getPhaseWorksheetIds(1, template);
    expect(custom).toEqual(['tpl_p1_a', 'tpl_p1_b']);
    // Sanity: these custom IDs are NOT in the hardcoded map.
    expect(PHASE_WORKSHEETS_MAP[1] || []).not.toContain('tpl_p1_a');
  });

  it('template worksheet titles override the hardcoded WORKSHEET_NAMES', () => {
    const template = buildCustomTemplate();
    expect(getWorksheetName('tpl_p1_a', template)).toBe('Template Alpha WS');
    expect(getWorksheetName('tpl_p1_b', template)).toBe('Template Beta WS');
    expect(WORKSHEET_NAMES['tpl_p1_a']).toBeUndefined(); // would have returned the raw id
  });

  it('template reviewers override the hardcoded WORKSHEET_REVIEWER', () => {
    const template = buildCustomTemplate();
    expect(getReviewerType('tpl_p1_a', template)).toBe('manager');
    expect(getReviewerType('tpl_p1_b', template)).toBe('buddy');
  });

  it('template week worksheets override the hardcoded WK_WORKSHEETS_MAP', () => {
    const template = buildCustomTemplate();
    expect(getWeekWorksheetIds(1, template)).toEqual(['tpl_p1_a', 'tpl_p1_b']);
    expect(WK_WORKSHEETS_MAP[1] || []).not.toContain('tpl_p1_a');
  });

  it('falls back to hardcoded config for worksheets NOT in the template', () => {
    const template = buildCustomTemplate();
    expect(getWorksheetName('p1_w1', template)).toBe(WORKSHEET_NAMES['p1_w1']);
    expect(getPhaseWorksheetIds(2, template)).toEqual(PHASE_WORKSHEETS_MAP[2]);
  });

  it('uses hardcoded config entirely when no template is available (backward compat)', () => {
    expect(getPhaseWorksheetIds(1, null)).toEqual(PHASE_WORKSHEETS_MAP[1]);
    expect(getWorksheetName('p1_w1', null)).toBe(WORKSHEET_NAMES['p1_w1']);
    expect(getReviewerType('p1_w1', null)).toBe('buddy');
  });

  it('end-to-end: fetched template drives worksheet loading (fetch → bridge)', async () => {
    mockTemplateQuery(buildCustomTemplate(), null);

    const template = await getCampusTemplate('campus-tpl');

    expect(getPhaseWorksheetIds(1, template)).toEqual(['tpl_p1_a', 'tpl_p1_b']);
    expect(getWorksheetName('tpl_p1_a', template)).toBe('Template Alpha WS');
    expect(getReviewerType('tpl_p1_a', template)).toBe('manager');
    expect(getWeekWorksheetIds(1, template)).toEqual(['tpl_p1_a', 'tpl_p1_b']);
  });
});
