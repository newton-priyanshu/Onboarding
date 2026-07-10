import { Monitor } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const portalTasks = ['Create coding question with custom test cases', 'Create MCQ with answer key and explanations', 'Design and publish a structured assignment', 'Set up lab exercise with test cases', 'Set cohort-specific content release rules', 'Reopen/extend deadline for individual students'];

export default function Phase2Worksheet4() {
  return (
    <WorksheetPage
      worksheetId="p2_w4" phase="phase-2" icon={Monitor}
      title="Advanced Portal Operations & Quiz Configuration Check"
      subtitle="Days 31-60 · Independent portal proficiency."
      backTo="/phase-2"
      defaultData={{
        employeeName: '',
        tasks: portalTasks.map(() => ({ self: false, verified: false })),
        demoDate: '', demoTasks: '', demoGaps: '', demoSignature: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Portal Operations checklist has been reviewed and approved."
      submittedMsg="Portal ops checklist submitted."
      buddyApproveMsg="Your Portal Ops checklist has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const toggleTask = (i: number, f: string) => setData(p => { const arr = [...p.tasks]; arr[i] = { ...arr[i], [f]: !arr[i][f] }; return { ...p, tasks: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Advanced Portal Operations Checklist" subtitle="By Day 60, you must independently handle all operations.">
              {portalTasks.map((task, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', flex: 1, color: 'var(--color-charcoal)' }}>{task}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                    <input type="checkbox" checked={data.tasks[i].self} onChange={() => toggleTask(i, 'self')} style={{ accentColor: 'var(--color-charcoal)' }} /> Self
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                    <input type="checkbox" checked={data.tasks[i].verified} onChange={() => toggleTask(i, 'verified')} style={{ accentColor: 'var(--color-charcoal)' }} /> Verified
                  </label>
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Faculty Lead Live Demo Sign-Off">
              <div className="ws-stack-sm">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <FieldGroup label="Demo conducted on (date)" id="demoDate"><input id="demoDate" type="date" className="lux-input" value={data.demoDate} onChange={e => updateField('demoDate', e.target.value)} /></FieldGroup>
                  <FieldGroup label="Tasks demonstrated" id="demoTasks"><input id="demoTasks" className="lux-input" value={data.demoTasks} onChange={e => updateField('demoTasks', e.target.value)} /></FieldGroup>
                </div>
              </div>
              <FieldGroup label="Gaps to address" id="demoGaps"><textarea id="demoGaps" className="lux-textarea" rows={1} value={data.demoGaps} onChange={e => updateField('demoGaps', e.target.value)} /></FieldGroup>
              <FieldGroup label="Faculty Lead Signature" id="demoSignature"><input id="demoSignature" className="lux-input" value={data.demoSignature} onChange={e => updateField('demoSignature', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature" id="employeeSignature"><input id="employeeSignature" className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
