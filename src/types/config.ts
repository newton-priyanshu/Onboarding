import type { WorksheetId, ReviewerType } from './supabase';

// ─── Worksheet Config Entry ─────────────────────────────
export interface WorksheetConfigEntry {
  id: WorksheetId;
  phase: string;
  title: string;
  reviewer: ReviewerType;
  color: string;
  isGate?: boolean;
  order: number;
}

// ─── WORKSHEET_NAMES type ───────────────────────────────
export type WorksheetNames = Record<WorksheetId, string>;

// ─── WORKSHEET_INFO type ────────────────────────────────
export interface WorksheetInfoEntry {
  id: WorksheetId;
  title: string;
  reviewer: ReviewerType;
  color: string;
  isGate?: boolean;
}

// ─── Phase review status result ─────────────────────────
export interface PhaseReviewStatusResult {
  ready: boolean;
  buddyApproved: number;
  total: number;
  details: string;
}

// ─── Worksheet reviewer map ─────────────────────────────
export type ReviewerMap = Record<WorksheetId, ReviewerType>;

// ─── Phase worksheets map ───────────────────────────────
export type PhaseWorksheetsMap = Record<number, WorksheetId[]>;

// ─── Phase labels ───────────────────────────────────────
export interface PhaseLabelConfig {
  title: string;
  subtitle: string;
  days: string;
}

// ─── WorksheetData (generic JSONB shape) ────────────────
export type WorksheetData = Record<string, unknown>;
