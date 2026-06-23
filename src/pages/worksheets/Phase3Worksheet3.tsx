import { CheckSquare } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const bloomLevels = [
  { key: 'remember', label: 'Remember — Recall facts and terms' },
  { key: 'understand', label: 'Understand — Explain concepts in own words' },
  { key: 'apply', label: 'Apply — Use knowledge in new contexts' },
  { key: 'analyse', label: 'Analyse — Break down and examine relationships' },
  { key: 'evaluate', label: 'Evaluate — Justify decisions and critique' },
  { key: 'create', label: 'Create — Design novel solutions' },
];

export default function Phase3Worksheet3() {
  return (
    <WorksheetPage
      worksheetId="p3_w3" phase="phase-3" icon={CheckSquare}
      title="Assessment Blueprint & Bloom's Taxonomy Grid"
      subtitle="Design assessments that measure learning at every cognitive level"
      backTo="/phase-3"
      defaultData={{
        employeeName: '',
        bloomGrid: bloomLevels.map(() => ({ coverage: '', exampleItem: '' })),
        blueprintAssessmentType: '', blueprintDifficultyDistribution: '', blueprintFeedbackLoop: '',
      }}
      requiredFields={[{ key: 'blueprintAssessmentType', label: 'Assessment type description' }]}
      approvedMsg="Your Assessment Blueprint worksheet has been reviewed and approved."
      submittedMsg="Assessment Blueprint submitted for review."
      buddyApproveMsg="Your Assessment Blueprint has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uBloom = (i: number, f: string, v: any) => setData(p => { const arr = [...p.bloomGrid]; arr[i] = { ...arr[i], [f]: v }; return { ...p, bloomGrid: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Bloom's Taxonomy Coverage Grid" subtitle="For each cognitive level, describe how your assessment addresses it and provide one example question/item.">
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Cognitive Level', 'Coverage (How assessed?)', 'Example Question/Item'].map(h => (
                  <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                ))}
              </div>
              {bloomLevels.map((level, i) => (
                <div key={level.key} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 2.5fr', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', color: 'var(--color-charcoal)' }}>{level.label}</span>
                  <input className="lux-input" placeholder="How covered?" value={data.bloomGrid[i].coverage} onChange={e => uBloom(i, 'coverage', e.target.value)} />
                  <input className="lux-input" placeholder="Example question" value={data.bloomGrid[i].exampleItem} onChange={e => uBloom(i, 'exampleItem', e.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Assessment Design Decisions" subtitle="Explain the rationale behind your assessment structure.">
              <FieldGroup label="What type of assessment are you designing (quiz, assignment, exam, project) and what are its primary learning objectives?">
                <textarea className="lux-textarea" rows={2} value={data.blueprintAssessmentType || ''} onChange={e => updateField('blueprintAssessmentType', e.target.value)} placeholder="Describe the assessment and what it aims to measure..." />
              </FieldGroup>
              <FieldGroup label="How is difficulty distributed across questions — and how do you ensure both strong and struggling students are fairly assessed?">
                <textarea className="lux-textarea" rows={2} value={data.blueprintDifficultyDistribution || ''} onChange={e => updateField('blueprintDifficultyDistribution', e.target.value)} placeholder="e.g. 30% recall, 40% application, 30% analysis..." />
              </FieldGroup>
              <FieldGroup label="How will you use assessment results to inform your subsequent teaching (closing the feedback loop)?">
                <textarea className="lux-textarea" rows={2} value={data.blueprintFeedbackLoop || ''} onChange={e => updateField('blueprintFeedbackLoop', e.target.value)} placeholder="How will assessment data shape your next lessons?" />
              </FieldGroup>
            </WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
