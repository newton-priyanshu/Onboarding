import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { 
  ArrowRight, BookOpen, Target, Sparkles,
  CheckCircle2, Clock, AlertCircle, FileText,
} from 'lucide-react';
import { WORKSHEET_REVIEWER, REVIEWER_LABELS, REVIEWER_STYLES, ReviewerBadge } from '../worksheetConfig.jsx';

const phases = [
  { num: 1, title: 'Orientation & Understanding', days: 'Days 1–30', description: 'People, culture, systems, and processes.', icon: BookOpen, path: '/phase-1', worksheets: ['p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8'], hasGate: true, gatePath: '/phase-1/gate-1' },
  { num: 2, title: 'Contribution & Guided Teaching', days: 'Days 31–60', description: 'Teach, create content, and develop your craft.', icon: Target, path: '/phase-2', worksheets: ['p2_w1','p2_w2','p2_w3','p2_w4'], hasGate: true, gatePath: '/phase-2/gate-2' },
  { num: 3, title: 'Independent Teaching & Ownership', days: 'Days 61–90', description: 'Teach independently and propose improvements.', icon: Sparkles, path: '/phase-3', worksheets: ['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5'], hasGate: true, gatePath: '/phase-3/gate-3' },
];

const WORKSHEET_TITLES = {
  p1_w1: 'Team Introduction', p1_w2: 'Mentor Weekly Sync', p1_w3: 'Teaching Philosophy',
  p1_w4: 'University Governance', p1_w5: 'Portal Walkthrough', p1_w6: 'Observation Journal',
  p1_w7: 'Courseware Review', p1_w8: 'Slack Audit',
  p2_w1: 'Doubt Resolution', p2_w2: 'Lab Scorecard', p2_w3: 'Content Ledger', p2_w4: 'Portal Ops',
  p3_w1: 'Lecture Delivery', p3_w2: 'Cohort Profiling', p3_w3: 'Assessment Blueprint',
  p3_w4: 'Pedagogical Journal', p3_w5: 'Course Proposal',
  gc1: 'Gate Control 1', gc2: 'Gate Control 2', gc3: 'Gate Control 3',
};

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) loadSubmissions();
    else setLoading(false);
  }, [user?.id]);

  async function loadSubmissions() {
    try {
      const { data } = await supabase
        .from('worksheet_submissions')
        .select('*')
        .eq('user_id', user.id);
      if (data) setSubmissions(data);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  }

  function getWorksheetStatus(wsId) {
    const sub = submissions.find(s => s.worksheet_id === wsId);
    if (!sub) return { status: 'not_started', label: 'Not Started', color: t.wg, icon: null };
    if (sub.review_status === 'approved') return { status: 'approved', label: 'Reviewed', color: '#1B5E20', icon: CheckCircle2 };
    if (sub.review_status === 'buddy_approved') return { status: 'buddy_approved', label: 'Buddy Approved', color: '#381E72', icon: CheckCircle2 };
    if (sub.review_status === 'needs_revision') return { status: 'needs_revision', label: 'Needs Revision', color: '#C62828', icon: AlertCircle };
    if (sub.review_status === 'revision_submitted' || sub.review_status === 'pending_review') return { status: 'pending', label: 'Under Review', color: '#7D5260', icon: Clock };
    if (sub.status === 'submitted') return { status: 'submitted', label: 'Submitted', color: '#7D5260', icon: Clock };
    return { status: 'in_progress', label: 'In Progress', color: t.ch, icon: FileText };
  }

  function getPhaseProgress(phaseWorksheets) {
    const total = phaseWorksheets.length;
    const done = phaseWorksheets.filter(wsId => {
      const s = getWorksheetStatus(wsId);
      return s.status === 'approved' || s.status === 'buddy_approved';
    }).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  const totalApproved = submissions.filter(s => s.review_status === 'approved').length;

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Hero */}
        <div style={{ marginBottom: '4rem', maxWidth: '800px' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.25rem' }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '1rem',
          }}>
            Newton School of Technology · Bengaluru
          </span>
          <h1 style={{
            fontFamily: t.heading,
            fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: t.ch,
            marginBottom: '1.25rem',
          }}>
            Welcome to Your{' '}
            <em style={{ fontStyle: 'italic', color: t.gd }}>Onboarding</em>
            <br />
            Journey
          </h1>
          <p style={{
            fontFamily: t.body, fontSize: '0.95rem', lineHeight: 1.7,
            color: t.wg, maxWidth: '500px', marginBottom: '2rem',
          }}>
            This 30–60–90 day program helps you integrate into our faculty community.
            Complete worksheets and pass gate controls to advance through each phase.
          </p>

          {/* Status Legend */}
          {!loading && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Not Started', color: t.wg },
                { label: 'In Progress', color: t.ch },
                { label: 'Buddy Approved', color: '#381E72' },
                { label: 'Under Review', color: '#7D5260' },
                { label: 'Reviewed', color: '#1B5E20' },
                { label: 'Needs Revision', color: '#C62828' },
              ].map(b => (
                <span key={b.label} className="lux-badge lux-badge-light" style={{
                  borderColor: b.color, color: b.color, fontSize: '0.55rem',
                }}>{b.label}</span>
              ))}
            </div>
          )}
        </div>

        {/* Overall Progress */}
        {!loading && submissions.length > 0 && (
          <div style={{
            marginBottom: '3.5rem', padding: '1.5rem 0',
            borderTop: '1px solid rgba(26, 26, 26, 0.12)',
            borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
              }}>
                Overall Progress
              </span>
              <div className="lux-progress" style={{ flex: 1, minWidth: '150px', maxWidth: '350px' }}>
                <div className="lux-progress-fill lux-progress-fill-gold" style={{
                  width: `${Math.round((totalApproved / 20) * 100)}%`,
                }} />
              </div>
              <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
                {totalApproved}<span style={{ color: t.wg, fontWeight: 400 }}> / 20</span>
              </span>
            </div>
          </div>
        )}

        {/* Phase Roadmap */}
        <section>
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '0.5rem' }}>
              Onboarding <em style={{ fontStyle: 'italic', color: t.gd }}>Roadmap</em>
            </h2>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
              Three phases to build your teaching practice at Newton School
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {phases.map((phase, idx) => {
              const Icon = phase.icon;
              const progress = getPhaseProgress(phase.worksheets);
              return (
                <div key={phase.num} style={{
                  animation: `luxFadeIn 0.7s ${idx * 0.15}s forwards`, opacity: 0,
                  borderTop: '1px solid var(--color-charcoal)',
                  padding: '2rem 0',
                }}>
                  {/* Phase Header */}
                  <Link to={phase.path} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '1.25rem',
                    textDecoration: 'none', cursor: 'pointer',
                    transition: 'opacity 500ms var(--ease-lux)',
                  }}
                    onMouseOver={e => { e.currentTarget.style.opacity = '0.7'; }}
                    onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <div style={{
                      width: '52px', height: '52px',
                      border: '1px solid var(--color-charcoal)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={24} strokeWidth={1.5} style={{ color: t.ch }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>
                          Phase {phase.num}
                        </span>
                        <span style={{ fontFamily: t.body, fontSize: '0.6rem', letterSpacing: '0.1em', color: t.wg }}>
                          {phase.days}
                        </span>
                        <span className="lux-badge lux-badge-light" style={{ fontSize: '0.55rem' }}>
                          {phase.worksheets.length} worksheets
                        </span>
                      </div>
                      <h3 style={{ fontFamily: t.heading, fontSize: '1.35rem', fontWeight: 400, color: t.ch, marginBottom: '4px' }}>
                        {phase.title}
                      </h3>
                      <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg, lineHeight: 1.6, marginBottom: '0.75rem' }}>
                        {phase.description}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="lux-progress" style={{ flex: 1, maxWidth: '250px' }}>
                          <div className="lux-progress-fill" style={{ width: `${progress.pct}%` }} />
                        </div>
                        <span style={{ fontFamily: t.body, fontSize: '0.75rem', fontWeight: 500, color: t.ch }}>
                          {progress.done}/{progress.total}
                        </span>
                        <ArrowRight size={13} strokeWidth={1.5} style={{ color: t.wg }} />
                      </div>
                    </div>
                  </Link>

                  {/* Worksheet List */}
                  {!loading && (
                    <div style={{ marginTop: '1rem', paddingLeft: 'calc(52px + 1.25rem)' }}>
                      {phase.worksheets.map((wsId, i) => {
                        const ws = getWorksheetStatus(wsId);
                        const StatusIcon = ws.icon;
                        const reviewerType = WORKSHEET_REVIEWER[wsId] || 'manager';
                        return (
                          <Link key={wsId} to={`/phase-${phase.num}/worksheet-${wsId.replace('p' + phase.num + '_w', '')}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '10px 0 10px 12px',
                              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                              textDecoration: 'none',
                              fontFamily: t.body, fontSize: '0.8rem', color: t.ch,
                              transition: 'color 500ms var(--ease-lux)',
                              opacity: 0,
                              animation: `luxFadeIn 0.5s ${(idx * phase.worksheets.length + i) * 0.04 + 0.3}s forwards`,
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = t.gd; }}
                            onMouseOut={e => { e.currentTarget.style.color = t.ch; }}
                          >
                            {StatusIcon ? (
                              <StatusIcon size={12} strokeWidth={2} style={{ color: ws.color, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '10px', height: '10px', border: '1px solid ' + ws.color, flexShrink: 0 }} />
                            )}
                            <span style={{ flex: 1 }}>{WORKSHEET_TITLES[wsId] || wsId}</span>
                            <ReviewerBadge worksheetId={wsId} />
                            <span style={{ fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: ws.color, whiteSpace: 'nowrap' }}>
                              {ws.label}
                            </span>
                          </Link>
                        );
                      })}
                      {phase.hasGate && (
                        <Link to={phase.gatePath}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '12px 0 12px 12px',
                            textDecoration: 'none',
                            fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500,
                            color: t.gd,
                            opacity: 0,
                            animation: `luxFadeIn 0.5s ${(idx * phase.worksheets.length + phase.worksheets.length) * 0.04 + 0.4}s forwards`,
                          }}>
                          <div style={{ width: '10px', height: '10px', border: '1px solid ' + t.gd, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <div style={{ width: '4px', height: '4px', background: t.gd }} />
                          </div>
                          <span>Gate {phase.num} — Milestone Review</span>
                          <ReviewerBadge worksheetId={`gc${phase.num}`} />
                          <ArrowRight size={12} strokeWidth={1.5} style={{ marginLeft: 'auto' }} />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Links */}
        <section style={{ marginTop: '4rem', borderTop: '1px solid rgba(26, 26, 26, 0.12)', paddingTop: '2rem' }}>
          <h4 style={{
            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.25rem',
          }}>
            Quick Links
          </h4>
          <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
            {[
              { to: '/phase-1', label: 'Start Phase 1', desc: 'Begin your orientation' },
              { to: '/phase-2', label: 'Phase 2 Worksheets', desc: 'Teaching & content creation' },
              { to: '/phase-3', label: 'Phase 3 Worksheets', desc: 'Independent teaching' },
              { to: '/assessment', label: 'Final Assessment', desc: 'Check readiness criteria' },
              { to: '/stakeholders', label: 'Meet the Team', desc: 'View stakeholders' },
            ].map((link, i) => (
              <Link key={i} to={link.to} style={{
                textDecoration: 'none', padding: '1rem 0',
                borderTop: '1px solid var(--color-charcoal)',
                minWidth: '160px',
                transition: 'opacity 500ms var(--ease-lux)',
              }}
                onMouseOver={e => { e.currentTarget.style.opacity = '0.7'; }}
                onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, marginBottom: '2px' }}>
                  {link.label} <ArrowRight size={11} strokeWidth={1.5} style={{ marginLeft: '4px', color: t.wg }} />
                </p>
                <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
