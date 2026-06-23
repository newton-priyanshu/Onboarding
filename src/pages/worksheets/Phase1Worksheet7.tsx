import { FileText, Star } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const materialTypes = ['Lecture Slide Decks (PPTs)', 'Worksheets & Problem Sets', 'Coding Question Bank', 'MCQ Bank', 'Previous Exam / Contest Papers', 'Assignment Sets', 'Lab Exercises'];
const blankReview = () => ({ subject: '', items: '', quality: '', gaps: '' });

export default function Phase1Worksheet7() {
  return (
    <WorksheetPage
      worksheetId="p1_w7" phase="phase-1" icon={FileText}
      title="Existing Courseware & Question Bank Review Matrix"
      subtitle="Days 7-28 · Systematically review all existing course material."
      backTo="/phase-1"
      defaultData={{
        employeeName: '',
        reviews: materialTypes.map(() => blankReview()),
        narrativeAchieve: '', narrativeProgression: '', narrativeStruggle: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Courseware Review has been reviewed and approved."
      submittedMsg="Courseware review submitted."
      buddyApproveMsg="Your Courseware Review has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uRev = (i: number, f: string, v: any) => setData(p => { const arr = [...p.reviews]; arr[i] = { ...arr[i], [f]: v }; return { ...p, reviews: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Courseware Review Log" subtitle="Review each material type and rate its quality, quantity, and gaps.">
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 0.8fr 0.8fr 1.8fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Material Type', 'Subject', 'Items', 'Quality 1-5', 'Gaps / Improvements'].map(h => (
                  <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                ))}
              </div>
              {materialTypes.map((type, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 0.8fr 0.8fr 1.8fr', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', color: 'var(--color-charcoal)' }}>{type}</span>
                  <input className="lux-input" placeholder="Subject" value={data.reviews[i].subject} onChange={e => uRev(i, 'subject', e.target.value)} />
                  <input className="lux-input" placeholder="Count" value={data.reviews[i].items} onChange={e => uRev(i, 'items', e.target.value)} />
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    {[1, 2, 3, 4, 5].map(v => (
                      <button key={v} type="button" onClick={() => uRev(i, 'quality', v)}
                        style={{
                          padding: '4px 4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                          background: 'transparent',
                          color: v <= parseInt(String(data.reviews[i].quality || 0)) ? 'var(--color-gold)' : 'rgba(26,26,26,0.15)',
                          transition: 'color 300ms var(--ease-lux)',
                        }}>
                        <Star size={14} strokeWidth={1.5} fill={v <= parseInt(String(data.reviews[i].quality || 0)) ? 'var(--color-gold)' : 'transparent'} />
                      </button>
                    ))}
                  </div>
                  <input className="lux-input" placeholder="Gaps?" value={data.reviews[i].gaps} onChange={e => uRev(i, 'gaps', e.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Content Narrative" subtitle="Reflect on the course's overall design and student challenges.">
              <FieldGroup label="What is the course trying to achieve? (Write the learning outcome in your own words):"><textarea className="lux-textarea" rows={2} value={data.narrativeAchieve} onChange={e => updateField('narrativeAchieve', e.target.value)} /></FieldGroup>
              <FieldGroup label="How does the difficulty level progress across weeks? Map it briefly:"><textarea className="lux-textarea" rows={2} value={data.narrativeProgression} onChange={e => updateField('narrativeProgression', e.target.value)} /></FieldGroup>
              <FieldGroup label="Where do students historically struggle most, and what does existing content do to address this?"><textarea className="lux-textarea" rows={2} value={data.narrativeStruggle} onChange={e => updateField('narrativeStruggle', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
