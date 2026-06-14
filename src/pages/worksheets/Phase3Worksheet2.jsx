import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p3_w2';

export default function Phase3Worksheet2() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(() => ({
    governanceStructure: '', reviewCadence: '', primaryKpis: '', targetThresholds: '',
    reportingStructure: '', accountabilityMechanisms: '',
    status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-3');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const saved = await loadWorksheetData(user.id, WS);
        if (saved?.worksheet_data) {
          setData(prev => ({ ...prev, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
        } else {
          const name = await getOAuthName();
          if (name) setData(prev => ({ ...prev, employeeName: name }));
        }
        setLoaded(true);
      } catch (err) { console.error('Load error:', err); setLoaded(true); }
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));

  async function handleSubmit() {
    setSubmitError('');
    if (!data.governanceStructure?.trim()) {
      setSubmitError('Please fill in the Governance Structure.');
      return;
    }
    setSubmitting(true);
    const submitData = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') };
    setData(submitData);
    await flushSave(submitData);
    setSubmitting(false);
  }

  if (loaded && data._savedReviewStatus === 'approved') {
    return <ApprovedView msg="Your Governance & Performance Indicators worksheet has been reviewed and approved." path="/phase-3" />;
  }
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') {
    return <SubmittedView msg="Governance & Performance worksheet submitted for review." path="/phase-3" />;
  }
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader
          icon={null} title="Governance & Performance Indicators"
          subtitle="Define governance structures and key performance indicators" saveStatus={saveStatus}
        />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review the feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="Governance Framework">
            <FieldGroup label="Governance Structure" hint="What governance model will oversee execution?" required>
              <textarea className="lux-textarea" rows={4} value={data.governanceStructure || ''}
                onChange={e => u('governanceStructure', e.target.value)} placeholder="Describe the governance structure..." />
            </FieldGroup>
            <FieldGroup label="Review Cadence" hint="How frequently will progress be reviewed?">
              <select className="lux-select" value={data.reviewCadence || ''} onChange={e => u('reviewCadence', e.target.value)}>
                <option value="">Select cadence...</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Key Performance Indicators">
            <FieldGroup label="Primary KPIs" hint="List the 3-5 key metrics that define success">
              <textarea className="lux-textarea" rows={4} value={data.primaryKpis || ''}
                onChange={e => u('primaryKpis', e.target.value)} placeholder="Enter your primary KPIs..." />
            </FieldGroup>
            <FieldGroup label="Target Thresholds" hint="What are the specific numeric targets for each KPI?">
              <textarea className="lux-textarea" rows={3} value={data.targetThresholds || ''}
                onChange={e => u('targetThresholds', e.target.value)} placeholder="Define target thresholds..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Reporting & Accountability">
            <FieldGroup label="Reporting Structure" hint="How will results be reported and to whom?">
              <textarea className="lux-textarea" rows={3} value={data.reportingStructure || ''}
                onChange={e => u('reportingStructure', e.target.value)} placeholder="Describe reporting structure..." />
            </FieldGroup>
            <FieldGroup label="Accountability Mechanisms" hint="What mechanisms ensure accountability?">
              <textarea className="lux-textarea" rows={3} value={data.accountabilityMechanisms || ''}
                onChange={e => u('accountabilityMechanisms', e.target.value)} placeholder="Describe accountability mechanisms..." />
            </FieldGroup>
          </WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-3')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
