import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../api/supabase';
import { Users, Clock, ArrowRight, RefreshCw, UserCheck, BadgeCheck, Shield, FileCheck } from 'lucide-react';
import { WORKSHEET_NAMES, type WorksheetSubmission } from '../config/worksheetConfig';
import { t } from '../config/theme';
import { fetchWithCache, invalidateCacheByPrefix } from '../utils/queryCache';

interface SimpleInstructor {
  id: string;
  full_name: string;
  email: string;
}

interface GATE_INFO_ENTRY {
  gateId: string;
  regularSheets: string[];
  label: string;
}

const GATE_INFO: Record<number, GATE_INFO_ENTRY> = {
  1: { gateId: 'gc1', regularSheets: ['p1_w1','p1_w2','p1_w3','p1_w4','p1_w5','p1_w6','p1_w7','p1_w8'], label: 'Gate Pass 1 — Phase 1' },
  2: { gateId: 'gc2', regularSheets: ['p2_w1','p2_w2','p2_w3','p2_w4'], label: 'Gate Pass 2 — Phase 2' },
  3: { gateId: 'gc3', regularSheets: ['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5'], label: 'Gate Pass 3 — Phase 3' },
};

interface TabItem {
  id: string;
  label: string;
}

interface StatsData {
  pending: number;
  buddyApproved: number;
  approved: number;
  revisionNeeded: number;
}

export default function BuddyDashboard() {
  const { profile, user } = useAuth();
  const [myInstructors, setMyInstructors] = useState<SimpleInstructor[]>([]);
  const [allWorksheets, setAllWorksheets] = useState<WorksheetSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [viewMode, setViewMode] = useState('all');

  const isBuddy = profile?.role === 'lead_instructor' || profile?.role === 'academic_head';

  useEffect(() => { if (isBuddy && user) loadData(); }, [isBuddy, user]);

  async function loadData() {
    setLoading(true);
    try {
      const [asLead, asBuddy] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, email').eq('assigned_lead_id', user!.id),
        supabase.from('user_profiles').select('id, full_name, email').eq('assigned_buddy_id', user!.id),
      ]);
      const unique = [...(asLead.data || []), ...(asBuddy.data || [])].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      setMyInstructors(unique as SimpleInstructor[]);
      const ids = unique.map(a => a.id);
      if (ids.length > 0) {
        const wsData = await fetchWithCache(`buddy-worksheets-${ids.sort().join(',')}`, () =>
          supabase.from('worksheet_submissions').select('id, user_id, worksheet_id, review_status, status, updated_at, reviewer_name, review_history').in('user_id', ids).order('updated_at', { ascending: false }).limit(200)
            .then(r => r.data as unknown as WorksheetSubmission[])
        , { ttl: 15_000 });
        if (wsData) setAllWorksheets(wsData);
      }
    } catch (err) {
      console.error('Failed to load buddy data:', err);
    } finally {
      setLoading(false);
    }
  }

  // ALL worksheets that need buddy attention (pending_review or revision_submitted)
  const pendingWorksheets = allWorksheets.filter(w =>
    (w.review_status === 'pending_review' || w.review_status === 'revision_submitted')
  );
  // Buddy-approved worksheets (awaiting manager)
  const buddyApprovedWorksheets = allWorksheets.filter(w => w.review_status === 'buddy_approved');
  // Fully approved
  const approvedWorksheets = allWorksheets.filter(w => w.review_status === 'approved');
  // Needs revision (waiting for joinee)
  const revisionNeeded = allWorksheets.filter(w => w.review_status === 'needs_revision');

  const stats: StatsData = {
    pending: pendingWorksheets.length,
    buddyApproved: buddyApprovedWorksheets.length,
    approved: approvedWorksheets.length,
    revisionNeeded: revisionNeeded.length,
  };

  if (!isBuddy) {
    return (
      <div className="lux-section" style={{ textAlign: 'center' }}>
        <div className="lux-container">
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '1rem' }}>Access Restricted</h2>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>This dashboard is for Buddies and Mentors only.</p>
        </div>
      </div>
    );
  }

  const tabs: TabItem[] = [
    { id: 'pending', label: `Pending Review (${stats.pending})` },
    { id: 'buddy_approved', label: `Buddy Approved (${stats.buddyApproved})` },
    { id: 'instructors', label: 'My Instructors' },
  ];

  let displayWorksheets: WorksheetSubmission[] = [];
  if (activeTab === 'pending') displayWorksheets = pendingWorksheets;
  if (activeTab === 'buddy_approved') displayWorksheets = buddyApprovedWorksheets;

  if (viewMode === 'approved' && activeTab !== 'instructors') {
    displayWorksheets = approvedWorksheets;
  }

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Buddy Review Dashboard
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                Review ALL worksheets from {myInstructors.length} assigned instructor(s) — {stats.pending} pending review
              </p>
            </div>
            <button onClick={() => { invalidateCacheByPrefix('buddy-'); loadData(); }} disabled={loading} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 20px', cursor: 'pointer',
              transition: 'all 500ms ' + t.ease,
            }}>
              <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '6px' }} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
            <Users size={20} strokeWidth={1.5} style={{ color: t.ch, marginBottom: '8px' }} />
            <p style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch }}>{myInstructors.length}</p>
            <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Instructors</p>
          </div>
          <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
            <Clock size={20} strokeWidth={1.5} style={{ color: '#D4AF37', marginBottom: '8px' }} />
            <p style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: '#D4AF37' }}>{stats.pending}</p>
            <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Pending Review</p>
          </div>
          <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
            <Shield size={20} strokeWidth={1.5} style={{ color: t.purple, marginBottom: '8px' }} />
            <p style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.purple }}>{stats.buddyApproved}</p>
            <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Buddy Approved</p>
          </div>
          <div style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
            <BadgeCheck size={20} strokeWidth={1.5} style={{ color: t.success, marginBottom: '8px' }} />
            <p style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.success }}>{stats.approved}</p>
            <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>Approved</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(26, 26, 26, 0.12)', marginBottom: '1.5rem' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setViewMode('all'); }} style={{
              fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', padding: '12px 24px', cursor: 'pointer',
              color: activeTab === tab.id ? t.ch : t.wg,
              borderBottom: activeTab === tab.id ? '1px solid ' + t.ch : '1px solid transparent',
              transition: 'color 500ms ' + t.ease + ', border-color 500ms ' + t.ease,
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Queue tabs */}
        {(activeTab === 'pending' || activeTab === 'buddy_approved') && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {(['all', 'approved'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                  background: viewMode === m ? t.ch : 'transparent',
                  border: '1px solid ' + (viewMode === m ? t.ch : 'rgba(26,26,26,0.2)'),
                  color: viewMode === m ? '#F9F8F6' : t.wg,
                  padding: '6px 16px', cursor: 'pointer',
                  transition: 'all 500ms ' + t.ease,
                }}>
                  {m === 'all' ? 'All' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <WorksheetQueueTab
              title={activeTab === 'pending' ? 'Awaiting Your Review' : 'Buddy Approved — Awaiting Manager'}
              worksheets={displayWorksheets}
              instructors={myInstructors}
              getLink={(uid, wid) => `/buddy/review/${uid}/${wid}`}
              activeTab={activeTab}
            />
          </>
        )}
        {activeTab === 'instructors' && <InstructorsTab myInstructors={myInstructors} allWorksheets={allWorksheets} />}
      </div>
    </div>
  );
}

function WorksheetQueueTab({ title, worksheets, instructors, getLink, activeTab }: {
  title: string;
  worksheets: WorksheetSubmission[];
  instructors: SimpleInstructor[];
  getLink: (userId: string, worksheetId: string) => string;
  activeTab: string;
}) {
  const navigate = useNavigate();

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem' }}>
        {title} ({worksheets.length})
      </p>
      {worksheets.length === 0 ? (          <div style={{ textAlign: 'center', padding: '2.5rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <div className="lux-line" style={{ margin: '0 auto 1rem' }} />
            <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>All Caught Up</p>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, lineHeight: 1.6, maxWidth: '360px', margin: '0 auto' }}>
              {activeTab === 'pending'
                ? 'All assigned worksheets have been reviewed. Switch to "Buddy Approved" or "My Instructors" to see the full picture.'
                : activeTab === 'buddy_approved'
                  ? 'No buddy-approved worksheets awaiting manager review. Worksheets will appear here once you approve them.'
                  : 'No worksheets match the current filter.'}
            </p>
          </div>
      ) : (
        worksheets.map((ws, idx) => {
          const instr = instructors.find(i => i.id === ws.user_id);
          const isBuddyApproved = ws.review_status === 'buddy_approved';
          return (
            <div key={ws.id}
              onClick={() => navigate(getLink(ws.user_id, ws.worksheet_id))}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0',
                borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                cursor: 'pointer',
                opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
              }}>
              <div style={{ width: '36px', height: '36px', border: '1px solid ' + (isBuddyApproved ? t.purple : t.ch), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: isBuddyApproved ? t.purple : t.ch }}>
                {instr?.full_name?.charAt(0) || '?'}
              </div>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{instr?.full_name || 'Unknown'}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{WORKSHEET_NAMES[ws.worksheet_id] || ws.worksheet_id}</p>
                <p style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>{ws.updated_at ? new Date(ws.updated_at).toLocaleDateString() : 'N/A'}</p>
              </div>
              {isBuddyApproved ? (
                <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #381E72', color: t.purple }}>Buddy Approved</span>
              ) : ws.review_status === 'revision_submitted' ? (
                <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #7D5260', color: t.pending }}>Revised</span>
              ) : (
                <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #D4AF37', color: '#D4AF37' }}>Pending</span>
              )}
              <ArrowRight size={14} strokeWidth={1.5} style={{ color: t.wg, flexShrink: 0 }} />
            </div>
          );
        })
      )}
    </div>
  );
}

function InstructorsTab({ myInstructors, allWorksheets }: {
  myInstructors: SimpleInstructor[];
  allWorksheets: WorksheetSubmission[];
}) {
  const navigate = useNavigate();

  /** Check if all regular worksheets in a phase are buddy-approved for this user */
  function isPhaseReadyForGate(userId: string, phaseNum: number): boolean {
    const info = GATE_INFO[phaseNum]!;
    if (!info) return false;
    const userSheets = allWorksheets.filter(w => w.user_id === userId);
    return info.regularSheets.every(wsId => {
      const sub = userSheets.find(s => s.worksheet_id === wsId);
      return sub?.review_status === 'buddy_approved' || sub?.review_status === 'approved';
    });
  }

  /** Check if the gate pass has already been filled (= buddy_approved) */
  function isGateFilled(userId: string, gateId: string): boolean {
    const sub = allWorksheets.find(w => w.user_id === userId && w.worksheet_id === gateId);
    return sub?.review_status === 'buddy_approved' || sub?.review_status === 'approved';
  }

  return (
    <div>
      <p style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1rem' }}>
        Your Assigned Instructors ({myInstructors.length})
      </p>
      {myInstructors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, lineHeight: 1.6, maxWidth: '360px', margin: '0 auto' }}>
            No instructors assigned yet. Ask an admin to assign joinees to you as a buddy or manager.
          </p>
        </div>
      ) : (
        myInstructors.map((instr, idx) => {
          const instrWorksheets = allWorksheets.filter(w => w.user_id === instr.id);
          const pending = instrWorksheets.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted');
          const buddyApproved = instrWorksheets.filter(w => w.review_status === 'buddy_approved');
          const totalApproved = instrWorksheets.filter(w => w.review_status === 'approved').length;

          // Check which phases need a gate pass filled
          const gatePassNeeded = [1, 2, 3].filter(phaseNum =>
            isPhaseReadyForGate(instr.id, phaseNum) &&
            !isGateFilled(instr.id, GATE_INFO[phaseNum]!.gateId)
          );

          return (
            <div key={instr.id} style={{
              padding: '12px 0',
              borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
              opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.05}s forwards`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: gatePassNeeded.length > 0 ? '8px' : 0 }}>
                <UserCheck size={16} strokeWidth={1.5} style={{ color: t.ch, flexShrink: 0 }} />
                <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch, flex: 1 }}>{instr.full_name}</span>
                <span style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{instr.email}</span>
                {pending.length > 0 && (
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #D4AF37', color: '#D4AF37' }}>
                    {pending.length} pending
                  </span>
                )}
                {buddyApproved.length > 0 && (
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #381E72', color: t.purple }}>
                    {buddyApproved.length} buddy approved
                  </span>
                )}
                {totalApproved > 0 && (
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #1B5E20', color: t.success }}>
                    {totalApproved} approved
                  </span>
                )}
              </div>
              {/* Gate Pass Action Buttons */}
              {gatePassNeeded.length > 0 && (
                <div style={{ paddingLeft: '28px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {gatePassNeeded.map(phaseNum => {
                    const info = GATE_INFO[phaseNum];
                    if (!info) return null;
                    return (
                      <button key={phaseNum}
                        onClick={() => navigate(`/buddy/gate-pass/${instr.id}/${info.gateId}`)}
                        style={{
                          fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          padding: '6px 14px', border: '1px solid #381E72',
                          background: 'rgba(56, 30, 114, 0.06)', color: t.purple,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                          transition: 'all 300ms var(--ease-lux)',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = t.purple; e.currentTarget.style.color = '#FFF'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'rgba(56, 30, 114, 0.06)'; e.currentTarget.style.color = t.purple; }}
                      >
                        <FileCheck size={12} strokeWidth={1.5} />
                        Fill {info.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
