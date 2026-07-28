import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabase';
import { withCampusIf } from '../../api/supabase';
import { unwrap } from '../../api/db';
import {
  Building, Users, Clock, Shield, BadgeCheck, BarChart3,
  FileText, RefreshCw, AlertCircle, ChevronRight, GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { REVIEW_STATUS } from '../../constants/status';
import { t } from '../../config/theme';

interface StatItem {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

interface RecentActivity {
  id: string;
  userName: string;
  action: string;
  time: string;
  type: 'submission' | 'approval' | 'assignment';
}

export default function CampusAdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const campusId = profile?.campus_id;

  const [stats, setStats] = useState({
    totalJoiners: 0,
    pendingReview: 0,
    buddyApproved: 0,
    approved: 0,
    unassigned: 0,
    activeBuddies: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campusName, setCampusName] = useState('');

  useEffect(() => {
    if (campusId) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  async function loadData() {
    if (!campusId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch campus details
      const { data: campusData } = await supabase
        .from('campuses')
        .select('name')
        .eq('id', campusId)
        .single();
      if (campusData) setCampusName(campusData.name);

      // Fetch joinees in this campus
      const joinees = await withCampusIf(
        supabase.from('user_profiles')
          .select('id, full_name, email, role, assigned_lead_id, assigned_buddy_id')
          .in('role', ['new_joinee', 'lab_instructor']),
        campusId
      ).then(unwrap) as { id: string; full_name: string; email: string; role: string; assigned_lead_id: string | null; assigned_buddy_id: string | null }[];

      // Fetch non-joinee profiles (buddies, heads, etc.)
      const buddies = await withCampusIf(
        supabase.from('user_profiles')
          .select('id, full_name, email, role')
          .not('role', 'in', '("new_joinee","lab_instructor")'),
        campusId
      ).then(unwrap) as { id: string; full_name: string; role: string }[];

      // Fetch submissions for these joinees
      const joineeIds = joinees.map(j => j.id);
      const submissions = joineeIds.length > 0
        ? await withCampusIf(
            supabase.from('worksheet_submissions')
              .select('user_id, review_status'),
            campusId
          ).then(unwrap) as { user_id: string; review_status: string }[]
        : [];

      const totalJoiners = joinees.length;
      const pendingReview = submissions.filter(s => s.review_status === REVIEW_STATUS.PENDING_REVIEW || s.review_status === REVIEW_STATUS.REVISION_SUBMITTED).length;
      const buddyApproved = submissions.filter(s => s.review_status === REVIEW_STATUS.BUDDY_APPROVED).length;
      const approved = submissions.filter(s => s.review_status === REVIEW_STATUS.APPROVED).length;
      const unassigned = joinees.filter(j => !j.assigned_lead_id && !j.assigned_buddy_id).length;
      const activeBuddies = buddies.filter(b => b.role === 'lead_instructor' || b.role === 'onboarding_lead').length;

      setStats({ totalJoiners, pendingReview, buddyApproved, approved, unassigned, activeBuddies });

      // Generate recent activity
      const activity: RecentActivity[] = [
        ...submissions.filter(s => s.review_status === REVIEW_STATUS.PENDING_REVIEW).slice(0, 5).map(s => {
          const joinee = joinees.find(j => j.id === s.user_id);
          return { id: s.user_id, userName: joinee?.full_name || 'Unknown', action: 'Submitted worksheet for review', time: 'Recently', type: 'submission' as const };
        }),
        ...submissions.filter(s => s.review_status === REVIEW_STATUS.BUDDY_APPROVED).slice(0, 3).map(s => {
          const joinee = joinees.find(j => j.id === s.user_id);
          return { id: s.user_id, userName: joinee?.full_name || 'Unknown', action: 'Buddy approved worksheet', time: 'Recently', type: 'approval' as const };
        }),
      ];
      setRecentActivity(activity.slice(0, 10));

    } catch (err) {
      console.error('Failed to load campus admin data:', err);
      setError('Could not load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const statItems: StatItem[] = [
    { label: 'Joinees', value: stats.totalJoiners, icon: Users, color: t.ch },
    { label: 'Pending Review', value: stats.pendingReview, icon: Clock, color: t.gd },
    { label: 'Buddy Approved', value: stats.buddyApproved, icon: Shield, color: t.purple },
    { label: 'Approved', value: stats.approved, icon: BadgeCheck, color: t.success },
    { label: 'Unassigned', value: stats.unassigned, icon: AlertCircle, color: stats.unassigned > 0 ? t.warning : t.success },
    { label: 'Active Buddies', value: stats.activeBuddies, icon: GraduationCap, color: t.info },
  ];

  if (!campusId) {
    return (
      <div className="lux-section" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <Building size={32} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>No Campus Assigned</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>Your profile doesn't have a campus assigned. Contact the Super Admin to set up your campus.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lux-section" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={28} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>Error Loading Dashboard</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg, marginBottom: '1.5rem' }}>{error}</p>
          <button onClick={loadData} className="lux-btn lux-btn-primary" style={{ minWidth: '160px' }}>
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Building size={20} strokeWidth={1.5} style={{ color: t.ch }} />
                <span style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em',
                  textTransform: 'uppercase', color: t.ch, padding: '3px 10px',
                  border: '1px solid ' + t.ch,
                }}>
                  {campusName || 'My Campus'}
                </span>
              </div>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Campus Admin Dashboard</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                Manage your campus · {stats.totalJoiners} joinee(s) · {stats.activeBuddies} active buddy(ies)
              </p>
            </div>
            <button onClick={loadData} disabled={loading} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 20px', cursor: 'pointer',
              transition: 'all 200ms ' + t.ease,
            }}>
              <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '6px' }} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1px',
          background: 'rgba(26, 26, 26, 0.1)',
          marginBottom: '2.5rem',
        }}>
          {statItems.map((item, i) => (
            <div key={i} style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
              <item.icon size={20} strokeWidth={1.5} style={{ color: item.color, marginBottom: '8px' }} />
              <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.ch, marginBottom: '4px' }}>{item.value}</p>
              <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontFamily: t.heading, fontSize: '1.1rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Quick Actions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Roster & Users', desc: 'View joinees, buddies, and managers', path: '/admin', icon: Users, color: t.ch },
              { label: 'Pending Reviews', desc: 'Review and approve phases', path: '/admin', icon: FileText, color: t.purple },
              { label: 'Assignments', desc: 'Assign buddies and managers', path: '/admin', icon: Shield, color: t.info },
              { label: 'Reports', desc: 'View campus analytics', path: '/admin/reports', icon: BarChart3, color: t.success },
              { label: 'Settings', desc: 'Campus configuration', path: '/admin/settings', icon: Building, color: t.gd },
            ].map((action, idx) => {
              const Icon = action.icon;
              return (
                <button key={idx} onClick={() => navigate(action.path)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '16px 20px',
                    border: '1px solid rgba(26, 26, 26, 0.12)',
                    background: 'transparent', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit', fontSize: 'inherit',
                    transition: 'all 200ms var(--ease-lux)',
                    opacity: 0,
                    animation: `luxFadeIn 0.4s ${idx * 0.06}s forwards`,
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = action.color; e.currentTarget.style.background = `${action.color}08`; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.12)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: '38px', height: '38px', border: '1px solid ' + action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} strokeWidth={1.5} style={{ color: action.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, marginBottom: '2px' }}>{action.label}</p>
                    <p style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>{action.desc}</p>
                  </div>
                  <ChevronRight size={14} strokeWidth={1.5} style={{ color: t.wg, flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 style={{ fontFamily: t.heading, fontSize: '1.1rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>No recent activity for your campus.</p>
            </div>
          ) : (
            <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
              {recentActivity.map((act, idx) => (
                <div key={`${act.id}-${idx}`} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 0', borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                  opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
                }}>
                  <div style={{
                    width: '32px', height: '32px',
                    border: '1px solid ' + (act.type === 'approval' ? t.purple : act.type === 'assignment' ? t.info : t.ch),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {act.type === 'approval' ? <Shield size={14} strokeWidth={1.5} style={{ color: t.purple }} /> :
                     act.type === 'assignment' ? <Users size={14} strokeWidth={1.5} style={{ color: t.info }} /> :
                     <FileText size={14} strokeWidth={1.5} style={{ color: t.ch }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>{act.userName}</p>
                    <p style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>{act.action}</p>
                  </div>
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg }}>{act.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
