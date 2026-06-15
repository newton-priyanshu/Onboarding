import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorksheet } from '../../hooks/useWorksheet';
import { Users } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, FieldGrid, ReviewFeedback } from '../../worksheetComponents';

const WORKSHEET_ID = 'p1_w1';

const blankStakeholder = () => ({ name: '', role: '', team: '', responsibility: '' });
const blankConversation = () => ({ instructorName: '', date: '', takeaways: '' });

export default function Phase1Worksheet1() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    data, setData, loaded, submitting, submitError, saveStatus,
    updateField, handleSubmit,
    isApproved, isSubmitted,
  } = useWorksheet({
    user,
    worksheetId: WORKSHEET_ID,
    phase: 'phase-1',
    defaultData: {
      employeeName: '',
      department: '',
      // Section A: Stakeholder Directory (4 rows)
      stakeholders: Array(4).fill(null).map(() => blankStakeholder()),
      // Section B: One-on-One Conversations Log (2 rows)
      conversations: Array(2).fill(null).map(() => blankConversation()),
      // Section C: Buddy/Mentor Assignment
      buddyName: '',
      buddyAssignmentDate: '',
      buddyChannel: '',
      buddySyncDay: '',
      // Reflection
      reflectionLearningFrom: '',
    },
    requiredFields: [
      { key: 'employeeName', label: 'Full Name' },
      { key: 'buddyName', label: 'Buddy / Mentor Name' },
      { key: 'buddyAssignmentDate', label: 'Assignment Date (must be by Day 3)' },
    ],
    redirectPath: '/phase-1',
    approvedMsg: 'Your Team Introduction worksheet has been reviewed and approved.',
    submittedMsg: 'Your Team Introduction & Stakeholder Mapping worksheet has been submitted for review.',
  });

  if (isApproved) return <ApprovedView msg="Your Team Introduction worksheet has been reviewed and approved." path="/phase-1" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (isSubmitted) return <SubmittedView msg="Your Team Introduction & Stakeholder Mapping worksheet has been submitted for review." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={Users} title="Team Introduction & Stakeholder Mapping Log" subtitle="Days 1-7 · Build an accurate map of every person you work with." saveStatus={saveStatus} />

        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You">
            <FieldGrid cols={2}>
              <FieldGroup label="Full Name" required id="emp-name"><input id="emp-name" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
              <FieldGroup label="Department / Course" id="dept"><input id="dept" className="lux-input" value={data.department} onChange={e => updateField('department', e.target.value)} /></FieldGroup>
            </FieldGrid>
          </WorksheetSection>

          <WorksheetSection title="Section A: Stakeholder Directory" subtitle="Map the key people you work with.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Name</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Role / Title</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Team / Subject</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Key Responsibility</span>
              </div>
              {data.stakeholders.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="Name" id={`st-name-${i}`} value={s.name} onChange={e => setData(p => { const arr = [...p.stakeholders]; arr[i] = { ...arr[i], name: e.target.value }; return { ...p, stakeholders: arr }; })} />
                  <input className="lux-input" placeholder="Role" id={`st-role-${i}`} value={s.role} onChange={e => setData(p => { const arr = [...p.stakeholders]; arr[i] = { ...arr[i], role: e.target.value }; return { ...p, stakeholders: arr }; })} />
                  <input className="lux-input" placeholder="Team" id={`st-team-${i}`} value={s.team} onChange={e => setData(p => { const arr = [...p.stakeholders]; arr[i] = { ...arr[i], team: e.target.value }; return { ...p, stakeholders: arr }; })} />
                  <input className="lux-input" placeholder="Why they matter" id={`st-resp-${i}`} value={s.responsibility} onChange={e => setData(p => { const arr = [...p.stakeholders]; arr[i] = { ...arr[i], responsibility: e.target.value }; return { ...p, stakeholders: arr }; })} />
                </div>
              ))}
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section B: One-on-One Conversations Log" subtitle="Connect with min. 2 senior instructors in your first 2 weeks.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 3fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Instructor Name</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Date</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Key Takeaways</span>
              </div>
              {data.conversations.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 3fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="Instructor name" id={`conv-name-${i}`} value={c.instructorName} onChange={e => setData(p => { const arr = [...p.conversations]; arr[i] = { ...arr[i], instructorName: e.target.value }; return { ...p, conversations: arr }; })} />
                  <input className="lux-input" type="date" id={`conv-date-${i}`} value={c.date} onChange={e => setData(p => { const arr = [...p.conversations]; arr[i] = { ...arr[i], date: e.target.value }; return { ...p, conversations: arr }; })} />
                  <textarea className="lux-textarea" rows={2} placeholder="What key insight did you gain from this conversation?" id={`conv-take-${i}`} value={c.takeaways} onChange={e => setData(p => { const arr = [...p.conversations]; arr[i] = { ...arr[i], takeaways: e.target.value }; return { ...p, conversations: arr }; })} />
                </div>
              ))}
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section C: Buddy / Mentor Assignment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FieldGroup label="Buddy / Mentor Name" required id="buddy-name"><input id="buddy-name" className="lux-input" value={data.buddyName} onChange={e => updateField('buddyName', e.target.value)} /></FieldGroup>
              <FieldGrid cols={2}>
                <FieldGroup label="Assignment Date (must be by Day 3)" required id="buddy-date"><input id="buddy-date" type="date" className="lux-input" value={data.buddyAssignmentDate} onChange={e => updateField('buddyAssignmentDate', e.target.value)} /></FieldGroup>
                <FieldGroup label="Channel (Slack/WhatsApp/Email)" id="buddy-channel"><input id="buddy-channel" className="lux-input" value={data.buddyChannel} onChange={e => updateField('buddyChannel', e.target.value)} /></FieldGroup>
              </FieldGrid>
              <FieldGroup label="Scheduled Weekly Sync Day & Time" id="buddy-sync"><input id="buddy-sync" className="lux-input" placeholder="e.g. Monday 11 AM" value={data.buddySyncDay} onChange={e => updateField('buddySyncDay', e.target.value)} /></FieldGroup>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="Which colleague's working style would you most like to learn from, and what specifically draws you to their approach?" id="reflection">
              <textarea id="reflection" className="lux-textarea" rows={2} value={data.reflectionLearningFrom} onChange={e => updateField('reflectionLearningFrom', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>

          <ErrorAlert message={submitError} />

          <ActionBar onCancel={() => navigate('/phase-1')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
