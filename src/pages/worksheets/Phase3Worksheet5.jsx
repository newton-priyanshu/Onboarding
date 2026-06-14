import { useState } from 'react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useAuth } from '../../context/AuthContext';

export default function Phase3Worksheet5() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const { saveStatus, saveData } = useAutoSave('phase3_worksheet5', formData);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await saveData();
      setCompleted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit worksheet.');
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) return <SubmittedView />;

  return (
    <div style={{ padding: '3rem 1rem', maxWidth: 800, margin: '0 auto' }}>
      <BackButton to="/phase3" />
      <WorksheetHeader
        title="3.5 Communication & Change Management"
        subtitle="Develop a communication and change management plan to ensure adoption"
        saveStatus={saveStatus}
      />

      <WorksheetSection title="Communication Plan">
        <FieldGroup label="Key Stakeholders" hint="Who needs to be informed and engaged?">
          <textarea
            className="lux-textarea"
            rows={4}
            value={formData.keyStakeholders || ''}
            onChange={handleChange('keyStakeholders')}
            placeholder="List key stakeholders..."
          />
        </FieldGroup>
        <FieldGroup label="Communication Channels" hint="What channels will be used for communication?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.communicationChannels || ''}
            onChange={handleChange('communicationChannels')}
            placeholder="Describe communication channels..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Change Management">
        <FieldGroup label="Change Impact Assessment" hint="What is the expected impact of the changes on teams and processes?">
          <textarea
            className="lux-textarea"
            rows={4}
            value={formData.changeImpact || ''}
            onChange={handleChange('changeImpact')}
            placeholder="Assess the impact of changes..."
          />
        </FieldGroup>
        <FieldGroup label="Training & Support" hint="What training and support will be provided?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.trainingSupport || ''}
            onChange={handleChange('trainingSupport')}
            placeholder="Describe training and support plans..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Adoption Metrics">
        <FieldGroup label="Success Metrics" hint="How will you measure adoption and success?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.successMetrics || ''}
            onChange={handleChange('successMetrics')}
            placeholder="Define success metrics..."
          />
        </FieldGroup>
        <FieldGroup label="Feedback Mechanisms" hint="How will you collect and incorporate feedback?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.feedbackMechanisms || ''}
            onChange={handleChange('feedbackMechanisms')}
            placeholder="Describe feedback mechanisms..."
          />
        </FieldGroup>
      </WorksheetSection>

      {error && <ErrorAlert message={error} />}
      <ActionBar onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
