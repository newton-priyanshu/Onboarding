import { BookText } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

export default function Phase1Worksheet3() {
  return (
    <WorksheetPage
      worksheetId="p1_w3" phase="phase-1" icon={BookText}
      title="Organisational Culture & Teaching Philosophy Reflection"
      subtitle="Days 1-14 · Demonstrate understanding of NST BLR's teaching philosophy."
      backTo="/phase-1"
      defaultData={{
        employeeName: '',
        culturePhilosophy: '', cultureIndustryDiff: '', culturePsychSafety: '',
        partnerStructure: '', semesterStructure: '', studentExpectations: '',
        behaviour1: '', behaviour2: '', behaviour3: '',
        employeeSignature: '',
      }}
      requiredFields={[
        { key: 'employeeName', label: 'Full Name' },
        { key: 'culturePhilosophy', label: 'Teaching Philosophy reflection' },
      ]}
      approvedMsg="Your Culture & Teaching Philosophy reflection has been reviewed and approved."
      submittedMsg="Culture & Teaching Philosophy submitted."
      buddyApproveMsg="Your Teaching Philosophy reflection has been approved by your buddy."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="About You">
            <FieldGroup label="Full Name" required id="employeeName">
              <input id="employeeName" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Section A: Culture Understanding" subtitle="The shift from industry to teaching requires a deliberate mindset change.">
            <FieldGroup label="Describe NST BLR's teaching philosophy in your own words (min. 50 words):" required id="culturePhilosophy">
              <textarea id="culturePhilosophy" className="lux-textarea" rows={3} value={data.culturePhilosophy} onChange={e => updateField('culturePhilosophy', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="How does classroom communication differ from communication in your previous industry role?" id="cultureIndustryDiff">
              <textarea id="cultureIndustryDiff" className="lux-textarea" rows={2} value={data.cultureIndustryDiff} onChange={e => updateField('cultureIndustryDiff', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="What does 'psychological safety in the classroom' mean to you, and how would you cultivate it?" id="culturePsychSafety">
              <textarea id="culturePsychSafety" className="lux-textarea" rows={2} value={data.culturePsychSafety} onChange={e => updateField('culturePsychSafety', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Section B: University Partnership Model">
            <FieldGroup label="Describe the partnership structure between NST BLR and its affiliated universities." id="partnerStructure">
              <textarea id="partnerStructure" className="lux-textarea" rows={2} value={data.partnerStructure} onChange={e => updateField('partnerStructure', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="How is the academic semester structured — key dates, milestones, and exam windows?" id="semesterStructure">
              <textarea id="semesterStructure" className="lux-textarea" rows={2} value={data.semesterStructure} onChange={e => updateField('semesterStructure', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="What do students at your institution primarily expect from their instructors?" id="studentExpectations">
              <textarea id="studentExpectations" className="lux-textarea" rows={2} value={data.studentExpectations} onChange={e => updateField('studentExpectations', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Section C: Personal Commitment">
            <FieldGroup label="List three specific behaviours you will consciously practise in your first lecture:">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="behaviour1" className="ws-sr-only">Behaviour 1</label>
                <input id="behaviour1" className="lux-input" placeholder="Behaviour 1" value={data.behaviour1} onChange={e => updateField('behaviour1', e.target.value)} />
                <label htmlFor="behaviour2" className="ws-sr-only">Behaviour 2</label>
                <input id="behaviour2" className="lux-input" placeholder="Behaviour 2" value={data.behaviour2} onChange={e => updateField('behaviour2', e.target.value)} />
                <label htmlFor="behaviour3" className="ws-sr-only">Behaviour 3</label>
                <input id="behaviour3" className="lux-input" placeholder="Behaviour 3" value={data.behaviour3} onChange={e => updateField('behaviour3', e.target.value)} />
              </div>
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Verification">
            <FieldGroup label="Employee Signature" id="employeeSignature">
              <input id="employeeSignature" className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
