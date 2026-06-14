import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p2_w1';
const blankEntry = () => ({ date: '', channel: '', query: '', resolution: '' });
const blankError = () => ({ misconception: '', topic: '', rootCause: '', fix: '' });

export default function Phase2Worksheet1() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    entries: Array(10).fill(null).map(() => blankEntry()),
    errors: Array(6).fill(null).map(() => blankError()),
    keyInsight: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-2');

  useEffect(() => {
    if (!user?.id) return; (async () => {
      const saved = await loadWorksheetData(user.id, WS);
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
      else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); }
      setLoaded(true);
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const uE = (i, f, v) => setData(p => { const arr = [...p.entries]; arr[i] = { ...arr[i], [f]: v }; return { ...p, entries: arr }; });
  const uEr = (i, f, v) => setData(p => { const arr = [...p.errors]; arr[i] = { ...arr[i], [f]: v }; return { ...p, errors: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (data.status === 'submitted' && loaded) return <SubmittedView msg="Student doubt log submitted." path="/phase-2" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-2" label="Back to Phase 2" />
        <WorksheetHeader icon={MessageSquare} title="Student Doubt Resolution & Common Errors Diagnostic Log" subtitle="Days 31-60 · Track min. 30 student interactions." saveStatus={saveStatus} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Doubt Resolution Log" subtitle="Track each student interaction.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2.5fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Date', 'Channel', 'Student Query', 'Resolution'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.entries.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2.5fr 2.5fr', gap: '8px' }}>
                <input className="lux-input" type="date" value={e.date} onChange={ev => uE(i, 'date', ev.target.value)} />
                <input className="lux-input" placeholder="Portal/Slack/Lab" value={e.channel} onChange={ev => uE(i, 'channel', ev.target.value)} />
                <input className="lux-input" placeholder="What was the doubt?" value={e.query} onChange={ev => uE(i, 'query', ev.target.value)} />
                <input className="lux-input" placeholder="How was it resolved?" value={e.resolution} onChange={ev => uE(i, 'resolution', ev.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Error Pattern Diagnostic" subtitle="Identify recurring misconceptions and their root causes.">
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 2fr 2fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Misconception', 'Topic', 'Root Cause', 'Suggested Fix'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.errors.map((er, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 2fr 2fr', gap: '8px' }}>
                <input className="lux-input" placeholder="Error pattern" value={er.misconception} onChange={ev => uEr(i, 'misconception', ev.target.value)} />
                <input className="lux-input" placeholder="Topic" value={er.topic} onChange={ev => uEr(i, 'topic', ev.target.value)} />
                <input className="lux-input" placeholder="Why does it happen?" value={er.rootCause} onChange={ev => uEr(i, 'rootCause', ev.target.value)} />
                <input className="lux-input" placeholder="How to address it" value={er.fix} onChange={ev => uEr(i, 'fix', ev.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Key Insight"><FieldGroup label="Most important insight gained from student interactions this phase:"><textarea className="lux-textarea" rows={3} value={data.keyInsight} onChange={e => u('keyInsight', e.target.value)} /></FieldGroup></WorksheetSection>
          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-2')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
