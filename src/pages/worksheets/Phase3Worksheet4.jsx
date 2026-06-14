import { useState } from 'react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useAuth } from '../../context/AuthContext';

export default function Phase3Worksheet4() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const { saveStatus, saveData } = useAutoSave('phase3_worksheet4', formData);

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
        title="3.4 Resource Allocation & Budgeting"
        subtitle="Detail the resources, budget, and timeline required for execution"
        saveStatus={saveStatus}
      />

      <WorksheetSection title="Resource Requirements">
        <FieldGroup label="Human Resources" hint="What personnel and expertise are needed?">
          <textarea
            className="lux-textarea"
            rows={4}
            value={formData.humanResources || ''}
            onChange={handleChange('humanResources')}
            placeholder="Describe human resource needs..."
          />
        </FieldGroup>
        <FieldGroup label="Technology & Tools" hint="What technology, software, or tools are required?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.technologyTools || ''}
            onChange={handleChange('technologyTools')}
            placeholder="List technology and tools needed..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Budget Planning">
        <FieldGroup label="Budget Breakdown" hint="Provide a detailed breakdown of the budget">
          <textarea
            className="lux-textarea"
            rows={5}
            value={formData.budgetBreakdown || ''}
            onChange={handleChange('budgetBreakdown')}
            placeholder="Break down the budget..."
          />
        </FieldGroup>
        <FieldGroup label="Funding Sources" hint="What are the sources of funding?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.fundingSources || ''}
            onChange={handleChange('fundingSources')}
            placeholder="Identify funding sources..."
          />
        </FieldGroup>
      </WorksheetSection>

      <WorksheetSection title="Timeline & Milestones">
        <FieldGroup label="Key Milestones" hint="What are the key milestones and their target dates?">
          <textarea
            className="lux-textarea"
            rows={4}
            value={formData.keyMilestones || ''}
            onChange={handleChange('keyMilestones')}
            placeholder="List key milestones with dates..."
          />
        </FieldGroup>
        <FieldGroup label="Dependencies" hint="What dependencies exist between milestones?">
          <textarea
            className="lux-textarea"
            rows={3}
            value={formData.dependencies || ''}
            onChange={handleChange('dependencies')}
            placeholder="Describe dependencies..."
          />
        </FieldGroup>
      </WorksheetSection>

      {error && <ErrorAlert message={error} />}
      <ActionBar onSubmit={handleSubmit} submitting={submitting} />
    </div>
  );
}
