import { Users } from 'lucide-react';
import WorksheetPage, { WorksheetSection, FieldGroup } from '../../components/WorksheetPage';

export default function Phase3Worksheet2() {
  return (
    <WorksheetPage
      worksheetId="p3_w2" phase="phase-3" icon={Users}
      title="Student Cohort Profiling & Performance Mapping"
      subtitle="Understand who your students are and how to reach each of them effectively"
      backTo="/phase-3"
      defaultData={{
        employeeName: '', cohortSize: '', performanceRange: '',
        highPerformers: '', lowPerformers: '', learningNeeds: '',
        teachingAdaptations: '', relationshipApproach: '',
      }}
      requiredFields={[{ key: 'cohortSize', label: 'Cohort size / ability spread' }]}
      approvedMsg="Your Student Cohort Profiling worksheet has been reviewed and approved."
      submittedMsg="Student Cohort Profiling submitted for review."
      buddyApproveMsg="Your Cohort Profiling worksheet has been approved by your buddy."
    >
      {({ data, updateField }) => (
        <>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
          <WorksheetSection title="Cohort Profile" subtitle="Map the composition and performance spread of your students.">
            <FieldGroup label="What is the size of your cohort(s), and how would you describe the overall ability spread?" required>
              <textarea className="lux-textarea" rows={2} value={data.cohortSize || ''} onChange={e => updateField('cohortSize', e.target.value)} placeholder="e.g. 120 students across 2 sections — roughly 30% high-performers, 50% mid-range, 20% struggling..." />
            </FieldGroup>
            <FieldGroup label="How would you characterise the top performers vs. those who need additional support — what distinguishes them?">
              <textarea className="lux-textarea" rows={2} value={data.performanceRange || ''} onChange={e => updateField('performanceRange', e.target.value)} placeholder="Describe patterns you've observed..." />
            </FieldGroup>
            <FieldGroup label="What specific learning needs or engagement challenges are most prevalent in your cohort?">
              <textarea className="lux-textarea" rows={2} value={data.learningNeeds || ''} onChange={e => updateField('learningNeeds', e.target.value)} placeholder="e.g. struggling with abstract concepts, low participation in labs, language barriers..." />
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Teaching Adaptations" subtitle="How your understanding of the cohort shapes your teaching.">
            <FieldGroup label="What adaptations have you made to your teaching approach based on the cohort's profile?">
              <textarea className="lux-textarea" rows={2} value={data.teachingAdaptations || ''} onChange={e => updateField('teachingAdaptations', e.target.value)} placeholder="e.g. more live coding demos for visual learners, additional practice sheets for slower-paced students..." />
            </FieldGroup>
            <FieldGroup label="How do you build individual rapport with students and ensure no one falls through the cracks?">
              <textarea className="lux-textarea" rows={2} value={data.relationshipApproach || ''} onChange={e => updateField('relationshipApproach', e.target.value)} placeholder="Describe your system for tracking student progress and reaching out..." />
            </FieldGroup>
          </WorksheetSection>
        </>
      )}
    </WorksheetPage>
  );
}
