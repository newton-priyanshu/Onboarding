import { Shield } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankSemester = () => ({ semester: '', startDate: '', endDate: '', keyEvents: '' });
const blankCohort = () => ({ name: '', students: '', semesterYear: '', notes: '' });

export default function Phase1Worksheet4() {
  return (
    <WorksheetPage
      worksheetId="p1_w4" phase="phase-1" icon={Shield}
      title="Partner University Governance & Semester Architecture Map"
      subtitle="Days 1-14 · Understand how the semester and university partnership operate."
      backTo="/phase-1"
      defaultData={{
        employeeName: '',
        semesters: Array(3).fill(null).map(() => blankSemester()),
        cohorts: Array(3).fill(null).map(() => blankCohort()),
        liaisonContact: '', escalationPath: '', gradeProcess: '', latePolicy: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your University Governance worksheet has been reviewed and approved."
      submittedMsg="University Governance worksheet submitted."
      buddyApproveMsg="Your University Governance worksheet has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uSem = (i: number, f: string, v: any) => setData(p => { const arr = [...p.semesters]; arr[i] = { ...arr[i], [f]: v }; return { ...p, semesters: arr }; });
        const uCoh = (i: number, f: string, v: any) => setData(p => { const arr = [...p.cohorts]; arr[i] = { ...arr[i], [f]: v }; return { ...p, cohorts: arr }; });
        return (
          <>
            <WorksheetSection title="About You">
              <FieldGroup label="Full Name" required>
                <input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} />
              </FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Section A: Academic Calendar Map" subtitle="Map out key dates for each semester.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Semester', 'Start Date', 'End Date', 'Key Events'].map(h => (
                  <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                ))}
              </div>
              {data.semesters.map((s: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="e.g. Sem 1" value={s.semester} onChange={e => uSem(i, 'semester', e.target.value)} />
                  <input className="lux-input" type="date" value={s.startDate} onChange={e => uSem(i, 'startDate', e.target.value)} />
                  <input className="lux-input" type="date" value={s.endDate} onChange={e => uSem(i, 'endDate', e.target.value)} />
                  <input className="lux-input" placeholder="Exams, breaks" value={s.keyEvents} onChange={e => uSem(i, 'keyEvents', e.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Section B: Cohort Structure" subtitle="List cohorts you'll be teaching.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Cohort Name', 'No. of Students', 'Semester/Year', 'Notes'].map(h => (
                  <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                ))}
              </div>
              {data.cohorts.map((c: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="Cohort" value={c.name} onChange={e => uCoh(i, 'name', e.target.value)} />
                  <input className="lux-input" placeholder="Count" value={c.students} onChange={e => uCoh(i, 'students', e.target.value)} />
                  <input className="lux-input" placeholder="e.g. Y1S1" value={c.semesterYear} onChange={e => uCoh(i, 'semesterYear', e.target.value)} />
                  <input className="lux-input" placeholder="Notes" value={c.notes} onChange={e => uCoh(i, 'notes', e.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Section C: Governance Contacts">
              <FieldGroup label="University Liaison Contact"><input className="lux-input" value={data.liaisonContact} onChange={e => updateField('liaisonContact', e.target.value)} /></FieldGroup>
              <FieldGroup label="Internal escalation path for academic disputes"><textarea className="lux-textarea" rows={2} value={data.escalationPath} onChange={e => updateField('escalationPath', e.target.value)} /></FieldGroup>
              <FieldGroup label="Grade submission process and deadline"><textarea className="lux-textarea" rows={2} value={data.gradeProcess} onChange={e => updateField('gradeProcess', e.target.value)} /></FieldGroup>
              <FieldGroup label="Policy for late submissions and re-assessments"><textarea className="lux-textarea" rows={2} value={data.latePolicy} onChange={e => updateField('latePolicy', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
