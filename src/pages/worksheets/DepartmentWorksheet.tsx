import { FileText, CheckCircle2 } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';
import { WORKSHEET_NAMES, WORKSHEET_INFO } from '../../config/worksheetConfigData';

interface DeptWorksheetProps {
  worksheetId: string;
  phase: string;
  backTo: string;
}

/**
 * DepartmentWorksheet — Generic worksheet component for Progression and Operations
 * departments. Renders a simple form with reflection fields, checklist items,
 * and notes based on the worksheet ID and config.
 */
export default function DepartmentWorksheet({ worksheetId, phase, backTo }: DeptWorksheetProps) {
  const info = WORKSHEET_INFO[worksheetId] || { title: worksheetId, phase: '' };
  const shortName = WORKSHEET_NAMES[worksheetId] || worksheetId;

  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={FileText}
      title={info.title}
      subtitle={`${shortName} — ${info.phase}`}
      backTo={backTo}
      defaultData={{
        employeeName: '',
        reflection: '',
        checklistItems: [] as string[],
        keyLearnings: '',
        questions: '',
        notes: '',
        completed: false,
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      approvedMsg={`Your worksheet "${shortName}" has been approved.`}
      submittedMsg={`Your worksheet "${shortName}" has been submitted.`}
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Getting Started">
            <FieldGroup label="Your Name" required id={`${worksheetId}-name`}>
              <input
                id={`${worksheetId}-name`}
                className="lux-input"
                value={data.employeeName as string}
                onChange={e => updateField('employeeName', e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </FieldGroup>
            <FieldGroup label="Key Learnings" id={`${worksheetId}-learnings`}>
              <textarea
                id={`${worksheetId}-learnings`}
                className="lux-textarea"
                rows={3}
                value={data.keyLearnings as string}
                onChange={e => updateField('keyLearnings', e.target.value)}
                placeholder="What are the key takeaways from this session?"
              />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="Your Reflection" id={`${worksheetId}-reflection`}>
              <textarea
                id={`${worksheetId}-reflection`}
                className="lux-textarea"
                rows={4}
                value={data.reflection as string}
                onChange={e => updateField('reflection', e.target.value)}
                placeholder="Reflect on what you learned and how you'll apply it..."
              />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Checklist">
            <FieldGroup label="Completion Checklist" id={`${worksheetId}-checklist`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {[
                  'Reviewed all materials',
                  'Completed all exercises',
                  'Discussed with buddy/mentor',
                  'Documented key action items',
                  'Submitted for review',
                ].map(item => {
                  const checked = (data.checklistItems as string[]).includes(item);
                  return (
                    <label key={item} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 0', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const items = [...(data.checklistItems as string[])];
                          if (e.target.checked) items.push(item);
                          else {
                            const idx = items.indexOf(item);
                            if (idx >= 0) items.splice(idx, 1);
                          }
                          updateField('checklistItems', items);
                        }}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }}
                      />
                      <span>{item}</span>
                      {checked && <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--color-success)', marginLeft: 'auto' }} />}
                    </label>
                  );
                })}
              </div>
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Questions & Notes">
            <FieldGroup label="Questions for your Buddy/Reviewer" id={`${worksheetId}-questions`}>
              <textarea
                id={`${worksheetId}-questions`}
                className="lux-textarea"
                rows={2}
                value={data.questions as string}
                onChange={e => updateField('questions', e.target.value)}
                placeholder="Any questions or clarifications needed?"
              />
            </FieldGroup>
            <FieldGroup label="Additional Notes" id={`${worksheetId}-notes`}>
              <textarea
                id={`${worksheetId}-notes`}
                className="lux-textarea"
                rows={2}
                value={data.notes as string}
                onChange={e => updateField('notes', e.target.value)}
                placeholder="Any additional notes..."
              />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
