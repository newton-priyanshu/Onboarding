import { useState } from 'react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useAuth } from '../../context/AuthContext';

export default function Phase3Worksheet2() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const { saveStatus, saveData } = useAutoSave('phase3_worksheet2', formData);

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
        title="3.2 Governance & Performance Indicators"
        subtitle="Define governance structures and key performance indicators for sustained execution"
        saveStatus={saveStatus}
      />

      <WorksheetSection title="Governance Framework">
        <FieldGroup label="Governance Structure" hint="What governance model will oversee execution?">
          <textarea
            className="lux-textarea"
            rows={4}
            value={formData.governanceStructure || ''}
            onChange={handleChange('governanceStructure')}
            placeholder="Describe the governance structure..."
          />
        </FieldGroup>
        <FieldGroup label="Review Cadence" hint="How frequently will progress be reviewed?">
          <select
            className="lux-select"
            value={formData.reviewCadence || ''}
            onChange={handleChange('reviewCadence')}
          >
            <option value="">Select cadence...</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Key Performance Indicators">
        <FieldGroup label="Primary KPIs" hint="List the 3–5 key metrics that define success">
          <textarea
            className="lux-textarea"
            rows={4}
            value={formData.primaryKpis || ''}
            onChange={handleChange('primaryKpis')}
            placeholder="Enter your primary KPIs..."
          />
        </FieldGroup>
        <FieldGroup label="Target Thresholds" hint="What are the specific numeric targets for each KPI?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.targetThresholds || ''}
            onChange={handleChange('targetThresholds')}
            placeholder="Define target thresholds..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Reporting & Accountability">
        <FieldGroup label="Reporting Structure" hint="How will results be reported and to whom?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.reportingStructure || ''}
            onChange={handleChange('reportingStructure')}
            placeholder="Describe reporting structure..."
          />
        </FieldGroup>
        <FieldGroup label="Accountability Mechanisms" hint="What mechanisms ensure accountability?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.accountabilityMechanisms || ''}
            onChange={handleChange('accountabilityMechanisms')}
            placeholder="Describe accountability mechanisms..."
          />
        </FieldGroup>
      </WorksheetSection>

      {error && <ErrorAlert message={error} />}
      <ActionBar onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
