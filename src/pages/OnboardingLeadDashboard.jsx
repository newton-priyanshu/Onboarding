import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { Users, Clock, CheckCircle2, AlertCircle, ArrowRight, RefreshCw, Shield, BadgeCheck, XCircle } from 'lucide-react';
import { WORKSHEET_REVIEWER, REVIEWER_LABELS, REVIEWER_STYLES } from '../worksheetConfig.jsx';

const WORKSHEET_NAMES = {
  p1_w4: 'University Governance & Semester Map', p1_w5: 'Portal Walkthrough & Verification',
  p2_w4: 'Advanced Portal Operations Check',
};

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function OnboardingLeadDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [instructors, setInstructors] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('pending');

  const isOnboardingLead = profile?.role === 'onboarding_lead';

  useEffect(() => { if (isOnboardingLead && user) loadData(); }, [isOnboardingLead, user]);

  async function loadData() {
    setLoading(true);
    const { data: instrData } = await supabase.from('user_profiles').select('id, full_name, email').in('role', ['new_joinee', 'lab_instructor']);
    const instructorMap = {};
    if (instrData) { setInstructors(instrData); instrData.forEach(i => { instructorMap[i.id] = i; }); }

    const onboardingLeadSheets = Object.entries(WORKSHEET_REVIEWER).filter(([, type]) => type === 'onboarding_lead').map(([id]) => id);
    if (onboardingLeadSheets.length > 0) {
      const { data: wsData } = await supabase.from('worksheet_submissions').select('*').in('worksheet_id', onboardingLeadSheets).order('updated_at', { ascending: false });
      if (wsData) setWorksheets(wsData.map(ws => ({ ...ws, user_profiles: instructorMap[ws.user_id] || { full_name: 'Unknown', email: '' } })));
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

  const pendingWorksheets = worksheets.filter(w => w.review_status === 'pending_review' || w.review_status === 'revision_submitted');
  const approvedWorksheets = worksheets.filter(w => w.review_status === 'approved');
  const revisionWorksheets = worksheets.filter(w => w.review_status === 'needs_revision');

  let displayWorksheets = worksheets;
  if (viewMode === 'pending') displayWorksheets = pendingWorksheets;
  if (viewMode === 'approved') displayWorksheets = approvedWorksheets;
  if (viewMode === 'revision') displayWorksheets = revisionWorksheets;

  const filterOptions = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: `Pending (${pendingWorksheets.length})` },
    { id: 'approved', label: `Approved (${approvedWorksheets.length})` },
    { id: 'revision', label: `Revision (${revisionWorksheets.length})` },
  ];

  return (
    <div className="lux-section">
      <div className="lux-container">
        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Onboarding Lead Panel</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                Reviewing procedural worksheets · {pendingWorksheets.length} pending · {instructors.length} joinee(s)
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

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', background: 'rgba(26, 26, 26, 0.1)', marginBottom: '2rem' }}>
          {[
            { label: 'Joinees', value: instructors.length, icon: Users, color: t.ch },
            { label: 'Pending', value: pendingWorksheets.length, icon: Clock, color: '#0369A1' },
            { label: 'Approved', value: approvedWorksheets.length, icon: BadgeCheck, color: '#1B5E20' },
            { label: 'Revision', value: revisionWorksheets.length, icon: XCircle, color: '#C62828' },
          ].map((item, i) => (
            <div key={i} style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
              <item.icon size={20} strokeWidth={1.5} style={{ color: item.color, marginBottom: '8px' }} />
              <p style={{ fontFamily: t.heading, fontSize: '1.5rem', fontWeight: 400, color: t.ch }}>{item.value}</p>
              <p style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {filterOptions.map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)} style={{
              fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
              background: viewMode === m.id ? t.ch : 'transparent',
              border: '1px solid ' + (viewMode === m.id ? t.ch : 'rgba(26,26,26,0.2)'),
              color: viewMode === m.id ? '#F9F8F6' : t.wg,
              padding: '6px 16px', cursor: 'pointer',
              transition: 'all 500ms ' + t.ease,
            }}>{m.label}</button>
          ))}
        </div>

        {/* Worksheet list */}
        {loading ? (
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, textAlign: 'center', padding: '2rem' }}>Loading...</p>
        ) : displayWorksheets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem' }}>
            <p style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>
              {viewMode === 'pending' ? 'All Caught Up' : 'No Worksheets'}
            </p>
            <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
              {viewMode === 'pending' ? 'All procedural worksheets have been reviewed.' : 'No worksheets match the selected filter.'}
            </p>
          </div>
        ) : (
          displayWorksheets.map((ws, idx) => {
            const isApproved = ws.review_status === 'approved';
            const isRevision = ws.review_status === 'revision_submitted';
            return (
              <div key={ws.id} onClick={() => navigate(`/onboarding-lead/review/${ws.user_id}/${ws.worksheet_id}`)} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0',
                borderBottom: '1px solid rgba(26, 26, 26, 0.06)', cursor: 'pointer',
                opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.04}s forwards`,
              }}>
                <div style={{ width: '36px', height: '36px', border: '1px solid ' + (isApproved ? '#1B5E20' : '#0369A1'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: isApproved ? '#1B5E20' : '#0369A1' }}>
                  {ws.user_profiles?.full_name?.charAt(0) || '?'}
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <p style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{ws.user_profiles?.full_name || 'Unknown'}</p>
                  <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg }}>{WORKSHEET_NAMES[ws.worksheet_id] || ws.worksheet_id}</p>
                  <p style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>{ws.updated_at ? new Date(ws.updated_at).toLocaleDateString() : 'N/A'}</p>
                </div>
                {isApproved ? (
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #1B5E20', color: '#1B5E20' }}>Approved</span>
                ) : isRevision ? (
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #7D5260', color: '#7D5260' }}>Revised</span>
                ) : (
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid #D4AF37', color: '#D4AF37' }}>Pending</span>
                )}
                <ArrowRight size={14} strokeWidth={1.5} style={{ color: t.wg, flexShrink: 0 }} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
