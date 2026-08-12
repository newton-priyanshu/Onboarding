import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorksheet } from '../hooks/useWorksheet';
import type { ReactNode } from 'react';
import { Zap, type LucideIcon } from 'lucide-react';
import {
  WorksheetHeader, WorksheetSection, WorksheetProgressBar, ActionBar, SubmittedView,
  ApprovedView, BuddyApprovedView, LoadingView, BackButton,
  ErrorAlert, ReviewFeedback, FieldGroup, FieldGrid,
} from '../config/worksheetComponents';
import { XP_RULES } from '../config/gamification';

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
    // Submissions and revision re-submits both earn the same submit XP
    // (mirrors the DB trigger).
    return (
      <SubmittedView
        msg={submittedMsg}
        path={backTo}
        xpEarned={XP_RULES.submit}
      />
    );
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
        Shared responsive/a11y utilities for all worksheet forms.
        Includes .ws-sticky-pad for bottom sticky-action-bar clearance.
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
        .ws-sticky-pad {
          height: 72px;
        }
        @media (max-width: 640px) {
          .ws-stack-sm, .ws-stack-sm > div { grid-template-columns: 1fr !important; }
          .ws-sticky-pad {
            height: 96px;
          }
        }
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .ws-sticky-footer {
            padding-bottom: env(safe-area-inset-bottom);
          }
        }
      `}</style>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to={backTo} label={`Back to ${phaseLabel(phase)}`} />

        {/* ── Sticky Header: title + progress bar ── */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--color-bg)',
          paddingTop: '0.5rem',
          marginBottom: '1rem',
        }}>
          {/* Compact header in sticky area — reduced bottom margin */}
          <WorksheetHeader icon={icon} title={title} subtitle={subtitle} saveStatus={saveStatus} compact />
          <WorksheetProgressBar data={data} />
          {/* Subtle shadow separator when scrolled */}
          <div style={{
            height: '1px',
            background: 'rgba(26,26,26,0.06)',
            marginTop: '0.35rem',
          }} />
        </div>

        <ReviewFeedback data={data} />

        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {typeof children === 'function' ? (children as (ctx: WorksheetContext) => ReactNode)(context) : children}
          <ErrorAlert message={submitError} />
        </form>

        {/* Spacer so content doesn't hide behind sticky footer */}
        <div className="ws-sticky-pad" />

        {/* ── Sticky Footer: action bar + XP reward hint ── */}
        <div className="ws-sticky-footer" style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 20,
          background: 'var(--color-bg)',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.04)',
          paddingTop: '0.5rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            paddingBottom: '0.6rem', flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '0.6rem',
              color: 'var(--color-warm-grey)', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              <Zap size={11} strokeWidth={2} style={{ color: 'var(--color-gold)' }} />
              <b style={{ color: 'var(--color-gold)', fontWeight: 500 }}>+{XP_RULES.submit} XP</b> on submit
            </span>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '0.6rem',
              color: 'var(--color-warm-grey)', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              <Zap size={11} strokeWidth={2} style={{ color: 'var(--color-purple)' }} />
              <b style={{ color: 'var(--color-purple)', fontWeight: 500 }}>+{XP_RULES.buddy_approved} XP</b> on buddy approval
            </span>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '0.6rem',
              color: 'var(--color-warm-grey)', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              <Zap size={11} strokeWidth={2} style={{ color: 'var(--color-success)' }} />
              <b style={{ color: 'var(--color-success)', fontWeight: 500 }}>+{XP_RULES.manager_approved} XP</b> on manager approval
            </span>
          </div>
          <ActionBar onCancel={() => navigate(backTo)} onSubmit={ws.handleSubmit} submitting={submitting} />
        </div>
      </div>
    </div>
  );
}

// Re-export shared sub-components for convenience
export { WorksheetSection, FieldGroup, FieldGrid, WorksheetProgressBar };
