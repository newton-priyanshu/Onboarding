import { Users } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w4_d2';
const phase = 'week-4';

export default function W4D2() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={Users}
      title="Co-Teach Slot / Mock Classroom"
      subtitle="Live co-teach or mock with edge-case scenarios"
      backTo="/week-4"
      defaultData={{ employeeName: '', sessionType: '', date: '', scenarios: '', observerFeedback: '', selfReflection: '' }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Co-teach/mock reflection submitted.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Session Details">
            <FieldGroup label="Your Name" required><input className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
            <FieldGroup label="Session type">
              <select className="lux-select" value={data.sessionType as string} onChange={e => updateField('sessionType', e.target.value)}>
                <option value="">Select...</option>
                <option value="live_co_teach">Live co-teach with senior</option>
                <option value="mock_classroom">Mock classroom with edge cases</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Date"><input type="date" className="lux-input" value={data.date as string} onChange={e => updateField('date', e.target.value)} /></FieldGroup>
            <FieldGroup label="Scenarios encountered / roleplayed">
              <textarea className="lux-textarea" rows={3} value={data.scenarios as string} onChange={e => updateField('scenarios', e.target.value)}
                placeholder="e.g. Late arrival, phone ringing, 'this is basic' comment" />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Feedback & Reflection">
            <FieldGroup label="Observer feedback received">
              <textarea className="lux-textarea" rows={3} value={data.observerFeedback as string} onChange={e => updateField('observerFeedback', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Self-reflection">
              <textarea className="lux-textarea" rows={3} value={data.selfReflection as string} onChange={e => updateField('selfReflection', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
