import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertTriangle, type LucideIcon } from 'lucide-react';
import { t } from '../config/theme';
import { ReviewerBadge } from '../config/worksheetConfig';
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
  if (reviewStatus === 'approved') return { label: 'Reviewed', color: '#1B5E20' };
  if (reviewStatus === 'buddy_approved') return { label: 'Buddy Approved', color: '#381E72' };
  if (reviewStatus === 'needs_revision') return { label: 'Revise', color: '#C62828' };
  if (status === 'submitted' || reviewStatus === 'pending_review' || reviewStatus === 'revision_submitted') return { label: 'Pending', color: '#7D5260' };
  if (status === 'In Progress') return { label: 'In Progress', color: t.ch };
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
        return (
          <div key={ws.id} onClick={() => navigate(ws.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1.25rem 0',
              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
              cursor: 'pointer',
              transition: 'opacity 500ms var(--ease-lux)',
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
                <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
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
                <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: due.isOverdue ? '#C62828' : due.isDueSoon ? '#E65100' : t.wg, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
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

