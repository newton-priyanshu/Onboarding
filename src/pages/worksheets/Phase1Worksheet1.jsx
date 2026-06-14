import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { Users } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, FieldGrid } from '../../worksheetComponents';

const WORKSHEET_ID = 'p1_w1';

const blankStakeholder = () => ({ name: '', role: '', team: '', responsibility: '' });
const blankConversation = () => ({ instructorName: '', date: '', takeaways: '' });

export default function Phase1Worksheet1() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(() => ({
    employeeName: '',
    department: '',
    mentorName: '',
    mentorEmail: '',
    // Section A: Stakeholder Directory (8 rows)
    stakeholders: Array(8).fill(null).map(() => blankStakeholder()),
    // Section B: One-on-One Conversations Log (4 rows)
    conversations: Array(4).fill(null).map(() => blankConversation()),
    // Section C: Buddy/Mentor Assignment
    buddyName: '',
    buddyAssignmentDate: '',
    buddyChannel: '',
    buddySyncDay: '',
    // Reflection
    reflectionLearningFrom: '',
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
  const updateStakeholder = (i, f, v) => setData(p => { const arr = [...p.stakeholders]; arr[i] = { ...arr[i], [f]: v }; return { ...p, stakeholders: arr }; });
  const updateConversation = (i, f, v) => setData(p => { const arr = [...p.conversations]; arr[i] = { ...arr[i], [f]: v }; return { ...p, conversations: arr }; });

  const requiredFields = [
    { key: 'employeeName', label: 'Full Name' },
    { key: 'buddyName', label: 'Buddy / Mentor Name' },
    { key: 'buddyAssignmentDate', label: 'Assignment Date (must be by Day 3)' },
  ];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) {
      setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return false;
    }
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

  if (loaded && data._savedReviewStatus === 'approved') {
    return <ApprovedView msg="Your Team Introduction worksheet has been reviewed and approved." path="/phase-1" />;
  }
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') {
    return <SubmittedView msg="Your Team Introduction & Stakeholder Mapping worksheet has been submitted for review." path="/phase-1" />;
  }

  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={Users} title="Team Introduction & Stakeholder Mapping Log" subtitle="Days 1-7 · Build an accurate map of every person you work with." saveStatus={saveStatus} />

        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You">
            <FieldGrid cols={2}>
              <FieldGroup label="Full Name" required id="emp-name"><input id="emp-name" className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup>
              <FieldGroup label="Department / Course" id="dept"><input id="dept" className="lux-input" value={data.department} onChange={e => u('department', e.target.value)} /></FieldGroup>
            </FieldGrid>
          </WorksheetSection>

          <WorksheetSection title="Section A: Stakeholder Directory" subtitle="List every person you will work with regularly — Name, Role/Title, Team/Subject, Key Responsibility.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Name</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Role / Title</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Team / Subject</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Key Responsibility</span>
              </div>
              {data.stakeholders.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="Name" id={`st-name-${i}`} value={s.name} onChange={e => updateStakeholder(i, 'name', e.target.value)} />
                  <input className="lux-input" placeholder="Role" id={`st-role-${i}`} value={s.role} onChange={e => updateStakeholder(i, 'role', e.target.value)} />
                  <input className="lux-input" placeholder="Team" id={`st-team-${i}`} value={s.team} onChange={e => updateStakeholder(i, 'team', e.target.value)} />
                  <input className="lux-input" placeholder="Why they matter" id={`st-resp-${i}`} value={s.responsibility} onChange={e => updateStakeholder(i, 'responsibility', e.target.value)} />
                </div>
              ))}
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section B: One-on-One Conversations Log" subtitle="Min. 2 senior instructors in the first 2 weeks. Document key takeaways.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 3fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Instructor Name</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Date</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>Key Takeaways</span>
              </div>
              {data.conversations.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 3fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="Instructor name" id={`conv-name-${i}`} value={c.instructorName} onChange={e => updateConversation(i, 'instructorName', e.target.value)} />
                  <input className="lux-input" type="date" id={`conv-date-${i}`} value={c.date} onChange={e => updateConversation(i, 'date', e.target.value)} />
                  <input className="lux-input" placeholder="Key takeaways from conversation" id={`conv-take-${i}`} value={c.takeaways} onChange={e => updateConversation(i, 'takeaways', e.target.value)} />
                </div>
              ))}
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section C: Buddy / Mentor Assignment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FieldGroup label="Buddy / Mentor Name" required id="buddy-name"><input id="buddy-name" className="lux-input" value={data.buddyName} onChange={e => u('buddyName', e.target.value)} /></FieldGroup>
              <FieldGrid cols={2}>
                <FieldGroup label="Assignment Date (must be by Day 3)" required id="buddy-date"><input id="buddy-date" type="date" className="lux-input" value={data.buddyAssignmentDate} onChange={e => u('buddyAssignmentDate', e.target.value)} /></FieldGroup>
                <FieldGroup label="Channel (Slack/WhatsApp/Email)" id="buddy-channel"><input id="buddy-channel" className="lux-input" value={data.buddyChannel} onChange={e => u('buddyChannel', e.target.value)} /></FieldGroup>
              </FieldGrid>
              <FieldGroup label="Scheduled Weekly Sync Day & Time" id="buddy-sync"><input id="buddy-sync" className="lux-input" placeholder="e.g. Monday 11 AM" value={data.buddySyncDay} onChange={e => u('buddySyncDay', e.target.value)} /></FieldGroup>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="Who is the one person whose working style you most want to learn from and why?" id="reflection">
              <textarea id="reflection" className="lux-textarea" rows={3} value={data.reflectionLearningFrom} onChange={e => u('reflectionLearningFrom', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>

          <ErrorAlert message={submitError} />

          <ActionBar onCancel={() => navigate('/phase-1')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
