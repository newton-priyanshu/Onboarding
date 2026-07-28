import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import {
  ArrowRight, BookOpen, Target, Sparkles, CheckCircle2,
  Clock, AlertCircle, FileText, RefreshCw, LucideIcon, Lock,
} from 'lucide-react';
import { t } from '../config/theme';
import { getWorksheetName, getDeptPhaseMap, getReviewerType, getDeptApprovedPhases } from '../config/worksheetConfigData';
import { useWorksheetTemplate } from '../hooks/useWorksheetTemplate';
import { REVIEWER_STYLES, type WorksheetSubmission } from '../config/worksheetConfig';
import { SUBMISSION_STATUS, REVIEW_STATUS } from '../constants/status';
import type { Department } from '../types/supabase';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';

// ─── Props ──────────────────────────────────────────────

interface DeptDashboardProps {
  dept: Department;
  label: string;
  desc: string;
}

// ─── Constants ──────────────────────────────────────────

const DEPT_COLORS: Record<string, string> = {
  progression: '#2E7D32',
  operations: '#7B1FA2',
  academics: '#006494',
};

interface PhaseInfo {
  num: number;
  title: string;
  days: string;
  description: string;
  icon: LucideIcon;
  path: string;
}

const PHASE_TITLES: Record<number, { title: string; days: string; desc: string; icon: LucideIcon }> = {
  1: { title: 'Orientation & Understanding', days: 'Days 1–30', desc: 'Build foundational knowledge of people, culture, systems, and processes.', icon: BookOpen },
  2: { title: 'Contribution & Guided Teaching', days: 'Days 31–60', desc: 'Teach, create content, and develop your craft under guidance.', icon: Target },
  3: { title: 'Independent Teaching & Ownership', days: 'Days 61–90', desc: 'Teach independently, design assessments, and propose improvements.', icon: Sparkles },
};

interface StatusInfo {
  status: string;
  label: string;
  color: string;
  icon: LucideIcon | null;
}

// ─── Component ──────────────────────────────────────────

export default function DeptDashboard({ dept, label, desc }: DeptDashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { template } = useWorksheetTemplate();

  const phaseMap = getDeptPhaseMap(dept);
  const phases: PhaseInfo[] = [1, 2, 3].filter((n): n is 1|2|3 => (phaseMap[n]?.length || 0) > 0).map(n => {
    const info = PHASE_TITLES[n]!;
    return {
      num: n,
      title: info.title,
      days: info.days,
      description: info.desc,
      icon: info.icon,
      path: `/${dept}/phase-${n}`,
    };
  });

  const allWorksheetIds = phases.flatMap(p => phaseMap[p.num] || []);
  const color = DEPT_COLORS[dept] || 'var(--color-charcoal)';

  const loadSubmissions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, review_status, status, user_id')
        .eq('user_id', user.id)
        .limit(50)
        .then(unwrap);
      setSubmissions(data.map(s => ({ ...s, user_id: user.id })) as WorksheetSubmission[]);
    } catch (err) {
      console.error(`Failed to load ${dept} submissions:`, err);
      setLoadError('We could not load your progress. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, dept]);

  useEffect(() => {
    if (user?.id) loadSubmissions();
    else setLoading(false);
  }, [user?.id, loadSubmissions]);

  function getWorksheetStatus(wsId: string): StatusInfo {
    const sub = submissions.find(s => s.worksheet_id === wsId);
    if (!sub) return { status: 'not_started', label: 'Not Started', color: t.wg, icon: null };
    if (sub.review_status === REVIEW_STATUS.APPROVED) return { status: 'approved', label: 'Reviewed', color: t.success, icon: CheckCircle2 };
    if (sub.review_status === REVIEW_STATUS.BUDDY_APPROVED) return { status: 'buddy_approved', label: 'Buddy Approved', color: t.purple, icon: CheckCircle2 };
    if (sub.review_status === REVIEW_STATUS.NEEDS_REVISION) return { status: 'needs_revision', label: 'Needs Revision', color: t.error, icon: AlertCircle };
    if (sub.review_status === REVIEW_STATUS.REVISION_SUBMITTED || sub.review_status === REVIEW_STATUS.PENDING_REVIEW) return { status: 'pending', label: 'Under Review', color: t.pending, icon: Clock };
    const rawStatus = (sub.status as string) || '';
    if (rawStatus === SUBMISSION_STATUS.SUBMITTED || rawStatus === 'Submitted') return { status: 'submitted', label: 'Submitted', color: t.pending, icon: Clock };
    return { status: 'in_progress', label: 'In Progress', color: t.ch, icon: FileText };
  }

  function getPhaseProgress(wsIds: string[]) {
    const total = wsIds.length;
    const done = wsIds.filter(id => {
      const s = getWorksheetStatus(id);
      return s.status === 'approved' || s.status === 'buddy_approved';
    }).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  const totalApproved = submissions.filter(s => s.review_status === 'approved' || s.review_status === 'buddy_approved').length;
  const totalWorksheets = allWorksheetIds.length;

  // Phase gating — check if each prior phase is manager-approved
  const deptApproved = getDeptApprovedPhases(user?.id || '', submissions, dept);
  const deptPhase1Approved = deptApproved.includes(1);
  const deptPhase2Approved = deptApproved.includes(2);

  const lockedPhase = (phaseNum: number) => {
    if (phaseNum === 2 && !deptPhase1Approved) return true;
    if (phaseNum === 3 && !deptPhase2Approved) return true;
    return false;
  };

  const phaseLockReason = (phaseNum: number) => {
    if (phaseNum === 2 && !deptPhase1Approved) return 'Complete Phase 1 to unlock';
    if (phaseNum === 3 && !deptPhase2Approved) return 'Complete Phase 2 to unlock';
    return '';
  };



  // ─── Loading State ────────────────────────────────────

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" aria-label={`Loading ${label} dashboard`}>
          <div style={{ marginBottom: '4rem', maxWidth: '800px' }}>
            <div className="lux-line" style={{ marginBottom: '1.25rem', borderColor: color }} />
            <Skeleton width="280px" height="0.6rem" style={{ marginBottom: '1rem' }} />
            <Skeleton width="70%" height="2.8rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="45%" height="2.8rem" style={{ marginBottom: '1.25rem' }} />
            <div style={{ marginBottom: '2rem' }}><SkeletonBlock lines={2} width="500px" /></div>
          </div>
          <section>
            <Skeleton width="250px" height="1.5rem" style={{ marginBottom: '2rem' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ padding: '1rem 0', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
                  <Skeleton width="60%" height="1rem" style={{ marginBottom: '0.5rem' }} />
                  <Skeleton width="40%" height="0.75rem" />
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
            Couldn&apos;t Load Dashboard
          </h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => loadSubmissions()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Hero */}
        <div style={{ marginBottom: '3.5rem', maxWidth: '800px' }}>
          <div className="lux-line" style={{ marginBottom: '1.25rem', borderColor: color }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            color: color, display: 'block', marginBottom: '1rem',
          }}>
            {label}
          </span>
          <h1 style={{
            fontFamily: t.heading,
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: t.ch,
            marginBottom: '1rem',
          }}>
            Welcome to Your{' '}
            <em style={{ fontStyle: 'italic', color }}>{label.split(' ')[0]}</em>
            <br />
            Onboarding
          </h1>
          <p style={{
            fontFamily: t.body, fontSize: '0.9rem', lineHeight: 1.7,
            color: t.wg, maxWidth: '500px', marginBottom: '2rem',
          }}>
            {desc}
          </p>

          {/* Status Legend */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
        {totalWorksheets > 0 && (
          <div style={{
            marginBottom: '3rem', padding: '1.5rem 0',
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
                <div className="lux-progress-fill" style={{
                  width: `${totalWorksheets > 0 ? (totalApproved / totalWorksheets) * 100 : 0}%`,
                  background: color,
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
              Onboarding <em style={{ fontStyle: 'italic', color }}>Roadmap</em>
            </h2>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
              Three phases to build your practice in {label}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {phases.map((phase, idx) => {
              const Icon = phase.icon;
              const wsIds = phaseMap[phase.num] || [];
              const progress = getPhaseProgress(wsIds);
              const isLocked = lockedPhase(phase.num);
              return (
                <div key={phase.num} style={{
                  animation: `luxFadeIn 0.7s ${idx * 0.15}s forwards`, opacity: 0,
                  borderTop: '1px solid var(--color-charcoal)',
                  padding: '2rem 0',
                }}>
                  <div
                    onClick={() => { if (!isLocked) navigate(phase.path); }}
                    onKeyDown={(e: React.KeyboardEvent) => { if (!isLocked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); navigate(phase.path); } }}
                    role={isLocked ? 'presentation' : 'button'}
                    tabIndex={isLocked ? -1 : 0}
                    aria-label={isLocked ? `Phase ${phase.num} is locked. ${phaseLockReason(phase.num)}` : `Go to ${phase.title}`}
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
                          {wsIds.length} worksheets
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
                            <div className="lux-progress-fill" style={{ width: `${progress.pct}%`, background: progress.pct === 100 ? color : undefined }} />
                          </div>
                          <span style={{ fontFamily: t.body, fontSize: '0.75rem', fontWeight: 500, color: t.ch }}>
                            {progress.done}/{progress.total}
                          </span>
                          <ArrowRight size={13} strokeWidth={1.5} style={{ color: t.wg }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Worksheet List — only show for unlocked phases */}
                  {!loading && !isLocked && wsIds.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingLeft: 'calc(52px + 1.25rem)' }}>
                      {wsIds.map((wsId, i) => {
                        const ws = getWorksheetStatus(wsId);
                        const StatusIcon = ws.icon;
                        const reviewerType = getReviewerType(wsId, template);
                        const reviewerStyle = REVIEWER_STYLES[reviewerType as keyof typeof REVIEWER_STYLES];
                        return (
                          <div
                            key={wsId}
                            onClick={() => navigate(`/${dept}/phase-${phase.num}/worksheet/${wsId}`)}
                            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') navigate(`/${dept}/phase-${phase.num}/worksheet/${wsId}`); }}
                            role="button"
                            tabIndex={0}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '10px 0 10px 12px',
                              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                              cursor: 'pointer',
                              fontFamily: t.body, fontSize: '0.8rem', color: t.ch,
                              transition: 'color 200ms var(--ease-lux), opacity 200ms',
                              opacity: 0,
                              animation: `luxFadeIn 0.5s ${(idx * wsIds.length + i) * 0.04 + 0.3}s forwards`,
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = color; }}
                            onMouseOut={e => { e.currentTarget.style.color = t.ch; }}
                          >
                            {StatusIcon ? (
                              <StatusIcon size={12} strokeWidth={2} style={{ color: ws.color, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '10px', height: '10px', border: '1px solid ' + ws.color, flexShrink: 0 }} />
                            )}
                            <span style={{ flex: 1 }}>{getWorksheetName(wsId, template)}</span>
                            {reviewerStyle && (
                              <span style={{
                                fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.15em',
                                textTransform: 'uppercase', color: reviewerStyle.color,
                                border: '1px solid ' + reviewerStyle.color,
                                padding: '1px 6px',
                                whiteSpace: 'nowrap',
                              }}>
                                {reviewerType === 'buddy' ? 'Buddy' : reviewerType === 'manager' ? 'Manager' : 'Self'}
                              </span>
                            )}
                            <span style={{ fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: ws.color, whiteSpace: 'nowrap' }}>
                              {ws.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
