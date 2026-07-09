import { BarChart } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w4_e1';
const phase = 'week-4';

export default function W4E1() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={BarChart}
      title="Post-Contest Analysis & Calibration"
      subtitle="Predict solve rates, compare to actuals, write calibration note"
      backTo="/week-4"
      defaultData={{ employeeName: '', predictedRates: '', actualRates: '', calibrationNote: '', insights: '' }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Calibration note submitted.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required><input className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Prediction vs Actual">
            <FieldGroup label="Predicted solve rates per question (e.g. Q1: 80%, Q2: 60%...)">
              <textarea className="lux-textarea" rows={3} value={data.predictedRates as string} onChange={e => updateField('predictedRates', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Actual solve rates observed">
              <textarea className="lux-textarea" rows={3} value={data.actualRates as string} onChange={e => updateField('actualRates', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Calibration Note">
            <FieldGroup label="Calibration note (what does the gap tell you about your question design?)">
              <textarea className="lux-textarea" rows={4} value={data.calibrationNote as string} onChange={e => updateField('calibrationNote', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Key insights for future contest design">
              <textarea className="lux-textarea" rows={3} value={data.insights as string} onChange={e => updateField('insights', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
