import { useState, useEffect } from 'react';
import SI from '../../components/SaveIndicator';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { MessageSquare, CheckCircle2, Clock, AlertCircle, Send, Save } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WORKSHEET_ID = 'p1_w2';

const blankWeek = () => ({ date: '', topics: '', actions: '', mentorSignoff: false });

export default function Phase1Worksheet2() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(() => ({
    employeeName: '',
    mentorName: '',
    weeks: Array(4).fill(null).map(() => ({ ...blankWeek(), mentorSignoff: false })),
    mentorStrengths: '',
    mentorAreasForGrowth: '',
    mentorReadiness: '',
    status: 'In Progress',
    dateSubmitted: '',
    _savedReviewStatus: '',
  }));

  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { saveStatus, flushSave } = useAutoSave(user, data, WORKSHEET_ID, 'phase-1');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const saved = await loadWorksheetData(user.id, WORKSHEET_ID);
        if (saved?.worksheet_data) {
          setData((prev) => ({ ...prev, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
        } else {
          const name = await getOAuthName();
          if (name) setData((prev) => ({ ...prev, employeeName: name }));
        }
        setLoaded(true);
      } catch (err) { console.error('Load error:', err); setLoaded(true); }
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const updateWeek = (i, f, v) => setData(p => { const arr = [...p.weeks]; arr[i] = { ...arr[i], [f]: v }; return { ...p, weeks: arr }; });

  const requiredFields = [
    { key: 'employeeName', label: 'Full Name' },
    { key: 'mentorName', label: 'Mentor Name' },
  ];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  async function handleSubmit() {
    setSubmitError('');
    if (!validateRequired()) return;
    setSubmitting(true);
    const submitData = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') };
    setData(submitData);
    await flushSave(submitData);
    setSubmitting(false);
  }

  if (loaded && data._savedReviewStatus === 'approved') return <ApprovedView msg="Your Faculty Mentor Alignment worksheet has been reviewed and approved." path="/phase-1" />;
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') return <SubmittedView msg="Your Faculty Mentor Alignment & Weekly Sync Tracker has been submitted for review." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={MessageSquare} title="Faculty Mentor Alignment & Weekly Sync Tracker" subtitle="Days 1-30 · Track weekly mentor sync sessions." saveStatus={saveStatus} />

        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup>
              <FieldGroup label="Mentor Name" required><input className="lux-input" placeholder="Your mentor's name" value={data.mentorName} onChange={e => u('mentorName', e.target.value)} /></FieldGroup>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Weekly Mentor Sync Tracker" subtitle="Each session should cover progress, blockers, and one learning goal for the coming week.">
            {data.weeks.map((week, i) => (
              <div key={i} style={{ borderBottom: '1px solid rgba(26,26,26,0.06)', paddingBottom: '1rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Week {i + 1}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>
                    <input type="checkbox" checked={week.mentorSignoff} onChange={e => updateWeek(i, 'mentorSignoff', e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
                    Mentor Sign-off
                  </label>
                </div>
                <input className="lux-input" type="date" value={week.date} onChange={e => updateWeek(i, 'date', e.target.value)} style={{ marginBottom: '8px' }} />
                <textarea className="lux-textarea" rows={2} placeholder="Topics Discussed" value={week.topics} onChange={e => updateWeek(i, 'topics', e.target.value)} />
                <textarea className="lux-textarea" rows={2} placeholder="Actions / Follow-ups" value={week.actions} onChange={e => updateWeek(i, 'actions', e.target.value)} style={{ marginTop: '8px' }} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Mentor Feedback Summary (End of Phase 1)" subtitle="Filled by Mentor — summarize strengths, growth areas, and readiness.">
            <FieldGroup label="Strengths observed so far:"><textarea className="lux-textarea" rows={2} value={data.mentorStrengths} onChange={e => u('mentorStrengths', e.target.value)} /></FieldGroup>
            <FieldGroup label="Areas needing development:"><textarea className="lux-textarea" rows={2} value={data.mentorAreasForGrowth} onChange={e => u('mentorAreasForGrowth', e.target.value)} /></FieldGroup>
            <FieldGroup label="Mentor overall readiness assessment:"><textarea className="lux-textarea" rows={2} value={data.mentorReadiness} onChange={e => u('mentorReadiness', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-1')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
