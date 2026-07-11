/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClipboardCheck } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w2_o1';
const phase = 'week-2';

export default function W2O1() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={ClipboardCheck}
      title="Invigilation & Exam Formalities"
      subtitle="Policy walkthrough plus scenario sheet"
      backTo="/week-2"
      defaultData={{
        employeeName: '',
        policyRead: false,
        scenarios: [] as { situation: string; response: string }[],
        questions: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Invigilation sheet submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
              <input type="checkbox" checked={!!(data.policyRead as boolean)} onChange={e => updateField('policyRead', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
              I have read the invigilation SOP and UFM policy
            </label>
          </WorksheetSection>
          <WorksheetSection title="Scenario Responses">
            {['A student is found with unauthorised notes during an exam', 'A student submits a malpractice complaint against another student',
              'A student arrives 30 minutes late to the exam', 'The exam server goes down mid-test'].map((s, i) => (
              <FieldGroup key={i} label={`Scenario ${i + 1}: ${s}`} id={`scenario-${i}`}>
                <textarea id={`scenario-${i}`} className="lux-textarea" rows={2}
                  value={(data.scenarios as any[])?.[i]?.response || ''}
                  onChange={e => { const a = [...((data.scenarios as any[]) || [])]; a[i] = { ...a[i], situation: s, response: e.target.value }; updateField('scenarios', a); }} />
              </FieldGroup>
            ))}
          </WorksheetSection>
          <WorksheetSection title="Questions">
            <FieldGroup label="Any questions about exam policies?" id="questions">
              <textarea id="questions" className="lux-textarea" rows={2} value={data.questions as string} onChange={e => updateField('questions', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
