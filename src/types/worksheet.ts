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
