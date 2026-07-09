import { BookOpen, Users, MessageSquare, BookText, Eye, Monitor, MessageCircle, Shield, CheckCircle2, Anchor, Layers, Flag, ClipboardList, Search, FileEdit, ClipboardCheck, Mic, Clock, Sword, Heart, BarChart, type LucideIcon } from 'lucide-react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { t } from '../config/theme';
import { REVIEWER_LABELS, REVIEWER_STYLES } from '../config/worksheetConfig';
import PhaseWorksheetList from '../components/PhaseWorksheetList';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';

// ─── Types ──────────────────────────────────────────────

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

interface WeekSection {
  num: number;
  title: string;
  subtitle: string;
  theme: string;
  icon: LucideIcon;
  worksheets: WorksheetMeta[];
}

// ─── Week 1 — Anchor ────────────────────────────────────

const week1Worksheets: WorksheetMeta[] = [
  { id: 'p1_w5', num: 1, path: '/week-1/worksheet/p1_w5', title: 'Systems & Platform Walkthrough', icon: Monitor, desc: 'Product orientation — how the platform works end-to-end.' },
  { id: 'p1_w6', num: 2, path: '/week-1/worksheet/p1_w6', title: 'Structured Observation — Recorded Lectures', icon: Eye, desc: '3 recorded lectures with TLAC-lens observation sheet.' },
  { id: 'p1_w3', num: 3, path: '/week-1/worksheet/p1_w3', title: 'Culture-in-Delivery Opening', icon: BookText, desc: 'What NST believes about teaching — no student left behind.' },
  { id: 'w1_o1', num: 4, path: '/week-1/worksheet/w1_o1', title: 'Day 1 Logistics & Access', icon: ClipboardList, desc: 'Access verification, buddy contact, comms channels.' },
  { id: 'w1_e1', num: 5, path: '/week-1/worksheet/w1_e1', title: 'Contest Guidelines V3 Pre-read', icon: BookText, desc: 'Read Contest Guidelines V3 for W2-E1 receptivity build.' },
  { id: 'w1_o2', num: 6, path: '/week-1/worksheet/w1_o2', title: 'Playbook Scavenger Exercise', icon: Search, desc: 'Find-the-answer sheet across Playbook §1 to §5.' },
  { id: 'w1_g1', num: 7, path: '/week-1/worksheet/w1_g1', title: 'Gate 1 — Anchor Artifacts', icon: Shield, desc: 'Operational check, observation logs, scavenger sheet, reflection #0.' },
];

// ─── Week 2 — Co-create ─────────────────────────────────

const week2Worksheets: WorksheetMeta[] = [
  { id: 'p2_w3', num: 1, path: '/week-2/worksheet/p2_w3', title: 'Question Creation Mechanics', icon: FileEdit, desc: 'MCQ, coding, components, playgrounds — how to build them.' },
  { id: 'p1_w7', num: 2, path: '/week-2/worksheet/p1_w7', title: 'The Quality Standard', icon: ClipboardCheck, desc: 'Solved-by-creator, peer review, silent vs loud errors.' },

  { id: 'w2_e1', num: 3, path: '/week-2/worksheet/w2_e1', title: "Bloom's Two-Pens Session", icon: Layers, desc: 'Tag real past questions using Bloom\'s Taxonomy v4.' },
  { id: 'w2_c3', num: 5, path: '/week-2/worksheet/w2_c3', title: 'Create & Peer Review', icon: FileEdit, desc: '3 MCQs + 2 coding questions; review a peer\'s set.' },
  { id: 'w2_d2', num: 6, path: '/week-2/worksheet/w2_d2', title: 'Micro-Teach #1', icon: Mic, desc: '10-minute segment to 3 peers — rubric-lite feedback.' },
  { id: 'w2_b1', num: 7, path: '/week-2/worksheet/w2_b1', title: 'Discipline Consistency', icon: Shield, desc: 'Customise your classroom discipline approach.' },
  { id: 'w2_o1', num: 8, path: '/week-2/worksheet/w2_o1', title: 'Invigilation & Exam Formalities', icon: ClipboardCheck, desc: 'Policy walkthrough plus scenario sheet.' },
  { id: 'w2_g1', num: 9, path: '/week-2/worksheet/w2_g1', title: 'Gate 2 — Co-create Artifacts', icon: Shield, desc: 'Q set, peer reviews, Bloom\'s tagging, discipline sheet.' },
];

// ─── Week 3 — Co-deliver ────────────────────────────────

const week3Worksheets: WorksheetMeta[] = [
  { id: 'p2_w1', num: 1, path: '/week-3/worksheet/p2_w1', title: 'Engagement & Active Learning', icon: MessageSquare, desc: 'The "did you understand" anti-pattern — mirror moments inside K sessions.' },
  { id: 'p2_w2', num: 2, path: '/week-3/worksheet/p2_w2', title: 'Demo Dry-Run', icon: ClipboardCheck, desc: '30–40 min to peer classroom, observed on TLAC-based rubric.' },
  { id: 'p2_w4', num: 3, path: '/week-3/worksheet/p2_w4', title: 'Slot Creation & Attendance Flow', icon: FileEdit, desc: 'Hands-on with scheduling and attendance systems.' },
  { id: 'p3_w5', num: 4, path: '/week-3/worksheet/p3_w5', title: 'Build Full Lecture Package', icon: FileEdit, desc: 'Slides, quiz, assignment, notes for first real week.' },
  { id: 'w3_d1', num: 5, path: '/week-3/worksheet/w3_d1', title: 'Classroom Tech Hands-on', icon: Monitor, desc: 'Projectors, pentabs, portal joining, recording.' },
  { id: 'w3_d2', num: 6, path: '/week-3/worksheet/w3_d2', title: 'Planning & Time Management', icon: Clock, desc: '10-minute window planning, pacing, transitions.' },
  { id: 'w3_e1', num: 7, path: '/week-3/worksheet/w3_e1', title: 'Design Mini-Contest', icon: Sword, desc: '12-question contest against V3 + Bloom distribution.' },
  { id: 'w3_b1', num: 8, path: '/week-3/worksheet/w3_b1', title: 'Student Dialoguing Rehearsal', icon: MessageCircle, desc: 'At-risk 1:1s, rule challenges, "this is basic" moments.' },
  { id: 'w3_g1', num: 9, path: '/week-3/worksheet/w3_g1', title: 'Gate 3 — Co-deliver Artifacts', icon: Shield, desc: 'Demo rubric, lecture package v1, mini-contest L1 pass.' },
];

// ─── Week 4 — Independence Review ───────────────────────

const week4Worksheets: WorksheetMeta[] = [
  { id: 'p3_w1', num: 1, path: '/week-4/worksheet/p3_w1', title: 'Demo Final', icon: Users, desc: 'Feedback incorporated, Course Lead sign-off per A.7.' },
  { id: 'w4_d2', num: 2, path: '/week-4/worksheet/w4_d2', title: 'Co-Teach / Mock Classroom', icon: Users, desc: 'Live co-teach or mock classroom with edge-case scenarios.' },

  { id: 'w4_e1', num: 3, path: '/week-4/worksheet/w4_e1', title: 'Post-Contest Analysis & Calibration', icon: BarChart, desc: 'Predict solve rates, compare to actuals, write calibration note.' },
  { id: 'w4_o1', num: 5, path: '/week-4/worksheet/w4_o1', title: 'Pre-Semester Checklist', icon: ClipboardCheck, desc: 'Complete T-2-week checklist for your first teaching week.' },
  { id: 'w4_b1', num: 6, path: '/week-4/worksheet/w4_b1', title: 'Why We Reflect', icon: Heart, desc: 'Reflection cycle #1 — ownership & commitment ceremony.' },
  { id: 'w4_g1', num: 7, path: '/week-4/worksheet/w4_g1', title: 'Gate 4 — Independence Readiness', icon: Shield, desc: 'Final artifact review and independence sign-off.' },
];

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

  useEffect(() => {
    if (user) loadStatuses();
    else setLoading(false);
  }, [user]);

  async function loadStatuses() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('worksheet_submissions')
        .select('worksheet_id, status, review_status')
        .eq('user_id', user?.id);
      if (data) {
        const map: Record<string, StatusInfo> = {};
        data.forEach(s => { map[s.worksheet_id] = { status: s.status, review_status: s.review_status }; });
        setStatuses(map);
      }
    } catch (err) {
      console.error('Failed to load Phase 1 statuses:', err);
    } finally {
      setLoading(false);
    }
  }

  function getCompleted(worksheets: WorksheetMeta[]): number {
    return worksheets.filter(w => {
      const s = statuses[w.id];
      return s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved';
    }).length;
  }

  const allIds = getAllWeekWorksheetIds();
  const totalAll = allIds.length;
  const completedAll = allIds.filter(id => {
    const s = statuses[id];
    return s?.status === 'submitted' || s?.review_status === 'approved' || s?.review_status === 'buddy_approved';
  }).length;

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

        {/* Week Sections */}
        {weekSections.map((week, weekIdx) => {
          const weekCompleted = getCompleted(week.worksheets);
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
