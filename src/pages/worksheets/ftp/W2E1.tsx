/* eslint-disable @typescript-eslint/no-explicit-any */
import { Layers } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup, FieldGrid } from '../../../components/WorksheetPage';

const worksheetId = 'w2_e1';
const phase = 'week-2';

export default function W2E1() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={Layers}
      title="Bloom's Two-Pens Taxonomy Tagging"
      subtitle="Tag real past questions using Bloom's Taxonomy (v4)"
      backTo="/week-2"
      defaultData={{
        employeeName: '',
        taggings: [] as { question: string; bloomLevel: string; justification: string }[],
        reflection: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      approvedMsg="Bloom's tagging sheet approved."
      submittedMsg="Bloom's tagging submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName">
              <input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Bloom's Tagging Sheet">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', marginBottom: '1rem' }}>
              For each past question, identify its Bloom's level and justify your reasoning using the two-pens method.
            </p>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid rgba(26,26,26,0.1)' }}>
                <FieldGroup label={`Question ${i}`} id={`tag-question-${i}`}>
                  <input id={`tag-question-${i}`} className="lux-input" placeholder="Paste or describe the question..."
                    value={(data.taggings as any[])?.[i - 1]?.question || ''}
                    onChange={e => {
                      const arr = [...((data.taggings as any[]) || [])];
                      arr[i - 1] = { ...arr[i - 1], question: e.target.value };
                      updateField('taggings', arr);
                    }} />
                </FieldGroup>
                <div className="ws-stack-sm">
                  <FieldGrid cols={2}>
                    <FieldGroup label="Bloom's Level" id={`tag-bloom-${i}`}>
                      <select id={`tag-bloom-${i}`} className="lux-select"
                        value={(data.taggings as any[])?.[i - 1]?.bloomLevel || ''}
                        onChange={e => {
                          const arr = [...((data.taggings as any[]) || [])];
                          arr[i - 1] = { ...arr[i - 1], bloomLevel: e.target.value };
                          updateField('taggings', arr);
                        }}>
                        <option value="">Select...</option>
                        <option value="remember">Remember</option>
                        <option value="understand">Understand</option>
                        <option value="apply">Apply</option>
                        <option value="analyze">Analyze</option>
                        <option value="evaluate">Evaluate</option>
                        <option value="create">Create</option>
                      </select>
                    </FieldGroup>
                    <FieldGroup label="Justification" id={`tag-justification-${i}`}>
                      <input id={`tag-justification-${i}`} className="lux-input" placeholder="Why this level?"
                        value={(data.taggings as any[])?.[i - 1]?.justification || ''}
                        onChange={e => {
                          const arr = [...((data.taggings as any[]) || [])];
                          arr[i - 1] = { ...arr[i - 1], justification: e.target.value };
                          updateField('taggings', arr);
                        }} />
                    </FieldGroup>
                  </FieldGrid>
                </div>
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Reflection">
            <FieldGroup label="What patterns did you notice in the question distribution?" id="reflection">
              <textarea id="reflection" className="lux-textarea" rows={3} value={data.reflection as string} onChange={e => updateField('reflection', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
