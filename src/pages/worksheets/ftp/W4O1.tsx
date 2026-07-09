import { ClipboardList } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../../components/WorksheetPage';

const worksheetId = 'w4_o1';
const phase = 'week-4';

export default function W4O1() {
  return (
    <WorksheetPage worksheetId={worksheetId} phase={phase} icon={ClipboardList}
      title="Pre-Semester Checklist" subtitle="Complete your T-2-week checklist"
      backTo="/week-4"
      defaultData={{ employeeName: '', checklist: [] as { item: string; done: boolean; notes: string }[], courseLeadSignOff: false }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      submittedMsg="Pre-semester checklist submitted.">
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required><input className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="T-2 Week Checklist">
            {['Lecture schedule confirmed', 'All course materials uploaded to portal', 'First 3 lecture packages ready',
              'Assessment schedule published', 'Classroom assigned and verified', 'Office hours published',
              'Welcome message drafted for students', 'Backup plans for tech failures documented',
            ].map((item, i) => {
              const items = (data.checklist as any[]) || [];
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                  <input type="checkbox" checked={items[i]?.done || false}
                    onChange={e => { const arr = [...items]; arr[i] = { ...arr[i], item, done: e.target.checked }; updateField('checklist', arr); }}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', flex: 1 }}>{item}</span>
                </div>
              );
            })}
          </WorksheetSection>
          <WorksheetSection title="Sign-off">
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
              <input type="checkbox" checked={!!(data.courseLeadSignOff as boolean)} onChange={e => updateField('courseLeadSignOff', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
              Course Lead has reviewed and signed off
            </label>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
