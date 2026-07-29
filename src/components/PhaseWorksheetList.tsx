import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertTriangle, type LucideIcon } from 'lucide-react';
import { t } from '../config/theme';
import { ReviewerBadge } from '../config/worksheetConfig';
import { REVIEW_STATUS, SUBMISSION_STATUS } from '../constants/status';
import { getDueDateInfo } from '../hooks/useDueDates';

interface WorksheetMeta {
  id: string;
  num: number;
  path: string;
  title: string;
  icon: LucideIcon;
  desc: string;
}

interface StatusInfo {
  status: string | null;
  review_status: string | null;
}

interface PhaseWorksheetListProps {
  worksheets: WorksheetMeta[];
  statuses: Record<string, StatusInfo>;
}

function getBadge(status: string | null, reviewStatus: string | null): { label: string; color: string } {
  if (reviewStatus === REVIEW_STATUS.APPROVED) return { label: 'Reviewed', color: t.success };
  if (reviewStatus === REVIEW_STATUS.BUDDY_APPROVED) return { label: 'Buddy Approved', color: t.purple };
  if (reviewStatus === REVIEW_STATUS.NEEDS_REVISION) return { label: 'Revise', color: t.warning };
  if (status === SUBMISSION_STATUS.SUBMITTED || reviewStatus === REVIEW_STATUS.PENDING_REVIEW || reviewStatus === REVIEW_STATUS.REVISION_SUBMITTED) return { label: 'Pending', color: t.pending };
  if (status === SUBMISSION_STATUS.IN_PROGRESS) return { label: 'In Progress', color: t.ch };
  return { label: 'Not Started', color: t.wg };
}

export default function PhaseWorksheetList({ worksheets, statuses }: PhaseWorksheetListProps) {
  const navigate = useNavigate();

  return (
    <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
      {worksheets.map((ws, idx) => {
        const Icon = ws.icon;
        const wsStatus = statuses[ws.id];
        const badge = getBadge(wsStatus?.status ?? null, wsStatus?.review_status ?? null);
        return (            <div key={ws.id} onClick={() => navigate(ws.path)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(ws.path); } }}
              role="button" tabIndex={0}
              aria-label={`Open worksheet: ${ws.title}`}
            className="phase-ws-row"
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1.25rem 0',
              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
              cursor: 'pointer',
              transition: 'opacity 200ms var(--ease-lux)',
              opacity: 0,
              animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
            }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.6'; }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
          >
            <div style={{ width: '40px', height: '40px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="phase-ws-title" style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                  W{ws.num}: {ws.title}
                </span>
                <ReviewerBadge worksheetId={ws.id} />
              </div>
              <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, marginTop: '4px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ws.desc}</p>
            </div>
            {(badge.label === 'Not Started' || badge.label === 'In Progress') && (() => {
              const due = getDueDateInfo(ws.id);
              if (!due.dueDate) return null;
              return (
                <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: due.isOverdue ? t.error : due.isDueSoon ? t.warning : t.wg, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {due.isOverdue && <AlertTriangle size={10} strokeWidth={1.5} />}
                  {due.statusLabel}
                </span>
              );
            })()}
            <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
            <ArrowRight size={14} strokeWidth={1.5} style={{ color: t.wg, flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );
}

