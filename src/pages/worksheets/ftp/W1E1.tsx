import { BookOpen } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w1_e1';
const phase = 'week-1';

export default function W1E1() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={BookOpen}
      title="Contest Guidelines V3 Pre-read & Reflection"
      subtitle="Read Contest Guidelines V3 — receptivity build for W2-E1"
      backTo="/week-1"
      defaultData={{
        employeeName: '',
        dateRead: '',
        keyTakeaways: '',
        questionsForFacilitator: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      approvedMsg="Contest pre-read verified."
      submittedMsg="Pre-read reflection submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Pre-read Verification">
            <FieldGroup label="Your Name" required id="employeeName">
              <input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Date completed" id="dateRead">
              <input id="dateRead" type="date" className="lux-input" value={data.dateRead as string} onChange={e => updateField('dateRead', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="Key takeaways from Contest Guidelines V3" id="keyTakeaways">
              <textarea id="keyTakeaways" className="lux-textarea" rows={4} value={data.keyTakeaways as string} onChange={e => updateField('keyTakeaways', e.target.value)}
                placeholder="What are the most important rules, formats, or processes you noted?" />
            </FieldGroup>
            <FieldGroup label="Questions you'd like to ask before the Bloom's session" id="questionsForFacilitator">
              <textarea id="questionsForFacilitator" className="lux-textarea" rows={3} value={data.questionsForFacilitator as string} onChange={e => updateField('questionsForFacilitator', e.target.value)}
                placeholder="Anything unclear about contest design, evaluation, or Bloom's taxonomy application?" />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
