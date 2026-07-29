import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { unwrap } from '../api/db';
import {
  BookOpen, Target, Sparkles, Users, ArrowRight, Shield, CheckCircle2,
  Clock, AlertCircle, RefreshCw, BarChart3,
} from 'lucide-react';
import { t } from '../config/theme';
import { REVIEW_STATUS } from '../constants/status';
import Skeleton from '../components/Skeleton';

// ─── Types ──────────────────────────────────────────────

interface DeptInfo {
  key: string;
  label: string;
  desc: string;
  color: string;
  icon: typeof BookOpen;
}

interface DeptStats {
  key: string;
  label: string;
  color: string;
  icon: typeof BookOpen;
  totalUsers: number;
  totalWorksheets: number;
  completedWorksheets: number;
  pendingReviews: number;
  completionPct: number;
  recentActivity: { name: string; worksheet: string; date: string }[];
}

const DEPARTMENTS: DeptInfo[] = [
  {
    key: 'academics',
    label: 'Academics',
    desc: 'Teaching, curriculum design, and faculty development',
    color: '#006494',
    icon: BookOpen,
  },
  {
    key: 'progression',
    label: 'Progression',
    desc: 'Progress tracking, assessment design, and student outcome analysis',
    color: '#2E7D32',
    icon: Target,
  },
  {
    key: 'operations',
    label: 'Operations',
    desc: 'Campus operations, scheduling, compliance, and resource management',
    color: '#7B1FA2',
    icon: Sparkles,
  },
];

// ─── Worksheet IDs per dept (for counting) ──────────────
const DEPT_WORKSHEETS: Record<string, string[]> = {
  academics: [
    'p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8','gc1',
    'p2_w1','p2_w2','p2_w3','p2_w4','gc2',
    'p3_w1','p3_w2','p3_w3','p3_w4','p3_w5','gc3',
  ],
  progression: [
    'pr_p1_w1','pr_p1_w2','pr_p1_w3','pr_p1_w4','pr_p1_w5','pr_p1_w6','pr_gc1',
    'pr_p2_w1','pr_p2_w2','pr_p2_w3','pr_gc2',
    'pr_p3_w1','pr_p3_w2','pr_p3_w3','pr_p3_w4','pr_gc3',
  ],
  operations: [
    'op_p1_w1','op_p1_w2','op_p1_w3','op_p1_w4','op_p1_w5','op_p1_w6','op_gc1',
    'op_p2_w1','op_p2_w2','op_p2_w3','op_gc2',
    'op_p3_w1','op_p3_w2','op_p3_w3','op_p3_w4','op_gc3',
  ],
};

// ─── Component ──────────────────────────────────────────

export default function CampusHeadDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deptStats, setDeptStats] = useState<DeptStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overallUsers, setOverallUsers] = useState(0);
  const [overallCompleted, setOverallCompleted] = useState(0);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);

    try {
      // 1. Get all non-super-admin users grouped by department
      const profiles = await supabase
        .from('user_profiles')
        .select('id, department, full_name')
        .neq('role', 'super_admin')
        .then(unwrap) as { id: string; department: string | null; full_name: string | null }[];

      const totalUsers = profiles.length;
      setOverallUsers(totalUsers);

      // 2. Get all recent worksheet submissions (last 1000)
      const submissions = await supabase
        .from('worksheet_submissions')
        .select('user_id, worksheet_id, review_status, updated_at')
        .limit(1000)
        .order('updated_at', { ascending: false })
        .then(unwrap) as { user_id: string; worksheet_id: string; review_status: string; updated_at: string | null }[];

      // 3. Calculate stats per department
      const allDeptStats: DeptStats[] = DEPARTMENTS.map(dept => {
        const deptUsers = profiles.filter(p => p.department === dept.key || (!p.department && dept.key === 'academics'));
        const deptUserIds = new Set(deptUsers.map(u => u.id));
        const deptSubs = submissions.filter(s => deptUserIds.has(s.user_id));
        const wsIds = DEPT_WORKSHEETS[dept.key] || [];
        const total = wsIds.length * deptUsers.length;

        let completed = 0;
        let pending = 0;
        const recentActivity: { name: string; worksheet: string; date: string }[] = [];

        deptUsers.forEach(u => {
          const userSubs = deptSubs.filter(s => s.user_id === u.id);
          wsIds.forEach(wsId => {
            const sub = userSubs.find(s => s.worksheet_id === wsId);
            if (sub?.review_status === REVIEW_STATUS.APPROVED || sub?.review_status === REVIEW_STATUS.BUDDY_APPROVED) {
              completed++;
            } else if (sub?.review_status === REVIEW_STATUS.PENDING_REVIEW ||
                     sub?.review_status === REVIEW_STATUS.REVISION_SUBMITTED) {
              pending++;
            }
          });
        });

        // Recent activity
        deptSubs
          .filter(s => s.updated_at)
          .slice(0, 5)
          .forEach(s => {
            const profile = deptUsers.find(u => u.id === s.user_id);
            if (profile?.full_name) {
              recentActivity.push({
                name: profile.full_name.split(' ')[0] || profile.full_name,
                worksheet: s.worksheet_id,
                date: new Date(s.updated_at!).toLocaleDateString(),
              });
            }
          });

        return {
          ...dept,
          label: dept.label,
          color: dept.color,
          totalUsers: deptUsers.length,
          totalWorksheets: total,
          completedWorksheets: completed,
          pendingReviews: pending,
          completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
          recentActivity: recentActivity.slice(0, 3),
        };
      });

      setDeptStats(allDeptStats);
      setOverallCompleted(allDeptStats.reduce((sum, d) => sum + d.completedWorksheets, 0));
    } catch (err) {
      console.error('Failed to load campus head data:', err);
      setLoadError('We could not load the campus data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadData();
    else setLoading(false);
  }, [user?.id, loadData]);

  // ─── Loading State ────────────────────────────────────

  if (loading) {
    return (
      <div className="lux-section">
        <div className="lux-container">
          <div style={{ marginBottom: '4rem', maxWidth: '800px' }}>
            <div className="lux-line lux-line-gold" style={{ marginBottom: '1.25rem' }} />
            <Skeleton width="180px" height="0.6rem" style={{ marginBottom: '1rem' }} />
            <Skeleton width="70%" height="2.8rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="45%" height="2.8rem" style={{ marginBottom: '1.25rem' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ border: '1px solid rgba(26,26,26,0.12)', padding: '2rem' }}>
                <Skeleton width="60%" height="1.5rem" style={{ marginBottom: '1rem' }} />
                <Skeleton width="40%" height="0.8rem" />
              </div>
            ))}
          </div>
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
          <button onClick={loadData} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const overallPct = deptStats.reduce((sum, d) => sum + d.totalWorksheets, 0) > 0
    ? Math.round((deptStats.reduce((sum, d) => sum + d.completedWorksheets, 0) / deptStats.reduce((sum, d) => sum + d.totalWorksheets, 0)) * 100)
    : 0;

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Hero */}
        <div style={{ marginBottom: '3rem', maxWidth: '800px' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.25rem' }} />
          <span style={{
            fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
            letterSpacing: '0.25em', textTransform: 'uppercase',
            color: t.wg, display: 'block', marginBottom: '1rem',
          }}>
            Campus Head · Overview
          </span>
          <h1 style={{
            fontFamily: t.heading,
            fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            color: t.ch,
            marginBottom: '1rem',
          }}>
            All <em style={{ fontStyle: 'italic', color: t.gd }}>Departments</em>
            <br />
            Overview
          </h1>
          <p style={{
            fontFamily: t.body, fontSize: '0.9rem', lineHeight: 1.7,
            color: t.wg, maxWidth: '500px',
          }}>
            Monitor onboarding progress across all three departments — Academics, Progression, and Operations.
            Click any department to view detailed phase worksheets.
          </p>
        </div>

        {/* Overall Stats Bar */}
        {deptStats.length > 0 && (
          <div style={{
            marginBottom: '3rem',
            padding: '1.5rem 2rem',
            border: '1px solid rgba(26, 26, 26, 0.12)',
            background: 'rgba(26, 26, 26, 0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, lineHeight: 1 }}>
                  {overallUsers}
                </p>
                <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginTop: '4px' }}>
                  <Users size={12} strokeWidth={1.5} style={{ marginRight: '4px', display: 'inline' }} />
                  Users
                </p>
              </div>
              <div style={{ width: '1px', height: '40px', background: 'rgba(26,26,26,0.12)' }} />
              <div style={{ flex: 1, minWidth: '150px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>
                    Overall Completion
                  </span>
                  <span style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, color: t.ch }}>
                    {overallPct}%
                  </span>
                </div>
                <div className="lux-progress" style={{ height: '6px' }}>
                  <div
                    className={`lux-progress-fill ${overallPct === 100 ? 'lux-progress-shimmer' : ''}`}
                    style={{ width: `${overallPct}%`, background: 'linear-gradient(90deg, #D4A853, #C59B3E)' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.success, lineHeight: 1 }}>
                    {overallCompleted}
                  </p>
                  <p style={{ fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginTop: '4px' }}>
                    <CheckCircle2 size={10} strokeWidth={1.5} style={{ marginRight: '2px', display: 'inline' }} />
                    Done
                  </p>
                </div>
                <div style={{ width: '1px', height: '40px', background: 'rgba(26,26,26,0.12)' }} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.pending, lineHeight: 1 }}>
                    {deptStats.reduce((sum, d) => sum + d.pendingReviews, 0)}
                  </p>
                  <p style={{ fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginTop: '4px' }}>
                    <Clock size={10} strokeWidth={1.5} style={{ marginRight: '2px', display: 'inline' }} />
                    Pending
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Department Comparison Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {DEPARTMENTS.map((deptDef, idx) => {
            const stats = deptStats.find(s => s.key === deptDef.key);
            const Icon = deptDef.icon;

            return (
              <div
                key={deptDef.key}
                style={{
                  border: '1px solid rgba(26, 26, 26, 0.12)',
                  padding: '2rem',
                  cursor: 'pointer',
                  transition: 'all 200ms var(--ease-lux)',
                  animation: `luxFadeIn 0.6s ${idx * 0.12}s forwards`,
                  opacity: 0,
                }}
                onClick={() => navigate(deptDef.key === 'academics' ? '/' : `/${deptDef.key}`)}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') navigate(deptDef.key === 'academics' ? '/' : `/${deptDef.key}`); }}
                role="button"
                tabIndex={0}
                aria-label={`View ${deptDef.label} department`}
                onMouseOver={e => { e.currentTarget.style.borderColor = deptDef.color; e.currentTarget.style.background = `${deptDef.color}08`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.12)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>
                  <div style={{
                    width: '56px', height: '56px',
                    border: `1px solid ${deptDef.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    background: `${deptDef.color}10`,
                  }}>
                    <Icon size={26} strokeWidth={1.5} style={{ color: deptDef.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h2 style={{ fontFamily: t.heading, fontSize: '1.35rem', fontWeight: 400, color: t.ch, margin: 0 }}>
                        {deptDef.label}
                      </h2>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px',
                        fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em',
                        textTransform: 'uppercase', color: deptDef.color,
                        border: `1px solid ${deptDef.color}4D`,
                        background: `${deptDef.color}15`,
                      }}>
                        {deptDef.key}
                      </span>
                    </div>
                    <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, lineHeight: 1.6, marginBottom: '1rem', maxWidth: '500px' }}>
                      {deptDef.desc}
                    </p>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      <div>
                        <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg, marginBottom: '2px' }}>
                          <Users size={10} strokeWidth={1.5} style={{ marginRight: '4px', display: 'inline' }} />
                          Users
                        </p>
                        <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: deptDef.color }}>
                          {stats?.totalUsers || 0}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg, marginBottom: '2px' }}>
                          <CheckCircle2 size={10} strokeWidth={1.5} style={{ marginRight: '4px', display: 'inline' }} />
                          Completed
                        </p>
                        <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.success }}>
                          {stats?.completedWorksheets || 0}<span style={{ fontSize: '0.8rem', color: t.wg }}> / {stats?.totalWorksheets || 0}</span>
                        </p>
                      </div>
                      <div>
                        <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg, marginBottom: '2px' }}>
                          <Clock size={10} strokeWidth={1.5} style={{ marginRight: '4px', display: 'inline' }} />
                          Pending Review
                        </p>
                        <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.pending }}>
                          {stats?.pendingReviews || 0}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>
                          Progress
                        </span>
                        <span style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, color: deptDef.color }}>
                          {stats?.completionPct || 0}%
                        </span>
                      </div>
                      <div className="lux-progress" style={{ height: '4px' }}>
                        <div
                          className="lux-progress-fill"
                          style={{ width: `${stats?.completionPct || 0}%`, background: deptDef.color }}
                        />
                      </div>
                    </div>

                    {/* Recent activity */}
                    {stats && stats.recentActivity.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <p style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg, marginBottom: '4px' }}>
                          <BarChart3 size={10} strokeWidth={1.5} style={{ marginRight: '4px', display: 'inline' }} />
                          Recent Activity
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {stats.recentActivity.map((act, i) => (
                            <p key={i} style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg, lineHeight: 1.4 }}>
                              <span style={{ color: deptDef.color, fontWeight: 500 }}>{act.name}</span> submitted{' '}
                              <span style={{ color: t.ch }}>{act.worksheet.replace('_', ' ').toUpperCase()}</span> — {act.date}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[1, 2, 3].map(ph => (
                        <button
                          key={ph}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(deptDef.key === 'academics' ? `/phase-${ph}` : `/${deptDef.key}/phase-${ph}`);
                          }}
                          style={{
                            padding: '6px 14px',
                            border: `1px solid ${deptDef.color}4D`,
                            background: `${deptDef.color}08`,
                            color: deptDef.color,
                            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                            letterSpacing: '0.1em', textTransform: 'uppercase',
                            cursor: 'pointer',
                            transition: 'background 200ms',
                          }}
                          onMouseOver={e => { e.currentTarget.style.background = `${deptDef.color}20`; }}
                          onMouseOut={e => { e.currentTarget.style.background = `${deptDef.color}08`; }}
                        >
                          Phase {ph}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={18} strokeWidth={1.5} style={{ color: deptDef.color, flexShrink: 0, marginTop: '18px' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Links */}
        <div style={{
          marginTop: '4rem',
          borderTop: '1px solid rgba(26, 26, 26, 0.12)',
          paddingTop: '2rem',
        }}>
          <h4 style={{
            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg,
            marginBottom: '1rem',
          }}>
            Quick Actions
          </h4>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/admin')} className="lux-btn lux-btn-secondary">
              <Shield size={14} strokeWidth={1.5} /> Admin Dashboard
            </button>
            <button onClick={() => navigate('/buddy')} className="lux-btn lux-btn-secondary">
              <Users size={14} strokeWidth={1.5} /> Reviews & Approvals
            </button>
            <button onClick={() => navigate('/super-admin/campuses')} className="lux-btn lux-btn-secondary">
              <BarChart3 size={14} strokeWidth={1.5} /> Campus Management
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
