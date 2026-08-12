import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import {
  ArrowRight, BookOpen, Target, Sparkles, Lock,
  CheckCircle2, AlertCircle, RefreshCw, type LucideIcon,
  UserCheck, Shield, Trophy, Zap, Award,
} from 'lucide-react';
import { t } from '../config/theme';
import { getWorksheetName, isPhaseApproved, getReviewerType, type WorksheetSubmission, PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';
import { REVIEWER_STYLES } from '../config/worksheetConfig';
import { useWorksheetTemplate } from '../hooks/useWorksheetTemplate';
import { REVIEW_STATUS } from '../constants/status';
import type { UserProfile } from '../types/supabase';
import Skeleton, { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import CelebrationOverlay from '../components/CelebrationOverlay';
import ProgressRing from '../components/ProgressRing';
import JourneyTimeline from '../components/JourneyTimeline';
import { getDueDateInfo } from '../hooks/useDueDates';
import { getWorksheetPath } from '../utils/worksheetHelpers';
import { getWorksheetStatus as getWorksheetStatusInfo, type WorksheetStatusInfo } from '../utils/worksheetStatus';
import { useAchievements } from '../hooks/useAchievements';
import AchievementCard from '../components/AchievementCard';
import { getMotivation } from '../config/motivations';
import { getEstimatedTime } from '../config/estimatedTimes';
import { useKudos } from '../hooks/useKudos';
import { useMilestones } from '../hooks/useMilestones';
import KudosFeed from '../components/KudosFeed';
import { useGamification } from '../hooks/useGamification';
import GamificationStrip from '../components/GamificationStrip';
import NextUpCard, { pickNextWorksheet } from '../components/NextUpCard';
import AchievementUnlockBanner from '../components/AchievementUnlockBanner';
import CertificateModal from '../components/CertificateModal';

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

const ACCENT = t.gd; // gold — academic brand color

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { template } = useWorksheetTemplate();
  const [submissions, setSubmissions] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buddyProfile, setBuddyProfile] = useState<UserProfile | null>(null);
  const [managerProfile, setManagerProfile] = useState<UserProfile | null>(null);
  const [supportLoading, setSupportLoading] = useState(true);

  const loadSubmissions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await supabase
        .from('worksheet_submissions')
        .select('user_id, worksheet_id, review_status, status, updated_at')
        .eq('user_id', user.id)
        .limit(50)
        .then(unwrap);
      setSubmissions(data as unknown as WorksheetSubmission[]);
    } catch (err) {
      console.error('Failed to load submissions:', err);
      setLoadError('We could not load your progress. Your worksheets are safe — please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // ── Fetch buddy & manager profiles ────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const ids: string[] = [];
    if (profile.assigned_buddy_id) ids.push(profile.assigned_buddy_id);
    if (profile.assigned_lead_id) ids.push(profile.assigned_lead_id);

    if (ids.length === 0) {
      setSupportLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_buddy_manager_names', {
          p_user_ids: ids,
        });
        if (error) throw error;
        const profiles = (data || []) as UserProfile[];
        if (profile.assigned_buddy_id) {
          setBuddyProfile(profiles.find(p => p.id === profile.assigned_buddy_id) ?? null);
        }
        if (profile.assigned_lead_id) {
          setManagerProfile(profiles.find(p => p.id === profile.assigned_lead_id) ?? null);
        }
      } catch (err) {
        console.error('Failed to load support profiles:', err);
      } finally {
        setSupportLoading(false);
      }
    })();
  }, [profile]);

  useEffect(() => {
    if (user?.id) loadSubmissions();
    else setLoading(false);
  }, [user?.id, loadSubmissions]);

  function getWorksheetStatus(wsId: string): WorksheetStatusInfo {
    return getWorksheetStatusInfo(submissions.find((s: WorksheetSubmission) => s.worksheet_id === wsId));
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
  const allPhaseWorksheetIds = new Set(phases.flatMap(p => p.worksheets));
  const totalWorksheets = allPhaseWorksheetIds.size;

  // Phase gating
  const phase1Approved = isPhaseApproved(user?.id || '', 1, submissions);
  const phase2Approved = isPhaseApproved(user?.id || '', 2, submissions);
  const phase3Approved = isPhaseApproved(user?.id || '', 3, submissions);

  // ── Achievements ──
  const { achievements, newlyUnlocked } = useAchievements(user?.id || null, submissions);
  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const lockedAchievements = achievements.filter(a => !a.unlocked);

  // ── Kudos & Milestones ──
  const { receivedKudos } = useKudos(user?.id || null);
  const { milestones } = useMilestones({
    submissions,
    achievements,
    receivedKudos,
  });

  // ── Gamification (XP / level / streak / certificate) ──
  const { profile: gamProfile, dbAvailable, certificate } = useGamification(user?.id || null, submissions);
  const [showCertificate, setShowCertificate] = useState(false);

  // Next worksheet to work on — the single clearest "what do I do now?" cue.
  const nextUp = pickNextWorksheet(submissions);
  const onboardingComplete = certificate != null;

  // ── Daily motivation ──
  const [motivation] = useState(getMotivation);

  // ── Celebration overlay state ──
  const prevPhase1Ref = useRef(phase1Approved);
  const prevPhase2Ref = useRef(phase2Approved);
  const prevPhase3Ref = useRef(phase3Approved);
  const [celebrationPhase, setCelebrationPhase] = useState<number | null>(null);

  // Detect phase approval transitions — fire celebration only once per transition
  useEffect(() => {
    if (loading && submissions.length === 0) return;
    if (phase1Approved && !prevPhase1Ref.current) {
      setCelebrationPhase(1);
    } else if (phase2Approved && !prevPhase2Ref.current) {
      setCelebrationPhase(2);
    } else if (phase3Approved && !prevPhase3Ref.current) {
      setCelebrationPhase(3);
    }
    prevPhase1Ref.current = phase1Approved;
    prevPhase2Ref.current = phase2Approved;
    prevPhase3Ref.current = phase3Approved;
  }, [phase1Approved, phase2Approved, phase3Approved, loading, submissions.length]);

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
          <div style={{ marginBottom: '4rem', maxWidth: '800px' }}>
            <div className="lux-line" style={{ marginBottom: '1.25rem', borderColor: ACCENT }} />
            <Skeleton width="280px" height="0.6rem" style={{ marginBottom: '1rem' }} />
            <Skeleton width="70%" height="2.8rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="45%" height="2.8rem" style={{ marginBottom: '1.25rem' }} />
            <div style={{ marginBottom: '2rem' }}><SkeletonBlock lines={2} width="500px" /></div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} width="90px" height="24px" />
              ))}
            </div>
          </div>
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
          <section>
            <Skeleton width="250px" height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="350px" height="0.8rem" style={{ marginBottom: '2rem' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <SkeletonCard count={3} />
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
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => loadSubmissions()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      {/* Celebration overlay on phase completion */}
      {celebrationPhase && (
        <CelebrationOverlay
          phaseNum={celebrationPhase}
          onDismiss={() => setCelebrationPhase(null)}
          progressPath={`/phase-${celebrationPhase}`}
          storageKey={`phase_${celebrationPhase}_${user?.id || ''}`}
        />
      )}
      <div className="lux-container">
        {/* Hero — progression-style cleaner design */}
        <div style={{ marginBottom: '3.5rem', maxWidth: '800px' }}>
          <div className="lux-line" style={{ marginBottom: '1.25rem', borderColor: ACCENT }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '1rem',
          }}>
            NST BLR · AARAMBH
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
            {profile?.full_name ? (
              <>Welcome back, <em style={{ fontStyle: 'italic', color: ACCENT }}>{profile.full_name.split(' ')[0]}</em></>
            ) : (
              <>Welcome to Your{' '}
              <em style={{ fontStyle: 'italic', color: ACCENT }}>Onboarding</em>
              <br />
              Journey</>
            )}
          </h1>
          <p style={{
            fontFamily: t.body, fontSize: '0.9rem', lineHeight: 1.7,
            color: t.wg, maxWidth: '500px', marginBottom: '2rem',
          }}>
            This 30–60–90 day program helps you integrate into our faculty community.
            Complete worksheets and get them reviewed to advance through each phase.
          </p>
          {/* Motivation + Today's progress */}
          {submissions.length > 0 && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 1rem',
              borderLeft: '2px solid ' + ACCENT,
              fontFamily: t.heading,
              fontSize: '0.9rem',
              fontStyle: 'italic',
              color: t.ch,
              lineHeight: 1.5,
              maxWidth: '400px',
              animation: 'luxFadeIn 0.6s var(--ease-lux) forwards',
            }}>
              &ldquo;{motivation}&rdquo;
            </div>
          )}
          {/* Status Legend */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {([
              { label: 'Not Started', color: t.wg },
              { label: 'In Progress', color: t.ch },
              { label: 'Buddy Approved', color: t.purple },
              { label: 'Under Review', color: t.pending },
              { label: 'Reviewed', color: t.success },
              { label: 'Needs Revision', color: t.warning },
            ] as { label: string; color: string }[]).map(b => (
              <span key={b.label} className="lux-badge lux-badge-light" style={{
                borderColor: b.color, color: b.color, fontSize: '0.55rem',
              }}>{b.label}</span>
            ))}
          </div>
        </div>

        {/* Achievement unlock celebration */}
        <AchievementUnlockBanner newlyUnlocked={newlyUnlocked} />

        {/* Gamification strip — level, XP, streak, achievements */}
        {(gamProfile || submissions.length > 0) && (
          <GamificationStrip
            profile={gamProfile}
            achievementsUnlocked={unlockedAchievements.length}
            achievementsTotal={achievements.length}
            showStreak={dbAvailable}
          />
        )}

        {/* Next Up — the single most important cue for a joinee */}
        {!onboardingComplete && (
          <NextUpCard next={nextUp} submissions={submissions} template={template} />
        )}

        {/* Continue Last Worksheet */}
        {submissions.length > 0 && (
          (() => {
            const recentSub = submissions
              .filter(s => s.review_status !== REVIEW_STATUS.APPROVED && s.review_status !== REVIEW_STATUS.BUDDY_APPROVED)
              .sort((a, b) => new Date(b.updated_at as string).getTime() - new Date(a.updated_at as string).getTime())[0];
            if (recentSub) {
              // Build the correct route from the worksheet ID (handles FTP week
              // sheets like w1_o1 → /week-1/worksheet/w1_o1 and legacy phase
              // sheets like p2_w3 → /phase-2/worksheet-3).
              const wsId = recentSub.worksheet_id as string;
              const recentPath = getWorksheetPath(wsId);
              // No joinee-facing page (e.g. gate checks) — skip the banner.
              if (!recentPath) return null;
              return (
                <div style={{
                  marginBottom: '2rem',
                  padding: '1rem 1.25rem',
                  border: '1px solid ' + ACCENT,
                  background: 'rgba(212, 175, 55, 0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
                  animation: 'luxFadeIn 0.5s forwards',
                }}>
                  <div>
                    <span style={{
                      fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: ACCENT, display: 'block', marginBottom: '2px',
                    }}>
                      Continue Where You Left Off
                    </span>
                    <span style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.ch, fontWeight: 500 }}>
                      {getWorksheetName(recentSub.worksheet_id as string, template)}
                    </span>
                  </div>
                  <Link
                    to={recentPath}
                    className="lux-btn lux-btn-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="gold-overlay" /><span className="btn-content">
                      Continue <ArrowRight size={14} strokeWidth={1.5} />
                    </span>
                  </Link>
                </div>
              );
            }
            return null;
          })()
        )}

        {/* Completion Certificate card */}
        {onboardingComplete && certificate && (
          <div
            role="region"
            aria-label="Onboarding complete — view your certificate"
            style={{
              marginBottom: '2.5rem',
              padding: '1.5rem 1.75rem',
              border: '1px solid var(--color-gold)',
              background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.1), rgba(212, 175, 55, 0.03))',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '1rem',
              animation: 'luxFadeIn 0.6s forwards',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '240px' }}>
              <div style={{
                width: '52px', height: '52px', flexShrink: 0,
                border: '1px solid var(--color-gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(212, 175, 55, 0.1)',
                fontSize: '1.5rem',
              }} aria-hidden="true">🎓</div>
              <div>
                <span style={{
                  fontFamily: t.body, fontSize: '0.55rem', fontWeight: 600,
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'var(--color-gold)', display: 'block', marginBottom: '2px',
                }}>
                  Onboarding Complete
                </span>
                <span style={{ fontFamily: t.heading, fontSize: '1.05rem', color: t.ch, display: 'block' }}>
                  Welcome to the faculty!
                </span>
                <span style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, display: 'block', marginTop: '2px' }}>
                  Certificate № {certificate.certificate_number}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowCertificate(true)}
              className="lux-btn lux-btn-primary"
              style={{ flexShrink: 0 }}
            >
              <span className="gold-overlay" /><span className="btn-content">
                View Certificate
              </span>
            </button>
          </div>
        )}

        {showCertificate && certificate && (
          <CertificateModal
            certificate={certificate}
            fullName={profile?.full_name || 'Faculty Member'}
            campusName={null}
            onClose={() => setShowCertificate(false)}
          />
        )}

        {/* Your Support Team */}
        {(buddyProfile || managerProfile) && !supportLoading && (
          <div style={{
            marginBottom: '2.5rem',
            padding: '1.5rem 0',
            borderTop: '1px solid rgba(26, 26, 26, 0.12)',
            borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
          }}>
            <span style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
              letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
              display: 'block', marginBottom: '1rem',
            }}>
              Your Support Team
            </span>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {buddyProfile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '1rem 1.25rem',
                  border: '1px solid rgba(26, 26, 26, 0.12)',
                  flex: '1 1 200px',
                  animation: 'luxFadeIn 0.5s forwards',
                }}>
                  <div style={{
                    width: '40px', height: '40px',
                    border: '1px solid var(--color-charcoal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <UserCheck size={18} strokeWidth={1.5} style={{ color: t.info }} />
                  </div>
                  <div>
                    <span style={{
                      fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: t.info, display: 'block', marginBottom: '2px',
                    }}>
                      Buddy / Mentor
                    </span>
                    <span style={{ fontFamily: t.heading, fontSize: '0.95rem', fontWeight: 400, color: t.ch, display: 'block' }}>
                      {buddyProfile.full_name || 'Buddy'}
                    </span>
                    <span style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, display: 'block', marginTop: '2px' }}>
                      {buddyProfile.email || ''}
                    </span>
                  </div>
                </div>
              )}
              {managerProfile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '1rem 1.25rem',
                  border: '1px solid rgba(26, 26, 26, 0.12)',
                  flex: '1 1 200px',
                  animation: 'luxFadeIn 0.5s 0.15s forwards', opacity: 0,
                }}>
                  <div style={{
                    width: '40px', height: '40px',
                    border: '1px solid var(--color-charcoal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Shield size={18} strokeWidth={1.5} style={{ color: t.purple }} />
                  </div>
                  <div>
                    <span style={{
                      fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500,
                      letterSpacing: '0.15em', textTransform: 'uppercase',
                      color: t.purple, display: 'block', marginBottom: '2px',
                    }}>
                      Manager
                    </span>
                    <span style={{ fontFamily: t.heading, fontSize: '0.95rem', fontWeight: 400, color: t.ch, display: 'block' }}>
                      {managerProfile.full_name || 'Manager'}
                    </span>
                    <span style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, display: 'block', marginTop: '2px' }}>
                      {managerProfile.email || ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dashboard Widgets — Progress Ring + Due Soon + Recent Activity */}
        {(submissions.length > 0 || phase1Approved || phase2Approved || phase3Approved) && (
          <div style={{
            marginBottom: '3rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1px',
            background: 'rgba(26, 26, 26, 0.1)',
          }}>
            {/* Progress Ring */}
            <div style={{
              background: 'var(--color-alabaster)',
              padding: '2rem 1.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: '180px',
              animation: 'luxFadeIn 0.5s forwards',
            }}>
              <ProgressRing
                percentage={Math.round(totalWorksheets > 0 ? (totalApproved / totalWorksheets) * 100 : 0)}
                size={130}
                color={ACCENT}
                label="Approved"
              />
            </div>

            {/* Overall Progress bar */}
            {submissions.length > 0 && (
              <div style={{
                background: 'var(--color-alabaster)',
                padding: '2rem 1.5rem',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                animation: 'luxFadeIn 0.5s 0.1s forwards', opacity: 0,
              }}>
                <span style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                  letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
                  display: 'block', marginBottom: '1rem',
                }}>
                  Overall Progress
                </span>
                <div className="lux-progress" style={{ flex: 'none', width: '100%', height: '3px', marginBottom: '0.75rem' }}>
                  <div
                    className={`lux-progress-fill ${totalApproved === totalWorksheets && totalWorksheets > 0 ? 'lux-progress-shimmer' : ''}`}
                    style={{
                      width: `${Math.round(totalWorksheets > 0 ? (totalApproved / totalWorksheets) * 100 : 0)}%`,
                      background: ACCENT,
                      height: '3px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
                    {totalApproved}<span style={{ color: t.wg, fontWeight: 400 }}> / {totalWorksheets}</span>
                  </span>
                  {totalApproved === totalWorksheets && totalWorksheets > 0 && (
                    <Trophy size={16} strokeWidth={1.5} style={{ color: ACCENT }} />
                  )}
                </div>
              </div>
            )}

            {/* Due Soon widget */}
            {submissions.length > 0 && (
              <div style={{
                background: 'var(--color-alabaster)',
                padding: '2rem 1.5rem',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                animation: 'luxFadeIn 0.5s 0.2s forwards', opacity: 0,
              }}>
                <span style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                  letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
                  display: 'block', marginBottom: '0.75rem',
                }}>
                  Due Soon
                </span>
                {(() => {
                  const dueSoon = phases.flatMap(p => p.worksheets).filter(wsId => {
                    const due = getDueDateInfo(wsId);
                    return due.isDueSoon || due.isOverdue;
                  }).slice(0, 3);
                  if (dueSoon.length === 0) {
                    return (
                      <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                        No worksheets due in the next 48 hours.
                      </p>
                    );
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {dueSoon.map(wsId => {
                        const due = getDueDateInfo(wsId);
                        return (
                          <div key={wsId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                            <Zap size={12} strokeWidth={1.5} style={{ color: due.isOverdue ? t.error : t.warning, flexShrink: 0 }} />
                            <span style={{ color: t.ch, flex: 1 }}>{getWorksheetName(wsId, template)}</span>
                            <span style={{ color: due.statusColor, whiteSpace: 'nowrap', fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500 }}>
                              {due.statusLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Journey Timeline */}
        <div style={{
          marginBottom: '3rem',
          padding: '1.5rem 0',
          borderTop: '1px solid rgba(26, 26, 26, 0.12)',
          borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
        }}>
          <span style={{
            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
            display: 'block', marginBottom: '1.25rem',
          }}>
            Your Journey
          </span>
          <JourneyTimeline
            phases={[
              {
                num: 1, title: 'Orientation & Understanding', days: 'Days 1–30',
                description: 'People, culture, systems, and processes.',
                status: phase1Approved ? 'completed' : submissions.length > 0 ? 'current' : 'locked',
              },
              {
                num: 2, title: 'Contribution & Guided Teaching', days: 'Days 31–60',
                description: 'Teach, create content, and develop your craft.',
                status: phase2Approved ? 'completed' : phase1Approved ? 'current' : 'locked',
              },
              {
                num: 3, title: 'Independent Teaching & Ownership', days: 'Days 61–90',
                description: 'Teach independently and propose improvements.',
                status: phase3Approved ? 'completed' : phase2Approved ? 'current' : 'locked',
              },
            ]}
            accentColor={ACCENT}
          />
        </div>

        {/* Phase Roadmap — progression-style inline worksheets for ALL phases */}
        <section>
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '0.5rem' }}>
              Onboarding <em style={{ fontStyle: 'italic', color: ACCENT }}>Roadmap</em>
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
                  {/* Phase Header — clickable card */}
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
                      borderLeft: progress.pct === 100 ? '2px solid ' + ACCENT : 'none',
                      paddingLeft: progress.pct === 100 ? '1rem' : 0,
                    }}
                  >
                    <div style={{
                      width: '52px', height: '52px',
                      border: '1px solid ' + (progress.pct === 100 ? ACCENT : 'var(--color-charcoal)'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: progress.pct === 100 ? 'rgba(212, 175, 55, 0.06)' : 'transparent',
                      transition: 'border-color 200ms var(--ease-lux)',
                    }}>
                      {isLocked ? <Lock size={22} strokeWidth={1.5} style={{ color: t.wg }} /> :
                       progress.pct === 100 ? <Trophy size={22} strokeWidth={1.5} style={{ color: ACCENT }} /> :
                       <Icon size={24} strokeWidth={1.5} style={{ color: t.ch }} />}
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
                        {progress.pct === 100 && !isLocked && (
                          <span style={{
                            fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500,
                            letterSpacing: '0.15em', textTransform: 'uppercase',
                            color: t.success, padding: '1px 8px',
                            border: '1px solid ' + t.success,
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}>
                            <CheckCircle2 size={10} strokeWidth={2} /> Complete
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
                            <div
                              className={`lux-progress-fill ${progress.pct === 100 ? 'lux-progress-shimmer' : ''}
                                ${progress.pct > 0 && progress.pct < 100 ? 'lux-progress-pulse' : ''}`}
                              style={{ width: `${progress.pct}%`, background: progress.pct === 100 ? ACCENT : undefined }}
                            />
                          </div>
                          <span style={{ fontFamily: t.body, fontSize: '0.75rem', fontWeight: 500, color: t.ch }}>
                            {progress.done}/{progress.total}
                          </span>
                          <ArrowRight size={13} strokeWidth={1.5} style={{ color: t.wg }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline worksheet list for ALL unlocked phases — matches progression design */}
                  {!loading && !isLocked && (
                    <div style={{ marginTop: '1rem', paddingLeft: 'calc(52px + 1.25rem)' }}>
                      {phase.worksheets.map((wsId, i) => {
                        const ws = getWorksheetStatus(wsId);
                        const StatusIcon = ws.icon;
                        const reviewerType = getReviewerType(wsId, template);
                        const reviewerStyle = REVIEWER_STYLES[reviewerType as keyof typeof REVIEWER_STYLES];
                        // Build the correct route from the worksheet ID. Gate
                        // checks (gc1/gc2/gc3) have no joinee-facing page, so
                        // they render as non-clickable rows (fixes the 404 on
                        // /phase-1/worksheet- for FTP week sheets + gates).
                        const wsPath = getWorksheetPath(wsId);
                        const rowStyle = {
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 0 10px 12px',
                          borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                          textDecoration: 'none',
                          fontFamily: t.body, fontSize: '0.8rem', color: t.ch,
                          transition: 'color 200ms var(--ease-lux), opacity 200ms',
                          opacity: 0,
                          animation: `luxFadeIn 0.5s ${(idx * phase.worksheets.length + i) * 0.04 + 0.3}s forwards`,
                        } as const;
                        const rowChildren = (
                          <>
                            {StatusIcon ? (
                              <StatusIcon size={12} strokeWidth={2} style={{ color: ws.color, flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '10px', height: '10px', border: '1px solid ' + ws.color, flexShrink: 0 }} />
                            )}
                            <span style={{ flex: 1 }}>{getWorksheetName(wsId, template)}</span>
                            {getEstimatedTime(wsId) && (
                              <span style={{ fontSize: '0.5rem', color: t.wg, whiteSpace: 'nowrap' }}>
                                {getEstimatedTime(wsId)}
                              </span>
                            )}
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
                          </>
                        );
                        if (!wsPath) {
                          return (
                            <div key={wsId} role="listitem" aria-label={`${getWorksheetName(wsId, template)} — no page`}
                              style={{ ...rowStyle, opacity: 0.55, cursor: 'default' }}>
                              {rowChildren}
                            </div>
                          );
                        }
                        return (
                          <Link
                            key={wsId}
                            to={wsPath}
                            style={rowStyle}
                            onMouseOver={e => { e.currentTarget.style.color = ACCENT; }}
                            onMouseOut={e => { e.currentTarget.style.color = t.ch; }}
                          >
                            {rowChildren}
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

        {/* Milestones Feed */}
        {milestones.length > 0 && (
          <section style={{ marginTop: '3rem' }}>
            <div style={{
              marginBottom: '1.5rem',
              padding: '1.5rem 0',
              borderTop: '1px solid rgba(26, 26, 26, 0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Sparkles size={22} strokeWidth={1.5} style={{ color: '#E91E63' }} />
                    Activity Feed
                  </h2>
                  <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                    Your recognitions, achievements, and recent milestones
                  </p>
                </div>
              </div>
            </div>
            <KudosFeed milestones={milestones} compact />
          </section>
        )}

        {/* Achievements Section */}
        {achievements.length > 0 && (
          <section style={{ marginTop: '3rem' }}>
            <div style={{
              marginBottom: '1.5rem',
              padding: '1.5rem 0',
              borderTop: '1px solid rgba(26, 26, 26, 0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Award size={22} strokeWidth={1.5} style={{ color: ACCENT }} />
                    Achievements
                  </h2>
                  <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                    {unlockedAchievements.length} of {achievements.length} unlocked
                  </p>
                </div>
                {unlockedAchievements.length > 0 && (
                  <span style={{
                    fontFamily: t.heading,
                    fontSize: '0.85rem',
                    color: ACCENT,
                  }}>
                    {Math.round((unlockedAchievements.length / achievements.length) * 100)}% complete
                  </span>
                )}
              </div>
            </div>

            {/* Unlocked achievements */}
            {unlockedAchievements.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{
                  fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
                  letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
                  display: 'block', marginBottom: '0.75rem',
                }}>
                  Unlocked
                </span>
                <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                  {unlockedAchievements.map(a => (
                    <AchievementCard key={a.id} achievement={a} />
                  ))}
                </div>
              </div>
            )}

            {/* Locked achievements (collapsible) */}
            {lockedAchievements.length > 0 && (
              <details style={{ borderTop: '1px solid rgba(26, 26, 26, 0.06)', paddingTop: '1rem' }}>
                <summary style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: t.wg, cursor: 'pointer',
                  padding: '0.5rem 0',
                  userSelect: 'none',
                }}>
                  Locked ({lockedAchievements.length}) — click to reveal hints
                </summary>
                <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px', marginTop: '0.75rem' }}>
                  {lockedAchievements.map(a => (
                    <AchievementCard key={a.id} achievement={a} />
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
