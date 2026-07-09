import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle, Send, ArrowLeft } from 'lucide-react';
import { Section, Slider, BuddyApprovedView, LoadingView, ReviewFeedback } from '../../config/worksheetComponents';
import { t } from '../../config/theme';
import { useGateControl } from '../../hooks/useGateControl';

const milestones: [string, string][] = [
  ['Portal proficiency — end-to-end', 'Live demo with Faculty Lead'],
  ['Clear understanding of course objectives', 'Verbal explanation or short written summary'],
  ['Awareness of classroom management norms', 'Observation debrief with mentor'],
  ['All Phase 1 worksheets submitted', 'Compendium review by Faculty Lead'],
  ['Ready for guided contribution', 'Faculty Lead sign-off'],
];

interface GateControlProps {
  targetUserId?: string;
}

const defaultData = {
  employeeName: '',
  portalRating: 3, courseRating: 3, studentRating: 3, commRating: 3, readinessRating: 3,
  milestones: milestones.map(() => 'Not Met'),
  managerStrengths: '', managerRisks: '', readinessDecision: '',
  managerSignature: '', instructorSignature: '',
  status: 'In Progress', submittedAt: '',
};

export default function GateControl1({ targetUserId }: GateControlProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const {
    data, loaded, submitting, submitError,
    updateField, isBuddyApproved, isApproved, isSubmitted,
    toggleMilestone, handleSubmit,
  } = useGateControl({
    user,
    profile,
    worksheetId: 'gc1',
    phase: 'phase1',
    defaultData,
    requiredFields: [{ key: 'employeeName', label: 'Instructor Name' }],
    targetUserId,
  });

  // Early returns
  if (isBuddyApproved) {
    return <BuddyApprovedView msg="Your Gate Control 1 has been approved by your buddy." path="/phase-1" />;
  }
  if (isApproved) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.success, marginBottom: '0.75rem' }}>✓ Gate Control 1 Approved</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>Your 30-day milestone review has been approved.</p>
          <button onClick={() => navigate('/phase-1')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Back to Phase 1</span>
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
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>Gate Control 1 Submitted</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>Your 30-day milestone review has been submitted.</p>
          <button onClick={() => navigate('/phase-1')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Back to Phase 1</span>
          </button>
        </div>
      </div>
    );
  }
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate('/phase-1')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Phase 1
        </button>

        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '2px' }}>
                Gate Control 1 — <em style={{ fontStyle: 'italic', color: t.gd }}>30-Day Milestone</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Phase 1 · Approval required before entering Phase 2</p>
            </div>
          </div>
        </div>

        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="Self Assessment (1–5)">
            <Slider label="Portal & System Proficiency" value={data.portalRating as number} onChange={v => updateField('portalRating', v)} />
            <Slider label="Course & Content Understanding" value={data.courseRating as number} onChange={v => updateField('courseRating', v)} />
            <Slider label="Student Understanding & Engagement" value={data.studentRating as number} onChange={v => updateField('studentRating', v)} />
            <Slider label="Communication & Collaboration" value={data.commRating as number} onChange={v => updateField('commRating', v)} />
            <Slider label="Overall Teaching Readiness" value={data.readinessRating as number} onChange={v => updateField('readinessRating', v)} />
          </Section>

          <Section title="Required Milestone Outcomes" subtitle="Click to toggle: Met → Partial → Not Met">
            {milestones.map(([outcome, verify], i) => {
              const status = (data.milestones as string[])[i];
              const statusColor = status === 'Met' ? t.success : status === 'Partial' ? t.warning : t.wg;
              return (
                <div key={i} onClick={() => toggleMilestone(i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMilestone(i); } }}
                  role="button" tabIndex={0}
                  aria-label={`Toggle milestone: ${outcome}. Currently ${status}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderLeft: '1px solid ' + statusColor, transition: 'background 200ms var(--ease-lux)' }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(26, 26, 26, 0.03)'; }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
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

          <Section title="Manager Assessment">
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="gc1-strengths">Key Strengths Observed</label>
              <textarea id="gc1-strengths" className="lux-textarea" rows={2} value={data.managerStrengths as string} onChange={e => updateField('managerStrengths', e.target.value)} />
            </div>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="gc1-risks">Risks / Areas to Watch</label>
              <textarea id="gc1-risks" className="lux-textarea" rows={2} value={data.managerRisks as string} onChange={e => updateField('managerRisks', e.target.value)} />
            </div>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="gc1-decision">Readiness Decision</label>
              <select id="gc1-decision" className="lux-select" value={data.readinessDecision as string} onChange={e => updateField('readinessDecision', e.target.value)}>
                <option value="">Select...</option>
                <option value="approved">Approved — Ready for Phase 2</option>
                <option value="conditions">Approved with Conditions</option>
                <option value="needs_improvement">Needs Improvement</option>
              </select>
            </div>
          </Section>

          <Section title="Approval Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="gc1-mgr-sig">Manager Signature</label>
                <input id="gc1-mgr-sig" className="lux-input" value={data.managerSignature as string} onChange={e => updateField('managerSignature', e.target.value)} />
              </div>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="gc1-instr-sig">Instructor Signature</label>
                <input id="gc1-instr-sig" className="lux-input" value={data.instructorSignature as string} onChange={e => updateField('instructorSignature', e.target.value)} />
              </div>
            </div>
          </Section>

          {submitError && <div className="lux-alert lux-alert-error"><AlertCircle size={16} strokeWidth={1.5} /><span>{submitError}</span></div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/phase-1')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={() => handleSubmit()} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '180px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Gate Review</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
