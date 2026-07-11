import { BookOpen, Users, MessageSquare, MessageCircle, Shield, CheckCircle2, AlertCircle, RefreshCw, Anchor, Layers, Flag, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import { t } from '../config/theme';
import { REVIEWER_LABELS, REVIEWER_STYLES } from '../config/worksheetConfig';
import PhaseWorksheetList from '../components/PhaseWorksheetList';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';
import { countCompleted, buildStatusMap, type StatusInfo } from '../utils/worksheetHelpers';
import { week1Worksheets, week2Worksheets, week3Worksheets, week4Worksheets, type WorksheetMeta } from '../config/weeklyWorksheets';

// ─── Types ──────────────────────────────────────────────

interface WeekSection {
  num: number;
  title: string;
  subtitle: string;
  theme: string;
  icon: LucideIcon;
  worksheets: WorksheetMeta[];
}

// Week 1-4 worksheet data imported from src/config/weeklyWorksheets.ts

// ─── Additional Phase 1 Worksheets ──────────────────────

const additionalWorksheets: WorksheetMeta[] = [
  { id: 'p1_w1', num: 1, path: '/phase-1/worksheet-1', title: 'Team Introduction & Stakeholder Mapping Log', icon: Users, desc: 'Meet key people across teams and understand how they collaborate.' },
  { id: 'p1_w2', num: 2, path: '/phase-1/worksheet-2', title: 'Faculty Mentor Alignment & Weekly Sync Tracker', icon: MessageSquare, desc: 'Align with your mentor, document weekly syncs, and track feedback patterns.' },
  { id: 'p1_w4', num: 3, path: '/phase-1/worksheet-4', title: 'Partner University Governance & Semester Architecture Map', icon: Shield, desc: 'Understand university policies, semester flow, and escalation paths.' },
  { id: 'p1_w8', num: 4, path: '/phase-1/worksheet-8', title: 'Slack Historical Context & Student Bottleneck Audit', icon: MessageCircle, desc: 'Audit Slack history to identify recurring student pain points.' },
];

// ─── Week data ──────────────────────────────────────────

const weekSections: WeekSection[] = [
  { num: 1, title: 'Anchor', subtitle: 'Observe begins', theme: 'Context before content — functional means operational', icon: Anchor, worksheets: week1Worksheets },
  { num: 2, title: 'Co-create', subtitle: 'Observe deepens', theme: 'Content creation to the zero-error standard', icon: Layers, worksheets: week2Worksheets },
  { num: 3, title: 'Co-deliver', subtitle: 'Deliver under observation', theme: 'The rubric enters the room', icon: BookOpen, worksheets: week3Worksheets },
  { num: 4, title: 'Independence Review', subtitle: 'Co-deliver closes', theme: 'Feedback incorporated, real conditions rehearsed, release decided', icon: Flag, worksheets: week4Worksheets },
];

// ─── Get all week worksheet IDs for overall progress ───

function getAllWeekWorksheetIds(): string[] {
  const ids: string[] = [];
  weekSections.forEach(w => w.worksheets.forEach(ws => ids.push(ws.id)));
  additionalWorksheets.forEach(ws => ids.push(ws.id));
  return ids;
}

// ─── Phase 1 Component ─────────────────────────────────

export default function Phase1() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, StatusInfo>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, status, review_status')
        .eq('user_id', user.id)
        .then(unwrap);
      setStatuses(buildStatusMap(data as unknown as Array<{ worksheet_id: string; status: string | null; review_status: string | null }>));
    } catch (err) {
      console.error('Failed to load Phase 1 statuses:', err);
      setLoadError('We could not load your Phase 1 progress. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadStatuses();
    else setLoading(false);
  }, [user, loadStatuses]);

  const allIds = getAllWeekWorksheetIds();
  const totalAll = allIds.length;
  const completedAll = countCompleted(allIds, statuses);

  // ─── Loading Skeleton ─────────────────────────────────

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '960px', margin: '0 auto' }} aria-label="Loading Phase 1">
          {/* Header skeleton */}
          <div style={{ marginBottom: '3rem' }}>
            <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <Skeleton width="48px" height="48px" />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height="1.8rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton width="35%" height="0.75rem" />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }}><SkeletonBlock lines={2} width="500px" /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.25rem' }}>
              <Skeleton width="300px" height="2px" />
              <Skeleton width="60px" height="0.8rem" />
            </div>
          </div>
          {/* Reviewer legend skeleton */}
          <div style={{ marginBottom: '2.5rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
            <Skeleton width="100px" height="0.6rem" style={{ marginBottom: '0.75rem' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <Skeleton width="80px" height="24px" />
              <Skeleton width="100px" height="24px" />
              <Skeleton width="90px" height="24px" />
            </div>
          </div>
          {/* Week skeletons */}
          {[1, 2, 3, 4].map(week => (
            <div key={week} style={{ marginBottom: '3rem' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '1rem',
                padding: '1.25rem 0',
                borderTop: week === 1 ? 'none' : '1px solid rgba(26, 26, 26, 0.1)',
              }}>
                <Skeleton width="40px" height="40px" />
                <div style={{ flex: 1 }}>
                  <Skeleton width="50%" height="1.2rem" style={{ marginBottom: '0.4rem' }} />
                  <Skeleton width="70%" height="0.75rem" style={{ marginBottom: '0.75rem' }} />
                  <Skeleton width="200px" height="2px" />
                </div>
              </div>
              {/* Worksheet row skeletons */}
              {[1, 2, 3, 4].map(row => (
                <div key={row} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '1.25rem 0',
                  borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                }}>
                  <Skeleton width="40px" height="40px" />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="55%" height="0.85rem" style={{ marginBottom: '0.35rem' }} />
                    <Skeleton width="35%" height="0.7rem" />
                  </div>
                  <Skeleton width="70px" height="0.6rem" />
                  <Skeleton width="16px" height="14px" />
                </div>
              ))}
            </div>
          ))}
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
            Couldn&apos;t Load Phase 1
          </h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => loadStatuses()} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
        {/* Phase Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={22} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Phase 1: <em style={{ fontStyle: 'italic', color: t.gd }}>Orientation</em>
              </h1>
              <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, letterSpacing: '0.05em' }}>Days 1–30 — {totalAll} worksheets</span>
            </div>
          </div>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginTop: '1rem', maxWidth: '600px' }}>
            Build foundational knowledge of people, culture, systems, and processes. Complete worksheets across four weekly focus areas.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '1.25rem' }}>
            <div className="lux-progress" style={{ flex: 1, maxWidth: '300px' }}>
              <div className="lux-progress-fill lux-progress-fill-gold" style={{ width: `${totalAll > 0 ? (completedAll / totalAll) * 100 : 0}%` }} />
            </div>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>
              <CheckCircle2 size={14} strokeWidth={1.5} style={{ marginRight: '6px', color: t.gd, verticalAlign: 'middle' }} />
              {completedAll} / {totalAll}
            </span>
          </div>
        </div>

        {/* Reviewer Legend */}
        <div style={{ marginBottom: '2.5rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
          <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '0.75rem' }}>
            Reviewed by
          </span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(REVIEWER_LABELS).map(([key, label]) => {
              const style = REVIEWER_STYLES[key as keyof typeof REVIEWER_STYLES];
              if (!style) return null;
              return (
                <span key={key} style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                  letterSpacing: '0.1em',
                  padding: '4px 12px',
                  border: '1px solid ' + style.color,
                  color: style.color,
                }}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Week Sections */}          {weekSections.map((week, weekIdx) => {
          const weekCompleted = countCompleted(week.worksheets.map(w => w.id), statuses);
          const WeekIcon = week.icon;
          return (
            <div key={week.num} style={{ marginBottom: '3rem' }}>
              {/* Week Header */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '1rem',
                padding: '1.25rem 0',
                borderTop: weekIdx === 0 ? 'none' : '1px solid rgba(26, 26, 26, 0.1)',
              }}>
                <div style={{
                  width: '40px', height: '40px',
                  border: '1px solid var(--color-charcoal)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <WeekIcon size={18} strokeWidth={1.5} style={{ color: t.ch }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <h2 style={{
                      fontFamily: t.heading, fontSize: '1.35rem', fontWeight: 400,
                      letterSpacing: '-0.02em', color: t.ch, margin: 0,
                    }}>
                      Week {week.num}: <em style={{ fontStyle: 'italic', color: t.gd }}>{week.title}</em>
                    </h2>
                    <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg, letterSpacing: '0.15em' }}>
                      {week.subtitle}
                    </span>
                    <span className="lux-badge lux-badge-light" style={{ fontSize: '0.5rem' }}>
                      {week.worksheets.length} worksheets
                    </span>
                  </div>
                  <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, lineHeight: 1.5, marginBottom: '0.75rem' }}>
                    {week.theme}
                  </p>
                  {week.worksheets.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="lux-progress" style={{ flex: 1, maxWidth: '200px' }}>
                        <div className="lux-progress-fill" style={{ width: `${(weekCompleted / week.worksheets.length) * 100}%` }} />
                      </div>
                      <span style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, color: t.ch }}>
                        {weekCompleted}/{week.worksheets.length}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Week Worksheets */}
              <PhaseWorksheetList worksheets={week.worksheets} statuses={statuses} />
            </div>
          );
        })}

        {/* Additional Phase 1 Worksheets */}
        {additionalWorksheets.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '1.25rem 0 0.75rem',
              borderTop: '1px solid rgba(26, 26, 26, 0.08)',
            }}>
              <div style={{
                width: '32px', height: '32px',
                border: '1px solid var(--color-warm-grey)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                opacity: 0.5,
              }}>
                <BookOpen size={14} strokeWidth={1.5} style={{ color: t.wg }} />
              </div>
              <div>
                <h3 style={{
                  fontFamily: t.heading, fontSize: '0.95rem', fontWeight: 400,
                  color: t.wg, margin: 0,
                }}>
                  Additional Worksheets
                </h3>
                <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, marginTop: '2px' }}>
                  Core orientation worksheets that complete the Phase 1 curriculum
                </p>
              </div>
            </div>
            <PhaseWorksheetList worksheets={additionalWorksheets} statuses={statuses} />
          </div>
        )}
      </div>
    </div>
  );
}
