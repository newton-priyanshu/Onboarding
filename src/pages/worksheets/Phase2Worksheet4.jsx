import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { Monitor, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback } from '../../worksheetComponents';

const WS = 'p2_w4';
const portalTasks = ['Create coding question with custom test cases', 'Create MCQ with answer key and explanations', 'Create subjective (essay) question', 'Create fill-in-the-blank question', 'Design and publish a structured assignment', 'Set up lab exercise with test cases', 'Create and configure a quiz/assessment', 'Set cohort-specific content release rules', 'View and export student progress reports', 'Reopen/extend deadline for individual students'];

export default function Phase2Worksheet4() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    tasks: portalTasks.map(() => ({ self: false, verified: false })),
    demoDate: '', demoTasks: '', demoGaps: '', demoSignature: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-2');

  useEffect(() => {
    if (!user?.id) return; (async () => { const saved = await loadWorksheetData(user.id, WS);if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '', _savedReviewComment: saved.review_comment || '', _savedReviewerName: saved.reviewer_name || '', _savedReviewHistory: saved.review_history || [], _savedReviewedAt: saved.reviewed_at || '' }));
      else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); } setLoaded(true); })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const toggleTask = (i, f) => setData(p => { const arr = [...p.tasks]; arr[i] = { ...arr[i], [f]: !arr[i][f] }; return { ...p, tasks: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (loaded && data._savedReviewStatus === 'approved') return <ApprovedView msg="Your Portal Operations checklist has been reviewed and approved." path="/phase-2" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision' && data._savedReviewStatus !== 'revision_submitted') return <SubmittedView msg="Portal ops checklist submitted." path="/phase-2" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-2" label="Back to Phase 2" />
        <WorksheetHeader icon={Monitor} title="Advanced Portal Operations & Quiz Configuration Check" subtitle="Days 31-60 · Independent portal proficiency." saveStatus={saveStatus} />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Advanced Portal Operations Checklist" subtitle="By Day 60, you must independently handle all operations.">
            {portalTasks.map((task, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', flex: 1, color: 'var(--color-charcoal)' }}>{task}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                  <input type="checkbox" checked={data.tasks[i].self} onChange={() => toggleTask(i, 'self')} style={{ accentColor: 'var(--color-charcoal)' }} /> Self
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                  <input type="checkbox" checked={data.tasks[i].verified} onChange={() => toggleTask(i, 'verified')} style={{ accentColor: 'var(--color-charcoal)' }} /> Verified
                </label>
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Faculty Lead Live Demo Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FieldGroup label="Demo conducted on (date)"><input type="date" className="lux-input" value={data.demoDate} onChange={e => u('demoDate', e.target.value)} /></FieldGroup>
              <FieldGroup label="Tasks demonstrated"><input className="lux-input" value={data.demoTasks} onChange={e => u('demoTasks', e.target.value)} /></FieldGroup>
            </div>
            <FieldGroup label="Gaps to address"><textarea className="lux-textarea" rows={1} value={data.demoGaps} onChange={e => u('demoGaps', e.target.value)} /></FieldGroup>
            <FieldGroup label="Faculty Lead Signature"><input className="lux-input" value={data.demoSignature} onChange={e => u('demoSignature', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-2')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
