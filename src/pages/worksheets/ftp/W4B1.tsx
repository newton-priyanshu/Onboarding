import { Heart } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w4_b1';
const phase = 'week-4';

export default function W4B1() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={Heart}
      title="Why We Reflect" subtitle="Reflection cycle #1 — ownership & commitment"
      backTo="/week-4"
      defaultData={{
        employeeName: '',
        reflectionPrompt1: '', reflectionPrompt2: '', reflectionPrompt3: '',
        commitment: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }, { key: 'commitment', label: 'Commitment statement' }]}
      submittedMsg="Reflection #1 filed. Thank you for your commitment.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Reflection Cycle #1">
            <FieldGroup label="What has been the most challenging part of this onboarding journey?" id="reflectionPrompt1">
              <textarea id="reflectionPrompt1" className="lux-textarea" rows={3} value={data.reflectionPrompt1 as string} onChange={e => updateField('reflectionPrompt1', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="What has been the most surprising or rewarding moment?" id="reflectionPrompt2">
              <textarea id="reflectionPrompt2" className="lux-textarea" rows={3} value={data.reflectionPrompt2 as string} onChange={e => updateField('reflectionPrompt2', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="What will you carry forward into your independent teaching?" id="reflectionPrompt3">
              <textarea id="reflectionPrompt3" className="lux-textarea" rows={3} value={data.reflectionPrompt3 as string} onChange={e => updateField('reflectionPrompt3', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Commitment Ceremony">
            <FieldGroup label="Your first-semester commitment (name it aloud to your Course Lead)" required id="commitment">
              <textarea id="commitment" className="lux-textarea" rows={2} value={data.commitment as string} onChange={e => updateField('commitment', e.target.value)}
                placeholder="e.g. 'I commit to asking for feedback after every lecture in my first month.'" />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
