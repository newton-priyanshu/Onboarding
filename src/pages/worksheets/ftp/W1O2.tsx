import { Search } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w1_o2';
const phase = 'week-1';

export default function W1O2() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={Search}
      title="Playbook Scavenger Exercise"
      subtitle="Find-the-answer sheet across Playbook §1 to §5"
      backTo="/week-1"
      defaultData={{
        employeeName: '',
        answers: [] as { q: string; a: string; section: string }[],
        reflectionNote: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      approvedMsg="Playbook scavenger sheet approved."
      submittedMsg="Scavenger sheet submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName">
              <input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Scavenger Questions">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', marginBottom: '1rem' }}>
              Search the Playbook (§1–§5) to find answers to each question below.
            </p>
            {[
              { q: 'What is the sacrosanct standard in our teaching philosophy?', section: '§1' },
              { q: 'Name three components of the culture engine.', section: '§2' },
              { q: 'What is the difference between a silent error and a loud error?', section: '§3' },
              { q: 'How do we handle a "this is basic" moment from a student?', section: '§4' },
              { q: 'What is the 20% rule for content review?', section: '§5' },
            ].map((item, i) => (
              <FieldGroup key={i} label={`Q${i + 1}: ${item.q}`} hint={`Section: ${item.section}`} id={`answer-${i}`}>
                <textarea id={`answer-${i}`} className="lux-textarea" rows={2}
                  value={(data.answers as { q: string; a: string; section: string }[])?.[i]?.a || ''}
                  onChange={e => {
                    const arr = [...((data.answers as { q: string; a: string; section: string }[]) || [])];
                    arr[i] = { ...arr[i], q: item.q, a: e.target.value, section: item.section };
                    updateField('answers', arr);
                  }}
                  placeholder="Your answer..." />
              </FieldGroup>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="What was most surprising or valuable from the playbook?" id="reflectionNote">
              <textarea id="reflectionNote" className="lux-textarea" rows={3} value={data.reflectionNote as string} onChange={e => updateField('reflectionNote', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
