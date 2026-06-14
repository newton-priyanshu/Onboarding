import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { MessageCircle, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p1_w8';
const blankChan = () => ({ channel: '', dateRange: '', themes: '', pastDecisions: '' });

export default function Phase1Worksheet8() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    channels: Array(6).fill(null).map(() => blankChan()),
    topMisconceptions: '', contentDecisions: '', highestImpact: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-1');

  useEffect(() => {
    if (!user?.id) return; (async () => {
      const saved = await loadWorksheetData(user.id, WS);
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
      else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); }
      setLoaded(true);
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const uCh = (i, f, v) => setData(p => { const arr = [...p.channels]; arr[i] = { ...arr[i], [f]: v }; return { ...p, channels: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (data.status === 'submitted' && loaded) return <SubmittedView msg="Slack audit submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={MessageCircle} title="Slack Historical Context & Student Bottleneck Audit" subtitle="Days 7-28 · Read subject Slack channels to understand past decisions." saveStatus={saveStatus} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Slack Channel Audit Log" subtitle="Review each channel and document key themes and past decisions.">
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr 2fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Channel / Subject', 'Date Range Reviewed', 'Key Themes / Student Issues', 'Past Decisions Made'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.channels.map((ch, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr 2fr', gap: '8px' }}>
                <input className="lux-input" placeholder="Channel name" value={ch.channel} onChange={e => uCh(i, 'channel', e.target.value)} />
                <input className="lux-input" placeholder="e.g. Jan-Mar 2025" value={ch.dateRange} onChange={e => uCh(i, 'dateRange', e.target.value)} />
                <input className="lux-input" placeholder="Common issues" value={ch.themes} onChange={e => uCh(i, 'themes', e.target.value)} />
                <input className="lux-input" placeholder="Past decisions" value={ch.pastDecisions} onChange={e => uCh(i, 'pastDecisions', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Bottleneck Synthesis" subtitle="Synthesise patterns across channels.">
            <FieldGroup label="List the top 3 recurring student misconceptions or difficulty patterns across all channels:"><textarea className="lux-textarea" rows={3} value={data.topMisconceptions} onChange={e => u('topMisconceptions', e.target.value)} /></FieldGroup>
            <FieldGroup label="Which content sequencing decisions were made in the past, and do they still make sense?"><textarea className="lux-textarea" rows={2} value={data.contentDecisions} onChange={e => u('contentDecisions', e.target.value)} /></FieldGroup>
            <FieldGroup label="What one course improvement would have the highest impact on student outcomes?"><textarea className="lux-textarea" rows={2} value={data.highestImpact} onChange={e => u('highestImpact', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-1')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
