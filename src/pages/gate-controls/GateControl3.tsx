import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle, Send, ArrowLeft } from 'lucide-react';
import { Section, Slider, BuddyApprovedView, LoadingView, ReviewFeedback } from '../../config/worksheetComponents';
import { t } from '../../config/theme';
import { useGateControl } from '../../hooks/useGateControl';

const milestones: [string, string][] = [
  ['Independent lecture delivery (min. 2 full sessions)', 'Faculty Lead lecture observation'],
  ['Student awareness — knows names, cohorts, needs', 'Instructor-led student walkthrough'],
  ['End-to-end assessment creation and management', 'Review of created assessment artefacts'],
  ['Applied pedagogical frameworks in class', 'Classroom observation + self-assessment'],
  ['Active course improvement contributor', 'Written proposal submitted (WS 3.5)'],
  ['All Phase 3 worksheets submitted and reviewed', 'Compendium review by Faculty Lead'],
];

interface GateControlProps {
  targetUserId?: string;
}

const defaultData = {
  employeeName: '',
  selfProud: '', selfUncomfortable: '', selfSkills: '', selfPhilosophy: '',
  teachingRating: 3, commRating: 3, contentRating: 3, studentRating: 3, assessmentRating: 3, ownershipRating: 3, professionalismRating: 3,
  milestones: milestones.map(() => 'Not Met'),
  decision: '', finalComments: '', facultyLeadSignature: '', instructorSignature: '',
  status: 'In Progress', submittedAt: '',
};

export default function GateControl3({ targetUserId }: GateControlProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const {
    data, loaded, submitting, submitError,
    updateField, isBuddyApproved, isApproved, isSubmitted,
    toggleMilestone, handleSubmit,
  } = useGateControl({
    user,
    profile,
    worksheetId: 'gc3',
    phase: 'phase3',
    defaultData,
    requiredFields: [
      { key: 'employeeName', label: 'Instructor Name' },
      { key: 'decision', label: 'Final readiness rating' },
    ],
    targetUserId,
  });

  // Early returns
  if (isBuddyApproved) {
    return <BuddyApprovedView msg="Your Gate Control 3 has been approved by your buddy." path="/phase-3" />;
  }
  if (isApproved) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.success, marginBottom: '0.5rem' }}>✓ Onboarding Complete — Approved</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>
            Your 90-day readiness assessment has been reviewed and approved. Congratulations on completing the faculty onboarding program!
          </p>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }
  if (isSubmitted) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>Onboarding Complete</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>
            Your 90-day readiness assessment has been submitted. Congratulations on completing the faculty onboarding program!
          </p>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate('/phase-3')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Phase 3
        </button>

        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '2px' }}>
                Gate Control 3 — <em style={{ fontStyle: 'italic', color: t.gd }}>Final Readiness</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Phase 3 · Full Deployment Board — determines independence level</p>
            </div>
          </div>
        </div>

        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="New Instructor Self Reflection">
            {[
              { k: 'selfProud', l: 'What am I most proud of?' },
              { k: 'selfUncomfortable', l: 'What still makes me uncomfortable?' },
              { k: 'selfSkills', l: 'What skills require further development?' },
              { k: 'selfPhilosophy', l: 'How has my teaching philosophy evolved?' },
            ].map(item => (
              <div key={item.k} className="lux-form-group">
                <label className="lux-label" htmlFor={`gc3-${item.k}`}>{item.l}</label>
                <textarea id={`gc3-${item.k}`} className="lux-textarea" rows={2} value={data[item.k] as string} onChange={e => updateField(item.k, e.target.value)} />
              </div>
            ))}
          </Section>

          <Section title="Faculty Lead Assessment (1–5)">
            {[
              { k: 'teachingRating', l: 'Teaching' },
              { k: 'commRating', l: 'Communication' },
              { k: 'contentRating', l: 'Content Creation' },
              { k: 'studentRating', l: 'Student Handling' },
              { k: 'assessmentRating', l: 'Assessment Design' },
              { k: 'ownershipRating', l: 'Ownership' },
              { k: 'professionalismRating', l: 'Professionalism' },
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

          <Section title="Final Readiness Rating">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {[
                { k: 'fully_independent', l: 'Fully Independent', d: 'Can teach, create assessments, and contribute without supervision.' },
                { k: 'needs_minor_support', l: 'Needs Minor Support', d: 'Proficient in most areas; occasional guidance needed.' },
                { k: 'needs_development', l: 'Needs Development', d: 'Gaps in teaching fluency; remediation required.' },
              ].map(opt => {
                const isSelected = data.decision === opt.k;
                return (
                  <div key={opt.k} onClick={() => updateField('decision', opt.k)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateField('decision', opt.k); } }}
                    role="button" tabIndex={0}
                    aria-label={`Select readiness: ${opt.l}`}
                    style={{
                      padding: '16px', cursor: 'pointer',
                      borderTop: isSelected ? '3px solid var(--color-gold)' : '1px solid rgba(26,26,26,0.15)',
                      textAlign: 'center', transition: 'border-color 200ms var(--ease-lux)',
                    }}>
                    <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch, display: 'block', marginBottom: '4px' }}>{opt.l}</span>
                    <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, lineHeight: 1.5 }}>{opt.d}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Final Decision">
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="gc3-comments">Final Comments</label>
              <textarea id="gc3-comments" className="lux-textarea" rows={3} value={data.finalComments as string} onChange={e => updateField('finalComments', e.target.value)} />
            </div>
          </Section>

          <Section title="Approval Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc3-fl-sig">Faculty Lead Signature</label><input id="gc3-fl-sig" className="lux-input" value={data.facultyLeadSignature as string} onChange={e => updateField('facultyLeadSignature', e.target.value)} /></div>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc3-instr-sig">Instructor Signature</label><input id="gc3-instr-sig" className="lux-input" value={data.instructorSignature as string} onChange={e => updateField('instructorSignature', e.target.value)} /></div>
            </div>
          </Section>

          {submitError && <div className="lux-alert lux-alert-error"><AlertCircle size={16} strokeWidth={1.5} /><span>{submitError}</span></div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/phase-3')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '200px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Final Assessment</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
