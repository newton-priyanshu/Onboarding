import { Clock } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w3_d2';
const phase = 'week-3';

export default function W3D2() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={Clock}
      title="10-Minute Window Planning & Time Management"
      subtitle="Pacing, transitions, timeboxing for the classroom"
      backTo="/week-3"
      defaultData={{ employeeName: '', minuteByMinute: '', transitionStrategy: '', biggestChallenge: '' }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Planning worksheet submitted.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required><input className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="10-Minute Window">
            <FieldGroup label="Plan your ideal 10-minute teaching window (minute by minute)">
              <textarea className="lux-textarea" rows={5} value={data.minuteByMinute as string} onChange={e => updateField('minuteByMinute', e.target.value)}
                placeholder="Minute 1-2: Opening hook / framing&#10;Minute 3-5: Core concept explanation&#10;Minute 6-7: Example / demonstration&#10;Minute 8-9: Student check / quick exercise&#10;Minute 10: Recap and transition" />
            </FieldGroup>
            <FieldGroup label="Transition strategy between segments">
              <textarea className="lux-textarea" rows={3} value={data.transitionStrategy as string} onChange={e => updateField('transitionStrategy', e.target.value)}
                placeholder="How will you move smoothly between activities?" />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Reflection">
            <FieldGroup label="What's your biggest time management challenge?">
              <textarea className="lux-textarea" rows={2} value={data.biggestChallenge as string} onChange={e => updateField('biggestChallenge', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
