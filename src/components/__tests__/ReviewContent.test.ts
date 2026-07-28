import { describe, it, expect } from 'vitest';
import { FIELD_SECTIONS } from '../../config/reviewContentConfig';
import { PHASE_WORKSHEETS_MAP, WORKSHEET_INFO } from '../../config/worksheetConfigData';

/**
 * Department worksheets (Progression/Operations) use a generic
 * DepartmentWorksheet component instead of FIELD_SECTIONS for
 * review display, so they are excluded from these structural checks.
 */
const DEPT_WS_PREFIXES = ['pr_', 'op_'];
const isDeptWs = (id: string) => DEPT_WS_PREFIXES.some(p => id.startsWith(p));

describe('FIELD_SECTIONS configuration', () => {
  // ── Structural validation ──────────────────────────────

  it('has an entry for every worksheet in PHASE_WORKSHEETS_MAP', () => {
    const allKnownIds = Object.keys(WORKSHEET_INFO).filter(id => !isDeptWs(id));
    const configuredIds = Object.keys(FIELD_SECTIONS);

    // Every worksheet should have a FIELD_SECTIONS entry
    allKnownIds.forEach(id => {
      expect(configuredIds).toContain(id);
    });
  });

  it('has no orphaned entries (entries for non-existent worksheets)', () => {
    const allKnownIds = Object.keys(WORKSHEET_INFO);
    const configuredIds = Object.keys(FIELD_SECTIONS);

    configuredIds.forEach(id => {
      expect(allKnownIds).toContain(id);
    });
  });

  it('all department worksheets have WORKSHEET_INFO entries', () => {
    const deptIds = Object.keys(WORKSHEET_INFO).filter(isDeptWs);
    expect(deptIds.length).toBeGreaterThan(0);
    // All dept worksheets should be in WORKSHEET_REVIEWER
    deptIds.forEach(id => {
      expect(WORKSHEET_INFO[id]).toBeDefined();
    });
  });

  it('has exactly one entry per worksheet', () => {
    const configuredIds = Object.keys(FIELD_SECTIONS);
    const uniqueIds = new Set(configuredIds);
    expect(uniqueIds.size).toBe(configuredIds.length);
  });

  // ── Section structure validation ───────────────────────

  it('every worksheet has at least one section', () => {
    Object.entries(FIELD_SECTIONS).forEach(([, layout]) => {
      expect(layout.sections.length).toBeGreaterThan(0);
    });
  });

  it('every section has at least one field', () => {
    Object.entries(FIELD_SECTIONS).forEach(([id, layout]) => {
      Object.entries(layout.sectionMap).forEach(([section, fields]) => {
        expect(
          fields.length,
          `${id}: section "${section}" has no fields`
        ).toBeGreaterThan(0);
      });
    });
  });

  it('all section names in sectionMap exist in sections array', () => {
    Object.entries(FIELD_SECTIONS).forEach(([id, layout]) => {
      const sectionNames = new Set(layout.sections);
      Object.keys(layout.sectionMap).forEach(section => {
        expect(
          sectionNames.has(section),
          `${id}: section "${section}" in sectionMap but not in sections array`
        ).toBe(true);
      });
    });
  });

  it('all section names in sections array have an entry in sectionMap', () => {
    Object.entries(FIELD_SECTIONS).forEach(([id, layout]) => {
      layout.sections.forEach(section => {
        expect(
          layout.sectionMap[section],
          `${id}: section "${section}" in sections but missing from sectionMap`
        ).toBeDefined();
      });
    });
  });

  // ── No duplicate sections ──────────────────────────────

  it('no duplicate section names within a worksheet', () => {
    Object.entries(FIELD_SECTIONS).forEach(([id, layout]) => {
      const unique = new Set(layout.sections);
      expect(
        unique.size,
        `${id}: has ${layout.sections.length - unique.size} duplicate section(s)`
      ).toBe(layout.sections.length);
    });
  });

  // ── No duplicate fields within a worksheet ─────────────

  it('no duplicate field names within a worksheet', () => {
    Object.entries(FIELD_SECTIONS).forEach(([id, layout]) => {
      const allFields = Object.values(layout.sectionMap).flat();
      const unique = new Set(allFields);
      expect(
        unique.size,
        `${id}: has ${allFields.length - unique.size} duplicate field(s)`
      ).toBe(allFields.length);
    });
  });

  // ── Phase-level coverage ───────────────────────────────

  it('covers all worksheets in Phase 1', () => {
    const p1Ids = PHASE_WORKSHEETS_MAP[1] || [];
    p1Ids.forEach(id => {
      expect(FIELD_SECTIONS[id], `Phase 1: missing FIELD_SECTIONS for ${id}`).toBeDefined();
    });
  });

  it('covers all worksheets in Phase 2', () => {
    const p2Ids = PHASE_WORKSHEETS_MAP[2] || [];
    p2Ids.forEach(id => {
      expect(FIELD_SECTIONS[id], `Phase 2: missing FIELD_SECTIONS for ${id}`).toBeDefined();
    });
  });

  it('covers all worksheets in Phase 3', () => {
    const p3Ids = PHASE_WORKSHEETS_MAP[3] || [];
    p3Ids.forEach(id => {
      expect(FIELD_SECTIONS[id], `Phase 3: missing FIELD_SECTIONS for ${id}`).toBeDefined();
    });
  });

  // ── Field naming conventions ───────────────────────────

  it('all field names are lowercase camelCase (no spaces)', () => {
    Object.entries(FIELD_SECTIONS).forEach(([id, layout]) => {
      Object.values(layout.sectionMap).flat().forEach(field => {
        expect(
          field.match(/^[a-z]/),
          `${id}: field "${field}" should start with a lowercase letter`
        ).toBeTruthy();
        expect(
          field.match(/\s/),
          `${id}: field "${field}" contains spaces — should be camelCase`
        ).toBeNull();
      });
    });
  });
});
