import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { Monitor, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback } from '../../worksheetComponents';

const WS = 'p1_w5';
const studentFeatures = ['Browse course dashboard and navigation', 'View and attempt a live assignment', 'Submit code through the contest / assessment interface', 'View grades and submission feedback', 'Navigate lab exercise interface', 'Access lecture schedule and session links'];
const instructorTasks = ['Create a coding question with test cases', 'Create an MCQ with answer key', 'Upload and structure an assignment with deadline', 'Schedule a live class session', 'Lock / unlock content by cohort and date', 'Track student submission status', 'View individual student activity report', 'Release grades and feedback'];

export default function Phase1Worksheet5() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    studentLog: studentFeatures.map(() => ({ date: '', friction: '' })),
    instructorTasks: instructorTasks.map(() => ({ selfAssessed: false, verified: false })),
    demoDate: '', demoTasks: '', demoGaps: '', demoSignature: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-1');

  useEffect(() => {
    if (!user?.id) return; (async () => {
      const saved = await loadWorksheetData(user.id, WS);
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '', _savedReviewComment: saved.review_comment || '', _savedReviewerName: saved.reviewer_name || '', _savedReviewHistory: saved.review_history || [], _savedReviewedAt: saved.reviewed_at || '' }));
      else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); }
      setLoaded(true);
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const uStudent = (i, f, v) => setData(p => { const arr = [...p.studentLog]; arr[i] = { ...arr[i], [f]: v }; return { ...p, studentLog: arr }; });
  const uTask = (i, f) => setData(p => { const arr = [...p.instructorTasks]; arr[i] = { ...arr[i], [f]: !arr[i][f] }; return { ...p, instructorTasks: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (loaded && data._savedReviewStatus === 'approved') return <ApprovedView msg="Your Portal Walkthrough has been reviewed and approved." path="/phase-1" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision' && data._savedReviewStatus !== 'revision_submitted') return <SubmittedView msg="Portal walkthrough submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={Monitor} title="Core Learning Portal Practical Walkthrough & Verification" subtitle="Days 3-14 · Achieve end-to-end portal proficiency." saveStatus={saveStatus} />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Section A: Student-Side Exploration Log" subtitle="Experience the portal as a student.">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Feature Explored', 'Date', 'Friction Points Noted'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {studentFeatures.map((feat, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', color: 'var(--color-charcoal)' }}>{feat}</span>
                <input className="lux-input" type="date" value={data.studentLog[i].date} onChange={e => uStudent(i, 'date', e.target.value)} />
                <input className="lux-input" placeholder="What did you notice?" value={data.studentLog[i].friction} onChange={e => uStudent(i, 'friction', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Section B: Instructor Portal Competency Checklist" subtitle="Check off tasks you can perform independently. Faculty Lead verifies during demo.">
            {instructorTasks.map((task, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', flex: 1, color: 'var(--color-charcoal)' }}>{task}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                  <input type="checkbox" checked={data.instructorTasks[i].selfAssessed} onChange={() => uTask(i, 'selfAssessed')} style={{ accentColor: 'var(--color-charcoal)' }} /> Self
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                  <input type="checkbox" checked={data.instructorTasks[i].verified} onChange={() => uTask(i, 'verified')} style={{ accentColor: 'var(--color-charcoal)' }} /> Verified
                </label>
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Faculty Lead Demo Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FieldGroup label="Demo conducted on (date)"><input type="date" className="lux-input" value={data.demoDate} onChange={e => u('demoDate', e.target.value)} /></FieldGroup>
              <FieldGroup label="Tasks demonstrated"><input className="lux-input" placeholder="List tasks shown" value={data.demoTasks} onChange={e => u('demoTasks', e.target.value)} /></FieldGroup>
            </div>
            <FieldGroup label="Gap areas to revisit (if any)"><textarea className="lux-textarea" rows={2} value={data.demoGaps} onChange={e => u('demoGaps', e.target.value)} /></FieldGroup>
            <FieldGroup label="Faculty Lead Signature"><input className="lux-input" value={data.demoSignature} onChange={e => u('demoSignature', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-1')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
