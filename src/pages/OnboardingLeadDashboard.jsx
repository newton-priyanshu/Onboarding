import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { Users, Clock, CheckCircle2, RefreshCw, Shield, BadgeCheck, Eye, User, BookOpen } from 'lucide-react';
import { WORKSHEET_REVIEWER, PHASE_WORKSHEETS_MAP, getPhaseReviewStatus, WORKSHEET_NAMES } from '../config/worksheetConfig.jsx';
import { t } from '../config/theme.js';

export default function OnboardingLeadDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [instructors, setInstructors] = useState([]);
  const [allWorksheets, setAllWorksheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('all');
  const [viewPhase, setViewPhase] = useState('all');

  const isOnboardingLead = profile?.role === 'onboarding_lead';

  useEffect(() => { if (isOnboardingLead) loadData(); }, [isOnboardingLead]);

  async function loadData() {
    setLoading(true);
    try {
      const [instrRes, wsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').in('role', ['new_joinee', 'lab_instructor']),
        supabase.from('worksheet_submissions').select('*'),
      ]);
      if (instrRes.data) setInstructors(instrRes.data);
      if (wsRes.data) setAllWorksheets(wsRes.data);
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
    }
    setLoading(false);
  }

  if (!isOnboardingLead) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Access Restricted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>This dashboard is for Onboarding Leads only.</p>
        </div>
      </div>
    );
  }

  // Stats
  const totalPending = allWorksheets.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted').length;
  const totalBuddyApproved = allWorksheets.filter(w => w.review_status === 'buddy_approved').length;
  const totalApproved = allWorksheets.filter(w => w.review_status === 'approved').length;
  const totalSheets = allWorksheets.length;

  // Filter by phase
  let filteredInstructors = instructors;
  if (viewPhase !== 'all') {
    const phaseNum = parseInt(viewPhase, 10);
    const wsIds = PHASE_WORKSHEETS_MAP[phaseNum] || [];
    filteredInstructors = instructors.filter(instr => {
      const userSubs = allWorksheets.filter(w => w.user_id === instr.id && wsIds.includes(w.worksheet_id));
      return userSubs.length > 0;
    });
  }

  // Filter by status
  if (viewMode !== 'all') {
    filteredInstructors = filteredInstructors.filter(instr => {
      const userSubs = allWorksheets.filter(w => w.user_id === instr.id);
      if (viewMode === 'has_submissions') return userSubs.length > 0;
      if (viewMode === 'no_submissions') return userSubs.length === 0;
      if (viewMode === 'phase_ready') {
        for (const p of [1, 2, 3]) {
          if (getPhaseReviewStatus(p, allWorksheets, instr.id).ready) return true;
        }
        return false;
      }
      return true;
    });
  }

  const getPhaseForInstr = (userId) => {
    return [1, 2, 3].map(p => {
      const wsIds = PHASE_WORKSHEETS_MAP[p] || [];
      const userSubs = allWorksheets.filter(w => w.user_id === userId && wsIds.includes(w.worksheet_id));
      const buddyApproved = userSubs.filter(s => s.review_status === 'buddy_approved' || s.review_status === 'approved').length;
      return { phase: p, total: wsIds.length, done: buddyApproved, ready: getPhaseReviewStatus(p, allWorksheets, userId).ready };
    });
  };

  const filterOptions = [
    { id: 'all', label: 'All' },
    { id: 'has_submissions', label: 'Has Submissions' },
    { id: 'no_submissions', label: 'No Submissions' },
    { id: 'phase_ready', label: 'Phase Ready' },
  ];

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Monitoring Panel</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                Read-only monitoring · {instructors.length} joinee(s) · {totalSheets} submissions
              </p>
            </div>
            <button onClick={loadData} disabled={loading} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 20px', cursor: 'pointer',
            }}>
              <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '6px' }} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2rem' }}>
          {[
            { label: 'Joinees', value: instructors.length, icon: Users, color: t.ch },
            { label: 'Pending Review', value: totalPending, icon: Clock, color: '#D4AF37' },
            { label: 'Buddy Approved', value: totalBuddyApproved, icon: Shield, color: '#381E72' },
            { label: 'Approved', value: totalApproved, icon: BadgeCheck, color: '#1B5E20' },
          ].map((item, i) => (
            <div key={i} style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
              <item.icon size={20} strokeWidth={1.5} style={{ color: item.color, marginBottom: '8px' }} />
              <p style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch }}>{item.value}</p>
              <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <select value={viewPhase} onChange={e => setViewPhase(e.target.value)}
            style={{ fontFamily: t.body, fontSize: '0.65rem', padding: '6px 12px', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent', cursor: 'pointer', color: t.ch }}>
            <option value="all">All Phases</option>
            <option value="1">Phase 1</option>
            <option value="2">Phase 2</option>
            <option value="3">Phase 3</option>
          </select>
          {filterOptions.map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)} style={{
              fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: viewMode === m.id ? t.ch : 'transparent',
              border: '1px solid ' + (viewMode === m.id ? t.ch : 'rgba(26,26,26,0.2)'),
              color: viewMode === m.id ? '#F9F8F6' : t.wg,
              padding: '6px 16px', cursor: 'pointer',
            }}>{m.label}</button>
          ))}
        </div>

        {/* Joinee list */}
        {loading ? (
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, textAlign: 'center', padding: '2rem' }}>Loading...</p>
        ) : filteredInstructors.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem' }}>
            <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>No Results</p>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>No instructors match the current filter.</p>
          </div>
        ) : (
          <div>
            {filteredInstructors.map((instr, idx) => {
              const phases = getPhaseForInstr(instr.id);
              const instrSubs = allWorksheets.filter(w => w.user_id === instr.id);
              return (
                <div key={instr.id} style={{
                  borderTop: '1px solid rgba(26, 26, 26, 0.08)', padding: '1.25rem 0',
                  opacity: 0, animation: `luxFadeIn 0.5s ${idx * 0.04}s forwards`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', border: '1px solid ' + t.ch, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '0.9rem', fontWeight: 500, color: t.ch }}>
                      {instr.full_name?.charAt(0) || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{instr.full_name}</span>
                      <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{instr.email} · {instrSubs.length} submissions</p>

                      {/* Phase progress bars */}
                      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '8px', flexWrap: 'wrap' }}>
                        {phases.map(p => (
                          <div key={p.phase} style={{ minWidth: '100px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.wg }}>Phase {p.phase}</span>
                              <span style={{ fontFamily: t.body, fontSize: '0.55rem', color: t.wg }}>{p.done}/{p.total}</span>
                            </div>
                            <div className="lux-progress" style={{ height: '2px' }}>
                              <div className="lux-progress-fill" style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`, background: p.ready ? '#381E72' : p.done === p.total ? '#1B5E20' : t.ch }} />
                            </div>
                            {p.ready && (
                              <button onClick={() => navigate(`/onboarding-lead/review-phase/${instr.id}/${p.phase}`)}
                                style={{
                                  fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.1em',
                                  marginTop: '4px', padding: '2px 6px', background: '#0369A1', color: '#FFF',
                                  border: 'none', cursor: 'pointer', width: '100%',
                                }}>
                                <Eye size={10} strokeWidth={1.5} style={{ marginRight: '2px', verticalAlign: 'middle' }} /> View Phase
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
