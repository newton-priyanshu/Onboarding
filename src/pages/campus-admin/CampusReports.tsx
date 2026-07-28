import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabase';
import { withCampusIf } from '../../api/supabase';
import { unwrap } from '../../api/db';
import { BarChart3, TrendingUp, Users, Clock, Shield, BadgeCheck, AlertCircle, Building, RefreshCw } from 'lucide-react';
import { REVIEW_STATUS } from '../../constants/status';
import { t } from '../../config/theme';

interface ReportStats {
  totalJoiners: number;
  completedJoiners: number;
  pendingJoiners: number;
  totalSubmissions: number;
  pendingReview: number;
  buddyApproved: number;
  approved: number;
  needsRevision: number;
  buddyPerformance: { id: string; name: string; joinees: number; approved: number }[];
}

export default function CampusReports() {
  const { profile } = useAuth();
  const campusId = profile?.campus_id;

  const [stats, setStats] = useState<ReportStats>({
    totalJoiners: 0, completedJoiners: 0, pendingJoiners: 0,
    totalSubmissions: 0, pendingReview: 0, buddyApproved: 0, approved: 0, needsRevision: 0,
    buddyPerformance: [],
  });
  const [loading, setLoading] = useState(true);
  const [campusName, setCampusName] = useState('');

  useEffect(() => {
    if (campusId) loadReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  async function loadReports() {
    if (!campusId) return;
    setLoading(true);
    try {
      const { data: campus } = await supabase.from('campuses').select('name').eq('id', campusId).single();
      if (campus) setCampusName(campus.name);

      const joinees = await withCampusIf(
        supabase.from('user_profiles').select('id, full_name, assigned_buddy_id, created_at').in('role', ['new_joinee', 'lab_instructor']),
        campusId
      ).then(unwrap) as { id: string; full_name: string; assigned_buddy_id: string | null; created_at: string }[];

      const joineeIds = joinees.map(j => j.id);
      const submissions = joineeIds.length > 0
        ? await withCampusIf(
            supabase.from('worksheet_submissions').select('user_id, review_status, status'),
            campusId
          ).then(unwrap) as { user_id: string; review_status: string; status: string }[]
        : [];

      const totalJoiners = joinees.length;
      const pendingReview = submissions.filter(s => s.review_status === REVIEW_STATUS.PENDING_REVIEW || s.review_status === REVIEW_STATUS.REVISION_SUBMITTED).length;
      const buddyApproved = submissions.filter(s => s.review_status === REVIEW_STATUS.BUDDY_APPROVED).length;
      const approved = submissions.filter(s => s.review_status === REVIEW_STATUS.APPROVED).length;
      const needsRevision = submissions.filter(s => s.review_status === REVIEW_STATUS.NEEDS_REVISION).length;

      // Completed joiners: all their worksheets are approved
      const completedJoiners = joinees.filter(j => {
        const userSubs = submissions.filter(s => s.user_id === j.id);
        return userSubs.length > 0 && userSubs.every(s => s.review_status === REVIEW_STATUS.APPROVED);
      }).length;

      // Buddy performance
      const buddyPerfMap = new Map<string, { name: string; joinees: Set<string>; approved: number }>();
      joinees.forEach(j => {
        if (j.assigned_buddy_id) {
          if (!buddyPerfMap.has(j.assigned_buddy_id)) {
            buddyPerfMap.set(j.assigned_buddy_id, { name: j.full_name, joinees: new Set(), approved: 0 });
          }
          buddyPerfMap.get(j.assigned_buddy_id)!.joinees.add(j.id);
        }
      });
      submissions.filter(s => s.review_status === REVIEW_STATUS.APPROVED).forEach(s => {
        const joinee = joinees.find(j => j.id === s.user_id);
        if (joinee?.assigned_buddy_id) {
          const bp = buddyPerfMap.get(joinee.assigned_buddy_id);
          if (bp) bp.approved++;
        }
      });

      const buddyPerformance = Array.from(buddyPerfMap.entries()).map(([id, bp]) => ({
        id, name: bp.name, joinees: bp.joinees.size, approved: bp.approved,
      }));

      setStats({
        totalJoiners, completedJoiners, pendingJoiners: totalJoiners - completedJoiners,
        totalSubmissions: submissions.length, pendingReview, buddyApproved, approved, needsRevision,
        buddyPerformance,
      });
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!campusId) {
    return (
      <div className="lux-section" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <Building size={32} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
          <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>No campus assigned.</p>
        </div>
      </div>
    );
  }

  const completionRate = stats.totalJoiners > 0 ? Math.round((stats.completedJoiners / stats.totalJoiners) * 100) : 0;

  return (
    <div className="lux-section">
      <div className="lux-container">
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <BarChart3 size={16} strokeWidth={1.5} style={{ color: t.ch }} />
            <span style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.ch, padding: '3px 10px', border: '1px solid ' + t.ch }}>
              {campusName || 'Campus'} Reports
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Campus Reports</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Onboarding analytics for your campus</p>
            </div>
            <button onClick={loadReports} disabled={loading} style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 20px', cursor: 'pointer' }}>
              <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '6px' }} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>Loading reports…</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2.5rem' }}>
              <div style={{ background: 'var(--color-alabaster)', padding: '1.5rem', textAlign: 'center' }}>
                <Users size={22} strokeWidth={1.5} style={{ color: t.ch, marginBottom: '8px' }} />
                <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.ch, marginBottom: '4px' }}>{stats.totalJoiners}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Total Joinees</p>
              </div>
              <div style={{ background: 'var(--color-alabaster)', padding: '1.5rem', textAlign: 'center' }}>
                <BadgeCheck size={22} strokeWidth={1.5} style={{ color: t.success, marginBottom: '8px' }} />
                <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.success, marginBottom: '4px' }}>{completionRate}%</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Completion Rate</p>
              </div>
              <div style={{ background: 'var(--color-alabaster)', padding: '1.5rem', textAlign: 'center' }}>
                <TrendingUp size={22} strokeWidth={1.5} style={{ color: t.purple, marginBottom: '8px' }} />
                <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.purple, marginBottom: '4px' }}>{stats.completedJoiners}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Completed</p>
              </div>
              <div style={{ background: 'var(--color-alabaster)', padding: '1.5rem', textAlign: 'center' }}>
                <Clock size={22} strokeWidth={1.5} style={{ color: t.gd, marginBottom: '8px' }} />
                <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.gd, marginBottom: '4px' }}>{stats.pendingJoiners}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>In Progress</p>
              </div>
              <div style={{ background: 'var(--color-alabaster)', padding: '1.5rem', textAlign: 'center' }}>
                <Shield size={22} strokeWidth={1.5} style={{ color: t.purple, marginBottom: '8px' }} />
                <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.purple, marginBottom: '4px' }}>{stats.buddyApproved}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Buddy Approved</p>
              </div>
              <div style={{ background: 'var(--color-alabaster)', padding: '1.5rem', textAlign: 'center' }}>
                <AlertCircle size={22} strokeWidth={1.5} style={{ color: stats.needsRevision > 0 ? t.warning : t.success, marginBottom: '8px' }} />
                <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: stats.needsRevision > 0 ? t.warning : t.success, marginBottom: '4px' }}>{stats.needsRevision}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Needs Revision</p>
              </div>
            </div>

            {/* Submission Status Breakdown */}
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ fontFamily: t.heading, fontSize: '1.1rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Submission Status</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Total Submissions', value: stats.totalSubmissions, color: t.ch },
                  { label: 'Pending Review', value: stats.pendingReview, color: t.gd },
                  { label: 'Buddy Approved', value: stats.buddyApproved, color: t.purple },
                  { label: 'Approved', value: stats.approved, color: t.success },
                  { label: 'Needs Revision', value: stats.needsRevision, color: t.warning },
                ].map((item, idx) => (
                  <div key={idx} style={{ padding: '1rem', border: '1px solid rgba(26,26,26,0.1)', textAlign: 'center' }}>
                    <p style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: item.color, marginBottom: '4px' }}>{item.value}</p>
                    <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Buddy Performance */}
            {stats.buddyPerformance.length > 0 && (
              <div>
                <h3 style={{ fontFamily: t.heading, fontSize: '1.1rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Buddy Performance</h3>
                <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: '12px', padding: '12px 0', borderBottom: '1px solid rgba(26,26,26,0.08)', fontFamily: t.body, fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>
                    <span>Buddy</span>
                    <span>Joinees</span>
                    <span>Approved</span>
                  </div>
                  {stats.buddyPerformance.map((bp, idx) => (
                    <div key={bp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: '12px', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(26,26,26,0.06)', opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards` }}>
                      <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{bp.name}</span>
                      <span style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>{bp.joinees}</span>
                      <span style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.success }}>{bp.approved}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.buddyPerformance.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', border: '1px solid rgba(26,26,26,0.1)' }}>
                <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>No buddy data available yet. Assign buddies to joinees to see performance metrics.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
