import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import {
  ArrowRight, BookOpen, Target, Sparkles, Lock,
  CheckCircle2, Clock, AlertCircle, FileText, LucideIcon,
  Anchor, Layers, Users, Flag,
} from 'lucide-react';
import { t } from '../config/theme';
import { WORKSHEET_NAMES, isPhaseApproved, ReviewerBadge, type WorksheetSubmission } from '../config/worksheetConfig';

interface PhaseInfo {
  num: number;
  title: string;
  days: string;
  description: string;
  icon: LucideIcon;
  path: string;
  worksheets: string[];
}

const phases: PhaseInfo[] = [
  { num: 1, title: 'Orientation & Understanding', days: 'Days 1–30', description: 'People, culture, systems, and processes.', icon: BookOpen, path: '/phase-1', worksheets: ['p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8'] },
  { num: 2, title: 'Contribution & Guided Teaching', days: 'Days 31–60', description: 'Teach, create content, and develop your craft.', icon: Target, path: '/phase-2', worksheets: ['p2_w1','p2_w2','p2_w3','p2_w4'] },
  { num: 3, title: 'Independent Teaching & Ownership', days: 'Days 61–90', description: 'Teach independently and propose improvements.', icon: Sparkles, path: '/phase-3', worksheets: ['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5'] },
];

interface WeekInfo {
  num: number;
  title: string;
  subtitle: string;
  theme: string;
  icon: LucideIcon;
  path: string;
  worksheets: string[];
}

const weeks: WeekInfo[] = [
  { num: 1, title: 'Anchor', subtitle: 'Observe begins', theme: 'Context before content — functional means operational', icon: Anchor, path: '/week-1', worksheets: ['p1_w5','p1_w6','p1_w3','w1_o1','w1_e1','w1_o2'] },
  { num: 2, title: 'Co-create', subtitle: 'Observe deepens', theme: 'Content creation to the zero-error standard', icon: Layers, path: '/week-2', worksheets: ['p2_w3','p1_w7','p1_w6','w2_e1','w2_c3','w2_d2','w2_b1','w2_o1'] },
  { num: 3, title: 'Co-deliver', subtitle: 'Deliver under observation', theme: 'The rubric enters the room', icon: Users, path: '/week-3', worksheets: ['p2_w1','p2_w2','p2_w4','p3_w5','w3_d1','w3_d2','w3_e1','w3_b1'] },
  { num: 4, title: 'Independence Review', subtitle: 'Co-deliver closes', theme: 'Feedback incorporated, real conditions rehearsed, release decided', icon: Flag, path: '/week-4', worksheets: ['p3_w1','p3_w5','w4_d2','w4_e1','w4_o1','w4_b1'] },
];

interface StatusInfo {
  status: string;
  label: string;
  color: string;
  icon: LucideIcon | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) loadSubmissions();
    else setLoading(false);
  }, [user?.id]);

  async function loadSubmissions() {
    try {
      const { data } = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, review_status, status, updated_at')
        .eq('user_id', user!.id)
        .limit(50);
      if (data) setSubmissions(data as unknown as WorksheetSubmission[]);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  }

  function getWorksheetStatus(wsId: string): StatusInfo {
    const sub = submissions.find((s: WorksheetSubmission) => s.worksheet_id === wsId);
    if (!sub) return { status: 'not_started', label: 'Not Started', color: t.wg, icon: null };
    if (sub.review_status === 'approved') return { status: 'approved', label: 'Reviewed', color: t.success, icon: CheckCircle2 };
    if (sub.review_status === 'buddy_approved') return { status: 'buddy_approved', label: 'Buddy Approved', color: t.purple, icon: CheckCircle2 };
    if (sub.review_status === 'needs_revision') return { status: 'needs_revision', label: 'Needs Revision', color: t.error, icon: AlertCircle };
    if (sub.review_status === 'revision_submitted' || sub.review_status === 'pending_review') return { status: 'pending', label: 'Under Review', color: t.pending, icon: Clock };
    if ((sub.status as string) === 'Submitted') return { status: 'submitted', label: 'Submitted', color: t.pending, icon: Clock };
    return { status: 'in_progress', label: 'In Progress', color: t.ch, icon: FileText };
  }

  function getPhaseProgress(phaseWorksheets: string[]) {
    const total = phaseWorksheets.length;
    const done = phaseWorksheets.filter(wsId => {
      const s = getWorksheetStatus(wsId);
      return s.status === 'approved' || s.status === 'buddy_approved';
    }).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  const totalApproved = submissions.filter(s => s.review_status === 'approved').length;

  // Count total unique worksheets
  const allWorksheetIds = new Set([
    ...phases.flatMap(p => p.worksheets),
    ...weeks.flatMap(w => w.worksheets),
  ]);
  const totalWorksheets = allWorksheetIds.size;

  // Phase gating
  const phase1Approved = isPhaseApproved(user?.id || '', 1, submissions);
  const phase2Approved = isPhaseApproved(user?.id || '', 2, submissions);

  const lockedPhase = (phaseNum: number) => {
    if (phaseNum === 2 && !phase1Approved) return true;
    if (phaseNum === 3 && !phase2Approved) return true;
    return false;
  };

  const phaseLockReason = (phaseNum: number) => {
    if (phaseNum === 2 && !phase1Approved) return 'Complete Phase 1 to unlock';
    if (phaseNum === 3 && !phase2Approved) return 'Complete Phase 2 to unlock';
    return '';
  };

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
            Complete worksheets and get them reviewed to advance through each phase.
          </p>

          {/* Status Legend */}
          {!loading && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {([
                { label: 'Not Started', color: t.wg },
                { label: 'In Progress', color: t.ch },
                { label: 'Buddy Approved', color: t.purple },
                { label: 'Under Review', color: t.pending },
                { label: 'Reviewed', color: t.success },
                { label: 'Needs Revision', color: t.error },
              ] as { label: string; color: string }[]).map(b => (
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
                  width: `${Math.round(totalWorksheets > 0 ? (totalApproved / totalWorksheets) * 100 : 0)}%`,
                }} />
              </div>
              <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
                {totalApproved}<span style={{ color: t.wg, fontWeight: 400 }}> / {totalWorksheets}</span>
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
              const isLocked = lockedPhase(phase.num);
              return (
                <div key={phase.num} style={{
                  animation: `luxFadeIn 0.7s ${idx * 0.15}s forwards`, opacity: 0,
                  borderTop: '1px solid var(--color-charcoal)',
                  padding: '2rem 0',
                }}>
                  {/* Phase Header */}
                  <div onClick={() => { if (!isLocked) navigate(phase.path); }}
                    onKeyDown={!isLocked ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(phase.path); } } : undefined}
                    role={isLocked ? 'presentation' : 'button'}
                    tabIndex={isLocked ? -1 : 0}
                    aria-label={isLocked ? `Phase ${phase.num} is locked. ${phaseLockReason(phase.num)}` : `Go to Phase ${phase.num}`}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '1.25rem',
                      textDecoration: 'none', cursor: isLocked ? 'default' : 'pointer',
                      transition: 'opacity 200ms var(--ease-lux)',
                      opacity: isLocked ? 0.5 : 1,
                    }}
                  >
                    <div style={{
                      width: '52px', height: '52px',
                      border: '1px solid var(--color-charcoal)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {isLocked ? <Lock size={22} strokeWidth={1.5} style={{ color: t.wg }} /> : <Icon size={24} strokeWidth={1.5} style={{ color: t.ch }} />}
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
                        {isLocked && (
                          <span className="lux-badge" style={{ fontSize: '0.55rem', borderColor: '#9E9E9E', color: '#9E9E9E' }}>
                            <Lock size={10} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Locked
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontFamily: t.heading, fontSize: '1.35rem', fontWeight: 400, color: isLocked ? t.wg : t.ch, marginBottom: '4px' }}>
                        {phase.title}
                      </h3>
                      <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg, lineHeight: 1.6, marginBottom: '0.75rem' }}>
                        {isLocked ? phaseLockReason(phase.num) : phase.description}
                      </p>
                      {isLocked ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Lock size={12} strokeWidth={1.5} style={{ color: t.wg }} />
                          <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>
                            {phaseLockReason(phase.num)}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="lux-progress" style={{ flex: 1, maxWidth: '250px' }}>
                            <div className="lux-progress-fill" style={{ width: `${progress.pct}%` }} />
                          </div>
                          <span style={{ fontFamily: t.body, fontSize: '0.75rem', fontWeight: 500, color: t.ch }}>
                            {progress.done}/{progress.total}
                          </span>
                          <ArrowRight size={13} strokeWidth={1.5} style={{ color: t.wg }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Worksheet List */}
                  {!loading && !isLocked && (
                    <div style={{ marginTop: '1rem', paddingLeft: 'calc(52px + 1.25rem)' }}>
                      {phase.worksheets.map((wsId, i) => {
                        const ws = getWorksheetStatus(wsId);
                        const StatusIcon = ws.icon;
                        return (
                          <Link key={wsId} to={`/phase-${phase.num}/worksheet-${wsId.replace('p' + phase.num + '_w', '')}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '10px 0 10px 12px',
                              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                              textDecoration: 'none',
                              fontFamily: t.body, fontSize: '0.8rem', color: t.ch,
                              transition: 'color 200ms var(--ease-lux)',
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
                            <span style={{ flex: 1 }}>{WORKSHEET_NAMES[wsId] || wsId}</span>
                            <ReviewerBadge worksheetId={wsId} />
                            <span style={{ fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: ws.color, whiteSpace: 'nowrap' }}>
                              {ws.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* FTP Week Roadmap */}
        <section style={{ marginTop: '4rem', borderTop: '1px solid var(--color-charcoal)', paddingTop: '2rem' }}>
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '0.5rem' }}>
              FTP Curriculum <em style={{ fontStyle: 'italic', color: t.gd }}>Weeks</em>
            </h2>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
              Four-week faculty training program — Anchor → Independence
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {weeks.map((week, idx) => {
              const Icon = week.icon;
              const progress = getPhaseProgress(week.worksheets);
              return (
                <div key={week.num}
                  onClick={() => navigate(week.path)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(week.path); } }}
                  role="button" tabIndex={0}
                  style={{
                    padding: '1.5rem',
                    border: '1px solid var(--color-charcoal)',
                    cursor: 'pointer',
                    transition: 'all 200ms var(--ease-lux)',
                    opacity: 0,
                    animation: `luxFadeIn 0.5s ${idx * 0.1}s forwards`,
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(26, 26, 26, 0.03)'; e.currentTarget.style.borderColor = t.gd; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-charcoal)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{
                      width: '40px', height: '40px',
                      border: '1px solid var(--color-charcoal)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={20} strokeWidth={1.5} style={{ color: t.ch }} />
                    </div>
                    <div>
                      <span style={{
                        fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
                        letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
                      }}>
                        Week {week.num}
                      </span>
                      <h3 style={{
                        fontFamily: t.heading, fontSize: '1.2rem', fontWeight: 400,
                        color: t.ch, margin: 0,
                      }}>
                        {week.title} — {week.subtitle}
                      </h3>
                    </div>
                  </div>
                  <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, lineHeight: 1.5, marginBottom: '8px' }}>
                    {week.theme}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="lux-progress" style={{ flex: 1 }}>
                      <div className="lux-progress-fill" style={{ width: `${progress.pct}%` }} />
                    </div>
                    <span style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, color: t.ch }}>
                      {progress.done}/{progress.total}
                    </span>
                  </div>
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
            {([
              { to: '/phase-1', label: 'Start Phase 1', desc: 'Begin your orientation' },
              { to: '/phase-2', label: 'Phase 2 Worksheets', desc: 'Teaching & content creation' },
              { to: '/phase-3', label: 'Phase 3 Worksheets', desc: 'Independent teaching' },
              // FTP Week Quick Links
              { to: '/week-1', label: 'Week 1 — Anchor', desc: 'Context before content' },
              { to: '/week-2', label: 'Week 2 — Co-create', desc: 'Zero-error content standard' },
              { to: '/week-3', label: 'Week 3 — Co-deliver', desc: 'Deliver under observation' },
              { to: '/week-4', label: 'Week 4 — Independence', desc: 'Release readiness review' },
              { to: '/assessment', label: 'Final Assessment', desc: 'Check readiness criteria' },
              { to: '/stakeholders', label: 'Meet the Team', desc: 'View stakeholders' },
              { to: 'https://newton.school/academy', label: 'Help & Guide', desc: 'Faculty onboarding resources' },
            ] as { to: string; label: string; desc: string }[]).map((link, i) => (
              <Link key={i} to={link.to} style={{
                textDecoration: 'none', padding: '1rem 0',
                borderTop: '1px solid var(--color-charcoal)',
                minWidth: '160px',
                transition: 'opacity 200ms var(--ease-lux)',
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
