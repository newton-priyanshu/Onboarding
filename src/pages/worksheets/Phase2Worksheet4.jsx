import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorksheet } from '../../hooks/useWorksheet';
import { Monitor } from 'lucide-react';
import {BuddyApprovedView, WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback} from '../../worksheetComponents';

const WS = 'p2_w4';
const portalTasks = ['Create coding question with custom test cases', 'Create MCQ with answer key and explanations', 'Design and publish a structured assignment', 'Set up lab exercise with test cases', 'Set cohort-specific content release rules', 'Reopen/extend deadline for individual students'];

export default function Phase2Worksheet4() {
  const n = useNavigate(); const { user } = useAuth();

  const {
    data, setData, loaded, submitting, submitError, saveStatus,
    updateField, handleSubmit,
    isBuddyApproved, isApproved, isSubmitted,
  } = useWorksheet({
    user, worksheetId: WS, phase: 'phase-2',
    defaultData: {
      employeeName: '',
      tasks: portalTasks.map(() => ({ self: false, verified: false })),
      demoDate: '', demoTasks: '', demoGaps: '', demoSignature: '',
      employeeSignature: '',
    },
    requiredFields: [{ key: 'employeeName', label: 'Full Name' }],
    redirectPath: '/phase-2',
    approvedMsg: 'Your Portal Operations checklist has been reviewed and approved.',
    submittedMsg: 'Portal ops checklist submitted.',
  });

  const toggleTask = (i, f) => setData(p => { const arr = [...p.tasks]; arr[i] = { ...arr[i], [f]: !arr[i][f] }; return { ...p, tasks: arr }; });

  if (isBuddyApproved) return <BuddyApprovedView msg="Your Portal Ops checklist has been approved by your buddy." path="/phase-2" />;
  if (isApproved) return <ApprovedView msg="Your Portal Operations checklist has been reviewed and approved." path="/phase-2" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (isSubmitted) return <SubmittedView msg="Portal ops checklist submitted." path="/phase-2" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-2" label="Back to Phase 2" />
        <WorksheetHeader icon={Monitor} title="Advanced Portal Operations & Quiz Configuration Check" subtitle="Days 31-60 · Independent portal proficiency." saveStatus={saveStatus} />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

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
              <FieldGroup label="Demo conducted on (date)"><input type="date" className="lux-input" value={data.demoDate} onChange={e => updateField('demoDate', e.target.value)} /></FieldGroup>
              <FieldGroup label="Tasks demonstrated"><input className="lux-input" value={data.demoTasks} onChange={e => updateField('demoTasks', e.target.value)} /></FieldGroup>
            </div>
            <FieldGroup label="Gaps to address"><textarea className="lux-textarea" rows={1} value={data.demoGaps} onChange={e => updateField('demoGaps', e.target.value)} /></FieldGroup>
            <FieldGroup label="Faculty Lead Signature"><input className="lux-input" value={data.demoSignature} onChange={e => updateField('demoSignature', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-2')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
