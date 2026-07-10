import { Lightbulb } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

export default function Phase3Worksheet5() {
  return (
    <WorksheetPage
      worksheetId="p3_w5" phase="phase-3" icon={Lightbulb}
      title="Continuous Course Improvement Proposal"
      subtitle="Identify a concrete gap in the current curriculum and propose an evidence-backed improvement"
      backTo="/phase-3"
      defaultData={{
        employeeName: '',
        problemIdentified: '', proposedChange: '', expectedImpact: '',
        implementationPlan: '', successCriteria: '',
      }}
      requiredFields={[{ key: 'problemIdentified', label: 'Problem description' }]}
      approvedMsg="Your Course Improvement Proposal has been reviewed and approved."
      submittedMsg="Course Improvement Proposal submitted for review."
      buddyApproveMsg="Your Course Improvement Proposal has been approved by your buddy."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required id="employeeName"><input id="employeeName" className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
          <WorksheetSection title="Problem Identification" subtitle="Ground your proposal in observed student needs or curriculum gaps.">
            <FieldGroup label="What specific gap, bottleneck, or student difficulty have you identified in the current course delivery or content?" required id="problemIdentified">
              <textarea id="problemIdentified" className="lux-textarea" rows={2} value={data.problemIdentified || ''} onChange={e => updateField('problemIdentified', e.target.value)} placeholder="Be precise — cite specific topics, student feedback patterns, or assessment data that reveal the gap..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Proposed Improvement" subtitle="Describe your solution and how it addresses the identified gap.">
            <FieldGroup label="What specific change are you proposing, and what would it look like in practice?" id="proposedChange">
              <textarea id="proposedChange" className="lux-textarea" rows={2} value={data.proposedChange || ''} onChange={e => updateField('proposedChange', e.target.value)} placeholder="e.g. Adding weekly low-stakes quizzes, restructuring module sequencing, introducing peer review..." />
            </FieldGroup>
            <FieldGroup label="What measurable impact do you expect this change to have on student learning outcomes?" id="expectedImpact">
              <textarea id="expectedImpact" className="lux-textarea" rows={2} value={data.expectedImpact || ''} onChange={e => updateField('expectedImpact', e.target.value)} placeholder="How will you know if the change is working?" />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Implementation & Success Metrics">
            <FieldGroup label="Outline a brief implementation plan — what needs to happen, who needs to be involved, and over what timeline?" id="implementationPlan">
              <textarea id="implementationPlan" className="lux-textarea" rows={2} value={data.implementationPlan || ''} onChange={e => updateField('implementationPlan', e.target.value)} placeholder="Key steps, stakeholders, and timeline..." />
            </FieldGroup>
            <FieldGroup label="Define specific success criteria — how will you measure whether the improvement has worked?" id="successCriteria">
              <textarea id="successCriteria" className="lux-textarea" rows={2} value={data.successCriteria || ''} onChange={e => updateField('successCriteria', e.target.value)} placeholder="e.g. 15% improvement in assessment scores, reduced dropout rate, positive student survey results..." />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
