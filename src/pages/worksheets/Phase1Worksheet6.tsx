import { Eye } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankObs = () => ({ date: '', subject: '', instructor: '', sessionType: '', observations: '' });

export default function Phase1Worksheet6() {
  return (
    <WorksheetPage
      worksheetId="p1_w6" phase="phase-1" icon={Eye}
      title="Classroom & Laboratory Live Observation Journal"
      subtitle="Days 7-28 · Observe minimum 2-3 days per subject."
      backTo="/phase-1"
      defaultData={{
        employeeName: '',
        observations: Array(4).fill(null).map(() => blankObs()),
        reflectionArc: '', reflectionRoom: '', reflectionAdopt: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Observation Journal has been reviewed and approved."
      submittedMsg="Observation journal submitted."
      buddyApproveMsg="Your Observation Journal has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uObs = (i: number, f: string, v: any) => setData(p => { const arr = [...p.observations]; arr[i] = { ...arr[i], [f]: v }; return { ...p, observations: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Lecture & Lab Observation Log" subtitle="Min. 2 sessions per subject. Note session type (Lecture / Lab).">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 1fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Date', 'Subject', 'Instructor', 'Type', 'Key Observations'].map(h => (
                  <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                ))}
              </div>
              {data.observations.map((o: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 1fr 2.5fr', gap: '8px' }}>
                  <input className="lux-input" type="date" value={o.date} onChange={e => uObs(i, 'date', e.target.value)} />
                  <input className="lux-input" placeholder="Subject" value={o.subject} onChange={e => uObs(i, 'subject', e.target.value)} />
                  <input className="lux-input" placeholder="Instructor" value={o.instructor} onChange={e => uObs(i, 'instructor', e.target.value)} />
                  <select className="lux-select" value={o.sessionType} onChange={e => uObs(i, 'sessionType', e.target.value)}>
                    <option value="">Type</option><option value="Lecture">Lecture</option><option value="Lab">Lab</option>
                  </select>
                  <input className="lux-input" placeholder="What stood out?" value={o.observations} onChange={e => uObs(i, 'observations', e.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Reflection" subtitle="Distil what you observed into actionable takeaways.">
              <FieldGroup label="How did the instructor structure the session — what was the arc from opening to close?"><textarea className="lux-textarea" rows={2} value={data.reflectionArc} onChange={e => updateField('reflectionArc', e.target.value)} /></FieldGroup>
              <FieldGroup label="What techniques did you observe for 'reading the room' — pacing, checks for understanding, handling doubt?"><textarea className="lux-textarea" rows={2} value={data.reflectionRoom} onChange={e => updateField('reflectionRoom', e.target.value)} /></FieldGroup>
              <FieldGroup label="What one technique will you adopt in your own teaching, and why does it resonate?"><textarea className="lux-textarea" rows={2} value={data.reflectionAdopt} onChange={e => updateField('reflectionAdopt', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
