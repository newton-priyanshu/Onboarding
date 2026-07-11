/* eslint-disable @typescript-eslint/no-explicit-any */
import { Sword } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w3_e1';
const phase = 'week-3';

export default function W3E1() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={Sword}
      title="Design a Mini-Contest" subtitle="Balanced 12-question mini-contest against V3 + Bloom distribution"
      backTo="/week-3"
      defaultData={{ employeeName: '', contestTitle: '', questions: [] as any[], bloomDistribution: '', peerReviewed: false }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Mini-contest submitted for L1 review.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
            <FieldGroup label="Contest Title" id="contestTitle"><input id="contestTitle" className="lux-input" value={data.contestTitle as string} onChange={e => updateField('contestTitle', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Bloom's Distribution">
            <FieldGroup label="How are your 12 questions distributed across Bloom's levels?" id="bloomDistribution">
              <textarea id="bloomDistribution" className="lux-textarea" rows={3} value={data.bloomDistribution as string} onChange={e => updateField('bloomDistribution', e.target.value)}
                placeholder="Remember: 2, Understand: 3, Apply: 3, Analyze: 2, Evaluate: 1, Create: 1" />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Peer L1 Review">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
              <input type="checkbox" checked={!!(data.peerReviewed as boolean)} onChange={e => updateField('peerReviewed', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
              I have completed L1 peer review of this contest
            </label>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
