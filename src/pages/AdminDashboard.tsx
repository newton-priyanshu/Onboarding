import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { Users, Clock, RefreshCw, Briefcase, User, Shield, BadgeCheck, XCircle, LucideIcon } from 'lucide-react';
import { PHASE_WORKSHEETS_MAP, getPhaseReviewStatus, type WorksheetSubmission, type UserProfile } from '../config/worksheetConfig';
import { triggerNotification } from '../hooks/useNotifications';
import { t } from '../config/theme';



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
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [, setLeadInstructors] = useState<BuddyProfile[]>([]);
  const [allBuddyProfiles, setAllBuddyProfiles] = useState<BuddyProfile[]>([]);
  const [allWorksheets, setAllWorksheets] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isManager = profile?.role === 'academic_head';
  const isOnboardingLead = profile?.role === 'onboarding_lead';
  const canAssign = isManager || isOnboardingLead;

  useEffect(() => { if (canAssign) loadData(); }, [canAssign]);

  async function loadData() {
    setLoading(true);
    try {
      const queries = [
        supabase.from('user_profiles').select('*').in('role', ['new_joinee', 'lab_instructor']).order('created_at', { ascending: false }),
        supabase.from('worksheet_submissions').select('*'),
        supabase.from('user_profiles').select('id, full_name, email, role').not('role', 'in', '("new_joinee","lab_instructor")'),
      ];
      const results = await Promise.all(queries);
      const instrRes = results[0];
      const wsRes = results[1];
      const buddyRes = results[2];
      if (instrRes?.data) setInstructors(instrRes.data as unknown as UserProfile[]);
      if (wsRes?.data) setAllWorksheets(wsRes.data as unknown as WorksheetSubmission[]);
      if (buddyRes?.data) {
        setLeadInstructors(buddyRes.data.filter((p: BuddyProfile) => p.role === 'academic_head'));
        setAllBuddyProfiles(buddyRes.data);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
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

  const getInstrStats = (userId: string): InstrStats => {
    const userWs = allWorksheets.filter(w => w.user_id === userId);
    const pending = userWs.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted').length;
    const buddyApproved = userWs.filter(w => w.review_status === 'buddy_approved').length;
    const approved = userWs.filter(w => w.review_status === 'approved').length;
    const revision = userWs.filter(w => w.review_status === 'needs_revision').length;
    return { total: userWs.length, pending, buddyApproved, approved, revision, notStarted: 20 - userWs.length };
  };

  const getPhaseProgress = (userId: string, phase: number): PhaseProgress => {
    const wsList = PHASE_WORKSHEETS_MAP[phase] || [];
    const userWs = allWorksheets.filter(w => w.user_id === userId && wsList.includes(w.worksheet_id));
    const completed = userWs.filter(w => w.review_status === 'approved').length;
    const buddyApproved = userWs.filter(w => w.review_status === 'buddy_approved').length;
    return { total: wsList.length, completed, buddyApproved, pct: wsList.length ? Math.round(((completed + buddyApproved) / wsList.length) * 100) : 0 };
  };

  const getReadyPhases = (userId: string): number[] => {
    const ready: number[] = [];
    for (const phaseNum of [1, 2, 3]) {
      const status = getPhaseReviewStatus(phaseNum, allWorksheets, userId);
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
        if (statusFilter === 'buddy_approved') {
          return getReadyPhases(instr.id).length > 0;
        }
        if (statusFilter === 'approved') return s.approved > 0;
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

  const totalPending = allWorksheets.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted').length;
  const totalBuddyApproved = allWorksheets.filter(w => w.review_status === 'buddy_approved').length;
  const totalApproved = allWorksheets.filter(w => w.review_status === 'approved').length;
  const totalRevision = allWorksheets.filter(w => w.review_status === 'needs_revision').length;

  // Count actual phases ready (across all instructors)
  const totalReadyPhases = instructors.reduce((count, instr) => {
    for (const phaseNum of [1, 2, 3]) {
      if (getPhaseReviewStatus(phaseNum, allWorksheets, instr.id).ready) count++;
    }
    return count;
  }, 0);

  const tabs: TabItem[] = [
    { id: 'overview', label: `Overview` },
    { id: 'pending_review', label: `Phases Ready (${totalReadyPhases > 0 ? totalReadyPhases : '0'})` },
    ...(canAssign ? [{ id: 'assignments' as const, label: 'Assignments' }] : []),
  ];

  const statusFilters = ['all', 'pending', 'buddy_approved', 'approved', 'revision', 'not_started'];

  const statItems: StatItem[] = [
    { label: 'Joinees', value: instructors.length, icon: Users, color: t.ch },
    { label: 'Pending Review', value: totalPending, icon: Clock, color: '#D4AF37' },
    { label: 'Buddy Approved', value: totalBuddyApproved, icon: Shield, color: '#381E72' },
    { label: 'Approved', value: totalApproved, icon: BadgeCheck, color: '#1B5E20' },
    ...(isManager ? [{ label: 'Revision' as const, value: totalRevision, icon: XCircle as LucideIcon, color: '#C62828' }] : []),
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
                {isManager ? 'Academic Head' : 'Onboarding Lead'} · {isManager ? 'Approve phases · ' : 'Monitor · '} {instructors.length} joinee(s)
              </p>
            </div>
            <button onClick={loadData} disabled={loading} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 20px', cursor: 'pointer',
              transition: 'all 500ms ' + t.ease,
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
              transition: 'color 500ms ' + t.ease + ', border-color 500ms ' + t.ease,
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
                  transition: 'all 500ms ' + t.ease,
                }}>
                  {f === 'all' ? 'All' : f === 'buddy_approved' ? 'Buddy Approved' : f === 'not_started' ? 'Not Started' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input type="text" placeholder="Search by name or email…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="lux-input" style={{ fontSize: '0.8rem' }} />
            </div>
            {loading ? (
              <div style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, textAlign: 'center', padding: '3rem' }}>Loading...</div>
            ) : filterInstructors().length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>No instructors match this filter.</p>
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
                            <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + (instr.assigned_lead_id ? '#381E72' : '#F57F17'), color: instr.assigned_lead_id ? '#381E72' : '#F57F17' }}>
                              {instr.assigned_lead_id ? 'Manager Assigned' : 'No Manager'}
                            </span>
                            <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + (instr.assigned_buddy_id ? '#0369A1' : '#F57F17'), color: instr.assigned_buddy_id ? '#0369A1' : '#F57F17' }}>
                              {instr.assigned_buddy_id ? 'Buddy Assigned' : 'No Buddy'}
                            </span>
                          </div>
                          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>{instr.email}</p>

                          {/* Phase progress */}
                          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '8px', flexWrap: 'wrap' }}>
                            {[1, 2, 3].map(phaseNum => {
                              const p = getPhaseProgress(instr.id, phaseNum);
                              const phaseReady = readyPhases.includes(phaseNum);
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
                                    <div className="lux-progress-fill" style={{ width: `${p.pct}%`, background: phaseReady ? '#381E72' : p.pct === 100 ? '#1B5E20' : t.ch }} />
                                  </div>
                                  {phaseReady && isManager && (
                                    <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/review-phase/${instr.id}/${phaseNum}`); }}
                                      style={{
                                        fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.1em',
                                        marginTop: '4px', padding: '2px 6px', background: '#381E72', color: '#FFF',
                                        border: 'none', cursor: 'pointer', width: '100%',
                                      }}>
                                      Review Phase
                                    </button>
                                  )}
                                  {phaseReady && isOnboardingLead && (
                                    <span style={{ fontFamily: t.body, fontSize: '0.5rem', marginTop: '4px', display: 'block', color: '#0369A1' }}>
                                      ✓ Phase ready
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Status badges */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {s.pending > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #D4AF37', color: '#D4AF37' }}>{s.pending} pending</span>}
                            {s.buddyApproved > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #381E72', color: '#381E72' }}>{s.buddyApproved} buddy approved</span>}
                            {s.approved > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #1B5E20', color: '#1B5E20' }}>{s.approved} approved</span>}
                            {s.revision > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #C62828', color: '#C62828' }}>{s.revision} revision</span>}
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

        {/* Pending Review Tab — Phases Ready for Manager */}
        {activeTab === 'pending_review' && <PhasesReadyTab allWorksheets={allWorksheets} instructors={instructors} isManager={isManager} />}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && <AssignmentsTab instructors={instructors} buddyProfiles={allBuddyProfiles} onRefresh={loadData} />}
      </div>
    </div>
  );
}

/** Shows phases that are ready for manager approval */
function PhasesReadyTab({ allWorksheets, instructors, isManager }: {
  allWorksheets: WorksheetSubmission[];
  instructors: UserProfile[];
  isManager: boolean;
}) {
  const navigate = useNavigate();

  // Collect all joinees that have a phase ready
  const readyEntries: { userId: string; userName: string; phaseNum: number; status: ReturnType<typeof getPhaseReviewStatus> }[] = [];
  instructors.forEach(instr => {
    for (const phaseNum of [1, 2, 3]) {
      const status = getPhaseReviewStatus(phaseNum, allWorksheets, instr.id);
      if (status.ready) {
        readyEntries.push({ userId: instr.id, userName: instr.full_name || instr.id, phaseNum, status });
      }
    }
  });

  if (readyEntries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>All Caught Up</p>
        <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>No phases are ready for manager approval. Buddy-approved worksheets will appear here once all worksheets in a phase are complete.</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.5rem' }}>
        Phases Ready for {isManager ? 'Manager Approval' : 'Monitoring'} ({readyEntries.length})
      </p>
      {readyEntries.map((entry, idx) => (
        <div key={`${entry.userId}-${entry.phaseNum}`} style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0',
          borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
          opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
        }}>
          <div style={{ width: '40px', height: '40px', border: '1px solid #381E72', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={18} strokeWidth={1.5} style={{ color: '#381E72' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>
              {entry.userName}
              <span style={{ color: t.wg, fontWeight: 400 }}> · Phase {entry.phaseNum} ready</span>
            </p>
            <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>
              {entry.status.buddyApproved}/{entry.status.total} worksheets buddy-approved
            </p>
          </div>
          {isManager ? (
            <button onClick={() => navigate(`/admin/review-phase/${entry.userId}/${entry.phaseNum}`)}
              style={{
                fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                padding: '8px 20px', border: '1px solid #381E72', background: '#381E72', color: '#FFF', cursor: 'pointer',
              }}>
              Approve Phase
            </button>
          ) : (
            <button onClick={() => navigate(`/onboarding-lead/review-phase/${entry.userId}/${entry.phaseNum}`)}
              style={{
                fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                padding: '8px 20px', border: '1px solid #0369A1', background: 'transparent', color: '#0369A1', cursor: 'pointer',
              }}>
              View Phase
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AssignmentsTab({ instructors, buddyProfiles, onRefresh }: {
  instructors: UserProfile[];
  buddyProfiles: BuddyProfile[];
  onRefresh: () => void;
}) {
  const { profile } = useAuth();
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedBuddy, setSelectedBuddy] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const buddyCandidates = buddyProfiles.filter(i => i.id !== selectedInstructor);

  const assignedInstructors = instructors.filter(i => i.assigned_lead_id || i.assigned_buddy_id);
  const unassignedInstructors = instructors.filter(i => !i.assigned_lead_id && !i.assigned_buddy_id);

  const styleLabel: React.CSSProperties = { fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '8px' };
  const styleSelect: React.CSSProperties = { fontFamily: t.body, fontSize: '0.8rem', color: t.ch, width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid ' + t.ch, background: 'transparent', outline: 'none', marginBottom: '1.5rem' };

  const btnPrimary: React.CSSProperties = { fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 20px', border: '1px solid ' + t.ch, background: t.ch, color: '#F9F8F6', cursor: 'pointer', transition: 'all 500ms ' + t.ease };

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.5rem' }}>
        Assign Manager & Buddy
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <label style={styleLabel} htmlFor="assign-joinee">Joinee</label>
          <select id="assign-joinee" name="assign-joinee" style={styleSelect} value={selectedInstructor} onChange={e => { setSelectedInstructor(e.target.value); setMessage(''); }}>
            <option value="">Select...</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id}>{i.full_name} {i.assigned_lead_id ? '(managed)' : ''} {i.assigned_buddy_id ? '(buddy)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={styleLabel} htmlFor="assign-manager">Manager</label>
          <select id="assign-manager" name="assign-manager" style={styleSelect} value={selectedManager} onChange={e => setSelectedManager(e.target.value)}>
            <option value="">Select...</option>
            {buddyCandidates.filter(p => p.role === 'academic_head').map(b => (<option key={b.id} value={b.id}>{b.full_name}</option>))}
          </select>
        </div>
        <div>
          <label style={styleLabel} htmlFor="assign-buddy">Buddy / Mentor</label>
          <select id="assign-buddy" name="assign-buddy" style={styleSelect} value={selectedBuddy} onChange={e => setSelectedBuddy(e.target.value)}>
            <option value="">Select...</option>
            {buddyCandidates.filter(p => p.role === 'lead_instructor' || p.role === 'onboarding_lead').map(b => (
              <option key={b.id} value={b.id}>{b.full_name} · {b.role === 'lead_instructor' ? 'Buddy / Mentor' : 'Onboarding Lead'}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button onClick={async () => {
          if (!selectedInstructor || !selectedManager) { setMessage('Select a joinee and a manager.'); return; }
          setSaving(true); setMessage('');
          const { error } = await supabase.from('user_profiles').update({ assigned_lead_id: selectedManager || null }).eq('id', selectedInstructor);
          if (!error) {
            const managerName = buddyProfiles.find(p => p.id === selectedManager)?.full_name || 'Manager';
            const joineeName = instructors.find(p => p.id === selectedInstructor)?.full_name || 'Joinee';
            await triggerNotification({
              userId: selectedInstructor,
              fromUserId: profile?.id,
              worksheetId: '',
              type: 'approved',
              message: `A manager (${managerName}) has been assigned to you. They will oversee your Phase 2 & 3 approvals.`,
            });
            await triggerNotification({
              userId: selectedManager,
              fromUserId: profile?.id,
              worksheetId: '',
              type: 'submitted',
              message: `You have been assigned as the manager for ${joineeName}. Review their progress in the dashboard.`,
            });
          }
          setMessage(error ? 'Error: ' + error.message : 'Manager assigned!');
          onRefresh(); setSaving(false);
        }} disabled={saving} style={btnPrimary}>
          <Briefcase size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Assign Manager
        </button>
        <button onClick={async () => {
          if (!selectedInstructor || !selectedBuddy) { setMessage('Select a joinee and a buddy.'); return; }
          setSaving(true); setMessage('');
          const { error } = await supabase.from('user_profiles').update({ assigned_buddy_id: selectedBuddy || null }).eq('id', selectedInstructor);
          if (!error) {
            const buddyName = buddyProfiles.find(p => p.id === selectedBuddy)?.full_name || 'Buddy';
            const joineeName = instructors.find(p => p.id === selectedInstructor)?.full_name || 'Joinee';
            await triggerNotification({
              userId: selectedInstructor,
              fromUserId: profile?.id,
              worksheetId: '',
              type: 'approved',
              message: `A buddy/mentor (${buddyName}) has been assigned to you. They will review your Phase 1 worksheets.`,
            });
            await triggerNotification({
              userId: selectedBuddy,
              fromUserId: profile?.id,
              worksheetId: '',
              type: 'submitted',
              message: `You have been assigned as the buddy/mentor for ${joineeName}. Their worksheets will appear in your review dashboard.`,
            });
          }
          setMessage(error ? 'Error: ' + error.message : 'Buddy assigned!');
          onRefresh(); setSaving(false);
        }} disabled={saving} style={btnPrimary}>
          <User size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Assign Buddy
        </button>
      </div>

      {message && <div style={{ fontFamily: t.body, fontSize: '0.75rem', color: message.includes('Error') ? '#C62828' : '#1B5E20', marginBottom: '1rem' }}>{message}</div>}

      {/* Current assignments */}
      <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)', paddingTop: '1.5rem' }}>
        <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '0.75rem' }}>
          Current Assignments ({assignedInstructors.length})
        </p>
        {assignedInstructors.length === 0 ? (
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>No assignments yet.</p>
        ) : (
          assignedInstructors.map(instr => {
            const manager = buddyProfiles.find(l => l.id === instr.assigned_lead_id);
            const buddy = buddyProfiles.find(b => b.id === instr.assigned_buddy_id);
            return (
              <div key={instr.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 600, color: t.ch, minWidth: '120px' }}>{instr.full_name}</span>
                <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #381E72', color: '#381E72' }}>
                  Manager: {manager?.full_name || '—'}
                </span>
                <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #0369A1', color: '#0369A1' }}>
                  Buddy: {buddy?.full_name || '—'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '0.75rem' }}>
          Unassigned ({unassignedInstructors.length})
        </p>
        {unassignedInstructors.map(instr => (
          <div key={instr.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch }}>{instr.full_name}</span>
            <span style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{instr.email}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
