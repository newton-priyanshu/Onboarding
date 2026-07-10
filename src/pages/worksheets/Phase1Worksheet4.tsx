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
        const uSem = (i: number, f: string, v: string) => setData(p => { const arr = [...p.semesters]; arr[i] = { ...arr[i], [f]: v }; return { ...p, semesters: arr }; });
        const uCoh = (i: number, f: string, v: string) => setData(p => { const arr = [...p.cohorts]; arr[i] = { ...arr[i], [f]: v }; return { ...p, cohorts: arr }; });
        return (
          <>
            <WorksheetSection title="About You">
              <FieldGroup label="Full Name" required id="employeeName">
                <input id="employeeName" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} />
              </FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Section A: Academic Calendar Map" subtitle="Map out key dates for each semester.">
              <div className="ws-scroll-x">
                <div className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                  {['Semester', 'Start Date', 'End Date', 'Key Events'].map(h => (
                    <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                  ))}
                </div>
                {(data.semesters as Array<Record<string, string>>).map((s, i) => (
                  <div key={i} className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                    <label htmlFor={`sem-name-${i}`} className="ws-sr-only">Semester (row {i + 1})</label>
                    <input id={`sem-name-${i}`} className="lux-input" placeholder="e.g. Sem 1" value={s.semester} onChange={e => uSem(i, 'semester', e.target.value)} />
                    <label htmlFor={`sem-start-${i}`} className="ws-sr-only">Start Date (row {i + 1})</label>
                    <input id={`sem-start-${i}`} className="lux-input" type="date" value={s.startDate} onChange={e => uSem(i, 'startDate', e.target.value)} />
                    <label htmlFor={`sem-end-${i}`} className="ws-sr-only">End Date (row {i + 1})</label>
                    <input id={`sem-end-${i}`} className="lux-input" type="date" value={s.endDate} onChange={e => uSem(i, 'endDate', e.target.value)} />
                    <label htmlFor={`sem-events-${i}`} className="ws-sr-only">Key Events (row {i + 1})</label>
                    <input id={`sem-events-${i}`} className="lux-input" placeholder="Exams, breaks" value={s.keyEvents} onChange={e => uSem(i, 'keyEvents', e.target.value)} />
                  </div>
                ))}
              </div>
            </WorksheetSection>
            <WorksheetSection title="Section B: Cohort Structure" subtitle="List cohorts you'll be teaching.">
              <div className="ws-scroll-x">
                <div className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                  {['Cohort Name', 'No. of Students', 'Semester/Year', 'Notes'].map(h => (
                    <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                  ))}
                </div>
                {(data.cohorts as Array<Record<string, string>>).map((c, i) => (
                  <div key={i} className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '8px' }}>
                    <label htmlFor={`coh-name-${i}`} className="ws-sr-only">Cohort Name (row {i + 1})</label>
                    <input id={`coh-name-${i}`} className="lux-input" placeholder="Cohort" value={c.name} onChange={e => uCoh(i, 'name', e.target.value)} />
                    <label htmlFor={`coh-students-${i}`} className="ws-sr-only">No. of Students (row {i + 1})</label>
                    <input id={`coh-students-${i}`} className="lux-input" placeholder="Count" value={c.students} onChange={e => uCoh(i, 'students', e.target.value)} />
                    <label htmlFor={`coh-semyear-${i}`} className="ws-sr-only">Semester/Year (row {i + 1})</label>
                    <input id={`coh-semyear-${i}`} className="lux-input" placeholder="e.g. Y1S1" value={c.semesterYear} onChange={e => uCoh(i, 'semesterYear', e.target.value)} />
                    <label htmlFor={`coh-notes-${i}`} className="ws-sr-only">Notes (row {i + 1})</label>
                    <input id={`coh-notes-${i}`} className="lux-input" placeholder="Notes" value={c.notes} onChange={e => uCoh(i, 'notes', e.target.value)} />
                  </div>
                ))}
              </div>
            </WorksheetSection>
            <WorksheetSection title="Section C: Governance Contacts">
              <FieldGroup label="University Liaison Contact" id="liaisonContact"><input id="liaisonContact" className="lux-input" value={data.liaisonContact} onChange={e => updateField('liaisonContact', e.target.value)} /></FieldGroup>
              <FieldGroup label="Internal escalation path for academic disputes" id="escalationPath"><textarea id="escalationPath" className="lux-textarea" rows={2} value={data.escalationPath} onChange={e => updateField('escalationPath', e.target.value)} /></FieldGroup>
              <FieldGroup label="Grade submission process and deadline" id="gradeProcess"><textarea id="gradeProcess" className="lux-textarea" rows={2} value={data.gradeProcess} onChange={e => updateField('gradeProcess', e.target.value)} /></FieldGroup>
              <FieldGroup label="Policy for late submissions and re-assessments" id="latePolicy"><textarea id="latePolicy" className="lux-textarea" rows={2} value={data.latePolicy} onChange={e => updateField('latePolicy', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature" id="employeeSignature"><input id="employeeSignature" className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
