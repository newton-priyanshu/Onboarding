import { BookText } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankLec = () => ({ date: '', subject: '', duration: '', observer: '' });

export default function Phase3Worksheet1() {
  return (
    <WorksheetPage
      worksheetId="p3_w1" phase="phase-3" icon={BookText}
      title="Independent Lecture Delivery Log & Pacing Post-Mortem"
      subtitle="Days 61-90 · Min. 2 full lectures independently delivered and observed."
      backTo="/phase-3"
      defaultData={{
        employeeName: '',
        lectures: Array(3).fill(null).map(() => blankLec()),
        postMortemFlow: '', postMortemParticipation: '', postMortemQuestions: '', postMortemTime: '',
        feedbackSummary: '', improvementTarget: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Lecture Delivery log has been reviewed and approved."
      submittedMsg="Lecture delivery log submitted."
      buddyApproveMsg="Your Lecture Delivery log has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uL = (i: number, f: string, v: string) => setData(p => { const arr = [...p.lectures]; arr[i] = { ...arr[i], [f]: v }; return { ...p, lectures: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Lecture Delivery Log">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Date', 'Subject / Topic', 'Duration', 'Faculty Lead Present?'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
              </div>
              {(data.lectures as Array<Record<string, string>>).map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 1.5fr', gap: '8px' }}>
                  <input className="lux-input" type="date" value={l.date} onChange={e => uL(i, 'date', e.target.value)} />
                  <input className="lux-input" placeholder="Topic" value={l.subject} onChange={e => uL(i, 'subject', e.target.value)} />
                  <input className="lux-input" placeholder="mins" value={l.duration} onChange={e => uL(i, 'duration', e.target.value)} />
                  <input className="lux-input" placeholder="Observer name" value={l.observer} onChange={e => uL(i, 'observer', e.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Post-Mortem (Complete Within 24 Hours of Each Lecture)">
              <FieldGroup label="Class flow and pacing — did you introduce concepts progressively? What would you change?"><textarea className="lux-textarea" rows={2} value={data.postMortemFlow} onChange={e => updateField('postMortemFlow', e.target.value)} /></FieldGroup>
              <FieldGroup label="Student participation — which techniques did you use? How effective were they?"><textarea className="lux-textarea" rows={2} value={data.postMortemParticipation} onChange={e => updateField('postMortemParticipation', e.target.value)} /></FieldGroup>
              <FieldGroup label="Unexpected questions — how did you handle uncertainty while keeping the class moving?"><textarea className="lux-textarea" rows={2} value={data.postMortemQuestions} onChange={e => updateField('postMortemQuestions', e.target.value)} /></FieldGroup>
              <FieldGroup label="Time management — did you cover planned content? What was cut or rushed?"><textarea className="lux-textarea" rows={2} value={data.postMortemTime} onChange={e => updateField('postMortemTime', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Faculty Lead Observation Debrief">
              <FieldGroup label="Faculty Lead feedback summary:"><textarea className="lux-textarea" rows={2} value={data.feedbackSummary} onChange={e => updateField('feedbackSummary', e.target.value)} /></FieldGroup>
              <FieldGroup label="One specific improvement target for the next lecture:"><textarea className="lux-textarea" rows={1} value={data.improvementTarget} onChange={e => updateField('improvementTarget', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
