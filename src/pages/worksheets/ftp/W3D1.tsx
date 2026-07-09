import { Monitor } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w3_d1';
const phase = 'week-3';

export default function W3D1() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={Monitor}
      title="Classroom Technology Hands-on" subtitle="Projectors, pentabs, portal joining, recording"
      backTo="/week-3"
      defaultData={{ employeeName: '', techConfirmed: [] as string[], notes: '' }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Tech proficiency submitted.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required><input className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Tech Proficiency Checklist">
            {['Projector connection & screen sharing', 'Pentab setup & calibration', 'Portal joining (student + faculty)',
              'Recording a lecture', 'Using in-class polling tools', 'Sound system & microphone test'].map((item, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', fontFamily: 'var(--font-body)', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={((data.techConfirmed as string[]) || []).includes(item)}
                  onChange={e => { const arr = [...((data.techConfirmed as string[]) || [])]; e.target.checked ? arr.push(item) : arr.splice(arr.indexOf(item), 1); updateField('techConfirmed', arr); }}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
                {item}
              </label>
            ))}
          </WorksheetSection>
          <WorksheetSection title="Notes">
            <FieldGroup label="Any tech issues or questions?">
              <textarea className="lux-textarea" rows={3} value={data.notes as string} onChange={e => updateField('notes', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
