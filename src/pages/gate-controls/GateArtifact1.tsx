import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, AlertCircle, Send, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Section, BuddyApprovedView, LoadingView, ReviewFeedback } from '../../config/worksheetComponents';
import { t } from '../../config/theme';
import { useGateControl } from '../../hooks/useGateControl';
import { FTP_GATE_ARTIFACTS, FTP_GATE_LABELS } from '../../config/worksheetConfigData';

interface GateProps { targetUserId?: string }

const gateId = 'w1_g1';
const gateMeta = FTP_GATE_LABELS[gateId]!;
const artifacts = FTP_GATE_ARTIFACTS[gateId]!;

const defaultData = {
  employeeName: '',
  artifacts: artifacts.map(() => false),
  buddyNotes: '',
  status: 'In Progress', submittedAt: '',
};

export default function GateArtifact1({ targetUserId }: GateProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data, loaded, submitting, submitError, updateField, isBuddyApproved, isSubmitted, handleSubmit } = useGateControl({
    user, profile, worksheetId: gateId, phase: 'week-1', defaultData,
    requiredFields: [{ key: 'employeeName', label: 'Instructor Name' }], targetUserId,
  });

  if (isBuddyApproved) return <BuddyApprovedView msg="Gate 1 artifacts approved." path="/week-1" />;
  if (isSubmitted) return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch }}>{gateMeta.title} Submitted</h1>
        <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>Week 1 artifacts submitted for review.</p>
        <button onClick={() => navigate('/week-1')} className="lux-btn lux-btn-primary"><span className="gold-overlay" /><span className="btn-content">Back to Week 1</span></button>
      </div>
    </div>
  );
  if (!loaded) return <LoadingView />;

  const allRequiredMet = artifacts.every((a, i) => !a.required || (data.artifacts as boolean[])?.[i]);

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate('/week-1')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Week 1
        </button>
        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '2px' }}>
                {gateMeta.title}
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>{gateMeta.subtitle}</p>
            </div>
          </div>
        </div>
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="Required Artifacts" subtitle="Confirm that each artifact has been completed and filed">
            {artifacts.map((a, i) => {
              const checked = (data.artifacts as boolean[])?.[i];
              return (
                <div key={i} onClick={() => { const arr = [...((data.artifacts as boolean[]) || [])]; arr[i] = !arr[i]; updateField('artifacts', arr); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderLeft: checked ? '3px solid ' + t.success : '3px solid ' + t.wg, background: checked ? 'rgba(46, 125, 50, 0.04)' : 'transparent' }}>
                  <div style={{ width: '20px', height: '20px', border: checked ? 'none' : '1px solid ' + t.wg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: checked ? t.success : 'transparent' }}>
                    {checked && <CheckCircle2 size={14} color="#FFF" strokeWidth={2.5} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: checked ? t.success : t.ch }}>{a.label}</span>
                    {!a.required && <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg, marginLeft: '8px' }}>(optional)</span>}
                  </div>
                  <span style={{ fontFamily: t.body, fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.1em', color: a.required ? t.ch : t.wg }}>
                    {a.required ? 'Required' : 'Optional'}
                  </span>
                </div>
              );
            })}
          </Section>
          <Section title="Buddy / Course Lead Notes">
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="gate-notes">Additional comments or observations</label>
              <textarea id="gate-notes" className="lux-textarea" rows={3} value={data.buddyNotes as string} onChange={e => updateField('buddyNotes', e.target.value)} />
            </div>
          </Section>
          {!allRequiredMet && submitError && <div className="lux-alert lux-alert-error"><AlertCircle size={16} strokeWidth={1.5} /><span>All required artifacts must be confirmed before submitting.</span></div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/week-1')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={() => { if (!allRequiredMet) { return; } handleSubmit(); }} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '180px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Gate</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
