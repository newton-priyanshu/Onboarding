import { MessageCircle } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w3_b1';
const phase = 'week-3';

export default function W3B1() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={MessageCircle}
      title="Student Dialoguing Rehearsal"
      subtitle="At-risk 1:1, rule challenge, 'this is basic' moment"
      backTo="/week-3"
      defaultData={{ employeeName: '', atRiskScript: '', ruleChallengeScript: '', basicMomentScript: '', forcedPosition: '' }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Dialoguing reflection submitted.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Dialoguing Rehearsal">
            <FieldGroup label="Scenario: At-risk student 1:1 — how would you start this conversation?" id="atRiskScript">
              <textarea id="atRiskScript" className="lux-textarea" rows={3} value={data.atRiskScript as string} onChange={e => updateField('atRiskScript', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Scenario: A student publicly challenges a rule you just set — how do you respond?" id="ruleChallengeScript">
              <textarea id="ruleChallengeScript" className="lux-textarea" rows={3} value={data.ruleChallengeScript as string} onChange={e => updateField('ruleChallengeScript', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Scenario: A student says 'this is basic' during class — your response?" id="basicMomentScript">
              <textarea id="basicMomentScript" className="lux-textarea" rows={3} value={data.basicMomentScript as string} onChange={e => updateField('basicMomentScript', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Forced position-taking: What's your natural default in these situations?" id="forcedPosition">
              <textarea id="forcedPosition" className="lux-textarea" rows={2} value={data.forcedPosition as string} onChange={e => updateField('forcedPosition', e.target.value)}
                placeholder="e.g. 'I tend to avoid confrontation, so I need to practice directness'" />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
