import { useState } from 'react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useAuth } from '../../context/AuthContext';

export default function Phase3Worksheet3() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const { saveStatus, saveData } = useAutoSave('phase3_worksheet3', formData);

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
        title="3.3 Risk Management & Mitigation"
        subtitle="Identify, assess, and plan mitigation strategies for key risks"
        saveStatus={saveStatus}
      />

      <WorksheetSection title="Risk Identification">
        <FieldGroup label="Key Risks" hint="List the top 5–7 risks to successful execution">
          <textarea
            className="lux-textarea"
            rows={5}
            value={formData.keyRisks || ''}
            onChange={handleChange('keyRisks')}
            placeholder="Enter key risks..."
          />
        </FieldGroup>
        <FieldGroup label="Risk Categorization" hint="Categorize each risk (strategic, operational, financial, regulatory)">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.riskCategorization || ''}
            onChange={handleChange('riskCategorization')}
            placeholder="Categorize your risks..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Risk Assessment">
        <FieldGroup label="Impact Assessment" hint="What is the potential impact of each risk on a scale of 1–5?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.impactAssessment || ''}
            onChange={handleChange('impactAssessment')}
            placeholder="Assess the impact of each risk..."
          />
        </FieldGroup>
        <FieldGroup label="Likelihood Assessment" hint="How likely is each risk to materialize? (1–5 scale)">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.likelihoodAssessment || ''}
            onChange={handleChange('likelihoodAssessment')}
            placeholder="Assess the likelihood of each risk..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Mitigation Strategies">
        <FieldGroup label="Mitigation Plans" hint="What are your specific plans to mitigate each risk?">
          <textarea
            className="lux-textarea"
            rows={5}
            value={formData.mitigationPlans || ''}
            onChange={handleChange('mitigationPlans')}
            placeholder="Describe mitigation plans..."
          />
        </FieldGroup>
        <FieldGroup label="Contingency Measures" hint="What contingency measures are in place if risks materialize?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.contingencyMeasures || ''}
            onChange={handleChange('contingencyMeasures')}
            placeholder="Describe contingency measures..."
          />
        </FieldGroup>
      </WorksheetSection>

      {error && <ErrorAlert message={error} />}
      <ActionBar onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
