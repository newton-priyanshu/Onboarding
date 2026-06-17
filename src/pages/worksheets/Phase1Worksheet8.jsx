import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorksheet } from '../../hooks/useWorksheet';
import { MessageCircle } from 'lucide-react';
import {BuddyApprovedView, WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback} from '../../config/worksheetComponents';

const WS = 'p1_w8';
const blankChan = () => ({ channel: '', dateRange: '', themes: '', pastDecisions: '' });

export default function Phase1Worksheet8() {
  const n = useNavigate(); const { user } = useAuth();

  const {
    data, setData, loaded, submitting, submitError, saveStatus,
    updateField, handleSubmit,
    isBuddyApproved, isApproved, isSubmitted,
  } = useWorksheet({
    user, worksheetId: WS, phase: 'phase-1',
    defaultData: {
      employeeName: '',
      channels: Array(4).fill(null).map(() => blankChan()),
      topMisconceptions: '', contentDecisions: '', highestImpact: '',
      employeeSignature: '',
    },
    requiredFields: [{ key: 'employeeName', label: 'Full Name' }],
    redirectPath: '/phase-1',
    approvedMsg: 'Your Slack Audit has been reviewed and approved.',
    submittedMsg: 'Slack audit submitted.',
  });

  const uCh = (i, f, v) => setData(p => { const arr = [...p.channels]; arr[i] = { ...arr[i], [f]: v }; return { ...p, channels: arr }; });

  if (isBuddyApproved) return <BuddyApprovedView msg="Your Slack Audit has been approved by your buddy." path="/phase-1" />;
  if (isApproved) return <ApprovedView msg="Your Slack Audit has been reviewed and approved." path="/phase-1" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (isSubmitted) return <SubmittedView msg="Slack audit submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={MessageCircle} title="Slack Historical Context & Student Bottleneck Audit" subtitle="Days 7-28 · Read subject Slack channels to understand past decisions." saveStatus={saveStatus} />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Slack Channel Audit Log" subtitle="Review each channel and document key themes and past decisions.">
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr 2fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Channel / Subject', 'Date Range Reviewed', 'Key Themes / Student Issues', 'Past Decisions Made'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {data.channels.map((ch, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 2fr 2fr', gap: '8px' }}>
                <input className="lux-input" placeholder="Channel name" value={ch.channel} onChange={e => uCh(i, 'channel', e.target.value)} />
                <input className="lux-input" placeholder="e.g. Jan-Mar 2025" value={ch.dateRange} onChange={e => uCh(i, 'dateRange', e.target.value)} />
                <input className="lux-input" placeholder="Common issues" value={ch.themes} onChange={e => uCh(i, 'themes', e.target.value)} />
                <input className="lux-input" placeholder="Past decisions" value={ch.pastDecisions} onChange={e => uCh(i, 'pastDecisions', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Bottleneck Synthesis" subtitle="Synthesise patterns across channels.">
            <FieldGroup label="List the top 3 recurring student misconceptions or difficulty patterns across all channels:"><textarea className="lux-textarea" rows={3} value={data.topMisconceptions} onChange={e => updateField('topMisconceptions', e.target.value)} /></FieldGroup>
            <FieldGroup label="Which content sequencing decisions were made in the past, and do they still make sense?"><textarea className="lux-textarea" rows={2} value={data.contentDecisions} onChange={e => updateField('contentDecisions', e.target.value)} /></FieldGroup>
            <FieldGroup label="What one course improvement would have the highest impact on student outcomes?"><textarea className="lux-textarea" rows={2} value={data.highestImpact} onChange={e => updateField('highestImpact', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => updateField('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-1')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
