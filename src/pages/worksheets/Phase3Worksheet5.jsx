import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorksheet } from '../../hooks/useWorksheet';
import {BuddyApprovedView, WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback} from '../../config/worksheetComponents';
import { Lightbulb } from 'lucide-react';

const WS = 'p3_w5';

export default function Phase3Worksheet5() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    data, loaded, submitting, submitError, saveStatus,
    updateField, handleSubmit,
    isBuddyApproved, isApproved, isSubmitted,
  } = useWorksheet({
    user, worksheetId: WS, phase: 'phase-3',
    defaultData: {
      employeeName: '',
      problemIdentified: '',
      proposedChange: '', expectedImpact: '',
      implementationPlan: '',
      successCriteria: '',
    },
    requiredFields: [{ key: 'problemIdentified', label: 'Problem description' }],
    redirectPath: '/phase-3',
    approvedMsg: 'Your Course Improvement Proposal has been reviewed and approved.',
    submittedMsg: 'Course Improvement Proposal submitted for review.',
  });

  if (isBuddyApproved) return <BuddyApprovedView msg="Your Course Improvement Proposal has been approved by your buddy." path="/phase-3" />;
  if (isApproved) return <ApprovedView msg="Your Course Improvement Proposal has been reviewed and approved." path="/phase-3" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (isSubmitted) return <SubmittedView msg="Course Improvement Proposal submitted for review." path="/phase-3" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader
          icon={Lightbulb} title="Continuous Course Improvement Proposal"
          subtitle="Identify a concrete gap in the current curriculum and propose an evidence-backed improvement" saveStatus={saveStatus}
        />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You">
            <FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Problem Identification" subtitle="Ground your proposal in observed student needs or curriculum gaps.">
            <FieldGroup label="What specific gap, bottleneck, or student difficulty have you identified in the current course delivery or content?" required>
              <textarea className="lux-textarea" rows={2} value={data.problemIdentified || ''}
                onChange={e => updateField('problemIdentified', e.target.value)} placeholder="Be precise — cite specific topics, student feedback patterns, or assessment data that reveal the gap..." />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Proposed Improvement" subtitle="Describe your solution and how it addresses the identified gap.">
            <FieldGroup label="What specific change are you proposing, and what would it look like in practice?">
              <textarea className="lux-textarea" rows={2} value={data.proposedChange || ''}
                onChange={e => updateField('proposedChange', e.target.value)} placeholder="e.g. Adding weekly low-stakes quizzes, restructuring module sequencing, introducing peer review..." />
            </FieldGroup>
            <FieldGroup label="What measurable impact do you expect this change to have on student learning outcomes?">
              <textarea className="lux-textarea" rows={2} value={data.expectedImpact || ''}
                onChange={e => updateField('expectedImpact', e.target.value)} placeholder="How will you know if the change is working?" />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Implementation & Success Metrics">
            <FieldGroup label="Outline a brief implementation plan — what needs to happen, who needs to be involved, and over what timeline?">
              <textarea className="lux-textarea" rows={2} value={data.implementationPlan || ''}
                onChange={e => updateField('implementationPlan', e.target.value)} placeholder="Key steps, stakeholders, and timeline..." />
            </FieldGroup>
            <FieldGroup label="Define specific success criteria — how will you measure whether the improvement has worked?">
              <textarea className="lux-textarea" rows={2} value={data.successCriteria || ''}
                onChange={e => updateField('successCriteria', e.target.value)} placeholder="e.g. 15% improvement in assessment scores, reduced dropout rate, positive student survey results..." />
            </FieldGroup>
          </WorksheetSection>

          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-3')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
