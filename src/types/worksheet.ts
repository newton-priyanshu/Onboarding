import type { WorksheetId, ReviewerType } from './supabase';

// ─── Worksheet Metadata (from worksheetConfig) ───────────
export interface WorksheetInfo {
  id: WorksheetId;
  title: string;
  reviewer: ReviewerType;
  color: string;
  isGate?: boolean;
}

export interface PhaseData {
  num: number;
  sheets: WorksheetInfo[];
}

export type AllWorksheets = Record<string, PhaseData>;

// ─── Phase Labels ────────────────────────────────────────
export interface PhaseLabel {
  title: string;
  subtitle: string;
  days: string;
}

// ─── Phase Review Status ─────────────────────────────────
export interface PhaseReviewStatus {
  ready: boolean;
  buddyApproved: number;
  total: number;
  details: string;
}

// ─── Worksheet Reviewer Config ───────────────────────────
export type WorksheetReviewerMap = Record<WorksheetId, ReviewerType>;

// ─── Template Structure Types (for onboarding_templates) ──

/** A single worksheet entry within a template week */
export interface TemplateWorksheet {
  id: string;
  num: number;
  title: string;
  reviewer?: string;
  engineTag?: string;
  isGate?: boolean;
}

/** A week within a template */
export interface TemplateWeek {
  num: number;
  title: string;
  subtitle: string;
  days: string;
  theme: string;
  worksheets: TemplateWorksheet[];
}

/** A phase within a template */
export interface TemplatePhase {
  num: number;
  title: string;
  days: string;
  worksheets: string[];
}

/** A gate artifact requirement */
export interface TemplateGateArtifact {
  label: string;
  required: boolean;
}

/** The full template structure stored as JSONB */
export interface TemplateStructure {
  weeks: TemplateWeek[];
  phases: TemplatePhase[];
  gateArtifacts?: Record<string, TemplateGateArtifact[]>;
}

/** Ordered list of reviewer roles for the approval chain */
export type ApprovalChain = string[];
