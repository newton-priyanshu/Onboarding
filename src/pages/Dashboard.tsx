import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import {
  ArrowRight, BookOpen, Target, Sparkles, Lock,
  CheckCircle2, Clock, AlertCircle, FileText, RefreshCw, LucideIcon,
} from 'lucide-react';
import { t } from '../config/theme';
import { WORKSHEET_NAMES, isPhaseApproved, ReviewerBadge, type WorksheetSubmission, PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';
import { SUBMISSION_STATUS } from '../constants/status';
import Skeleton, { SkeletonBlock, SkeletonCard } from '../components/Skeleton';

/** All unique Phase 1 worksheet IDs (FTP weeks + legacy) */
const PHASE1_WS_IDS = [...new Set(PHASE_WORKSHEETS_MAP[1])];

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
  { num: 1, title: 'Orientation & Understanding', days: 'Days 1–30', description: 'People, culture, systems, and processes across four weekly focus areas.', icon: BookOpen, path: '/phase-1', worksheets: PHASE1_WS_IDS },
  { num: 2, title: 'Contribution & Guided Teaching', days: 'Days 31–60', description: 'Teach, create content, and develop your craft.', icon: Target, path: '/phase-2', worksheets: ['p2_w1','p2_w2','p2_w3','p2_w4'] },
  { num: 3, title: 'Independent Teaching & Ownership', days: 'Days 61–90', description: 'Teach independently and propose improvements.', icon: Sparkles, path: '/phase-3', worksheets: ['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5'] },
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) loadSubmissions();
    else setLoading(false);
    // loadSubmissions intentionally omitted: closes over fresh user.id each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadSubmissions() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, review_status, status, updated_at')
        .eq('user_id', user!.id)
        .limit(50)
        .then(unwrap);
      setSubmissions(data as unknown as WorksheetSubmission[]);
    } catch (err) {
      console.error('Failed to load submissions:', err);
      setLoadError('We could not load your progress. Your worksheets are safe — please try again.');
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
    // Support both legacy capital 'Submitted' (from gate controls before fix) and lowercase 'submitted'
    const rawStatus = (sub.status as string) || '';
    if (rawStatus === SUBMISSION_STATUS.SUBMITTED || rawStatus === 'Submitted') return { status: 'submitted', label: 'Submitted', color: t.pending, icon: Clock };
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

  // Count all unique worksheets across phases
  const allPhaseWorksheetIds = new Set(phases.flatMap(p => p.worksheets));
  const totalWorksheets = allPhaseWorksheetIds.size;

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

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" aria-label="Loading dashboard">
          {/* Hero skeleton */}
          <div style={{ marginBottom: '4rem', maxWidth: '800px' }}>
            <div className="lux-line lux-line-gold" style={{ marginBottom: '1.25rem' }} />
            <Skeleton width="280px" height="0.6rem" style={{ marginBottom: '1rem' }} />
            <Skeleton width="70%" height="2.8rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="45%" height="2.8rem" style={{ marginBottom: '1.25rem' }} />
            <div style={{ marginBottom: '2rem' }}><SkeletonBlock lines={2} width="500px" /></div>
            {/* Status legend badges */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} width="90px" height="24px" />
              ))}
            </div>
          </div>
          {/* Overall progress skeleton */}
          <div style={{
            marginBottom: '3.5rem', padding: '1.5rem 0',
            borderTop: '1px solid rgba(26, 26, 26, 0.12)',
            borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <Skeleton width="120px" height="0.65rem" />
              <Skeleton width="350px" height="2px" />
              <Skeleton width="50px" height="0.8rem" />
            </div>
          </div>
          {/* Phase card skeletons */}
          <section>
            <Skeleton width="250px" height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="350px" height="0.8rem" style={{ marginBottom: '2rem' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <SkeletonCard count={3} />
            </div>
          </section>
          {/* Quick links skeleton */}
          <section style={{ marginTop: '4rem', borderTop: '1px solid rgba(26, 26, 26, 0.12)', paddingTop: '2rem' }}>
            <Skeleton width="100px" height="0.65rem" style={{ marginBottom: '1.25rem' }} />
            <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ minWidth: '160px', borderTop: '1px solid var(--color-charcoal)', padding: '1rem 0' }}>
                  <Skeleton width="80%" height="0.85rem" style={{ marginBottom: '0.35rem' }} />
                  <Skeleton width="60%" height="0.7rem" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
            Couldn&apos;t Load Your Dashboard
          </h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {loadError}
          </p>
          <button onClick={() => loadSubmissions()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

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
            NST BLR · AARAMBH
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
        </div>

        {/* Overall Progress */}
        {submissions.length > 0 && (
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
              Three phases to build your teaching practice at NST BLR
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
                          <span className="lux-badge" style={{ fontSize: '0.55rem', borderColor: t.wg, color: t.wg }}>
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

                  {/* Worksheet List — Phase 1 is too large to expand; show link instead */}
                  {!loading && !isLocked && phase.num === 1 && (
                    <div style={{ marginTop: '1rem', paddingLeft: 'calc(52px + 1.25rem)' }}>
                      <Link to="/phase-1" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 0 10px 12px',
                        textDecoration: 'none',
                        fontFamily: t.body, fontSize: '0.8rem', color: t.gd,
                        transition: 'opacity 200ms var(--ease-lux)',
                      }}
                        onMouseOver={e => { e.currentTarget.style.opacity = '0.7'; }}
                        onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        <ArrowRight size={13} strokeWidth={1.5} />
                        <span>View all {phase.worksheets.length} worksheets in Phase 1</span>
                      </Link>
                    </div>
                  )}
                  {/* Phase 2 & 3 — expanded worksheet list */}
                  {!loading && !isLocked && phase.num > 1 && (
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

              { to: '/assessment', label: 'Final Assessment', desc: 'Check readiness criteria' },
              { to: '/stakeholders', label: 'Meet the Team', desc: 'View stakeholders' },
              { to: 'https://newton.school/academy', label: 'Help & Guide', desc: 'NST BLR resources' },
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
