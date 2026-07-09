import { Shield } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w2_b1';
const phase = 'week-2';

export default function W2B1() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={Shield}
      title="Discipline Consistency Session"
      subtitle="Customise your classroom discipline approach"
      backTo="/week-2"
      defaultData={{
        employeeName: '',
        topRules: [] as string[],
        consequenceForBreaking: '',
        consistencyStrategy: '',
        mirrorReflection: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Discipline customisation sheet submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required><input className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Class Discipline Customisation Sheet">
            <FieldGroup label="Top 3 non-negotiable rules for your classroom">
              <textarea className="lux-textarea" rows={3} value={(data.topRules as string[])?.join('\n') || ''}
                onChange={e => updateField('topRules', e.target.value.split('\n').filter(Boolean))}
                placeholder="Rule 1&#10;Rule 2&#10;Rule 3" />
            </FieldGroup>
            <FieldGroup label="Consequence for breaking a rule (first offense)">
              <textarea className="lux-textarea" rows={2} value={data.consequenceForBreaking as string} onChange={e => updateField('consequenceForBreaking', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="How will you ensure consistency? (A rule enforced once and skipped twice is a suggestion)">
              <textarea className="lux-textarea" rows={3} value={data.consistencyStrategy as string} onChange={e => updateField('consistencyStrategy', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Mirror reflection — what's your natural tendency in discipline situations?">
              <textarea className="lux-textarea" rows={3} value={data.mirrorReflection as string} onChange={e => updateField('mirrorReflection', e.target.value)} placeholder="Do you tend to be too strict, too lenient, or avoid confrontation?" />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
