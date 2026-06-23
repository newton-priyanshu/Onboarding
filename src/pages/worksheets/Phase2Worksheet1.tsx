import { MessageSquare } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankEntry = () => ({ date: '', channel: '', query: '', resolution: '' });
const blankError = () => ({ misconception: '', topic: '', rootCause: '', fix: '' });

export default function Phase2Worksheet1() {
  return (
    <WorksheetPage
      worksheetId="p2_w1" phase="phase-2" icon={MessageSquare}
      title="Student Doubt Resolution & Common Errors Diagnostic Log"
      subtitle="Days 31-60 · Track min. 30 student interactions."
      backTo="/phase-2"
      defaultData={{
        employeeName: '',
        entries: Array(5).fill(null).map(() => blankEntry()),
        errors: Array(3).fill(null).map(() => blankError()),
        keyInsight: '', employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Doubt Resolution log has been reviewed and approved."
      submittedMsg="Student doubt log submitted."
      buddyApproveMsg="Your Doubt Resolution log has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uE = (i: number, f: string, v: any) => setData(p => { const arr = [...p.entries]; arr[i] = { ...arr[i], [f]: v }; return { ...p, entries: arr }; });
        const uEr = (i: number, f: string, v: any) => setData(p => { const arr = [...p.errors]; arr[i] = { ...arr[i], [f]: v }; return { ...p, errors: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Doubt Resolution Log" subtitle="Track notable student interactions (min. 15 over the phase).">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2.5fr 2.5fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Date', 'Channel', 'Student Query', 'Resolution'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
              </div>
              {data.entries.map((e: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2.5fr 2.5fr', gap: '8px' }}>
                  <input className="lux-input" type="date" value={e.date} onChange={ev => uE(i, 'date', ev.target.value)} />
                  <input className="lux-input" placeholder="Portal/Slack/Lab" value={e.channel} onChange={ev => uE(i, 'channel', ev.target.value)} />
                  <input className="lux-input" placeholder="What was the doubt?" value={e.query} onChange={ev => uE(i, 'query', ev.target.value)} />
                  <textarea className="lux-textarea" rows={2} placeholder="How was it resolved?" value={e.resolution} onChange={ev => uE(i, 'resolution', ev.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Error Pattern Diagnostic" subtitle="Identify recurring misconceptions and their root causes.">
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 2fr 2fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Misconception', 'Topic', 'Root Cause', 'Suggested Fix'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
              </div>
              {data.errors.map((er: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 2fr 2fr', gap: '8px' }}>
                  <input className="lux-input" placeholder="Error pattern" value={er.misconception} onChange={ev => uEr(i, 'misconception', ev.target.value)} />
                  <input className="lux-input" placeholder="Topic" value={er.topic} onChange={ev => uEr(i, 'topic', ev.target.value)} />
                  <textarea className="lux-textarea" rows={1} placeholder="Why does it happen?" value={er.rootCause} onChange={ev => uEr(i, 'rootCause', ev.target.value)} />
                  <textarea className="lux-textarea" rows={1} placeholder="How to address it" value={er.fix} onChange={ev => uEr(i, 'fix', ev.target.value)} />
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Key Insight"><FieldGroup label="Most important insight gained from student interactions this phase:"><textarea className="lux-textarea" rows={3} value={data.keyInsight} onChange={e => updateField('keyInsight', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
