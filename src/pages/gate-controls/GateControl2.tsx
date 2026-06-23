import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle, Send, ArrowLeft } from 'lucide-react';
import { Section, Slider, BuddyApprovedView, LoadingView, ReviewFeedback } from '../../config/worksheetComponents';
import { t } from '../../config/theme';
import { useGateControl } from '../../hooks/useGateControl';

const milestones: [string, string][] = [
  ['Confidently resolves student doubts independently', 'Observed by mentor during doubt session'],
  ['Runs lab sessions without guidance', 'Faculty Lead lab observation'],
  ['All content contributions reviewed and approved', 'Content audit by Faculty Lead'],
  ['Full advanced portal proficiency', 'Live portal demonstration'],
  ['All Phase 2 worksheets submitted', 'Compendium review by Faculty Lead'],
];

interface GateControlProps {
  targetUserId?: string;
}

const defaultData = {
  employeeName: '',
  studentSupport: 3, labFacilitation: 3, contentCreation: 3, portalProficiency: 3, communication: 3,
  milestones: milestones.map(() => 'Not Met'),
  managerComments: '', decision: '', managerSignature: '', instructorSignature: '',
  status: 'In Progress', submittedAt: '',
};

export default function GateControl2({ targetUserId }: GateControlProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const {
    data, loaded, submitting, submitError,
    updateField, isBuddyApproved, isApproved, isSubmitted,
    toggleMilestone, handleSubmit,
  } = useGateControl({
    user,
    profile,
    worksheetId: 'gc2',
    phase: 'phase2',
    defaultData,
    requiredFields: [{ key: 'employeeName', label: 'Instructor Name' }],
    targetUserId,
  });

  // Early returns
  if (isBuddyApproved) {
    return <BuddyApprovedView msg="Your Gate Control 2 has been approved by your buddy." path="/phase-2" />;
  }
  if (isApproved) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.success, marginBottom: '0.75rem' }}>✓ Gate Control 2 Approved</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>Your 60-day milestone review has been approved.</p>
          <button onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Back to Phase 2</span>
          </button>
        </div>
      </div>
    );
  }
  if (isSubmitted) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>Gate Control 2 Submitted</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>60-day review submitted.</p>
          <button onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Back to Phase 2</span>
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <button onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Phase 2
        </button>

        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '2px' }}>
                Gate Control 2 — <em style={{ fontStyle: 'italic', color: t.gd }}>60-Day Milestone</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Phase 2 · Required before advancing to Phase 3</p>
            </div>
          </div>
        </div>

        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="Self Assessment (1–5)">
            {[
              { k: 'studentSupport', l: 'Student Support' },
              { k: 'labFacilitation', l: 'Lab Facilitation' },
              { k: 'contentCreation', l: 'Content Creation' },
              { k: 'portalProficiency', l: 'Portal Proficiency' },
              { k: 'communication', l: 'Communication' },
            ].map(item => (
              <Slider key={item.k} label={item.l} value={data[item.k] as number} onChange={v => updateField(item.k, v)} />
            ))}
          </Section>

          <Section title="Required Milestone Outcomes" subtitle="Click to toggle: Met → Partial → Not Met">
            {milestones.map(([outcome, verify], i) => {
              const status = (data.milestones as string[])[i];
              const statusColor = status === 'Met' ? t.success : status === 'Partial' ? t.warning : t.wg;
              return (
                <div key={i} onClick={() => toggleMilestone(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderLeft: '1px solid ' + statusColor }}>
                  <div style={{ width: '8px', height: '8px', background: statusColor, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{outcome}</span>
                    <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, margin: '2px 0 0' }}>{verify}</p>
                  </div>
                  <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', color: statusColor, whiteSpace: 'nowrap' }}>{status}</span>
                </div>
              );
            })}
          </Section>

          <Section title="Manager Review">
            <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-comments">Manager Comments</label><textarea id="gc2-comments" className="lux-textarea" rows={3} value={data.managerComments as string} onChange={e => updateField('managerComments', e.target.value)} /></div>
            <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-decision">Decision</label><select id="gc2-decision" className="lux-select" value={data.decision as string} onChange={e => updateField('decision', e.target.value)}><option value="">Select...</option><option value="approved">Approved</option><option value="conditions">Approved with Conditions</option><option value="needs_improvement">Needs Improvement</option></select></div>
          </Section>

          <Section title="Approval Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-mgr-sig">Manager Signature</label><input id="gc2-mgr-sig" className="lux-input" value={data.managerSignature as string} onChange={e => updateField('managerSignature', e.target.value)} /></div>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-instr-sig">Instructor Signature</label><input id="gc2-instr-sig" className="lux-input" value={data.instructorSignature as string} onChange={e => updateField('instructorSignature', e.target.value)} /></div>
            </div>
          </Section>

          {submitError && <div className="lux-alert lux-alert-error"><AlertCircle size={16} strokeWidth={1.5} /><span>{submitError}</span></div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={() => handleSubmit()} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '180px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Gate Review</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
