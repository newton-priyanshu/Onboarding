import { describe, it, expect, vi } from 'vitest';
import {
  parseTemplateStructure,
  validateTemplateStructure,
  getTemplateWeeks,
  getWeek,
  getWeekWorksheets,
  getWorksheetEntry,
  getTemplatePhases,
  getPhase,
  getPhaseWorksheetIds,
  getGateArtifacts,
  getAllGateArtifacts,
  getApprovalChain,
  isReviewerInChain,
  getWorksheetTitle,
  getWorksheetReviewer,
  getWorksheetEngineTag,
  isGateWorksheet,
  resolveReviewer,
} from '../templates';
import type { OnboardingTemplate } from '../../types/supabase';

// templates.ts imports supabase at module scope; parsing/validation helpers are
// pure and never touch it, but we mock the module so the import is hermetic.
vi.mock('../supabase', () => ({ supabase: {} }));

// ─── Fixtures ───────────────────────────────────────────

const VALID_STRUCTURE: Record<string, unknown> = {
  weeks: [
    {
      num: 1,
      title: 'Anchor',
      subtitle: 'Observe begins',
      days: 'Week 1',
      theme: 'Context before content',
      worksheets: [
        { id: 'p1_w1', num: 1, title: 'Campus Immersion', reviewer: 'buddy', engineTag: 'K', isGate: false },
        { id: 'p1_w2', num: 2, title: 'Faculty Shadowing', reviewer: 'buddy' },
      ],
    },
    {
      num: 2,
      title: 'Observe',
      subtitle: 'Structured observation',
      days: 'Week 2',
      theme: 'Watch experienced faculty',
      worksheets: [
        { id: 'p1_w3', num: 1, title: 'Observation Log', reviewer: 'manager', isGate: true },
      ],
    },
  ],
  phases: [
    { num: 1, title: 'Phase 1 — Orientation', days: 'Days 1–30', worksheets: ['p1_w1', 'p1_w2', 'p1_w3'] },
    { num: 2, title: 'Phase 2 — Contribution', days: 'Days 31–60', worksheets: ['p2_w1'] },
  ],
  gateArtifacts: {
    w1_g1: [
      { label: 'Operational checklist complete', required: true },
      { label: 'Campus tour signed off', required: false },
    ],
    w2_g1: [{ label: 'Observation log submitted', required: true }],
  },
};

function buildTemplate(structure: Record<string, unknown> = VALID_STRUCTURE): OnboardingTemplate {
  return {
    id: 'tpl-1',
    campus_id: 'campus-1',
    name: 'FTP Template',
    description: null,
    structure,
    approval_chain: ['lead_instructor', 'academic_head'],
    is_active: true,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

// ─── parseTemplateStructure ─────────────────────────────

describe('parseTemplateStructure', () => {
  it('parses a valid structure into typed weeks/phases/gateArtifacts', () => {
    const parsed = parseTemplateStructure(VALID_STRUCTURE);
    expect(parsed).not.toBeNull();
    expect(parsed!.weeks).toHaveLength(2);
    expect(parsed!.weeks[0]!.worksheets[0]!.id).toBe('p1_w1');
    expect(parsed!.phases).toHaveLength(2);
    expect(parsed!.phases[0]!.worksheets).toEqual(['p1_w1', 'p1_w2', 'p1_w3']);
    expect(Object.keys(parsed!.gateArtifacts!)).toEqual(['w1_g1', 'w2_g1']);
  });

  it('defaults missing weeks/phases/gateArtifacts when at least one section exists', () => {
    const parsed = parseTemplateStructure({ phases: [{ num: 1, title: 'P1', days: 'D', worksheets: [] }] });
    expect(parsed).not.toBeNull();
    expect(parsed!.weeks).toEqual([]);
    expect(parsed!.phases).toHaveLength(1);
    expect(parsed!.gateArtifacts).toEqual({});
  });

  it('returns null when neither weeks nor phases is an array', () => {
    expect(parseTemplateStructure({ weeks: 'nope' })).toBeNull();
    expect(parseTemplateStructure({ weeks: 'nope', phases: 'also-nope' })).toBeNull();
    expect(parseTemplateStructure({ gateArtifacts: {} })).toBeNull();
  });

  it('returns null for null or non-object input', () => {
    expect(parseTemplateStructure(null as unknown as Record<string, unknown>)).toBeNull();
    expect(parseTemplateStructure('garbage' as unknown as Record<string, unknown>)).toBeNull();
    expect(parseTemplateStructure(42 as unknown as Record<string, unknown>)).toBeNull();
  });
});

// ─── Week helpers ───────────────────────────────────────

describe('week helpers', () => {
  it('getTemplateWeeks returns all weeks from the template', () => {
    expect(getTemplateWeeks(buildTemplate())).toHaveLength(2);
  });

  it('getWeek finds a week by number and returns null for missing weeks', () => {
    const template = buildTemplate();
    expect(getWeek(template, 2)?.title).toBe('Observe');
    expect(getWeek(template, 99)).toBeNull();
  });

  it('getWeekWorksheets returns worksheets for a week (empty for unknown week)', () => {
    const template = buildTemplate();
    expect(getWeekWorksheets(template, 1).map(w => w.id)).toEqual(['p1_w1', 'p1_w2']);
    expect(getWeekWorksheets(template, 99)).toEqual([]);
  });

  it('getWorksheetEntry searches across all weeks', () => {
    const template = buildTemplate();
    expect(getWorksheetEntry(template, 'p1_w3')?.title).toBe('Observation Log');
    expect(getWorksheetEntry(template, 'nope')).toBeNull();
  });
});

// ─── Phase helpers ──────────────────────────────────────

describe('phase helpers', () => {
  it('getTemplatePhases / getPhase / getPhaseWorksheetIds', () => {
    const template = buildTemplate();
    expect(getTemplatePhases(template)).toHaveLength(2);
    expect(getPhase(template, 1)?.title).toBe('Phase 1 — Orientation');
    expect(getPhase(template, 5)).toBeNull();
    expect(getPhaseWorksheetIds(template, 2)).toEqual(['p2_w1']);
    expect(getPhaseWorksheetIds(template, 9)).toEqual([]);
  });
});

// ─── Gate artifact helpers ──────────────────────────────

describe('gate artifact helpers', () => {
  it('getGateArtifacts returns artifacts for a gate (empty for unknown)', () => {
    const template = buildTemplate();
    const artifacts = getGateArtifacts(template, 'w1_g1');
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.required).toBe(true);
    expect(getGateArtifacts(template, 'unknown_gate')).toEqual([]);
  });

  it('getAllGateArtifacts returns the full map', () => {
    expect(Object.keys(getAllGateArtifacts(buildTemplate()))).toEqual(['w1_g1', 'w2_g1']);
  });
});

// ─── Approval chain ─────────────────────────────────────

describe('approval chain', () => {
  it('getApprovalChain returns the template chain, with a default when absent', () => {
    expect(getApprovalChain(buildTemplate())).toEqual(['lead_instructor', 'academic_head']);
    const noChain = buildTemplate();
    (noChain as { approval_chain?: unknown }).approval_chain = 'not-an-array' as unknown as string[];
    expect(getApprovalChain(noChain)).toEqual(['lead_instructor', 'academic_head']);
  });

  it('isReviewerInChain checks membership and optional position', () => {
    const template = buildTemplate();
    expect(isReviewerInChain(template, 'academic_head')).toBe(true);
    expect(isReviewerInChain(template, 'campus_head')).toBe(false);
    expect(isReviewerInChain(template, 'lead_instructor', 0)).toBe(true);
    expect(isReviewerInChain(template, 'academic_head', 0)).toBe(false);
  });
});

// ─── Worksheet info helpers ─────────────────────────────

describe('worksheet info helpers', () => {
  it('getWorksheetTitle returns the title or null', () => {
    const template = buildTemplate();
    expect(getWorksheetTitle(template, 'p1_w2')).toBe('Faculty Shadowing');
    expect(getWorksheetTitle(template, 'missing')).toBeNull();
  });

  it('getWorksheetReviewer returns the template reviewer or defaults to buddy', () => {
    const template = buildTemplate();
    expect(getWorksheetReviewer(template, 'p1_w1')).toBe('buddy');
    expect(getWorksheetReviewer(template, 'p1_w3')).toBe('manager');
    expect(getWorksheetReviewer(template, 'missing')).toBe('buddy');
  });

  it('getWorksheetEngineTag returns the tag or null', () => {
    const template = buildTemplate();
    expect(getWorksheetEngineTag(template, 'p1_w1')).toBe('K');
    expect(getWorksheetEngineTag(template, 'p1_w2')).toBeNull();
  });

  it('isGateWorksheet returns true only for gated worksheets', () => {
    const template = buildTemplate();
    expect(isGateWorksheet(template, 'p1_w3')).toBe(true);
    expect(isGateWorksheet(template, 'p1_w1')).toBe(false);
    expect(isGateWorksheet(template, 'missing')).toBe(false);
  });
});

// ─── resolveReviewer ────────────────────────────────────

describe('resolveReviewer', () => {
  const fallback: Record<string, string> = { legacy_w1: 'manager' };

  it('prefers the template reviewer when the template is provided', () => {
    expect(resolveReviewer(buildTemplate(), 'p1_w1', fallback)).toBe('buddy');
  });

  it('falls back to the map when the template has no entry', () => {
    expect(resolveReviewer(buildTemplate(), 'legacy_w1', fallback)).toBe('manager');
  });

  it('defaults to buddy when neither template nor map has an entry', () => {
    expect(resolveReviewer(buildTemplate(), 'unknown_ws', fallback)).toBe('buddy');
  });

  it('uses the map entirely when no template is available', () => {
    expect(resolveReviewer(null, 'legacy_w1', fallback)).toBe('manager');
    expect(resolveReviewer(null, 'unknown_ws', fallback)).toBe('buddy');
  });
});

// ─── validateTemplateStructure ──────────────────────────

describe('validateTemplateStructure', () => {
  it('returns no errors for a valid structure', () => {
    expect(validateTemplateStructure(VALID_STRUCTURE)).toEqual([]);
  });

  it('rejects non-object structures', () => {
    expect(validateTemplateStructure(null as unknown as Record<string, unknown>)).toContain('Structure must be a non-null object');
    expect(validateTemplateStructure('x' as unknown as Record<string, unknown>)).toContain('Structure must be a non-null object');
  });

  it('rejects weeks that are not an array', () => {
    expect(validateTemplateStructure({ weeks: 'bad' })).toContain('"weeks" must be an array');
  });

  it('flags week-level and worksheet-level shape errors', () => {
    const errors = validateTemplateStructure({
      weeks: [
        { title: 'No num', worksheets: 'bad' },
        // Worksheet missing BOTH id and title (only has num).
        { num: 2, title: 'W2', worksheets: [{ num: 1 }] },
      ],
    });
    expect(errors).toContain('weeks[0]: "num" must be a number');
    expect(errors).toContain('weeks[0]: "worksheets" must be an array');
    expect(errors).toContain('weeks[1].worksheets[0]: "id" must be a string');
    expect(errors).toContain('weeks[1].worksheets[0]: "title" must be a string');
  });

  it('flags phase-level shape errors', () => {
    const errors = validateTemplateStructure({
      phases: [
        { title: 'Missing num and worksheets' },
        { num: 2, worksheets: 'bad' },
      ],
    });
    expect(errors).toContain('phases[0]: "num" must be a number');
    expect(errors).toContain('phases[0]: "worksheets" must be an array of strings');
    expect(errors).toContain('phases[1]: "worksheets" must be an array of strings');
  });

  it('flags gateArtifacts shape errors', () => {
    const errors = validateTemplateStructure({
      phases: [{ num: 1, title: 'P1', days: 'D', worksheets: [] }],
      gateArtifacts: {
        good: [{ label: 'L', required: true }],
        notArray: 'nope',
        badEntry: [{ label: 'missing required flag' }],
      },
    });
    expect(errors).toContain('gateArtifacts["notArray"]: must be an array');
    expect(errors).toContain('gateArtifacts["badEntry"][0]: "required" must be a boolean');
  });
});
