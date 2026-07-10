import { MessageCircle } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

const blankChan = () => ({ channel: '', dateRange: '', themes: '', pastDecisions: '' });

export default function Phase1Worksheet8() {
  return (
    <WorksheetPage
      worksheetId="p1_w8" phase="phase-1" icon={MessageCircle}
      title="Slack Historical Context & Student Bottleneck Audit"
      subtitle="Days 7-28 · Read subject Slack channels to understand past decisions."
      backTo="/phase-1"
      defaultData={{
        employeeName: '',
        channels: Array(4).fill(null).map(() => blankChan()),
        topMisconceptions: '', contentDecisions: '', highestImpact: '',
        employeeSignature: '',
      }}
      requiredFields={[{ key: 'employeeName', label: 'Full Name' }]}
      approvedMsg="Your Slack Audit has been reviewed and approved."
      submittedMsg="Slack audit submitted."
      buddyApproveMsg="Your Slack Audit has been approved by your buddy."
    >
      {({ data, updateField, setData }) => {
        const uCh = (i: number, f: string, v: string) => setData(p => { const arr = [...p.channels]; arr[i] = { ...arr[i], [f]: v }; return { ...p, channels: arr }; });
        return (
          <>
            <WorksheetSection title="About You"><FieldGroup label="Full Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
            <WorksheetSection title="Slack Channel Audit Log" subtitle="Review each channel and document key themes and past decisions.">
              <div className="ws-scroll-x">
                <div className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr 2fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
                  {['Channel / Subject', 'Date Range Reviewed', 'Key Themes / Student Issues', 'Past Decisions Made'].map(h => (
                    <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>
                  ))}
                </div>
                {(data.channels as Array<Record<string, string>>).map((ch, i) => (
                  <div key={i} className="ws-matrix-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr 2fr', gap: '8px' }}>
                    <label htmlFor={`ch-name-${i}`} className="ws-sr-only">Channel / Subject (row {i + 1})</label>
                    <input id={`ch-name-${i}`} className="lux-input" placeholder="Channel name" value={ch.channel} onChange={e => uCh(i, 'channel', e.target.value)} />
                    <label htmlFor={`ch-range-${i}`} className="ws-sr-only">Date Range Reviewed (row {i + 1})</label>
                    <input id={`ch-range-${i}`} className="lux-input" placeholder="e.g. Jan-Mar 2025" value={ch.dateRange} onChange={e => uCh(i, 'dateRange', e.target.value)} />
                    <label htmlFor={`ch-themes-${i}`} className="ws-sr-only">Key Themes / Student Issues (row {i + 1})</label>
                    <input id={`ch-themes-${i}`} className="lux-input" placeholder="Common issues" value={ch.themes} onChange={e => uCh(i, 'themes', e.target.value)} />
                    <label htmlFor={`ch-decisions-${i}`} className="ws-sr-only">Past Decisions Made (row {i + 1})</label>
                    <input id={`ch-decisions-${i}`} className="lux-input" placeholder="Past decisions" value={ch.pastDecisions} onChange={e => uCh(i, 'pastDecisions', e.target.value)} />
                  </div>
                ))}
              </div>
            </WorksheetSection>
            <WorksheetSection title="Bottleneck Synthesis" subtitle="Synthesise patterns across channels.">
              <FieldGroup label="List the top 3 recurring student misconceptions or difficulty patterns across all channels:" id="topMisconceptions"><textarea id="topMisconceptions" className="lux-textarea" rows={3} value={data.topMisconceptions} onChange={e => updateField('topMisconceptions', e.target.value)} /></FieldGroup>
              <FieldGroup label="Which content sequencing decisions were made in the past, and do they still make sense?" id="contentDecisions"><textarea id="contentDecisions" className="lux-textarea" rows={2} value={data.contentDecisions} onChange={e => updateField('contentDecisions', e.target.value)} /></FieldGroup>
              <FieldGroup label="What one course improvement would have the highest impact on student outcomes?" id="highestImpact"><textarea id="highestImpact" className="lux-textarea" rows={2} value={data.highestImpact} onChange={e => updateField('highestImpact', e.target.value)} /></FieldGroup>
            </WorksheetSection>
            <WorksheetSection title="Verification"><FieldGroup label="Employee Signature" id="employeeSignature"><input id="employeeSignature" className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          </>
        );
      }}
    </WorksheetPage>
  );
}
