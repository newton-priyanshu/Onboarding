import { useNavigate } from 'react-router-dom';
import { BookOpen, MessageSquare, ClipboardCheck, FileText, Monitor, Shield, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { REVIEWER_LABELS, REVIEWER_STYLES, ReviewerBadge } from '../worksheetConfig.jsx';
import { getDueDateInfo } from '../hooks/useDueDates';

const worksheets = [
  { id: 'p2_w1', num: 1, path: '/phase-2/worksheet-1', title: 'Student Doubt Resolution & Common Errors Diagnostic Log', icon: MessageSquare, desc: 'Track 30+ student interactions and identify confusion patterns.' },
  { id: 'p2_w2', num: 2, path: '/phase-2/worksheet-2', title: 'Independent Lab Facilitation Scorecard', icon: ClipboardCheck, desc: 'Document 2+ independent labs with mentor feedback.' },
  { id: 'p2_w3', num: 3, path: '/phase-2/worksheet-3', title: 'Courseware Content Creation Ledger', icon: FileText, desc: 'Track every content contribution — worksheets, MCQs, coding questions.' },
  { id: 'p2_w4', num: 4, path: '/phase-2/worksheet-4', title: 'Advanced Portal Operations & Quiz Configuration Check', icon: Monitor, desc: 'Evidence-based quiz configuration and scenario challenges.' },
];

const theme = {
  fontBody: 'var(--font-body)', fontHeading: 'var(--font-heading)',
  charcoal: 'var(--color-charcoal)', warmGrey: 'var(--color-warm-grey)', gold: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function Phase2() {
  const navigate = useNavigate(); const { user } = useAuth();
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    if (user) (async () => {
      const { data } = await supabase.from('worksheet_submissions').select('worksheet_id, status, review_status').eq('user_id', user.id);
      if (data) { const m = {}; data.forEach(s => { m[s.worksheet_id] = { status: s.status, review_status: s.review_status }; }); setStatuses(m); }
    })();
  }, [user]);

  const completed = worksheets.filter(w => { const s = statuses[w.id]; return s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved'; }).length;

  function getBadge(status, reviewStatus) {
    if (reviewStatus === 'approved') return { label: 'Reviewed', color: '#1B5E20' };
    if (reviewStatus === 'buddy_approved') return { label: 'Buddy Approved', color: '#381E72' };
    if (reviewStatus === 'needs_revision') return { label: 'Revise', color: '#C62828' };
    if (status === 'submitted' || reviewStatus === 'pending_review' || reviewStatus === 'revision_submitted') return { label: 'Pending', color: '#7D5260' };
    if (status === 'In Progress') return { label: 'In Progress', color: theme.charcoal };
    return { label: 'Not Started', color: theme.warmGrey };
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={22} strokeWidth={1.5} style={{ color: theme.charcoal }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: theme.fontHeading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: theme.charcoal, marginBottom: '4px' }}>
                Phase 2: <em style={{ fontStyle: 'italic', color: theme.gold }}>Contribution</em>
              </h1>
              <span style={{ fontFamily: theme.fontBody, fontSize: '0.75rem', color: theme.warmGrey, letterSpacing: '0.05em' }}>Days 31–60 — 4 worksheets + Gate Control</span>
            </div>
          </div>
          <p style={{ fontFamily: theme.fontBody, fontSize: '0.875rem', color: theme.warmGrey, lineHeight: 1.6, marginTop: '1rem', maxWidth: '600px' }}>
            Teach, create content, and develop your craft with mentor support.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.25rem' }}>
            <div className="lux-progress" style={{ flex: 1, maxWidth: '300px' }}>
              <div className="lux-progress-fill lux-progress-fill-gold" style={{ width: `${(completed / (worksheets.length + 1)) * 100}%` }} />
            </div>
            <span style={{ fontFamily: theme.fontBody, fontSize: '0.8rem', fontWeight: 500, color: theme.charcoal }}>
              <CheckCircle2 size={14} strokeWidth={1.5} style={{ marginRight: '6px', color: theme.gold, verticalAlign: 'middle' }} />
              {completed} / {worksheets.length + 1}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '2.5rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
          <span style={{ fontFamily: theme.fontBody, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: theme.warmGrey, display: 'block', marginBottom: '0.75rem' }}>
            Reviewed by
          </span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(REVIEWER_LABELS).map(([key, label]) => {
              const style = REVIEWER_STYLES[key];
              return (
                <span key={key} style={{ fontFamily: theme.fontBody, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', padding: '4px 12px', border: '1px solid ' + style.color, color: style.color }}>{label}</span>
              );
            })}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
          {worksheets.map((ws, idx) => {
            const Icon = ws.icon;
            const wsStatus = statuses[ws.id];
            const badge = getBadge(wsStatus?.status, wsStatus?.review_status);
            return (
              <div key={ws.id} onClick={() => navigate(ws.path)}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem 0', borderBottom: '1px solid rgba(26, 26, 26, 0.06)', cursor: 'pointer', transition: 'opacity 500ms var(--ease-lux)', opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards` }}
                onMouseOver={e => { e.currentTarget.style.opacity = '0.6'; }}
                onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <div style={{ width: '40px', height: '40px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} strokeWidth={1.5} style={{ color: theme.charcoal }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: theme.fontBody, fontSize: '0.85rem', fontWeight: 500, color: theme.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>W{ws.num}: {ws.title}</span>
                    <ReviewerBadge worksheetId={ws.id} />
                  </div>
                  <p style={{ fontFamily: theme.fontBody, fontSize: '0.75rem', color: theme.warmGrey, marginTop: '4px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ws.desc}</p>
                </div>
                {(badge.label === 'Not Started' || badge.label === 'In Progress') && (() => {
                  const due = getDueDateInfo(ws.id);
                  if (!due.dueDate) return null;
                  return (
                    <span style={{ fontFamily: theme.fontBody, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: due.isOverdue ? '#C62828' : due.isDueSoon ? '#E65100' : theme.warmGrey, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {due.isOverdue && <AlertTriangle size={10} strokeWidth={1.5} />}
                      {due.statusLabel}
                    </span>
                  );
                })()}
                <span style={{ fontFamily: theme.fontBody, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                <ArrowRight size={14} strokeWidth={1.5} style={{ color: theme.warmGrey, flexShrink: 0 }} />
              </div>
            );
          })}
        </div>

        <div onClick={() => navigate('/phase-2/gate-2')}
          style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem 0', marginTop: '0.5rem', cursor: 'pointer', borderTop: '1px solid ' + theme.gold, transition: 'opacity 500ms var(--ease-lux)', opacity: 0, animation: 'luxFadeIn 0.6s 0.6s forwards' }}
          onMouseOver={e => { e.currentTarget.style.opacity = '0.6'; }}
          onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
        >
          <div style={{ width: '36px', height: '36px', border: '1px solid ' + theme.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={18} strokeWidth={1.5} style={{ color: theme.gold }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: theme.fontBody, fontSize: '0.85rem', fontWeight: 500, color: theme.gold }}>Gate Control 2 — 60-Day Milestone Review</span>
              <ReviewerBadge worksheetId="gc2" />
            </div>
            <p style={{ fontFamily: theme.fontBody, fontSize: '0.75rem', color: theme.warmGrey, marginTop: '2px' }}>Manager sign-off to advance to Phase 3</p>
          </div>
          <ArrowRight size={14} strokeWidth={1.5} style={{ color: theme.gold, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}
