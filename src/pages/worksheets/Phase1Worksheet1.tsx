import { Users } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup, FieldGrid } from '../../components/WorksheetPage';

const blankStakeholder = () => ({ name: '', role: '', team: '', responsibility: '' });
const blankConversation = () => ({ instructorName: '', date: '', takeaways: '' });

export default function Phase1Worksheet1() {
  return (
    <WorksheetPage
      worksheetId="p1_w1" phase="phase-1" icon={Users}
      title="Team Introduction & Stakeholder Mapping Log"
      subtitle="Days 1-7 · Build an accurate map of every person you work with."
      backTo="/phase-1"
      defaultData={{
        employeeName: '', department: '',
        stakeholders: Array(4).fill(null).map(() => blankStakeholder()),
        conversations: Array(2).fill(null).map(() => blankConversation()),
        buddyName: '', buddyAssignmentDate: '', buddyChannel: '', buddySyncDay: '',
        reflectionLearningFrom: '',
      }}
      requiredFields={[
        { key: 'employeeName', label: 'Full Name' },
        { key: 'buddyName', label: 'Buddy / Mentor Name' },
        { key: 'buddyAssignmentDate', label: 'Assignment Date (must be by Day 3)' },
      ]}
      approvedMsg="Your Team Introduction worksheet has been reviewed and approved."
      submittedMsg="Your Team Introduction & Stakeholder Mapping worksheet has been submitted for review."
      buddyApproveMsg="Your Team Introduction worksheet has been approved by your buddy."
    >
      {({ data, updateField, updateArrayItemEvent }) => (
        <>
          <WorksheetSection title="About You">
            <div className="ws-stack-sm">
              <FieldGrid cols={2}>
                <FieldGroup label="Full Name" required id="emp-name">
                  <input id="emp-name" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', (e.target as HTMLInputElement).value)} />
                </FieldGroup>
                <FieldGroup label="Department / Course" id="dept">
                  <input id="dept" className="lux-input" value={data.department} onChange={e => updateField('department', (e.target as HTMLInputElement).value)} />
                </FieldGroup>
              </FieldGrid>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section A: Stakeholder Directory" subtitle="Map the key people you work with.">
            <div className="ws-scroll-x">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                  {['Name', 'Role / Title', 'Team / Subject', 'Key Responsibility'].map(h => (
                    <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                  ))}
                </div>
                {(data.stakeholders as Array<Record<string, string>>).map((s, i) => (
                  <div key={i} className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                    <label htmlFor={`sh-name-${i}`} className="ws-sr-only">Name (row {i + 1})</label>
                    <input id={`sh-name-${i}`} className="lux-input" placeholder="Name" value={s.name} onChange={updateArrayItemEvent('stakeholders', i, 'name')} />
                    <label htmlFor={`sh-role-${i}`} className="ws-sr-only">Role / Title (row {i + 1})</label>
                    <input id={`sh-role-${i}`} className="lux-input" placeholder="Role" value={s.role} onChange={updateArrayItemEvent('stakeholders', i, 'role')} />
                    <label htmlFor={`sh-team-${i}`} className="ws-sr-only">Team / Subject (row {i + 1})</label>
                    <input id={`sh-team-${i}`} className="lux-input" placeholder="Team" value={s.team} onChange={updateArrayItemEvent('stakeholders', i, 'team')} />
                    <label htmlFor={`sh-resp-${i}`} className="ws-sr-only">Key Responsibility (row {i + 1})</label>
                    <input id={`sh-resp-${i}`} className="lux-input" placeholder="Why they matter" value={s.responsibility} onChange={updateArrayItemEvent('stakeholders', i, 'responsibility')} />
                  </div>
                ))}
              </div>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section B: One-on-One Conversations Log" subtitle="Connect with min. 2 senior instructors in your first 2 weeks.">
            <div className="ws-scroll-x">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 3fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                  {['Instructor Name', 'Date', 'Key Takeaways'].map(h => (
                    <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                  ))}
                </div>
                {(data.conversations as Array<Record<string, string>>).map((c, i) => (
                  <div key={i} className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 3fr', gap: '8px' }}>
                    <label htmlFor={`conv-name-${i}`} className="ws-sr-only">Instructor Name (row {i + 1})</label>
                    <input id={`conv-name-${i}`} className="lux-input" placeholder="Instructor name" value={c.instructorName} onChange={updateArrayItemEvent('conversations', i, 'instructorName')} />
                    <label htmlFor={`conv-date-${i}`} className="ws-sr-only">Date (row {i + 1})</label>
                    <input id={`conv-date-${i}`} className="lux-input" type="date" value={c.date} onChange={updateArrayItemEvent('conversations', i, 'date')} />
                    <label htmlFor={`conv-takeaways-${i}`} className="ws-sr-only">Key Takeaways (row {i + 1})</label>
                    <textarea id={`conv-takeaways-${i}`} className="lux-textarea" rows={2} placeholder="What key insight did you gain from this conversation?" value={c.takeaways} onChange={updateArrayItemEvent('conversations', i, 'takeaways')} />
                  </div>
                ))}
              </div>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Section C: Buddy / Mentor Assignment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FieldGroup label="Buddy / Mentor Name" required id="buddy-name">
                <input id="buddy-name" className="lux-input" value={data.buddyName} onChange={e => updateField('buddyName', (e.target as HTMLInputElement).value)} />
              </FieldGroup>
              <div className="ws-stack-sm">
                <FieldGrid cols={2}>
                  <FieldGroup label="Assignment Date (must be by Day 3)" required id="buddy-date">
                    <input id="buddy-date" type="date" className="lux-input" value={data.buddyAssignmentDate} onChange={e => updateField('buddyAssignmentDate', (e.target as HTMLInputElement).value)} />
                  </FieldGroup>
                  <FieldGroup label="Channel (Slack/WhatsApp/Email)" id="buddy-channel">
                    <input id="buddy-channel" className="lux-input" value={data.buddyChannel} onChange={e => updateField('buddyChannel', (e.target as HTMLInputElement).value)} />
                  </FieldGroup>
                </FieldGrid>
              </div>
              <FieldGroup label="Scheduled Weekly Sync Day & Time" id="buddy-sync">
                <input id="buddy-sync" className="lux-input" placeholder="e.g. Monday 11 AM" value={data.buddySyncDay} onChange={e => updateField('buddySyncDay', (e.target as HTMLInputElement).value)} />
              </FieldGroup>
            </div>
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="Which colleague's working style would you most like to learn from, and what specifically draws you to their approach?" id="reflection">
              <textarea id="reflection" className="lux-textarea" rows={2} value={data.reflectionLearningFrom} onChange={e => updateField('reflectionLearningFrom', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
