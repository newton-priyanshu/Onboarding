import { t } from '../../config/theme';
import { FileText, Plus, Trash2 } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankEntry = () => ({ type: '', title: '', date: '', submitted: false, reviewer: '', approved: false });
const qualityItems = ['All questions have unambiguous problem statements', 'Coding questions include complete test cases', 'MCQs have one correct answer + plausible distractors', 'Solutions / answer keys are included', 'Difficulty is appropriate for current cohort', 'Content reviewed by mentor before submission'];

export default function Phase2Worksheet3() {
  return (
    <WorksheetPage
      worksheetId="p2_w3" phase="phase-2" icon={FileText}
      title="Courseware Content Creation Ledger"
      subtitle="Days 31-60 · Track every content contribution."
      backTo="/phase-2"
      defaultData={{
        employeeName: '',
        entries: Array(6).fill(null).map(() => blankEntry()),
        qualityChecks: qualityItems.map(() => false),
        reflection: '', employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Content Ledger has been reviewed and approved."
      submittedMsg="Content ledger submitted."
      buddyApproveMsg="Your Content Ledger has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uE = (i: number, f: string, v: any) => setData(p => { const arr = [...p.entries]; arr[i] = { ...arr[i], [f]: v }; return { ...p, entries: arr }; });
        const toggleQuality = (i: number) => setData(p => { const arr = [...p.qualityChecks]; arr[i] = !arr[i]; return { ...p, qualityChecks: arr }; });
        const addEntry = () => setData(p => ({ ...p, entries: [...p.entries, blankEntry()] }));
        const removeEntry = (i: number) => { if (data.entries.length > 1) setData(p => ({ ...p, entries: p.entries.filter((_: any, idx: number) => idx !== i) })); };
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Content Creation Tracker" subtitle="All content must be reviewed by mentor or Faculty Lead before release.">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>{data.entries.length} entries</span>
                <button type="button" onClick={addEntry} className="lux-btn lux-btn-ghost" style={{ padding: '6px 12px', height: 'auto', fontSize: '0.65rem' }}><Plus size={12} strokeWidth={1.5} /> Add</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.5fr 1fr 0.5fr', gap: '6px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                {['Type', 'Topic', 'Date', 'Sub.', 'Reviewer', 'Appr.'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
              </div>
              {data.entries.map((e: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.5fr 1fr 0.5fr', gap: '6px', flex: 1 }}>
                    <input className="lux-input" placeholder="Type" value={e.type} onChange={ev => uE(i, 'type', ev.target.value)} />
                    <input className="lux-input" placeholder="Topic" value={e.title} onChange={ev => uE(i, 'title', ev.target.value)} />
                    <input className="lux-input" type="date" value={e.date} onChange={ev => uE(i, 'date', ev.target.value)} />
                    <input type="checkbox" checked={e.submitted} onChange={ev => uE(i, 'submitted', ev.target.checked)} style={{ accentColor: 'var(--color-charcoal)', justifySelf: 'center' }} />
                    <input className="lux-input" placeholder="Name" value={e.reviewer} onChange={ev => uE(i, 'reviewer', ev.target.value)} />
                    <input type="checkbox" checked={e.approved} onChange={ev => uE(i, 'approved', ev.target.checked)} style={{ accentColor: 'var(--color-charcoal)', justifySelf: 'center' }} />
                  </div>
                  {data.entries.length > 1 && <button type="button" onClick={() => removeEntry(i)} style={{ background: 'none', border: 'none', color: t.error, cursor: 'pointer', padding: '4px' }}><Trash2 size={14} strokeWidth={1.5} /></button>}
                </div>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Worksheet Quality Checklist" subtitle="Self-review before submission.">
              {qualityItems.map((item, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.06)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={data.qualityChecks[i]} onChange={() => toggleQuality(i)} style={{ accentColor: 'var(--color-charcoal)' }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: data.qualityChecks[i] ? 'var(--color-charcoal)' : 'var(--color-warm-grey)' }}>{item}</span>
                </label>
              ))}
            </WorksheetSection>
            <WorksheetSection title="Reflection"><FieldGroup label="How did content creation improve your understanding of the subject?"><textarea className="lux-textarea" rows={3} value={data.reflection} onChange={e => updateField('reflection', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
