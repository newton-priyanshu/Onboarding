import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p3_w4';

export default function Phase3Worksheet4() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(() => ({
    humanResources: '', technologyTools: '', budgetBreakdown: '', fundingSources: '',
    keyMilestones: '', dependencies: '',
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
    if (!data.humanResources?.trim()) { setSubmitError('Please fill in Human Resources.'); return; }
    setSubmitting(true);
    const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') };
    setData(d); await flushSave(d);
    setSubmitting(false);
  }

  if (loaded && data._savedReviewStatus === 'approved') {
    return <ApprovedView msg="Your Resource Allocation & Budgeting worksheet has been reviewed and approved." path="/phase-3" />;
  }
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') {
    return <SubmittedView msg="Resource Allocation & Budgeting worksheet submitted for review." path="/phase-3" />;
  }
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader
          icon={null} title="Resource Allocation & Budgeting"
          subtitle="Detail the resources, budget, and timeline required for execution" saveStatus={saveStatus}
        />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review the feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="Resource Requirements">
            <FieldGroup label="Human Resources" hint="What personnel and expertise are needed?" required>
              <textarea className="lux-textarea" rows={4} value={data.humanResources || ''}
                onChange={e => u('humanResources', e.target.value)} placeholder="Describe human resource needs..." />
            </FieldGroup>
            <FieldGroup label="Technology & Tools" hint="What technology, software, or tools are required?">
              <textarea className="lux-textarea" rows={3} value={data.technologyTools || ''}
                onChange={e => u('technologyTools', e.target.value)} placeholder="List technology and tools needed..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Budget Planning">
            <FieldGroup label="Budget Breakdown" hint="Provide a detailed breakdown of the budget">
              <textarea className="lux-textarea" rows={5} value={data.budgetBreakdown || ''}
                onChange={e => u('budgetBreakdown', e.target.value)} placeholder="Break down the budget..." />
            </FieldGroup>
            <FieldGroup label="Funding Sources" hint="What are the sources of funding?">
              <textarea className="lux-textarea" rows={3} value={data.fundingSources || ''}
                onChange={e => u('fundingSources', e.target.value)} placeholder="Identify funding sources..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Timeline & Milestones">
            <FieldGroup label="Key Milestones" hint="What are the key milestones and their target dates?">
              <textarea className="lux-textarea" rows={4} value={data.keyMilestones || ''}
                onChange={e => u('keyMilestones', e.target.value)} placeholder="List key milestones with dates..." />
            </FieldGroup>
            <FieldGroup label="Dependencies" hint="What dependencies exist between milestones?">
              <textarea className="lux-textarea" rows={3} value={data.dependencies || ''}
                onChange={e => u('dependencies', e.target.value)} placeholder="Describe dependencies..." />
            </FieldGroup>
          </WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-3')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
