import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle, Send, ArrowLeft } from 'lucide-react';
import { Section, Slider, BuddyApprovedView, LoadingView } from '../../config/worksheetComponents';
import { t } from '../../config/theme';
import { useWorksheet } from '../../hooks/useWorksheet';

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
  const isBuddyMode = !!targetUserId;

  const ws = useWorksheet({
    user,
    worksheetId: 'gc1',
    phase: 'phase1',
    defaultData,
    requiredFields: [{ key: 'employeeName', label: 'Instructor Name' }],
    overrideUserId: targetUserId,
  });

  const { data, loaded, submitting, submitError, setSubmitError, setSubmitting, updateField, flushSave, isBuddyApproved, isApproved, isSubmitted } = ws;

  const toggleMilestone = (i: number) => {
    ws.setData(p => {
      const arr = [...(p.milestones as string[])];
      const vals: string[] = ['Not Met', 'Partial', 'Met'];
      const idx = vals.indexOf(arr[i]!);
      arr[i] = vals[(idx + 1) % vals.length]!;
      return { ...p, milestones: arr };
    });
  };

  const handleSubmit = async () => {
    setSubmitError('');
    if (!(data.employeeName as string)?.trim()) { setSubmitError('Please fill in the instructor name.'); return; }
    setSubmitting(true);
    try {
      const review_status = isBuddyMode ? 'buddy_approved' : (data._savedReviewStatus === 'needs_revision' ? 'revision_submitted' : '');
      const d = {
        ...data,
        status: 'Submitted',
        submittedAt: new Date().toISOString(),
        _savedReviewStatus: review_status,
        _savedReviewedBy: isBuddyMode ? user?.id : null,
        _savedReviewedAt: isBuddyMode ? new Date().toISOString() : null,
        _savedReviewerName: isBuddyMode ? ((profile?.full_name as string) || 'Buddy') : null,
      };
      ws.setData(d);
      await flushSave(d);
    } finally {
      setSubmitting(false);
    }
  };

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
      <div className="lux-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
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

        {(data._savedReviewStatus === 'needs_revision' || data._savedReviewStatus === 'revision_submitted') && !!data._savedReviewComment && (
          <div style={{ marginBottom: '1.5rem', border: '1px solid ' + t.error, background: '#FFF5F5', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <div style={{ width: '6px', height: '6px', background: '#C62828', flexShrink: 0 }} />
              <span style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.error }}>
                Revision Feedback
              </span>
            </div>
            <div style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.ch, lineHeight: 1.6, marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
              {data._savedReviewComment as string}
            </div>
            {!!data._savedReviewerName && (
              <div style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>— {data._savedReviewerName as string}</div>
            )}
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(198, 40, 40, 0.06)', fontFamily: t.body, fontSize: '0.75rem', color: t.error }}>
              Please review the feedback above, make changes, and resubmit.
            </div>
          </div>
        )}
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
            <button type="button" onClick={handleSubmit} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '180px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Gate Review</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
