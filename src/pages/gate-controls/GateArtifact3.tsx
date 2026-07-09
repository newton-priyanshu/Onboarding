import { useGateControl } from '../../hooks/useGateControl';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, Send, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Section, LoadingView, ReviewFeedback } from '../../config/worksheetComponents';
import { t } from '../../config/theme';
import { FTP_GATE_ARTIFACTS, FTP_GATE_LABELS } from '../../config/worksheetConfigData';

interface GateProps { targetUserId?: string }

const gateId = 'w3_g1';
const gateMeta = FTP_GATE_LABELS[gateId]!;
const artifacts = FTP_GATE_ARTIFACTS[gateId]!;

export default function GateArtifact3({ targetUserId }: GateProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data, loaded, submitting, updateField, isBuddyApproved, isSubmitted, handleSubmit } = useGateControl({
    user, profile, worksheetId: gateId, phase: 'week-3', defaultData: { employeeName: '', artifacts: artifacts.map(() => false), buddyNotes: '' },
    requiredFields: [{ key: 'employeeName', label: 'Instructor Name' }], targetUserId,
  });

  if (isBuddyApproved) return <SubmittedView title="Gate 3 approved" msg="Gate 3 artifacts approved." path="/week-3" />;
  if (isSubmitted) return <SubmittedView title={gateMeta.title + ' Submitted'} msg="Week 3 artifacts submitted for review." path="/week-3" />;
  if (!loaded) return <LoadingView />;
  const allRequiredMet = artifacts.every((a, i) => !a.required || (data.artifacts as boolean[])?.[i]);

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => navigate('/week-3')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}><ArrowLeft size={14} strokeWidth={1.5} /> Back to Week 3</button>
        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, color: t.ch, marginBottom: '2px' }}>{gateMeta.title}</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>{gateMeta.subtitle}</p>
            </div>
          </div>
        </div>
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()}>
          <Section title="Required Artifacts">
            {artifacts.map((a, i) => {
              const checked = (data.artifacts as boolean[])?.[i];
              return (
                <div key={i} onClick={() => { const arr = [...((data.artifacts as boolean[]) || [])]; arr[i] = !arr[i]; updateField('artifacts', arr); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderLeft: checked ? '3px solid ' + t.success : '3px solid ' + t.wg }}>
                  <div style={{ width: '20px', height: '20px', border: checked ? 'none' : '1px solid ' + t.wg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: checked ? t.success : 'transparent' }}>
                    {checked && <CheckCircle2 size={14} color="#FFF" strokeWidth={2.5} />}
                  </div>
                  <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, flex: 1 }}>{a.label}</span>
                </div>
              );
            })}
          </Section>
          <Section title="Notes">
            <textarea className="lux-textarea" rows={2} value={data.buddyNotes as string} onChange={e => updateField('buddyNotes', e.target.value)} placeholder="Additional comments..." />
          </Section>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/week-3')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={submitting || !allRequiredMet} className="lux-btn lux-btn-primary">
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Gate</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SubmittedView({ title, msg, path }: { title: string; msg: string; path: string }) {
  const navigate = useNavigate();
  return (
    <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
      <div className="lux-container" style={{ textAlign: 'center' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
        <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch }}>{title}</h1>
        <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>{msg}</p>
        <button onClick={() => navigate(path)} className="lux-btn lux-btn-primary"><span className="gold-overlay" /><span className="btn-content">Back</span></button>
      </div>
    </div>
  );
}
