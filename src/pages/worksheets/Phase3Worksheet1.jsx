import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { BookText, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p3_w1';
const blankLec = () => ({ date: '', subject: '', duration: '', observer: '' });

export default function Phase3Worksheet1() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    lectures: Array(4).fill(null).map(() => blankLec()),
    postMortemFlow: '', postMortemParticipation: '', postMortemQuestions: '', postMortemTime: '',
    feedbackSummary: '', improvementTarget: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-3');

  useEffect(() => {
    if (!user?.id) return; (async () => { const saved = await loadWorksheetData(user.id, WS); if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' })); else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); } setLoaded(true); })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const uL = (i, f, v) => setData(p => { const arr = [...p.lectures]; arr[i] = { ...arr[i], [f]: v }; return { ...p, lectures: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (data.status === 'submitted' && loaded) return <SubmittedView msg="Lecture delivery log submitted." path="/phase-3" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader icon={BookText} title="Independent Lecture Delivery Log & Pacing Post-Mortem" subtitle="Days 61-90 · Min. 2 full lectures independently delivered and observed." saveStatus={saveStatus} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Lecture Delivery Log">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Date', 'Subject / Topic', 'Duration', 'Faculty Lead Present?'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.lectures.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 1.5fr', gap: '8px' }}>
                <input className="lux-input" type="date" value={l.date} onChange={e => uL(i, 'date', e.target.value)} />
                <input className="lux-input" placeholder="Topic" value={l.subject} onChange={e => uL(i, 'subject', e.target.value)} />
                <input className="lux-input" placeholder="mins" value={l.duration} onChange={e => uL(i, 'duration', e.target.value)} />
                <input className="lux-input" placeholder="Observer name" value={l.observer} onChange={e => uL(i, 'observer', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Post-Mortem (Complete Within 24 Hours of Each Lecture)">
            <FieldGroup label="Class flow and pacing — did you introduce concepts progressively? What would you change?"><textarea className="lux-textarea" rows={2} value={data.postMortemFlow} onChange={e => u('postMortemFlow', e.target.value)} /></FieldGroup>
            <FieldGroup label="Student participation — which techniques did you use? How effective were they?"><textarea className="lux-textarea" rows={2} value={data.postMortemParticipation} onChange={e => u('postMortemParticipation', e.target.value)} /></FieldGroup>
            <FieldGroup label="Unexpected questions — how did you handle uncertainty while keeping the class moving?"><textarea className="lux-textarea" rows={2} value={data.postMortemQuestions} onChange={e => u('postMortemQuestions', e.target.value)} /></FieldGroup>
            <FieldGroup label="Time management — did you cover planned content? What was cut or rushed?"><textarea className="lux-textarea" rows={2} value={data.postMortemTime} onChange={e => u('postMortemTime', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Faculty Lead Observation Debrief">
            <FieldGroup label="Faculty Lead feedback summary:"><textarea className="lux-textarea" rows={2} value={data.feedbackSummary} onChange={e => u('feedbackSummary', e.target.value)} /></FieldGroup>
            <FieldGroup label="One specific improvement target for the next lecture:"><textarea className="lux-textarea" rows={1} value={data.improvementTarget} onChange={e => u('improvementTarget', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-3')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
