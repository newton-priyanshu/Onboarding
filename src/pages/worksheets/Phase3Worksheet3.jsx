import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p3_w3';

export default function Phase3Worksheet3() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(() => ({
    keyRisks: '', riskCategorization: '', impactAssessment: '', likelihoodAssessment: '',
    mitigationPlans: '', contingencyMeasures: '',
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
    if (!data.keyRisks?.trim()) { setSubmitError('Please fill in Key Risks.'); return; }
    setSubmitting(true);
    const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') };
    setData(d); await flushSave(d);
    setSubmitting(false);
  }

  if (loaded && data._savedReviewStatus === 'approved') {
    return <ApprovedView msg="Your Risk Management & Mitigation worksheet has been reviewed and approved." path="/phase-3" />;
  }
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') {
    return <SubmittedView msg="Risk Management worksheet submitted for review." path="/phase-3" />;
  }
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader icon={null} title="Risk Management & Mitigation" subtitle="Identify, assess, and plan mitigation strategies" saveStatus={saveStatus} />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}><span>Revision requested. Please review the feedback, make changes, and resubmit.</span></div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="Risk Identification">
            <FieldGroup label="Key Risks" hint="List the top 5-7 risks" required><textarea className="lux-textarea" rows={5} value={data.keyRisks} onChange={e => u('keyRisks', e.target.value)} /></FieldGroup>
            <FieldGroup label="Risk Categorization" hint="Strategic, operational, financial, regulatory"><textarea className="lux-textarea" rows={3} value={data.riskCategorization} onChange={e => u('riskCategorization', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Risk Assessment">
            <FieldGroup label="Impact Assessment" hint="Potential impact 1-5"><textarea className="lux-textarea" rows={3} value={data.impactAssessment} onChange={e => u('impactAssessment', e.target.value)} /></FieldGroup>
            <FieldGroup label="Likelihood Assessment" hint="How likely 1-5"><textarea className="lux-textarea" rows={3} value={data.likelihoodAssessment} onChange={e => u('likelihoodAssessment', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Mitigation Strategies">
            <FieldGroup label="Mitigation Plans"><textarea className="lux-textarea" rows={5} value={data.mitigationPlans} onChange={e => u('mitigationPlans', e.target.value)} /></FieldGroup>
            <FieldGroup label="Contingency Measures"><textarea className="lux-textarea" rows={3} value={data.contingencyMeasures} onChange={e => u('contingencyMeasures', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-3')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
