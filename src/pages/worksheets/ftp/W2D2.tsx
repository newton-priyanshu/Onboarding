import { Mic } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w2_d2';
const phase = 'week-2';

export default function W2D2() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={Mic}
      title="Micro-Teach #1"
      subtitle="10-minute segment to 3 peers — low stakes, rubric-lite feedback"
      backTo="/week-2"
      defaultData={{ employeeName: '', topic: '', feedbackNotes: '', selfReflection: '' }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Micro-teach reflection submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Micro-Teach Details">
            <FieldGroup label="Your Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
            <FieldGroup label="Topic taught" id="topic"><input id="topic" className="lux-input" value={data.topic as string} onChange={e => updateField('topic', e.target.value)} placeholder="e.g. Variables in Python" /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Feedback & Reflection">
            <FieldGroup label="Feedback received from peers" id="feedbackNotes">
              <textarea id="feedbackNotes" className="lux-textarea" rows={4} value={data.feedbackNotes as string} onChange={e => updateField('feedbackNotes', e.target.value)} placeholder="What did peers say went well? What could improve?" />
            </FieldGroup>
            <FieldGroup label="Self-reflection" id="selfReflection">
              <textarea id="selfReflection" className="lux-textarea" rows={3} value={data.selfReflection as string} onChange={e => updateField('selfReflection', e.target.value)} placeholder="How did it feel? What would you do differently?" />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
