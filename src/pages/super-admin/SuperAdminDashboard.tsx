import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { PHASE_WORKSHEETS_MAP } from '../../config/worksheetConfigData';
import { Building, FileText, Users, Activity, ChevronRight, Loader2, BarChart3, CheckCircle, Clock, Search } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface Campus {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface CampusStats {
  campusId: string;
  campusName: string;
  totalUsers: number;
  newJoiners: number;
  buddies: number;
  academicHeads: number;
  onboardingLeads: number;
  pendingApprovals: number;
  completedWorksheets: number;
  activeTemplates: number;
}

interface UserProgress {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  campus_name: string;
  phase1Complete: boolean;
  phase2Complete: boolean;
  phase3Complete: boolean;
  pendingReviews: number;
  lastActive: string;
}

interface PlatformStats {
  totalCampuses: number;
  activeCampuses: number;
  totalUsers: number;
  totalTemplates: number;
  recentSignups: number;
  pendingApprovals: number;
  completedOnboardings: number;
}

// ─── Component ──────────────────────────────────────────

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string>('all');
  const [campusStats, setCampusStats] = useState<CampusStats[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    totalCampuses: 0, activeCampuses: 0, totalUsers: 0,
    totalTemplates: 0, recentSignups: 0, pendingApprovals: 0, completedOnboardings: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch campuses
        const { data: campusData } = await supabase
          .from('campuses')
          .select('id, name, slug, is_active')
          .order('name');
        const campusList = (campusData || []) as Campus[];
        if (cancelled) return;
        setCampuses(campusList);

        // Fetch platform counts
        const [
          { count: cCount },
          { count: aCount },
          { count: uCount },
          { count: tCount },
          { count: rsCount },
          { count: pCount },
        ] = await Promise.all([
          supabase.from('campuses').select('*', { count: 'exact', head: true }),
          supabase.from('campuses').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
          supabase.from('onboarding_templates').select('*', { count: 'exact', head: true }),
          supabase.from('user_profiles').select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
          supabase.from('worksheet_submissions').select('*', { count: 'exact', head: true })
            .eq('review_status', 'pending_review'),
        ]);

        if (cancelled) return;
        setPlatformStats({
          totalCampuses: cCount ?? 0,
          activeCampuses: aCount ?? 0,
          totalUsers: uCount ?? 0,
          totalTemplates: tCount ?? 0,
          recentSignups: rsCount ?? 0,
          pendingApprovals: pCount ?? 0,
          completedOnboardings: 0, // Will be calculated per-campus
        });

        // Fetch per-campus stats
        const campusStatsData: CampusStats[] = [];
        for (const campus of campusList) {
          const [
            { count: users },
            { count: joiners },
            { count: buddies },
            { count: heads },
            { count: leads },
            { count: pending },
            { count: completed },
            { count: templates },
          ] = await Promise.all([
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('campus_id', campus.id),
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('campus_id', campus.id).eq('role', 'new_joinee'),
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('campus_id', campus.id).eq('role', 'lead_instructor'),
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('campus_id', campus.id).eq('role', 'academic_head'),
            supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('campus_id', campus.id).eq('role', 'onboarding_lead'),
            supabase.from('worksheet_submissions').select('*', { count: 'exact', head: true })
              .eq('campus_id', campus.id).eq('review_status', 'pending_review'),
            supabase.from('worksheet_submissions').select('*', { count: 'exact', head: true })
              .eq('campus_id', campus.id).eq('review_status', 'approved'),
            supabase.from('onboarding_templates').select('*', { count: 'exact', head: true }).eq('campus_id', campus.id),
          ]);
          if (cancelled) return;
          campusStatsData.push({
            campusId: campus.id,
            campusName: campus.name,
            totalUsers: users ?? 0,
            newJoiners: joiners ?? 0,
            buddies: buddies ?? 0,
            academicHeads: heads ?? 0,
            onboardingLeads: leads ?? 0,
            pendingApprovals: pending ?? 0,
            completedWorksheets: completed ?? 0,
            activeTemplates: templates ?? 0,
          });
        }
        if (cancelled) return;
        setCampusStats(campusStatsData);

        // Calculate completed onboarding
        const totalCompleted = campusStatsData.reduce((sum, cs) => sum + cs.completedWorksheets, 0);
        setPlatformStats(prev => ({ ...prev, completedOnboardings: totalCompleted }));

        // Fetch user progress data (all non-super-admin users)
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, role, campus_id, created_at')
          .neq('role', 'super_admin')
          .order('created_at', { ascending: false })
          .limit(100);

        if (cancelled) return;
        const profilesList = (profiles || []) as Array<{
          id: string; full_name: string | null; email: string | null;
          role: string; campus_id: string | null; created_at: string;
        }>;

        // Get submissions for progress tracking
        const { data: submissions } = await supabase
          .from('worksheet_submissions')
          .select('user_id, worksheet_id, review_status');

        const submissionList = (submissions || []) as Array<{
          user_id: string; worksheet_id: string; review_status: string;
        }>;

        if (cancelled) return;

        // Build user progress array
        const progress: UserProgress[] = profilesList.map(profile => {
          const userSubs = submissionList.filter(s => s.user_id === profile.id);
          const campus = campusList.find(c => c.id === profile.campus_id);
          
          // Check phase completion — checks ALL worksheets in each phase are approved
          const approvedIds = new Set(userSubs.filter(s => s.review_status === 'approved' || s.review_status === 'buddy_approved').map(s => s.worksheet_id));
          const phase1Complete = (PHASE_WORKSHEETS_MAP[1] || []).every(wid => approvedIds.has(wid));
          const phase2Complete = (PHASE_WORKSHEETS_MAP[2] || []).every(wid => approvedIds.has(wid));
          const phase3Complete = (PHASE_WORKSHEETS_MAP[3] || []).every(wid => approvedIds.has(wid));
          
          const pendingReviews = userSubs.filter(s => s.review_status === 'pending_review').length;

          return {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            role: profile.role,
            campus_name: campus?.name || 'Unknown',
            phase1Complete,
            phase2Complete,
            phase3Complete,
            pendingReviews,
            lastActive: profile.created_at,
          };
        });

        setUserProgress(progress);
      } catch (err) {
        if (!cancelled) setError('Failed to load dashboard data');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // ── Filter user progress ─────────────────────────────
  const filteredProgress = userProgress.filter(p => {
    if (selectedCampusId !== 'all' && p.campus_name !== campuses.find(c => c.id === selectedCampusId)?.name) return false;
    if (roleFilter !== 'all' && p.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.full_name?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Filter campus stats ──────────────────────────────
  const filteredCampusStats = selectedCampusId === 'all'
    ? campusStats
    : campusStats.filter(cs => cs.campusId === selectedCampusId);

  // ── Stat cards ────────────────────────────────────────
  const statCards = [
    {
      label: 'Total Campuses',
      value: platformStats.totalCampuses,
      sub: `${platformStats.activeCampuses} active`,
      icon: Building,
      color: '#006494',
      bg: 'rgba(0, 100, 148, 0.08)',
    },
    {
      label: 'Total Users',
      value: platformStats.totalUsers,
      sub: `${platformStats.recentSignups} joined this week`,
      icon: Users,
      color: '#2E7D32',
      bg: 'rgba(46, 125, 50, 0.08)',
    },
    {
      label: 'Onboarding Templates',
      value: platformStats.totalTemplates,
      sub: 'Across all campuses',
      icon: FileText,
      color: '#D4A853',
      bg: 'rgba(212, 168, 83, 0.08)',
    },
    {
      label: 'Pending Approvals',
      value: platformStats.pendingApprovals,
      sub: 'Awaiting review',
      icon: Activity,
      color: '#C62828',
      bg: 'rgba(198, 40, 40, 0.08)',
    },
    {
      label: 'Completed Worksheets',
      value: platformStats.completedOnboardings,
      sub: 'Approved submissions',
      icon: CheckCircle,
      color: '#2E7D32',
      bg: 'rgba(46, 125, 50, 0.08)',
    },
  ];

  // ── Role labels ───────────────────────────────────────
  const roleLabels: Record<string, string> = {
    new_joinee: 'New Joiner',
    lab_instructor: 'Lab Instructor',
    lead_instructor: 'Buddy / Mentor',
    academic_head: 'Academic Head',
    onboarding_lead: 'Onboarding Lead',
  };

  const roleColors: Record<string, string> = {
    new_joinee: '#006494',
    lab_instructor: '#625B71',
    lead_instructor: '#2E7D32',
    academic_head: '#C62828',
    onboarding_lead: '#D4A853',
  };

  // ── Render ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center', paddingTop: '6rem' }}>
          <Loader2 size={28} strokeWidth={1.5} className="spin-icon" style={{ color: 'var(--color-warm-grey)' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)', marginTop: '1rem' }}>Loading platform overview…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line" style={{ marginBottom: '1.5rem' }} />
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '2.5rem',
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}>
            Platform Overview
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>
            Monitor onboarding progress across all campuses, track user completion, and manage platform settings.
          </p>
        </div>

        {error && (
          <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>{error}</span>
          </div>
        )}

        {/* Platform Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '2.5rem',
        }}>
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} style={{
                padding: '1.25rem',
                border: '1px solid rgba(26, 26, 26, 0.12)',
                background: 'var(--color-alabaster)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '36px', height: '36px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: card.bg,
                  }}>
                    <Icon size={16} strokeWidth={1.5} style={{ color: card.color }} />
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.75rem',
                  fontWeight: 400,
                  color: 'var(--color-charcoal)',
                  lineHeight: 1,
                  marginBottom: '4px',
                }}>
                  {card.value}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--color-warm-grey)',
                  marginBottom: '2px',
                }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-warm-grey)' }}>
                  {card.sub}
                </div>
              </div>
            );
          })}
        </div>

        {/* Campus Filter + Quick Actions */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          marginBottom: '2rem', flexWrap: 'wrap',
        }}>
          {/* Campus filter */}
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <Building size={14} strokeWidth={1.5} style={{
              position: 'absolute', left: '12px', top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-warm-grey)',
              pointerEvents: 'none', zIndex: 1,
            }} />
            <select
              value={selectedCampusId}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              className="lux-input"
              style={{
                paddingLeft: '36px', fontSize: '0.8rem',
                appearance: 'none', cursor: 'pointer',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23999%27 stroke-width=%272%27%3E%3Cpolyline points=%276 9 12 15 18 9%27/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                paddingRight: '36px',
              }}
            >
              <option value="all">All Campuses</option>
              {campuses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {!c.is_active ? '(inactive)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quick action links */}
          <button onClick={() => navigate('/super-admin/campuses')}
            className="lux-btn lux-btn-sm" style={{ background: '#006494', color: '#FFFFFF' }}>
            <Building size={14} strokeWidth={1.5} /> Manage Campuses
          </button>
          <button onClick={() => navigate('/super-admin/templates')}
            className="lux-btn lux-btn-sm lux-btn-secondary">
            <FileText size={14} strokeWidth={1.5} /> Templates
          </button>
        </div>

        {/* Per-Campus Breakdown */}
        {filteredCampusStats.length > 0 && (
          <>
            <h2 style={{
              fontFamily: 'var(--font-heading)', fontSize: '1.1rem',
              fontWeight: 400, marginBottom: '1rem', color: 'var(--color-charcoal)',
            }}>
              {selectedCampusId === 'all' ? 'Campus Breakdown' : campuses.find(c => c.id === selectedCampusId)?.name}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '2.5rem' }}>
              {filteredCampusStats.map(cs => {
                const completionRate = cs.totalUsers > 0 ? Math.round((cs.completedWorksheets / Math.max(cs.totalUsers * 10, 1)) * 100) : 0;
                return (
                  <div key={cs.campusId} style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr 0.8fr',
                    gap: '8px',
                    padding: '14px 18px',
                    border: '1px solid rgba(26, 26, 26, 0.12)',
                    alignItems: 'center',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-body)',
                  }}>
                    <div style={{ fontWeight: 500, color: 'var(--color-charcoal)' }}>{cs.campusName}</div>
                    <div style={{ color: 'var(--color-warm-grey)' }}>
                      <span style={{ fontWeight: 500, color: '#006494' }}>{cs.totalUsers}</span> users
                    </div>
                    <div style={{ color: 'var(--color-warm-grey)', fontSize: '0.65rem' }}>
                      {cs.newJoiners} joiners · {cs.buddies} buddies
                    </div>
                    <div style={{ color: 'var(--color-warm-grey)', fontSize: '0.65rem' }}>
                      {cs.academicHeads} heads · {cs.onboardingLeads} leads
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      {cs.pendingApprovals > 0 ? (
                        <span style={{ color: '#C62828', fontWeight: 500 }}>
                          {cs.pendingApprovals} pending
                        </span>
                      ) : (
                        <span style={{ color: '#2E7D32' }}>Clear</span>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--color-warm-grey)' }}>
                      {cs.activeTemplates} templates
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '2px 10px',
                        background: completionRate > 50 ? 'rgba(46,125,50,0.08)' : 'rgba(198,40,40,0.06)',
                        color: completionRate > 50 ? '#2E7D32' : '#C62828',
                        fontSize: '0.65rem', fontWeight: 500,
                      }}>
                        {completionRate}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* User Progress Tracking */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1rem', flexWrap: 'wrap', gap: '8px',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)', fontSize: '1.1rem',
            fontWeight: 400, margin: 0, color: 'var(--color-charcoal)',
          }}>
            <Users size={16} strokeWidth={1.5} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--color-warm-grey)' }} />
            People & Progress
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={13} strokeWidth={1.5} style={{
                position: 'absolute', left: '10px', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--color-warm-grey)',
                pointerEvents: 'none', zIndex: 1,
              }} />
              <input
                className="lux-input"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '30px', fontSize: '0.75rem', minWidth: '200px' }}
              />
            </div>
            {/* Role filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="lux-input"
              style={{ fontSize: '0.75rem', minWidth: '130px', cursor: 'pointer' }}
            >
              <option value="all">All Roles</option>
              <option value="new_joinee">New Joiners</option>
              <option value="lead_instructor">Buddies</option>
              <option value="academic_head">Academic Heads</option>
              <option value="onboarding_lead">Onboarding Leads</option>
            </select>
          </div>
        </div>

        {/* User Progress Table */}
        {filteredProgress.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '3rem',
            border: '1px dashed rgba(26, 26, 26, 0.15)',
            fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)',
          }}>
            <Users size={24} strokeWidth={1.5} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
            <p>No users found matching the current filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: 'var(--font-body)', fontSize: '0.75rem',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(26, 26, 26, 0.12)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Role</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Campus</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phase 1</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phase 2</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phase 3</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {filteredProgress.map(p => {
                  const roleLabel = roleLabels[p.role] || p.role;
                  const roleColor = roleColors[p.role] || 'var(--color-warm-grey)';
                  return (
                    <tr key={p.id} style={{
                      borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                      transition: 'background 150ms var(--ease-lux)',
                    }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(26, 26, 26, 0.02)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--color-charcoal)' }}>{p.full_name || 'Unknown'}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>{p.email}</div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          fontSize: '0.6rem', fontWeight: 500,
                          color: roleColor,
                          border: `1px solid ${roleColor}20`,
                          background: `${roleColor}08`,
                        }}>
                          {roleLabel}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>
                        {p.campus_name}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {p.phase1Complete
                          ? <CheckCircle size={14} strokeWidth={1.5} style={{ color: '#2E7D32' }} />
                          : <Clock size={14} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)' }} />
                        }
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {p.phase2Complete
                          ? <CheckCircle size={14} strokeWidth={1.5} style={{ color: '#2E7D32' }} />
                          : <Clock size={14} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)' }} />
                        }
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {p.phase3Complete
                          ? <CheckCircle size={14} strokeWidth={1.5} style={{ color: '#2E7D32' }} />
                          : <Clock size={14} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)' }} />
                        }
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {p.pendingReviews > 0 ? (
                          <span style={{ color: '#C62828', fontWeight: 500, fontSize: '0.85rem' }}>
                            {p.pendingReviews}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-warm-grey)', fontSize: '0.7rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {userProgress.length > 0 && (
          <p style={{
            textAlign: 'center', marginTop: '1.5rem',
            fontFamily: 'var(--font-body)', fontSize: '0.65rem',
            color: 'var(--color-warm-grey)',
          }}>
            Showing {filteredProgress.length} of {userProgress.length} users
            {selectedCampusId !== 'all' ? ` (filtered by campus)` : ''}
            {roleFilter !== 'all' ? ` (${roleFilter} role)` : ''}
          </p>
        )}

        {/* Quick Actions */}
        <div style={{ marginTop: '3rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)', fontSize: '1.1rem',
            fontWeight: 400, marginBottom: '1rem', color: 'var(--color-charcoal)',
          }}>
            Quick Actions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { title: 'Manage Campuses', desc: 'Create, edit, activate/deactivate colleges', path: '/super-admin/campuses', icon: Building, color: '#006494' },
              { title: 'Onboarding Templates', desc: 'Configure weeks, phases, worksheets per campus', path: '/super-admin/templates', icon: FileText, color: '#D4A853' },
              { title: 'Platform Analytics', desc: 'Detailed cross-campus reports — coming soon', path: '#', icon: BarChart3, color: 'var(--color-warm-grey)', disabled: true },
            ].map(link => {
              const Icon = link.icon;
              return (
                <button
                  key={link.title}
                  onClick={() => !link.disabled && navigate(link.path)}
                  disabled={link.disabled}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '18px 22px',
                    border: `1px solid ${link.disabled ? 'rgba(26, 26, 26, 0.06)' : 'rgba(26, 26, 26, 0.12)'}`,
                    background: 'transparent', cursor: link.disabled ? 'default' : 'pointer',
                    textAlign: 'left', width: '100%',
                    opacity: link.disabled ? 0.5 : 1,
                    transition: 'border-color 200ms var(--ease-lux), background 200ms var(--ease-lux)',
                  }}
                  onMouseOver={(e) => { if (!link.disabled) { e.currentTarget.style.borderColor = link.color; e.currentTarget.style.background = `${link.color}08`; }}}
                  onMouseOut={(e) => { if (!link.disabled) { e.currentTarget.style.borderColor = 'rgba(26, 26, 26, 0.12)'; e.currentTarget.style.background = 'transparent'; }}}
                >
                  <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${link.color}10`, flexShrink: 0 }}>
                    <Icon size={18} strokeWidth={1.5} style={{ color: link.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '2px' }}>{link.title}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>{link.desc}</div>
                  </div>
                  {!link.disabled && <ChevronRight size={16} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
