import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { Shield, AlertCircle } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p1_w4';
const blankSemester = () => ({ semester: '', startDate: '', endDate: '', keyEvents: '' });
const blankCohort = () => ({ name: '', students: '', semesterYear: '', notes: '' });

export default function Phase1Worksheet4() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    semesters: Array(4).fill(null).map(() => blankSemester()),
    cohorts: Array(4).fill(null).map(() => blankCohort()),
    liaisonContact: '', escalationPath: '', gradeProcess: '', latePolicy: '',
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
  const uSem = (i, f, v) => setData(p => { const arr = [...p.semesters]; arr[i] = { ...arr[i], [f]: v }; return { ...p, semesters: arr }; });
  const uCoh = (i, f, v) => setData(p => { const arr = [...p.cohorts]; arr[i] = { ...arr[i], [f]: v }; return { ...p, cohorts: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (data.status === 'submitted' && loaded) return <SubmittedView msg="University Governance worksheet submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={Shield} title="Partner University Governance & Semester Architecture Map" subtitle="Days 1-14 · Understand how the semester and university partnership operate." saveStatus={saveStatus} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Section A: Academic Calendar Map" subtitle="Map out key dates for each semester.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Semester', 'Start Date', 'End Date', 'Key Events'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.semesters.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                <input className="lux-input" placeholder="e.g. Sem 1" value={s.semester} onChange={e => uSem(i, 'semester', e.target.value)} />
                <input className="lux-input" type="date" value={s.startDate} onChange={e => uSem(i, 'startDate', e.target.value)} />
                <input className="lux-input" type="date" value={s.endDate} onChange={e => uSem(i, 'endDate', e.target.value)} />
                <input className="lux-input" placeholder="Exams, breaks" value={s.keyEvents} onChange={e => uSem(i, 'keyEvents', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Section B: Cohort Structure" subtitle="List cohorts you'll be teaching.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Cohort Name', 'No. of Students', 'Semester/Year', 'Notes'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.cohorts.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                <input className="lux-input" placeholder="Cohort" value={c.name} onChange={e => uCoh(i, 'name', e.target.value)} />
                <input className="lux-input" placeholder="Count" value={c.students} onChange={e => uCoh(i, 'students', e.target.value)} />
                <input className="lux-input" placeholder="e.g. Y1S1" value={c.semesterYear} onChange={e => uCoh(i, 'semesterYear', e.target.value)} />
                <input className="lux-input" placeholder="Notes" value={c.notes} onChange={e => uCoh(i, 'notes', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Section C: Governance Contacts">
            <FieldGroup label="University Liaison Contact"><input className="lux-input" value={data.liaisonContact} onChange={e => u('liaisonContact', e.target.value)} /></FieldGroup>
            <FieldGroup label="Internal escalation path for academic disputes"><textarea className="lux-textarea" rows={2} value={data.escalationPath} onChange={e => u('escalationPath', e.target.value)} /></FieldGroup>
            <FieldGroup label="Grade submission process and deadline"><textarea className="lux-textarea" rows={2} value={data.gradeProcess} onChange={e => u('gradeProcess', e.target.value)} /></FieldGroup>
            <FieldGroup label="Policy for late submissions and re-assessments"><textarea className="lux-textarea" rows={2} value={data.latePolicy} onChange={e => u('latePolicy', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-1')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
