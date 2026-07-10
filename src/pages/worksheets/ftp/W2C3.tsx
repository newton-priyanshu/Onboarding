import { FileEdit } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup, FieldGrid } from '../../../components/WorksheetPage';

const worksheetId = 'w2_c3';
const phase = 'week-2';

export default function W2C3() {
  return (
    <WorksheetPage
      worksheetId={worksheetId}
      phase={phase}
      icon={FileEdit}
      title="Create & Peer Review"
      subtitle="3 MCQs + 2 coding questions — then review a peer's set"
      backTo="/week-2"
      defaultData={{
        employeeName: '',
        mcqs: [] as { question: string; options: string[]; answer: string; bloomLevel: string }[],
        codingQuestions: [] as { title: string; description: string; testCases: string }[],
        peerReviewDone: false,
        peerReviewedName: '',
        peerReviewFeedback: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Your Name' }]}
      approvedMsg="Question set and peer review approved."
      submittedMsg="Question set submitted."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="Your Info">
            <FieldGroup label="Your Name" required id="employeeName">
              <input id="employeeName" className="lux-input" value={data.employeeName as string} onChange={e => updateField('employeeName', e.target.value)} />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="3 MCQs (one per Bloom level)">
            {[1, 2, 3].map(i => (
              <div key={i} style={{ padding: '1rem', border: '1px solid rgba(26,26,26,0.1)', marginBottom: '1rem' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>MCQ {i}</p>
                <FieldGroup label="Question" id={`mcq-question-${i}`}>
                  <input id={`mcq-question-${i}`} className="lux-input" value={(data.mcqs as any[])?.[i - 1]?.question || ''}
                    onChange={e => { const a = [...((data.mcqs as any[]) || [])]; a[i - 1] = { ...a[i - 1], question: e.target.value }; updateField('mcqs', a); }} />
                </FieldGroup>
                <div className="ws-stack-sm">
                  <FieldGrid cols={2}>
                    <FieldGroup label="Correct Answer" id={`mcq-answer-${i}`}>
                      <input id={`mcq-answer-${i}`} className="lux-input" value={(data.mcqs as any[])?.[i - 1]?.answer || ''}
                        onChange={e => { const a = [...((data.mcqs as any[]) || [])]; a[i - 1] = { ...a[i - 1], answer: e.target.value }; updateField('mcqs', a); }} />
                    </FieldGroup>
                    <FieldGroup label="Bloom's Level" id={`mcq-bloom-${i}`}>
                      <select id={`mcq-bloom-${i}`} className="lux-select" value={(data.mcqs as any[])?.[i - 1]?.bloomLevel || ''}
                        onChange={e => { const a = [...((data.mcqs as any[]) || [])]; a[i - 1] = { ...a[i - 1], bloomLevel: e.target.value }; updateField('mcqs', a); }}>
                        <option value="">Select...</option>
                        <option value="remember">Remember</option>
                        <option value="understand">Understand</option>
                        <option value="apply">Apply</option>
                        <option value="analyze">Analyze</option>
                      </select>
                    </FieldGroup>
                  </FieldGrid>
                </div>
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="2 Coding Questions">
            {[1, 2].map(i => (
              <div key={i} style={{ padding: '1rem', border: '1px solid rgba(26,26,26,0.1)', marginBottom: '1rem' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Coding Q{i}</p>
                <FieldGroup label="Title" id={`coding-title-${i}`}>
                  <input id={`coding-title-${i}`} className="lux-input" value={(data.codingQuestions as any[])?.[i - 1]?.title || ''}
                    onChange={e => { const a = [...((data.codingQuestions as any[]) || [])]; a[i - 1] = { ...a[i - 1], title: e.target.value }; updateField('codingQuestions', a); }} />
                </FieldGroup>
                <FieldGroup label="Problem Description" id={`coding-desc-${i}`}>
                  <textarea id={`coding-desc-${i}`} className="lux-textarea" rows={3} value={(data.codingQuestions as any[])?.[i - 1]?.description || ''}
                    onChange={e => { const a = [...((data.codingQuestions as any[]) || [])]; a[i - 1] = { ...a[i - 1], description: e.target.value }; updateField('codingQuestions', a); }} />
                </FieldGroup>
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Peer Review">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', marginBottom: '1rem' }}>
              After creating your questions, exchange sets with a peer and review theirs.
            </p>
            <FieldGroup label="Peer's name (who you reviewed)" id="peerReviewedName">
              <input id="peerReviewedName" className="lux-input" value={data.peerReviewedName as string} onChange={e => updateField('peerReviewedName', e.target.value)} placeholder="e.g. Ravi Kumar" />
            </FieldGroup>
            <FieldGroup label="Peer review feedback (what worked, what could improve)" id="peerReviewFeedback">
              <textarea id="peerReviewFeedback" className="lux-textarea" rows={3} value={data.peerReviewFeedback as string} onChange={e => updateField('peerReviewFeedback', e.target.value)} />
            </FieldGroup>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!(data.peerReviewDone as boolean)} onChange={e => updateField('peerReviewDone', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-charcoal)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>I completed the peer review</span>
            </label>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
