import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { ClipboardCheck, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p2_w2';
const blankSession = () => ({ date: '', subject: '', observer: '', notes: '' });
const dims = ['Explained problem statement clearly', 'Circulated and helped multiple students', 'Debugged without giving answers', 'Managed 90-min lab time', 'Maintained student engagement'];

export default function Phase2Worksheet2() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    sessions: Array(4).fill(null).map(() => blankSession()),
    dimScores: dims.map(() => [0, 0]),
    strongestMoment: '', biggestChallenge: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-2');

  useEffect(() => {
    if (!user?.id) return; (async () => { const saved = await loadWorksheetData(user.id, WS); if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' })); else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); } setLoaded(true); })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const uS = (i, f, v) => setData(p => { const arr = [...p.sessions]; arr[i] = { ...arr[i], [f]: v }; return { ...p, sessions: arr }; });
  const uScore = (dimIdx, sessionIdx, v) => setData(p => { const arr = [...p.dimScores]; arr[dimIdx] = [...arr[dimIdx]]; arr[dimIdx][sessionIdx] = v; return { ...p, dimScores: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (loaded && data._savedReviewStatus === 'approved') return <ApprovedView msg="Your Lab Scorecard has been reviewed and approved." path="/phase-2" />;
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') return <SubmittedView msg="Lab scorecard submitted." path="/phase-2" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-2" label="Back to Phase 2" />
        <WorksheetHeader icon={ClipboardCheck} title="Independent Lab Facilitation Scorecard & Feedback Tracker" subtitle="Days 31-60 · Build lab facilitation confidence." saveStatus={saveStatus} />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review the feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Lab Session Log" subtitle="Min. 2 independent sessions required.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Date', 'Subject / Topic', 'Observer', 'Observer Notes'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.sessions.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 2.5fr', gap: '8px' }}>
                <input className="lux-input" type="date" value={s.date} onChange={e => uS(i, 'date', e.target.value)} />
                <input className="lux-input" placeholder="Subject" value={s.subject} onChange={e => uS(i, 'subject', e.target.value)} />
                <input className="lux-input" placeholder="Observer" value={s.observer} onChange={e => uS(i, 'observer', e.target.value)} />
                <input className="lux-input" placeholder="Observer notes" value={s.notes} onChange={e => uS(i, 'notes', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Facilitation Scorecard" subtitle="Rate each dimension 1-5 per session.">
            {dims.map((dim, di) => (
              <div key={di} style={{ padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-charcoal)', marginBottom: '6px' }}>{dim}</p>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                  {[0, 1].map(si => (
                    <div key={si} style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-warm-grey)', letterSpacing: '0.1em' }}>Session {si + 1}: </span>
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: 'var(--color-gold)' }}>{data.dimScores[di][si]}/5</span>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        {[1, 2, 3, 4, 5].map(v => (
                          <button key={v} type="button" onClick={() => uScore(di, si, v)}
                            style={{
                              flex: 1, padding: '6px 4px', cursor: 'pointer',
                              border: data.dimScores[di][si] >= v ? '1px solid var(--color-charcoal)' : '1px solid rgba(26,26,26,0.15)',
                              background: data.dimScores[di][si] >= v ? 'var(--color-charcoal)' : 'transparent',
                              color: data.dimScores[di][si] >= v ? '#F9F8F6' : 'var(--color-warm-grey)',
                              fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500,
                              transition: 'all 200ms var(--ease-lux)',
                            }}>{v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="Strongest moment in lab facilitation this phase:"><textarea className="lux-textarea" rows={2} value={data.strongestMoment} onChange={e => u('strongestMoment', e.target.value)} /></FieldGroup>
            <FieldGroup label="Biggest challenge faced and how you handled it:"><textarea className="lux-textarea" rows={2} value={data.biggestChallenge} onChange={e => u('biggestChallenge', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-2')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
