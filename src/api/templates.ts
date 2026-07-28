/**
 * templates.ts — Onboarding template service.
 *
 * Provides functions to fetch, parse, and interact with onboarding templates
 * stored in the `onboarding_templates` table. Each campus has a template that
 * defines its onboarding structure (weeks, phases, worksheets, approval chain).
 *
 * The template structure JSONB format:
 * {
 *   "weeks": [
 *     {
 *       "num": 1, "title": "Anchor", "subtitle": "Observe begins",
 *       "days": "Week 1", "theme": "Context before content...",
 *       "worksheets": [
 *         { "id": "p1_w5", "num": 1, "title": "...", "reviewer": "buddy",
 *           "engineTag": "K", "isGate": false }
 *       ]
 *     }
 *   ],
 *   "phases": [
 *     { "num": 1, "title": "Phase 1 — Orientation", "days": "Days 1–30",
 *       "worksheets": ["p1_w5", "p1_w6", ...] }
 *   ],
 *   "gateArtifacts": {
 *     "w1_g1": [
 *       { "label": "Operational checklist complete", "required": true }
 *     ]
 *   }
 * }
 */

import { supabase } from './supabase';
import type { OnboardingTemplate } from '../types/supabase';

// ─── Cache ──────────────────────────────────────────────

const templateCache = new Map<string, { template: OnboardingTemplate; expiresAt: number }>();
const CACHE_TTL = 120_000; // 2 minutes

function getCached(key: string): OnboardingTemplate | undefined {
  const entry = templateCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.template;
  templateCache.delete(key);
  return undefined;
}

function setCache(key: string, template: OnboardingTemplate): void {
  templateCache.set(key, { template, expiresAt: Date.now() + CACHE_TTL });
}

// ─── Types ──────────────────────────────────────────────

/** A single worksheet entry within a template week */
export interface TemplateWorksheetEntry {
  id: string;
  num: number;
  title: string;
  reviewer?: string;
  engineTag?: string;
  isGate?: boolean;
}

/** A week within the template structure */
export interface TemplateWeekEntry {
  num: number;
  title: string;
  subtitle: string;
  days: string;
  theme: string;
  worksheets: TemplateWorksheetEntry[];
}

/** A phase within the template structure */
export interface TemplatePhaseEntry {
  num: number;
  title: string;
  days: string;
  worksheets: string[];
}

/** A gate artifact requirement */
export interface GateArtifactEntry {
  label: string;
  required: boolean;
}

/** The parsed template structure */
export interface ParsedTemplateStructure {
  weeks: TemplateWeekEntry[];
  phases: TemplatePhaseEntry[];
  gateArtifacts?: Record<string, GateArtifactEntry[]>;
}

// ─── Fetching ───────────────────────────────────────────

/**
 * Fetch the active onboarding template for a given campus.
 * Falls back to the campus's default template if no active template is found.
 * Results are cached in-memory for CACHE_TTL milliseconds.
 */
export async function getCampusTemplate(campusId: string): Promise<OnboardingTemplate | null> {
  const cacheKey = `campus:${campusId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // Try the active template first
    const { data, error } = await supabase
      .from('onboarding_templates')
      .select('*')
      .eq('campus_id', campusId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error(`[Templates] Failed to fetch template for campus ${campusId}:`, error?.message || error);
      return null;
    }

    if (data) {
      const template = data as OnboardingTemplate;
      setCache(cacheKey, template);
      return template;
    }

    // Fall back to default template for this campus
    const { data: defaultData, error: defaultError } = await supabase
      .from('onboarding_templates')
      .select('*')
      .eq('campus_id', campusId)
      .eq('is_default', true)
      .maybeSingle();

    if (defaultError) {
      console.error(`[Templates] Failed to fetch default template for campus ${campusId}:`, defaultError?.message || defaultError);
      return null;
    }

    if (defaultData) {
      const template = defaultData as OnboardingTemplate;
      setCache(cacheKey, template);
      return template;
    }

    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Templates] Failed to fetch template for campus ${campusId}:`, msg);
    return null;
  }
}

/**
 * Fetch all templates for a given campus (for admin UI).
 */
export async function getCampusTemplates(campusId: string): Promise<OnboardingTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('onboarding_templates')
      .select('*')
      .eq('campus_id', campusId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[Templates] Failed to fetch templates for campus ${campusId}:`, error?.message || error);
      return [];
    }

    return (data as OnboardingTemplate[]) || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Templates] Failed to fetch templates for campus ${campusId}:`, msg);
    return [];
  }
}

/**
 * Fetch a single onboarding template by its ID.
 * Checks the cache first, then fetches from Supabase.
 */
export async function getTemplateById(templateId: string): Promise<OnboardingTemplate | null> {
  const cacheKey = `id:${templateId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('onboarding_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    if (error) {
      console.error(`[Templates] Failed to fetch template ${templateId}:`, error?.message || error);
      return null;
    }

    if (data) {
      const template = data as OnboardingTemplate;
      setCache(cacheKey, template);
      return template;
    }

    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Templates] Failed to fetch template ${templateId}:`, msg);
    return null;
  }
}

/**
 * Invalidate the template cache for a campus.
 */
export function invalidateTemplateCache(campusId: string): void {
  templateCache.delete(`campus:${campusId}`);
}

// ─── Structure Parsing ─────────────────────────────────

/**
 * Parse the raw JSONB structure into a typed object.
 * Returns null if the structure is invalid.
 */
export function parseTemplateStructure(structure: Record<string, unknown>): ParsedTemplateStructure | null {
  try {
    const weeks = structure.weeks as TemplateWeekEntry[] | undefined;
    const phases = structure.phases as TemplatePhaseEntry[] | undefined;
    const gateArtifacts = structure.gateArtifacts as Record<string, GateArtifactEntry[]> | undefined;

    if (!Array.isArray(weeks) && !Array.isArray(phases)) {
      console.error('[Templates] Invalid structure: must have at least weeks or phases');
      return null;
    }

    return {
      weeks: Array.isArray(weeks) ? weeks : [],
      phases: Array.isArray(phases) ? phases : [],
      gateArtifacts: gateArtifacts || {},
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Templates] Failed to parse template structure:', msg);
    return null;
  }
}

// ─── Week Helpers ───────────────────────────────────────

/**
 * Get all weeks from a template.
 */
export function getTemplateWeeks(template: OnboardingTemplate): TemplateWeekEntry[] {
  const parsed = parseTemplateStructure(template.structure);
  return parsed?.weeks || [];
}

/**
 * Get a specific week from a template by week number.
 */
export function getWeek(template: OnboardingTemplate, weekNum: number): TemplateWeekEntry | null {
  const weeks = getTemplateWeeks(template);
  return weeks.find(w => w.num === weekNum) || null;
}

/**
 * Get worksheets for a specific week.
 */
export function getWeekWorksheets(template: OnboardingTemplate, weekNum: number): TemplateWorksheetEntry[] {
  const week = getWeek(template, weekNum);
  return week?.worksheets || [];
}

/**
 * Get a worksheet entry from a template by ID.
 * Searches all weeks for the worksheet.
 */
export function getWorksheetEntry(template: OnboardingTemplate, worksheetId: string): TemplateWorksheetEntry | null {
  const weeks = getTemplateWeeks(template);
  for (const week of weeks) {
    const ws = week.worksheets.find(w => w.id === worksheetId);
    if (ws) return ws;
  }
  return null;
}

// ─── Phase Helpers ──────────────────────────────────────

/**
 * Get all phases from a template.
 */
export function getTemplatePhases(template: OnboardingTemplate): TemplatePhaseEntry[] {
  const parsed = parseTemplateStructure(template.structure);
  return parsed?.phases || [];
}

/**
 * Get a specific phase from a template by phase number.
 */
export function getPhase(template: OnboardingTemplate, phaseNum: number): TemplatePhaseEntry | null {
  const phases = getTemplatePhases(template);
  return phases.find(p => p.num === phaseNum) || null;
}

/**
 * Get worksheet IDs for a specific phase.
 */
export function getPhaseWorksheetIds(template: OnboardingTemplate, phaseNum: number): string[] {
  const phase = getPhase(template, phaseNum);
  return phase?.worksheets || [];
}

// ─── Gate Artifact Helpers ──────────────────────────────

/**
 * Get gate artifacts for a specific gate worksheet ID.
 */
export function getGateArtifacts(template: OnboardingTemplate, gateId: string): GateArtifactEntry[] {
  const parsed = parseTemplateStructure(template.structure);
  return parsed?.gateArtifacts?.[gateId] || [];
}

/**
 * Get all gate artifact entries from the template.
 */
export function getAllGateArtifacts(template: OnboardingTemplate): Record<string, GateArtifactEntry[]> {
  const parsed = parseTemplateStructure(template.structure);
  return parsed?.gateArtifacts || {};
}

// ─── Approval Chain ─────────────────────────────────────

/**
 * Get the approval chain for a template.
 * Returns the ordered list of reviewer roles.
 */
export function getApprovalChain(template: OnboardingTemplate): string[] {
  const chain = template.approval_chain;
  if (Array.isArray(chain)) return chain as string[];
  return ['lead_instructor', 'academic_head'];
}

/**
 * Check if a given role is in the approval chain at the specified position.
 */
export function isReviewerInChain(template: OnboardingTemplate, role: string, position?: number): boolean {
  const chain = getApprovalChain(template);
  if (position !== undefined) {
    return chain[position] === role;
  }
  return chain.includes(role);
}

// ─── Worksheet Info ─────────────────────────────────────

/**
 * Get the display title for a worksheet from the template.
 * Returns null if the worksheet is not found in the template.
 */
export function getWorksheetTitle(template: OnboardingTemplate, worksheetId: string): string | null {
  const entry = getWorksheetEntry(template, worksheetId);
  return entry?.title || null;
}

/**
 * Get the reviewer type for a worksheet from the template.
 * Falls back to 'buddy' if not specified.
 */
export function getWorksheetReviewer(template: OnboardingTemplate, worksheetId: string): string {
  const entry = getWorksheetEntry(template, worksheetId);
  return entry?.reviewer || 'buddy';
}

/**
 * Get the engine tag for a worksheet from the template.
 */
export function getWorksheetEngineTag(template: OnboardingTemplate, worksheetId: string): string | null {
  const entry = getWorksheetEntry(template, worksheetId);
  return entry?.engineTag || null;
}

/**
 * Check if a worksheet is a gate in the template.
 */
export function isGateWorksheet(template: OnboardingTemplate, worksheetId: string): boolean {
  const entry = getWorksheetEntry(template, worksheetId);
  return entry?.isGate === true;
}

/**
 * Resolve the reviewer type for a worksheet.
 * First checks the template (if provided), then falls back to the
 * hardcoded WORKSHEET_REVIEWER map for backward compatibility.
 */
export function resolveReviewer(
  template: OnboardingTemplate | null,
  worksheetId: string,
  fallbackReviewer: Record<string, string>
): string {
  if (template) {
    const reviewer = getWorksheetReviewer(template, worksheetId);
    if (reviewer) return reviewer;
  }
  return fallbackReviewer[worksheetId] || 'buddy';
}

// ─── Validation ─────────────────────────────────────────

/**
 * Validate a template structure against the expected schema.
 * Returns an array of validation error messages (empty = valid).
 */
export function validateTemplateStructure(structure: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!structure || typeof structure !== 'object') {
    errors.push('Structure must be a non-null object');
    return errors;
  }

  // Validate weeks
  const weeks = structure.weeks;
  if (weeks !== undefined) {
    if (!Array.isArray(weeks)) {
      errors.push('"weeks" must be an array');
    } else {
      for (let i = 0; i < weeks.length; i++) {
        const w = weeks[i] as Record<string, unknown>;
        if (!w || typeof w !== 'object') {
          errors.push(`weeks[${i}]: must be an object`);
          continue;
        }
        if (typeof w.num !== 'number') errors.push(`weeks[${i}]: "num" must be a number`);
        if (typeof w.title !== 'string') errors.push(`weeks[${i}]: "title" must be a string`);

        if (!Array.isArray(w.worksheets)) {
          errors.push(`weeks[${i}]: "worksheets" must be an array`);
        } else {
          for (let j = 0; j < (w.worksheets as unknown[]).length; j++) {
            const ws = (w.worksheets as Record<string, unknown>[])[j];
            if (!ws || typeof ws !== 'object') {
              errors.push(`weeks[${i}].worksheets[${j}]: must be an object`);
              continue;
            }
            if (typeof ws.id !== 'string') errors.push(`weeks[${i}].worksheets[${j}]: "id" must be a string`);
            if (typeof ws.title !== 'string') errors.push(`weeks[${i}].worksheets[${j}]: "title" must be a string`);
          }
        }
      }
    }
  }

  // Validate phases
  const phases = structure.phases;
  if (phases !== undefined) {
    if (!Array.isArray(phases)) {
      errors.push('"phases" must be an array');
    } else {
      for (let i = 0; i < phases.length; i++) {
        const p = phases[i] as Record<string, unknown>;
        if (!p || typeof p !== 'object') {
          errors.push(`phases[${i}]: must be an object`);
          continue;
        }
        if (typeof p.num !== 'number') errors.push(`phases[${i}]: "num" must be a number`);
        if (!Array.isArray(p.worksheets)) errors.push(`phases[${i}]: "worksheets" must be an array of strings`);
      }
    }
  }

  // Validate gateArtifacts
  const gates = structure.gateArtifacts;
  if (gates !== undefined) {
    if (typeof gates !== 'object' || Array.isArray(gates)) {
      errors.push('"gateArtifacts" must be an object');
    } else {
      for (const [gateId, artifacts] of Object.entries(gates as Record<string, unknown>)) {
        if (!Array.isArray(artifacts)) {
          errors.push(`gateArtifacts["${gateId}"]: must be an array`);
        } else {
          for (let i = 0; i < artifacts.length; i++) {
            const a = artifacts[i] as Record<string, unknown>;
            if (typeof a.label !== 'string') errors.push(`gateArtifacts["${gateId}"][${i}]: "label" must be a string`);
            if (typeof a.required !== 'boolean') errors.push(`gateArtifacts["${gateId}"][${i}]: "required" must be a boolean`);
          }
        }
      }
    }
  }

  return errors;
}
