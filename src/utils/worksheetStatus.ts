import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, AlertCircle, Clock, FileText } from 'lucide-react';
import { t } from '../config/theme';
import { SUBMISSION_STATUS, REVIEW_STATUS } from '../constants/status';

/**
 * Minimal row shape the status mapper needs — structurally satisfied by the
 * full `WorksheetSubmission` row (types/supabase.ts) AND by partial fixtures
 * in unit tests. The mapper only ever reads `review_status` and `status`.
 */
export interface WorksheetStatusRow {
  review_status?: string;
  status?: string;
}

/** What a worksheet row renders as on the dashboard roadmap. */
export interface WorksheetStatusInfo {
  status: string;
  label: string;
  color: string;
  icon: LucideIcon | null;
}

/**
 * getWorksheetStatus — dashboard roadmap row status → { status, label, color,
 * icon }. Extracted from Dashboard.tsx so the label mapping (which the
 * browser-pass roadmap-row assertions key on, e.g. needs_revision →
 * "Needs Revision") is unit-testable in isolation — mirror of how the
 * submissionPoller helpers were extracted from browser-pass.mjs.
 *
 * Order matters: review_status takes precedence, then the legacy submission
 * `status` ('submitted' / legacy 'Submitted'), then the in-progress fallback.
 */
export function getWorksheetStatus(sub: WorksheetStatusRow | null | undefined): WorksheetStatusInfo {
  if (!sub) return { status: 'not_started', label: 'Not Started', color: t.wg, icon: null };
  if (sub.review_status === REVIEW_STATUS.APPROVED) return { status: 'approved', label: 'Reviewed', color: t.success, icon: CheckCircle2 };
  if (sub.review_status === REVIEW_STATUS.BUDDY_APPROVED) return { status: 'buddy_approved', label: 'Buddy Approved', color: t.purple, icon: CheckCircle2 };
  if (sub.review_status === REVIEW_STATUS.NEEDS_REVISION) return { status: 'needs_revision', label: 'Needs Revision', color: t.warning, icon: AlertCircle };
  if (sub.review_status === REVIEW_STATUS.REVISION_SUBMITTED || sub.review_status === REVIEW_STATUS.PENDING_REVIEW) return { status: 'pending', label: 'Under Review', color: t.pending, icon: Clock };
  const rawStatus = (sub.status as string) || '';
  if (rawStatus === SUBMISSION_STATUS.SUBMITTED || rawStatus === 'Submitted') return { status: 'submitted', label: 'Submitted', color: t.pending, icon: Clock };
  return { status: 'in_progress', label: 'In Progress', color: t.ch, icon: FileText };
}
