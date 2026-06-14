import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { Users, ClipboardCheck, UserPlus, CheckCircle2, Clock, AlertCircle, ArrowRight, RefreshCw, UserCheck, Briefcase, User, Shield } from 'lucide-react';
import { WORKSHEET_REVIEWER, REVIEWER_LABELS, REVIEWER_STYLES } from '../worksheetConfig.jsx';

const WORKSHEET_NAMES = {
  p1_w1: 'Team Introduction', p1_w2: 'Faculty Mentor Sync', p1_w3: 'Teaching Philosophy',
  p1_w4: 'University Governance', p1_w5: 'Portal Walkthrough', p1_w6: 'Observation Journal',
  p1_w7: 'Courseware Review', p1_w8: 'Slack Audit', gc1: 'Gate Control 1',
  p2_w1: 'Doubt Resolution', p2_w2: 'Lab Scorecard', p2_w3: 'Content Ledger',
  p2_w4: 'Portal Ops Check', gc2: 'Gate Control 2',
  p3_w1: 'Lecture Delivery', p3_w2: 'Cohort Profiling', p3_w3: 'Assessment Blueprint',
  p3_w4: 'Pedagogical Journal', p3_w5: 'Course Proposal', gc3: 'Gate Control 3',
};

const PHASE_WORKSHEETS = {
  'Phase 1': ['p1_w1', 'p1_w2', 'p1_w3', 'p1_w4', 'p1_w5', 'p1_w6', 'p1_w7', 'p1_w8', 'gc1'],
  'Phase 2': ['p2_w1', 'p2_w2', 'p2_w3', 'p2_w4', 'gc2'],
  'Phase 3': ['p3_w1', 'p3_w2', 'p3_w3', 'p3_w4', 'p3_w5', 'gc3'],
};

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [instructors, setInstructors] = useState([]);
  const [leadInstructors, setLeadInstructors] = useState([]);
  const [allWorksheets, setAllWorksheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('all');

  const isLead = ['academic_head', 'onboarding_lead'].includes(profile?.role);
  const isManager = profile?.role === 'academic_head';

  useEffect(() => { if (isLead) loadData(); }, [isLead]);

  async function loadData() {
    setLoading(true);
    // Only fetch lead instructors (needed for assignments tab) if user is academic_head
    const queries = [
      supabase.from('user_profiles').select('*').in('role', ['new_joinee', 'lab_instructor']).order('created_at', { ascending: false }),
      supabase.from('worksheet_submissions').select('*'),
    ];
    if (isManager) {
      queries.push(supabase.from('user_profiles').select('id, full_name, email').eq('role', 'lead_instructor'));
    }
    const [instrRes, wsRes, leadsRes] = await Promise.all(queries);
    if (instrRes.data) setInstructors(instrRes.data);
    if (wsRes.data) setAllWorksheets(wsRes.data);
    if (leadsRes?.data) setLeadInstructors(leadsRes.data);
    setLoading(false);
  }

  if (!isLead) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Access Restricted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>This dashboard is for Academic Heads and Onboarding Leads.</p>
        </div>
      </div>
    );
  }

  const getInstrStats = (userId) => {
    const userWs = allWorksheets.filter(w => w.user_id === userId);
    const pending = userWs.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted').length;
    const approved = userWs.filter(w => w.review_status === 'approved').length;
    const revision = userWs.filter(w => w.review_status === 'needs_revision').length;
    return { total: userWs.length, pending, approved, revision, notStarted: 20 - userWs.length };
  };

  const getPhaseProgress = (userId, phase) => {
    const wsList = PHASE_WORKSHEETS[phase] || [];
    const userWs = allWorksheets.filter(w => w.user_id === userId && wsList.includes(w.worksheet_id));
    const completed = userWs.filter(w => w.review_status === 'approved').length;
    return { total: wsList.length, completed, pct: wsList.length ? Math.round((completed / wsList.length) * 100) : 0 };
  };

  const getReviewerStats = (userId) => {
    const stats = { buddy: { total: 0, pending: 0, approved: 0 }, manager: { total: 0, pending: 0, approved: 0 }, onboarding_lead: { total: 0, pending: 0, approved: 0 } };
    allWorksheets.filter(w => w.user_id === userId).forEach(w => {
      const type = WORKSHEET_REVIEWER[w.worksheet_id] || 'manager';
      if (stats[type]) { stats[type].total++; if (w.review_status === 'pending_review' || w.review_status === 'revision_submitted') stats[type].pending++; if (w.review_status === 'approved') stats[type].approved++; }
    });
    return stats;
  };

  const filterInstructors = () => {
    if (statusFilter === 'all') return instructors;
    return instructors.filter(instr => {
      const s = getInstrStats(instr.id);
      if (statusFilter === 'pending') return s.pending > 0;
      if (statusFilter === 'approved') return s.approved > 0;
      if (statusFilter === 'revision') return s.revision > 0;
      if (statusFilter === 'not_started') return s.total === 0;
      return true;
    });
  };

  const totalPending = allWorksheets.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted').length;
  const totalApproved = allWorksheets.filter(w => w.review_status === 'approved').length;
  const totalRevision = allWorksheets.filter(w => w.review_status === 'needs_revision').length;

  const tabs = [
    { id: 'overview', label: `Overview` },
    { id: 'pending_review', label: `Pending (${totalPending})` },
    ...(isManager ? [{ id: 'assignments', label: 'Assignments' }] : []),
  ];

  const statusFilters = ['all', 'pending', 'approved', 'revision', 'not_started'];

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
                {profile?.role === 'onboarding_lead' ? 'Onboarding Lead' : 'Academic Head'} · Overseeing {instructors.length} joinee(s)
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2.5rem' }}>
          {[
            { label: 'Joinees', value: instructors.length },
            { label: 'Pending', value: totalPending },
            { label: 'Approved', value: totalApproved },
            { label: 'Revision', value: totalRevision },
          ].map((item, i) => (
            <div key={i} style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {statusFilters.map(f => (
                <button key={f} onClick={() => setStatusFilter(f)} style={{
                  fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                  background: statusFilter === f ? t.ch : 'transparent',
                  border: '1px solid ' + (statusFilter === f ? t.ch : 'rgba(26,26,26,0.2)'),
                  color: statusFilter === f ? '#F9F8F6' : t.wg,
                  padding: '6px 16px', cursor: 'pointer',
                  transition: 'all 500ms ' + t.ease,
                }}>
                  {f === 'all' ? 'All' : f === 'not_started' ? 'Not Started' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
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
                  const rStats = getReviewerStats(instr.id);
                  return (
                    <div key={instr.id} style={{
                      borderTop: '1px solid rgba(26, 26, 26, 0.08)',
                      padding: '1.25rem 0',
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
                            {Object.entries(PHASE_WORKSHEETS).map(([phase, wsList]) => {
                              const p = getPhaseProgress(instr.id, phase);
                              return (
                                <div key={phase} style={{ minWidth: '80px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>{phase}</span>
                                    <span style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg }}>{p.completed}/{p.total}</span>
                                  </div>
                                  <div className="lux-progress" style={{ height: '2px' }}>
                                    <div className="lux-progress-fill" style={{ width: `${p.pct}%`, background: p.pct === 100 ? '#1B5E20' : t.ch }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Status badges */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {s.pending > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #7D5260', color: '#7D5260' }}>{s.pending} pending</span>}
                            {s.approved > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #1B5E20', color: '#1B5E20' }}>{s.approved} approved</span>}
                            {s.revision > 0 && <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #C62828', color: '#C62828' }}>{s.revision} revision</span>}
                          </div>
                        </div>
                        <div style={{ alignSelf: 'center', fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.wg }}>
                          {s.pending > 0 ? `${s.pending} pending` : s.approved > 0 ? `${s.approved} approved` : 'No submissions'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pending Review Tab */}
        {activeTab === 'pending_review' && <PendingReviewTab allWorksheets={allWorksheets} />}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && <AssignmentsTab instructors={instructors} leadInstructors={leadInstructors} onRefresh={loadData} />}
      </div>
    </div>
  );
}

function PendingReviewTab({ allWorksheets }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from('user_profiles').select('id, full_name, email');
      const map = {};
      if (profiles) profiles.forEach(p => { map[p.id] = p; });
      const { data: subs } = await supabase.from('worksheet_submissions').select('*').in('review_status', ['pending_review', 'revision_submitted']).order('updated_at', { ascending: false });
      if (subs) setPending(subs.map(s => ({ ...s, user_profiles: map[s.user_id] || { full_name: 'Unknown', email: '' } })));
      setLoading(false);
    })();
  }, [allWorksheets]);

  if (loading) return <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, textAlign: 'center', padding: '2rem' }}>Loading...</p>;

  const grouped = { buddy: [], manager: [], onboarding_lead: [] };
  pending.forEach(ws => {
    const type = WORKSHEET_REVIEWER[ws.worksheet_id] || 'manager';
    if (grouped[type]) grouped[type].push(ws);
  });

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem' }}>
        Pending Reviews ({pending.length})
      </p>
      {pending.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>All Caught Up</p>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>No worksheets pending review across all instructors.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([type, sheets]) => {
          if (sheets.length === 0) return null;
          const rStyle = REVIEWER_STYLES[type];
          const label = REVIEWER_LABELS[type];
          return (
            <div key={type} style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: rStyle.color, marginBottom: '0.75rem', borderBottom: '1px solid ' + rStyle.color, paddingBottom: '6px' }}>
                {label} · {sheets.length} pending
              </p>
              {sheets.map((ws, idx) => (
                <div key={ws.id} onClick={() => navigate(`/admin/review/${ws.user_id}/${ws.worksheet_id}`)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(26, 26, 26, 0.06)', cursor: 'pointer',
                  opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.03}s forwards`,
                }}>
                  <div style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch, flex: 1 }}>
                    {ws.user_profiles?.full_name || 'Unknown'}
                    <span style={{ color: t.wg, fontWeight: 400, fontSize: '0.75rem' }}> · {WORKSHEET_NAMES[ws.worksheet_id] || ws.worksheet_id}</span>
                  </div>
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid ' + (ws.review_status === 'revision_submitted' ? '#7D5260' : '#D4AF37'), color: ws.review_status === 'revision_submitted' ? '#7D5260' : '#D4AF37' }}>
                    {ws.review_status === 'revision_submitted' ? 'Revised' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function AssignmentsTab({ instructors, leadInstructors, onRefresh }) {
  const [allInstructors, setAllInstructors] = useState([]);
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedBuddy, setSelectedBuddy] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.from('user_profiles').select('id, full_name, email, role').not('role', 'in', '("academic_head","onboarding_lead")').then(({ data }) => { if (data) setAllInstructors(data); });
  }, []);

  const buddyCandidates = allInstructors.filter(i => i.id !== selectedInstructor);

  const assignedInstructors = instructors.filter(i => i.assigned_lead_id || i.assigned_buddy_id);
  const unassignedInstructors = instructors.filter(i => !i.assigned_lead_id && !i.assigned_buddy_id);

  const styleLabel = { fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, display: 'block', marginBottom: '8px' };
  const styleSelect = { fontFamily: t.body, fontSize: '0.8rem', color: t.ch, width: '100%', padding: '8px 0', border: 'none', borderBottom: '1px solid ' + t.ch, background: 'transparent', outline: 'none', marginBottom: '1.5rem' };

  const btnPrimary = { fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 20px', border: '1px solid ' + t.ch, background: t.ch, color: '#F9F8F6', cursor: 'pointer', transition: 'all 500ms ' + t.ease };
  const btnSecondary = { ...btnPrimary, background: 'transparent', color: t.ch };

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.5rem' }}>
        Assign Manager & Buddy
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <label style={styleLabel}>Joinee</label>
          <select style={styleSelect} value={selectedInstructor} onChange={e => { setSelectedInstructor(e.target.value); setMessage(''); }}>
            <option value="">Select...</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id}>{i.full_name} {i.assigned_lead_id ? '(managed)' : ''} {i.assigned_buddy_id ? '(buddy)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={styleLabel}>Manager</label>
          <select style={styleSelect} value={selectedManager} onChange={e => setSelectedManager(e.target.value)}>
            <option value="">Select...</option>
            {leadInstructors.map(b => (<option key={b.id} value={b.id}>{b.full_name}</option>))}
          </select>
        </div>
        <div>
          <label style={styleLabel}>Buddy / Mentor</label>
          <select style={styleSelect} value={selectedBuddy} onChange={e => setSelectedBuddy(e.target.value)}>
            <option value="">Select...</option>
            {buddyCandidates.map(b => (<option key={b.id} value={b.id}>{b.full_name} · {b.role === 'lead_instructor' ? 'Buddy / Mentor' : 'Instructor'}</option>))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button onClick={async () => { if (!selectedInstructor || !selectedManager) { setMessage('Select a joinee and a manager.'); return; } setSaving(true); setMessage(''); const { error } = await supabase.from('user_profiles').update({ assigned_lead_id: selectedManager || null }).eq('id', selectedInstructor); setMessage(error ? 'Error: ' + error.message : 'Assigned!'); onRefresh(); setSaving(false); }} disabled={saving} style={btnPrimary}>
          <Briefcase size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Assign Manager
        </button>
        <button onClick={async () => { if (!selectedInstructor || !selectedBuddy) { setMessage('Select a joinee and a buddy.'); return; } setSaving(true); setMessage(''); const { error } = await supabase.from('user_profiles').update({ assigned_buddy_id: selectedBuddy || null }).eq('id', selectedInstructor); setMessage(error ? 'Error: ' + error.message : 'Assigned!'); onRefresh(); setSaving(false); }} disabled={saving} style={btnSecondary}>
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
            const manager = leadInstructors.find(l => l.id === instr.assigned_lead_id);
            const buddy = allInstructors.find(b => b.id === instr.assigned_buddy_id);
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

      {/* Unassigned */}
      <div style={{ marginTop: '1.5rem' }}>
        <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '0.75rem' }}>
          Unassigned ({unassignedInstructors.length})
        </p>
        {unassignedInstructors.map((instr, idx) => (
          <div key={instr.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
            <span style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch }}>{instr.full_name}</span>
            <span style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{instr.email}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
