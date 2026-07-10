import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorksheet } from '../hooks/useWorksheet';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  WorksheetHeader, WorksheetSection, ActionBar, SubmittedView,
  ApprovedView, BuddyApprovedView, LoadingView, BackButton,
  ErrorAlert, ReviewFeedback, FieldGroup, FieldGrid,
} from '../config/worksheetComponents';

// ─── Props ──────────────────────────────────────────────

export interface WorksheetPageProps {
  worksheetId: string;
  phase: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  backTo: string;
  defaultData: Record<string, unknown>;
  requiredFields?: Array<{ key: string; label: string }>;
  approvedMsg?: string;
  submittedMsg?: string;
  buddyApproveMsg?: string;
  children: ReactNode | ((context: WorksheetContext) => ReactNode);
}

export interface WorksheetContext {
  data: Record<string, any>;
  setData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  loaded: boolean;
  submitting: boolean;
  submitError: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  updateField: (field: string, value: unknown) => void;
  updateArrayItem: (field: string, index: number, subField: string) => (value: unknown) => void;
  updateArrayItemEvent: (field: string, index: number, subField: string) => (e: unknown) => void;
  handleSubmit: () => Promise<void>;
  isApproved: boolean;
  isBuddyApproved: boolean;
  isSubmitted: boolean;
}

// ─── Helpers ────────────────────────────────────────────

function phaseLabel(phase: string): string {
  if (phase === 'phase-1') return 'Phase 1';
  if (phase === 'phase-2') return 'Phase 2';
  if (phase === 'phase-3') return 'Phase 3';
  if (phase === 'week-1') return 'Week 1 — Anchor';
  if (phase === 'week-2') return 'Week 2 — Co-create';
  if (phase === 'week-3') return 'Week 3 — Co-deliver';
  if (phase === 'week-4') return 'Week 4 — Independence Review';
  return phase;
}

// ─── Component ──────────────────────────────────────────

export default function WorksheetPage({
  worksheetId, phase, icon, title, subtitle, backTo,
  defaultData, requiredFields = [],
  approvedMsg = 'Your worksheet has been reviewed and approved.',
  submittedMsg = 'Your worksheet has been submitted for review.',
  buddyApproveMsg,
  children,
}: WorksheetPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const ws = useWorksheet({
    user,
    worksheetId,
    phase,
    defaultData,
    requiredFields,
    redirectPath: backTo,
    approvedMsg,
    submittedMsg,
  });

  const { data, loaded, submitting, submitError, saveStatus, isBuddyApproved, isApproved, isSubmitted } = ws;

  // Early returns for status views
  if (isBuddyApproved) {
    return (
      <BuddyApprovedView
        msg={buddyApproveMsg || `${title} has been approved by your buddy.`}
        path={backTo}
      />
    );
  }
  if (isApproved) {
    return (
      <ApprovedView
        msg={approvedMsg}
        path={backTo}
        reviewerName={data._savedReviewerName as string}
        date={data._savedReviewedAt as string}
      />
    );
  }
  if (isSubmitted) {
    return <SubmittedView msg={submittedMsg} path={backTo} />;
  }
  if (!loaded) return <LoadingView />;

  const context: WorksheetContext = {
    data,
    setData: ws.setData,
    loaded,
    submitting,
    submitError,
    saveStatus,
    updateField: ws.updateField,
    updateArrayItem: ws.updateArrayItem,
    updateArrayItemEvent: ws.updateArrayItemEvent,
    handleSubmit: ws.handleSubmit,
    isApproved,
    isBuddyApproved,
    isSubmitted,
  };

  return (
    <div className="lux-section">
      {/*
        Shared responsive/a11y utilities for all worksheet forms (H26 + a11y fixes).
        Kept here rather than duplicated in every worksheet file:
        - .ws-sr-only: visually-hidden label text (still read by screen readers),
          used to give bare table-style inputs a real associated <label> without
          changing the visual design.
        - .ws-scroll-x + .ws-matrix-row: wide "spreadsheet" style rows (fixed
          multi-column grids used for review matrices/logs) become horizontally
          scrollable on narrow screens instead of squashing into unreadable columns.
        - .ws-stack-sm: simple side-by-side field pairs collapse to a single
          column on phones.
        - .ws-star-btn: ensures star/rating buttons meet the 44px touch target.
      */}
      <style>{`
        .ws-sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .ws-scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ws-matrix-row { min-width: 620px; }
        .ws-star-btn {
          min-width: 44px; min-height: 44px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        @media (max-width: 640px) {
          .ws-stack-sm, .ws-stack-sm > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to={backTo} label={`Back to ${phaseLabel(phase)}`} />
        <WorksheetHeader icon={icon} title={title} subtitle={subtitle} saveStatus={saveStatus} />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          {typeof children === 'function' ? (children as (ctx: WorksheetContext) => ReactNode)(context) : children}
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate(backTo)} onSubmit={ws.handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}

// Re-export shared sub-components for convenience
export { WorksheetSection, FieldGroup, FieldGrid };
