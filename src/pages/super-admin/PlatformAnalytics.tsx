import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { PHASE_WORKSHEETS_MAP } from '../../config/worksheetConfigData';
import {
  BarChart3, Building, Users, CheckCircle, Clock, Activity,
  TrendingUp, TrendingDown, Loader2, ArrowLeft,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface CampusAnalytics {
  campusId: string;
  campusName: string;
  totalUsers: number;
  joiners: number;
  buddies: number;
  heads: number;
  pendingApprovals: number;
  completedSubmissions: number;
  totalSubmissions: number;
  completionRate: number;
  phase1Complete: number;
  phase2Complete: number;
  phase3Complete: number;
  templateCount: number;
  avgCompletionDays: number | null;
}

interface PlatformSummary {
  totalUsers: number;
  totalJoiners: number;
  totalBuddies: number;
  totalHeads: number;
  totalCampuses: number;
  activeCampuses: number;
  overallCompletionRate: number;
  totalPendingApprovals: number;
  totalCompletedSubmissions: number;
  avgCompletionDays: number | null;
}

// ─── Helpers ────────────────────────────────────────────

function completionRateColor(rate: number): string {
  if (rate >= 60) return '#2E7D32';
  if (rate >= 30) return '#D4A853';
  return '#C62828';
}

// ─── Component ──────────────────────────────────────────

export default function PlatformAnalytics() {
  const navigate = useNavigate();
  const [campusData, setCampusData] = useState<CampusAnalytics[]>([]);
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'completionRate' | 'users'>('completionRate');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch all campuses
        const { data: campuses } = await supabase
          .from('campuses')
          .select('id, name, is_active')
          .order('name');
        const campusList = (campuses || []) as { id: string; name: string; is_active: boolean }[];
        if (cancelled) return;

        // Build per-campus analytics
        const analytics: CampusAnalytics[] = [];
        let totalJoiners = 0, totalBuddies = 0, totalHeads = 0, totalUsers = 0;
        let totalPending = 0, totalCompleted = 0, totalSubmissions = 0;
        let totalCampusesWithDays = 0, totalDays = 0;

        for (const campus of campusList) {
          // Users per campus
          const { data: users } = await supabase
            .from('user_profiles')
            .select('id, role')
            .eq('campus_id', campus.id);

          const userList = (users || []) as { id: string; role: string }[];
          const joiners = userList.filter(u => u.role === 'new_joinee').length;
          const buddies = userList.filter(u => u.role === 'lead_instructor').length;
          const heads = userList.filter(u => ['academic_head', 'progression_head', 'ops_head', 'campus_head', 'onboarding_lead'].includes(u.role));
          const count = userList.length;

          totalJoiners += joiners;
          totalBuddies += buddies;
          totalHeads += heads.length;
          totalUsers += count;

          // Worksheet submissions
          const { data: submissions } = await supabase
            .from('worksheet_submissions')
            .select('review_status, created_at, updated_at')
            .eq('campus_id', campus.id);

          const subList = (submissions || []) as { review_status: string; created_at: string; updated_at: string }[];
          const pending = subList.filter(s => s.review_status === 'pending_review').length;
          const completed = subList.filter(s => s.review_status === 'approved').length;
          const total = subList.length;

          totalPending += pending;
          totalCompleted += completed;
          totalSubmissions += total;

          // Phase completion tracking across all users
          const { data: approvedSubs } = await supabase
            .from('worksheet_submissions')
            .select('user_id, worksheet_id, review_status')
            .eq('campus_id', campus.id)
            .in('review_status', ['approved', 'buddy_approved']);

          const approvedMap = new Map<string, Set<string>>();
          for (const s of (approvedSubs || []) as { user_id: string; worksheet_id: string }[]) {
            if (!approvedMap.has(s.user_id)) approvedMap.set(s.user_id, new Set());
            approvedMap.get(s.user_id)!.add(s.worksheet_id);
          }

          let p1Complete = 0, p2Complete = 0, p3Complete = 0;
          const p1Sheets = new Set(PHASE_WORKSHEETS_MAP[1] || []);
          const p2Sheets = new Set(PHASE_WORKSHEETS_MAP[2] || []);
          const p3Sheets = new Set(PHASE_WORKSHEETS_MAP[3] || []);

          for (const [, approved] of approvedMap) {
            if (p1Sheets.size > 0 && [...p1Sheets].every(id => approved.has(id))) p1Complete++;
            if (p2Sheets.size > 0 && [...p2Sheets].every(id => approved.has(id))) p2Complete++;
            if (p3Sheets.size > 0 && [...p3Sheets].every(id => approved.has(id))) p3Complete++;
          }

          // Approximate avg completion days (from created_at to approved_at)
          let campusDays = 0, campusDayCount = 0;
          for (const s of subList) {
            if (s.review_status === 'approved' && s.created_at && s.updated_at) {
              const start = new Date(s.created_at).getTime();
              const end = new Date(s.updated_at).getTime();
              if (!isNaN(start) && !isNaN(end) && end > start) {
                campusDays += (end - start) / (1000 * 60 * 60 * 24);
                campusDayCount++;
              }
            }
          }
          totalDays += campusDays;
          totalCampusesWithDays += campusDayCount;

          // Template count
          const { count: tmplCount } = await supabase
            .from('onboarding_templates')
            .select('*', { count: 'exact', head: true })
            .eq('campus_id', campus.id);

          analytics.push({
            campusId: campus.id,
            campusName: campus.name,
            totalUsers: count,
            joiners,
            buddies,
            heads: heads.length,
            pendingApprovals: pending,
            completedSubmissions: completed,
            totalSubmissions: total,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
            phase1Complete: p1Complete,
            phase2Complete: p2Complete,
            phase3Complete: p3Complete,
            templateCount: tmplCount ?? 0,
            avgCompletionDays: campusDayCount > 0 ? Math.round((campusDays / campusDayCount) * 10) / 10 : null,
          });

          if (cancelled) return;
        }

        setCampusData(analytics);
        setSummary({
          totalUsers,
          totalJoiners,
          totalBuddies,
          totalHeads,
          totalCampuses: campusList.length,
          activeCampuses: campusList.filter(c => c.is_active).length,
          overallCompletionRate: totalSubmissions > 0 ? Math.round((totalCompleted / totalSubmissions) * 100) : 0,
          totalPendingApprovals: totalPending,
          totalCompletedSubmissions: totalCompleted,
          avgCompletionDays: totalCampusesWithDays > 0 ? Math.round((totalDays / totalCampusesWithDays) * 10) / 10 : null,
        });
      } catch (err) {
        if (!cancelled) setError('Failed to load analytics data');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Sort ─────────────────────────────────────────────
  const sortedData = [...campusData].sort((a, b) => {
    if (sortBy === 'name') return a.campusName.localeCompare(b.campusName);
    if (sortBy === 'users') return b.totalUsers - a.totalUsers;
    return b.completionRate - a.completionRate;
  });

  // ── Loading ──────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center', paddingTop: '6rem' }}>
          <Loader2 size={28} strokeWidth={1.5} className="spin-icon" style={{ color: 'var(--color-warm-grey)' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)', marginTop: '1rem' }}>Loading analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Back link */}
        <button onClick={() => navigate('/super-admin')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            color: 'var(--color-warm-grey)', padding: 0,
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            marginBottom: '1.5rem',
          }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Dashboard
        </button>

        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--color-charcoal)', margin: '0 0 0.5rem' }}>
            <BarChart3 size={28} strokeWidth={1.5} style={{ marginRight: '12px', verticalAlign: 'middle', color: 'var(--color-warm-grey)' }} />
            Platform Analytics
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>
            Cross-campus onboarding metrics and performance insights.
          </p>
        </div>

        {error && (
          <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>{error}</span>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px', marginBottom: '2.5rem',
          }}>
            {[
              { label: 'Total Campuses', value: summary.totalCampuses, sub: `${summary.activeCampuses} active`, icon: Building, color: '#006494' },
              { label: 'Total Users', value: summary.totalUsers, sub: `${summary.totalJoiners} joiners`, icon: Users, color: '#2E7D32' },
              { label: 'Buddies', value: summary.totalBuddies, sub: 'Active mentors', icon: Users, color: '#7B1FA2' },
              { label: 'Heads & Leads', value: summary.totalHeads, sub: 'Administrators', icon: Users, color: '#D4A853' },
              { label: 'Completion Rate', value: `${summary.overallCompletionRate}%`, sub: 'Across all campuses', icon: TrendingUp, color: completionRateColor(summary.overallCompletionRate) },
              { label: 'Pending Approval', value: summary.totalPendingApprovals, sub: 'Awaiting review', icon: Clock, color: '#C62828' },
              { label: 'Completed', value: summary.totalCompletedSubmissions, sub: 'Approved worksheets', icon: CheckCircle, color: '#2E7D32' },
              { label: 'Avg Completion', value: summary.avgCompletionDays ? `${summary.avgCompletionDays}d` : '—', sub: 'Per submission', icon: Activity, color: '#1565C0' },
            ].map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} style={{
                  padding: '1.25rem', border: '1px solid rgba(26,26,26,0.12)',
                  background: 'var(--color-alabaster)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${card.color}10` }}>
                      <Icon size={16} strokeWidth={1.5} style={{ color: card.color }} />
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-charcoal)', lineHeight: 1, marginBottom: '4px' }}>
                    {card.value}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', marginBottom: '2px' }}>
                    {card.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-warm-grey)' }}>
                    {card.sub}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sort Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>
            Sort by:
          </span>
          {(['completionRate', 'name', 'users'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              style={{
                padding: '4px 12px', fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500,
                border: `1px solid ${sortBy === s ? 'var(--color-charcoal)' : 'rgba(26,26,26,0.15)'}`,
                background: sortBy === s ? 'var(--color-charcoal)' : 'transparent',
                color: sortBy === s ? '#F9F8F6' : 'var(--color-warm-grey)',
                cursor: 'pointer', letterSpacing: '0.05em',
                transition: 'all 200ms var(--ease-lux)',
              }}>
              {s === 'completionRate' ? 'Completion Rate' : s === 'name' ? 'Campus Name' : 'User Count'}
            </button>
          ))}
        </div>

        {/* Per-Campus Breakdown Table */}
        {sortedData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed rgba(26,26,26,0.15)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
            <BarChart3 size={24} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>No campus data available yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(26,26,26,0.12)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Campus</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Users</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Joiners</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Buddies</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pending</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Completed</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Completion</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phase 1 ✅</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phase 2 ✅</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phase 3 ✅</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Avg Days</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Templates</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map(c => {
                  const rateColor = completionRateColor(c.completionRate);
                  const trend = c.completionRate >= 50
                    ? <TrendingUp size={12} strokeWidth={1.5} style={{ color: '#2E7D32' }} />
                    : <TrendingDown size={12} strokeWidth={1.5} style={{ color: '#C62828' }} />;

                  return (
                    <tr key={c.campusId} style={{
                      borderBottom: '1px solid rgba(26,26,26,0.06)',
                      transition: 'background 150ms var(--ease-lux)',
                    }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(26,26,26,0.02)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px', fontWeight: 500, color: 'var(--color-charcoal)' }}>
                        {c.campusName}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--color-charcoal)' }}>{c.totalUsers}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--color-warm-grey)' }}>{c.joiners}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--color-warm-grey)' }}>{c.buddies}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {c.pendingApprovals > 0
                          ? <span style={{ color: '#C62828', fontWeight: 500 }}>{c.pendingApprovals}</span>
                          : <span style={{ color: '#2E7D32' }}>0</span>
                        }
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--color-warm-grey)' }}>{c.completedSubmissions}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 10px',
                          background: `${rateColor}10`,
                          color: rateColor, fontWeight: 500, fontSize: '0.7rem',
                        }}>
                          {trend} {c.completionRate}%
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: c.phase1Complete > 0 ? '#2E7D32' : 'var(--color-warm-grey)' }}>
                        {c.phase1Complete}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: c.phase2Complete > 0 ? '#2E7D32' : 'var(--color-warm-grey)' }}>
                        {c.phase2Complete}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: c.phase3Complete > 0 ? '#2E7D32' : 'var(--color-warm-grey)' }}>
                        {c.phase3Complete}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--color-warm-grey)', fontSize: '0.7rem' }}>
                        {c.avgCompletionDays ? `${c.avgCompletionDays}d` : '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--color-warm-grey)' }}>{c.templateCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {sortedData.length > 0 && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
            Showing {sortedData.length} campus{campusData.length !== 1 ? 'es' : ''}
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
