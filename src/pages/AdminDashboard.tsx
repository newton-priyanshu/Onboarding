import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { unwrap, fetchAllPages } from '../api/db';
import { withCampusIf } from '../api/supabase';
import { Users, Clock, RefreshCw, Shield, BadgeCheck, XCircle, AlertCircle, type LucideIcon } from 'lucide-react';
import { PHASE_WORKSHEETS_MAP, getPhaseReviewStatus, type WorksheetSubmission, type UserProfile } from '../config/worksheetConfig';
import { useWorksheetTemplate } from '../hooks/useWorksheetTemplate';
import { REVIEW_STATUS } from '../constants/status';
import { t } from '../config/theme';
import { fetchWithCache, invalidateCacheByPrefix } from '../utils/queryCache';
import PhasesReadyTab from '../components/admin/PhasesReadyTab';
import AssignmentsTab from '../components/admin/AssignmentsTab';
import RosterTab from '../components/admin/RosterTab';
import { SkeletonCard } from '../components/Skeleton';



interface BuddyProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface InstrStats {
  total: number;
  pending: number;
  buddyApproved: number;
  approved: number;
  revision: number;
  notStarted: number;
}

interface PhaseProgress {
  total: number;
  completed: number;
  buddyApproved: number;
  pct: number;
}

interface TabItem {
  id: string;
  label: string;
}

interface StatItem {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { template } = useWorksheetTemplate();
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [, setLeadInstructors] = useState<BuddyProfile[]>([]);
  const [allBuddyProfiles, setAllBuddyProfiles] = useState<BuddyProfile[]>([]);
  const [allWorksheets, setAllWorksheets] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Preserve scroll position on refresh
  const savedScrollY = useRef(0);

  const isManager = profile?.role === 'academic_head' || profile?.role === 'progression_head' || profile?.role === 'ops_head' || profile?.role === 'campus_head' || profile?.role === 'campus_admin';
  const isOnboardingLead = profile?.role === 'onboarding_lead';
  const isCampusAdmin = profile?.role === 'campus_admin';
  const canAssign = isManager || isOnboardingLead || isCampusAdmin;

  useEffect(() => { if (canAssign) loadData();
    // loadData intentionally omitted: closes over fresh canAssign each render
     
  }, [canAssign]);
   

  async function loadData() {
    savedScrollY.current = window.scrollY;
    setLoading(true);
    setLoadError(null);
    try {
      // Step 1: load the visible hires first — everything else is scoped to their IDs
      // so we never pull the entire worksheet_submissions table (H34/H36).
      const campusId = isCampusAdmin ? profile?.campus_id : null;

      const [instrDataRaw, buddyDataRaw] = await Promise.all([
        fetchWithCache(`admin-instructors-${campusId || 'all'}`, () =>
          withCampusIf(
            supabase.from('user_profiles')
              .select('id, full_name, email, role, assigned_lead_id, assigned_buddy_id, created_at')
              .in('role', ['new_joinee', 'lab_instructor'])
              .order('created_at', { ascending: false })
              .limit(500),
            campusId
          ).then(unwrap)
        ),
        fetchWithCache(`admin-buddies-${campusId || 'all'}`, () =>
          withCampusIf(
            supabase.from('user_profiles')
              .select('id, full_name, email, role')
              .not('role', 'in', '("new_joinee","lab_instructor")')
              .limit(500),
            campusId
          ).then(unwrap)
        ),
      ]);
      const instrData = instrDataRaw as unknown as UserProfile[];
      const buddyData = buddyDataRaw as unknown as BuddyProfile[];

      const ids = instrData.map(i => i.id);
      const wsDataRaw = ids.length === 0
        ? []
        : await fetchWithCache(`admin-worksheets-${campusId || 'all'}-${ids.slice().sort().join(',')}`, () =>
            fetchAllPages((from, to) =>
              withCampusIf(
                supabase.from('worksheet_submissions')
                  // review_history is heavy JSONB — fetched lazily per-worksheet on the review page, not in list view.
                  .select('user_id, worksheet_id, review_status, status, updated_at')
                  .in('user_id', ids)
                  .order('updated_at', { ascending: false })
                  .range(from, to),
                campusId
              )
            )
          );
      const wsData = wsDataRaw as unknown as WorksheetSubmission[];

      setInstructors(instrData);
      setAllWorksheets(wsData);
      setLeadInstructors(buddyData.filter((p: BuddyProfile) => p.role === 'academic_head'));
      setAllBuddyProfiles(buddyData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setLoadError('We could not load the dashboard data. Please check your connection and try again.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => window.scrollTo(0, savedScrollY.current));
    }
  }

  if (!canAssign) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Access Restricted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>This dashboard is for Managers and Onboarding Leads.</p>
        </div>
      </div>
    );
  }

  if (loadError && !loading) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: t.error, marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>
            Couldn&apos;t Load Dashboard Data
          </h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, lineHeight: 1.6, marginBottom: '1.5rem' }}>{loadError}</p>
          <button onClick={() => { invalidateCacheByPrefix('admin-'); loadData(); }} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content"><RefreshCw size={14} strokeWidth={1.5} /> Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const getInstrStats = (userId: string): InstrStats => {
    const userWs = allWorksheets.filter(w => w.user_id === userId);
    const pending = userWs.filter(w => w.review_status === REVIEW_STATUS.PENDING_REVIEW || w.review_status === REVIEW_STATUS.REVISION_SUBMITTED).length;
    const buddyApproved = userWs.filter(w => w.review_status === REVIEW_STATUS.BUDDY_APPROVED).length;
    const approved = userWs.filter(w => w.review_status === REVIEW_STATUS.APPROVED).length;
    const revision = userWs.filter(w => w.review_status === REVIEW_STATUS.NEEDS_REVISION).length;
    return { total: userWs.length, pending, buddyApproved, approved, revision, notStarted: 20 - userWs.length };
  };

  const getPhaseProgress = (userId: string, phase: number): PhaseProgress => {
    const wsList = PHASE_WORKSHEETS_MAP[phase] || [];
    const userWs = allWorksheets.filter(w => w.user_id === userId && wsList.includes(w.worksheet_id));
    const completed = userWs.filter(w => w.review_status === REVIEW_STATUS.APPROVED).length;
    const buddyApproved = userWs.filter(w => w.review_status === REVIEW_STATUS.BUDDY_APPROVED).length;
    return { total: wsList.length, completed, buddyApproved, pct: wsList.length ? Math.round(((completed + buddyApproved) / wsList.length) * 100) : 0 };
  };

  const getReadyPhases = (userId: string): number[] => {
    const ready: number[] = [];
    for (const phaseNum of [1, 2, 3]) {
      const status = getPhaseReviewStatus(phaseNum, allWorksheets, userId, template);
      if (status.ready) ready.push(phaseNum);
    }
    return ready;
  };

  const filterInstructors = (): UserProfile[] => {
    let filtered = instructors;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(instr => {
        const s = getInstrStats(instr.id);
        if (statusFilter === 'pending') return s.pending > 0;
        if (statusFilter === REVIEW_STATUS.BUDDY_APPROVED) {
          return getReadyPhases(instr.id).length > 0;
        }
        if (statusFilter === REVIEW_STATUS.APPROVED) return s.approved > 0;
        if (statusFilter === 'revision') return s.revision > 0;
        if (statusFilter === 'not_started') return s.total === 0;
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(instr =>
        instr.full_name?.toLowerCase().includes(q) ||
        instr.email?.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const totalPending = allWorksheets.filter(w => w.review_status === REVIEW_STATUS.PENDING_REVIEW || w.review_status === REVIEW_STATUS.REVISION_SUBMITTED).length;
  const totalBuddyApproved = allWorksheets.filter(w => w.review_status === REVIEW_STATUS.BUDDY_APPROVED).length;
  const totalApproved = allWorksheets.filter(w => w.review_status === REVIEW_STATUS.APPROVED).length;
  const totalRevision = allWorksheets.filter(w => w.review_status === REVIEW_STATUS.NEEDS_REVISION).length;

  // Count actual phases ready (across all instructors)
  const totalReadyPhases = instructors.reduce((count, instr) => {
    for (const phaseNum of [1, 2, 3]) {
      if (getPhaseReviewStatus(phaseNum, allWorksheets, instr.id, template).ready) count++;
    }
    return count;
  }, 0);

  const tabs: TabItem[] = [
    { id: 'overview', label: `Overview` },
    { id: 'roster', label: `Roster (${instructors.length})` },
    { id: 'pending_review', label: `Phases Ready (${totalReadyPhases > 0 ? totalReadyPhases : '0'})` },
    ...(canAssign ? [{ id: 'assignments' as const, label: 'Assignments' }] : []),
  ];

  const statusFilters = ['all', 'pending', REVIEW_STATUS.BUDDY_APPROVED, REVIEW_STATUS.APPROVED, 'revision', 'not_started'];

  const statItems: StatItem[] = [
    { label: 'Joinees', value: instructors.length, icon: Users, color: t.ch },
    { label: 'Pending Review', value: totalPending, icon: Clock, color: t.gd },
    { label: 'Buddy Approved', value: totalBuddyApproved, icon: Shield, color: t.purple },
    { label: 'Approved', value: totalApproved, icon: BadgeCheck, color: t.success },
    ...(isManager ? [{ label: 'Revision' as const, value: totalRevision, icon: XCircle as LucideIcon, color: t.error }] : []),
  ];

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Admin Dashboard</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                {isCampusAdmin ? 'Campus Admin' : isManager ? (profile?.role === 'campus_head' ? 'Campus Head' : profile?.role === 'progression_head' ? 'Progression Head' : profile?.role === 'ops_head' ? 'Ops Head' : 'Academic Head') : 'Onboarding Lead'} · {isManager ? 'Approve phases · ' : 'Monitor · '} {instructors.length} joinee(s)
                {isCampusAdmin && profile?.campus_id && (
                  <span style={{ marginLeft: '8px', opacity: 0.6 }}>· Campus-scoped view</span>
                )}
              </p>
            </div>
            <button onClick={() => { invalidateCacheByPrefix('admin-'); loadData(); }} disabled={loading} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 20px', cursor: 'pointer',
              transition: 'all 200ms ' + t.ease,
            }}>
              <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '6px' }} /> Refresh
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2.5rem' }}>
          {statItems.map((item, i) => (
            <div key={i} style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
              <item.icon size={20} strokeWidth={1.5} style={{ color: item.color, marginBottom: '8px' }} />
              <p style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, color: t.ch, marginBottom: '4px' }}>{item.value}</p>
              <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(26, 26, 26, 0.12)', marginBottom: '2rem' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', padding: '12px 24px', cursor: 'pointer',
              color: activeTab === tab.id ? t.ch : t.wg,
              borderBottom: activeTab === tab.id ? '1px solid ' + t.ch : '1px solid transparent',
              transition: 'color 200ms ' + t.ease + ', border-color 200ms ' + t.ease,
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {statusFilters.map(f => (
                <button key={f} onClick={() => setStatusFilter(f)} style={{
                  fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                  background: statusFilter === f ? t.ch : 'transparent',
                  border: '1px solid ' + (statusFilter === f ? t.ch : 'rgba(26,26,26,0.2)'),
                  color: statusFilter === f ? '#F9F8F6' : t.wg,
                  padding: '6px 16px', cursor: 'pointer',
                  transition: 'all 200ms ' + t.ease,
                }}>
                  {f === 'all' ? 'All' : f === REVIEW_STATUS.BUDDY_APPROVED ? 'Buddy Approved' : f === 'not_started' ? 'Not Started' : f === REVIEW_STATUS.APPROVED ? 'Approved' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input type="text" placeholder="Search by name or email…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="lux-input" style={{ fontSize: '0.8rem' }} />
            </div>
            {loading ? (
              <div style={{ padding: '2rem' }}><SkeletonCard count={5} /></div>
            ) : filterInstructors().length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg }}>No instructors match the current filter. Try adjusting your search or filter criteria.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filterInstructors().map((instr, idx) => {
                  const s = getInstrStats(instr.id);
                  const readyPhases = getReadyPhases(instr.id);
                  return (
                    <div key={instr.id} style={{
                      borderTop: '1px solid rgba(26, 26, 26, 0.08)', padding: '1.25rem 0',
                      opacity: 0, animation: `luxFadeIn 0.5s ${idx * 0.04}s forwards`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ width: '40px', height: '40px', border: '1px solid ' + t.ch, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '0.9rem', fontWeight: 500, color: t.ch }}>
                          {instr.full_name?.charAt(0) || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{instr.full_name}</span>
                            <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + (instr.assigned_lead_id ? t.purple : t.warning), color: instr.assigned_lead_id ? t.purple : t.warning }}>
                              {instr.assigned_lead_id ? 'Manager Assigned' : 'No Manager'}
                            </span>
                            <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + (instr.assigned_buddy_id ? t.info : t.warning), color: instr.assigned_buddy_id ? t.info : t.warning }}>
                              {instr.assigned_buddy_id ? 'Buddy Assigned' : 'No Buddy'}
                            </span>
                          </div>
                          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>{instr.email}</p>

                          {/* Phase progress */}
                          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '8px', flexWrap: 'wrap' }}>
                            {[1, 2, 3].map(phaseNum => {
                              const p = getPhaseProgress(instr.id, phaseNum);
                              const phaseReady = readyPhases.includes(phaseNum);
                              const wsList = PHASE_WORKSHEETS_MAP[phaseNum] || [];
                              const hasSubmissions = allWorksheets.some(w => w.user_id === instr.id && wsList.includes(w.worksheet_id));
                              return (
                                <div key={phaseNum} style={{ minWidth: '80px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>Phase {phaseNum}</span>
                                    <span style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg }}>
                                      {p.completed}/{p.total}
                                      {p.buddyApproved > 0 && ` (+${p.buddyApproved} ready)`}
                                    </span>
                                  </div>
                                  <div className="lux-progress" style={{ height: '2px' }}>
                                    <div className="lux-progress-fill" style={{ width: `${p.pct}%`, background: phaseReady ? t.purple : p.pct === 100 ? t.success : t.ch }} />
                                  </div>
                                  {/* Academic head: always show navigation when phase has submissions */}
                                  {isManager && hasSubmissions && (
                                    <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/review-phase/${instr.id}/${phaseNum}`); }}
                                      style={{
                                        fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.1em',
                                        marginTop: '4px', padding: '2px 6px',
                                        background: phaseReady ? t.purple : 'transparent',
                                        color: phaseReady ? '#FFF' : t.ch,
                                        border: `1px solid ${phaseReady ? t.purple : t.ch}`,
                                        cursor: 'pointer', width: '100%',
                                        transition: 'all 200ms ' + t.ease,
                                      }}>
                                      {phaseReady ? 'Approve Phase' : 'View Phase'}
                                    </button>
                                  )}
                                  {phaseReady && isOnboardingLead && (
                                    <span style={{ fontFamily: t.body, fontSize: '0.5rem', marginTop: '4px', display: 'block', color: t.info }}>
                                      ✓ Phase ready
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Status badges */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {s.pending > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + t.gd, color: t.gd }}>{s.pending} pending</span>}
                            {s.buddyApproved > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + t.purple, color: t.purple }}>{s.buddyApproved} buddy approved</span>}
                            {s.approved > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + t.success, color: t.success }}>{s.approved} approved</span>}
                            {s.revision > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + t.error, color: t.error }}>{s.revision} revision</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Roster Tab — Joinee list with buddy/manager assignments */}
        {activeTab === 'roster' && <RosterTab instructors={instructors} buddyProfiles={allBuddyProfiles} campusId={profile?.campus_id} />}

        {/* Pending Review Tab — Phases Ready for Manager */}
        {activeTab === 'pending_review' && <PhasesReadyTab allWorksheets={allWorksheets} instructors={instructors} isManager={isManager} campusId={profile?.campus_id} />}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && <AssignmentsTab instructors={instructors} buddyProfiles={allBuddyProfiles} onRefresh={loadData} campusId={profile?.campus_id} />}
      </div>
    </div>
  );
}


