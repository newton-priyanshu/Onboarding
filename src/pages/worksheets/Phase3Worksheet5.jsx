import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p3_w5';

export default function Phase3Worksheet5() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(() => ({
    keyStakeholders: '', communicationChannels: '', changeImpact: '', trainingSupport: '',
    successMetrics: '', feedbackMechanisms: '',
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
    if (!data.keyStakeholders?.trim()) { setSubmitError('Please fill in Key Stakeholders.'); return; }
    setSubmitting(true);
    const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') };
    setData(d); await flushSave(d);
    setSubmitting(false);
  }

  if (loaded && data._savedReviewStatus === 'approved') {
    return <ApprovedView msg="Your Communication & Change Management worksheet has been reviewed and approved." path="/phase-3" />;
  }
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') {
    return <SubmittedView msg="Communication & Change Management worksheet submitted for review." path="/phase-3" />;
  }
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader
          icon={null} title="Communication & Change Management"
          subtitle="Develop a communication and change management plan to ensure adoption" saveStatus={saveStatus}
        />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review the feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="Communication Plan">
            <FieldGroup label="Key Stakeholders" hint="Who needs to be informed and engaged?" required>
              <textarea className="lux-textarea" rows={4} value={data.keyStakeholders || ''}
                onChange={e => u('keyStakeholders', e.target.value)} placeholder="List key stakeholders..." />
            </FieldGroup>
            <FieldGroup label="Communication Channels" hint="What channels will be used for communication?">
              <textarea className="lux-textarea" rows={3} value={data.communicationChannels || ''}
                onChange={e => u('communicationChannels', e.target.value)} placeholder="Describe communication channels..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Change Management">
            <FieldGroup label="Change Impact Assessment" hint="What is the expected impact of the changes on teams and processes?">
              <textarea className="lux-textarea" rows={4} value={data.changeImpact || ''}
                onChange={e => u('changeImpact', e.target.value)} placeholder="Assess the impact of changes..." />
            </FieldGroup>
            <FieldGroup label="Training & Support" hint="What training and support will be provided?">
              <textarea className="lux-textarea" rows={3} value={data.trainingSupport || ''}
                onChange={e => u('trainingSupport', e.target.value)} placeholder="Describe training and support plans..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Adoption Metrics">
            <FieldGroup label="Success Metrics" hint="How will you measure adoption and success?">
              <textarea className="lux-textarea" rows={3} value={data.successMetrics || ''}
                onChange={e => u('successMetrics', e.target.value)} placeholder="Define success metrics..." />
            </FieldGroup>
            <FieldGroup label="Feedback Mechanisms" hint="How will you collect and incorporate feedback?">
              <textarea className="lux-textarea" rows={3} value={data.feedbackMechanisms || ''}
                onChange={e => u('feedbackMechanisms', e.target.value)} placeholder="Describe feedback mechanisms..." />
            </FieldGroup>
          </WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-3')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
