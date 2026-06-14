import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { Eye, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p1_w6';
const blankObs = () => ({ date: '', subject: '', instructor: '', sessionType: '', observations: '' });

export default function Phase1Worksheet6() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    observations: Array(8).fill(null).map(() => blankObs()),
    reflectionArc: '', reflectionRoom: '', reflectionDoubts: '', reflectionLabDiff: '', reflectionAdopt: '',
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
  const uObs = (i, f, v) => setData(p => { const arr = [...p.observations]; arr[i] = { ...arr[i], [f]: v }; return { ...p, observations: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (loaded && data._savedReviewStatus === 'approved') return <ApprovedView msg="Your Observation Journal has been reviewed and approved." path="/phase-1" />;
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') return <SubmittedView msg="Observation journal submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={Eye} title="Classroom & Laboratory Live Observation Journal" subtitle="Days 7-28 · Observe minimum 2-3 days per subject." saveStatus={saveStatus} />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review the feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Lecture & Lab Observation Log" subtitle="Min. 2 sessions per subject. Note session type (Lecture / Lab).">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 1fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Date', 'Subject', 'Instructor', 'Type', 'Key Observations'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.observations.map((o, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 1fr 2.5fr', gap: '8px' }}>
                <input className="lux-input" type="date" value={o.date} onChange={e => uObs(i, 'date', e.target.value)} />
                <input className="lux-input" placeholder="Subject" value={o.subject} onChange={e => uObs(i, 'subject', e.target.value)} />
                <input className="lux-input" placeholder="Instructor" value={o.instructor} onChange={e => uObs(i, 'instructor', e.target.value)} />
                <select className="lux-select" value={o.sessionType} onChange={e => uObs(i, 'sessionType', e.target.value)}>
                  <option value="">Type</option><option value="Lecture">Lecture</option><option value="Lab">Lab</option>
                </select>
                <input className="lux-input" placeholder="What stood out?" value={o.observations} onChange={e => uObs(i, 'observations', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Deep Reflection Questions" subtitle="Complete after each subject's observations.">
            <FieldGroup label="1. How did the instructor structure the 60–90 minute lecture? Describe the arc."><textarea className="lux-textarea" rows={2} value={data.reflectionArc} onChange={e => u('reflectionArc', e.target.value)} /></FieldGroup>
            <FieldGroup label="2. How did the instructor 'read the room' — pace, pauses, comprehension checks?"><textarea className="lux-textarea" rows={2} value={data.reflectionRoom} onChange={e => u('reflectionRoom', e.target.value)} /></FieldGroup>
            <FieldGroup label="3. How were student doubts handled without derailing the session?"><textarea className="lux-textarea" rows={2} value={data.reflectionDoubts} onChange={e => u('reflectionDoubts', e.target.value)} /></FieldGroup>
            <FieldGroup label="4. How did lab tone and facilitation style differ from the lecture?"><textarea className="lux-textarea" rows={2} value={data.reflectionLabDiff} onChange={e => u('reflectionLabDiff', e.target.value)} /></FieldGroup>
            <FieldGroup label="5. What one teaching technique will you adopt from what you observed, and why?"><textarea className="lux-textarea" rows={2} value={data.reflectionAdopt} onChange={e => u('reflectionAdopt', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-1')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
