import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorksheet } from '../../hooks/useWorksheet';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback } from '../../worksheetComponents';

const WS = 'p2_w3';
const blankEntry = () => ({ type: '', title: '', date: '', submitted: false, reviewer: '', approved: false });
const qualityItems = ['All questions have unambiguous problem statements', 'Coding questions include complete test cases', 'MCQs have one correct answer + plausible distractors', 'Solutions / answer keys are included', 'Difficulty is appropriate for current cohort', 'Content reviewed by mentor before submission'];

export default function Phase2Worksheet3() {
  const n = useNavigate(); const { user } = useAuth();

  const {
    data, setData, loaded, submitting, submitError, saveStatus,
    updateField, handleSubmit,
    isApproved, isSubmitted,
  } = useWorksheet({
    user, worksheetId: WS, phase: 'phase-2',
    defaultData: {
      employeeName: '',
      entries: Array(6).fill(null).map(() => blankEntry()),
      qualityChecks: qualityItems.map(() => false),
      reflection: '',
      employeeSignature: '',
    },
    requiredFields: [{ key: 'employeeName', label: 'Full Name' }],
    redirectPath: '/phase-2',
    approvedMsg: 'Your Content Ledger has been reviewed and approved.',
    submittedMsg: 'Content ledger submitted.',
  });

  const uE = (i, f, v) => setData(p => { const arr = [...p.entries]; arr[i] = { ...arr[i], [f]: v }; return { ...p, entries: arr }; });
  const toggleQuality = (i) => setData(p => { const arr = [...p.qualityChecks]; arr[i] = !arr[i]; return { ...p, qualityChecks: arr }; });
  const addEntry = () => setData(p => ({ ...p, entries: [...p.entries, blankEntry()] }));
  const removeEntry = (i) => { if (data.entries.length > 1) setData(p => ({ ...p, entries: p.entries.filter((_, idx) => idx !== i) })); };

  if (isApproved) return <ApprovedView msg="Your Content Ledger has been reviewed and approved." path="/phase-2" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (isSubmitted) return <SubmittedView msg="Content ledger submitted." path="/phase-2" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-2" label="Back to Phase 2" />
        <WorksheetHeader icon={FileText} title="Courseware Content Creation Ledger" subtitle="Days 31-60 · Track every content contribution." saveStatus={saveStatus} />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Content Creation Tracker" subtitle="All content must be reviewed by mentor or Faculty Lead before release.">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>{data.entries.length} entries</span>
              <button type="button" onClick={addEntry} className="lux-btn lux-btn-ghost" style={{ padding: '6px 12px', height: 'auto', fontSize: '0.65rem' }}><Plus size={12} strokeWidth={1.5} /> Add</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.5fr 1fr 0.5fr', gap: '6px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Type', 'Topic', 'Date', 'Sub.', 'Reviewer', 'Appr.'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.entries.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.5fr 1fr 0.5fr', gap: '6px', flex: 1 }}>
                  <input className="lux-input" placeholder="Type" value={e.type} onChange={ev => uE(i, 'type', ev.target.value)} />
                  <input className="lux-input" placeholder="Topic" value={e.title} onChange={ev => uE(i, 'title', ev.target.value)} />
                  <input className="lux-input" type="date" value={e.date} onChange={ev => uE(i, 'date', ev.target.value)} />
                  <input type="checkbox" checked={e.submitted} onChange={ev => uE(i, 'submitted', ev.target.checked)} style={{ accentColor: 'var(--color-charcoal)', justifySelf: 'center' }} />
                  <input className="lux-input" placeholder="Name" value={e.reviewer} onChange={ev => uE(i, 'reviewer', ev.target.value)} />
                  <input type="checkbox" checked={e.approved} onChange={ev => uE(i, 'approved', ev.target.checked)} style={{ accentColor: 'var(--color-charcoal)', justifySelf: 'center' }} />
                </div>
                {data.entries.length > 1 && <button type="button" onClick={() => removeEntry(i)} style={{ background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} strokeWidth={1.5} /></button>}
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
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-2')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
