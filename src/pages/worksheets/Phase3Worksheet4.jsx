import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorksheet } from '../../hooks/useWorksheet';
import {BuddyApprovedView, WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert, ReviewFeedback} from '../../worksheetComponents';
import { BookOpen } from 'lucide-react';

const WS = 'p3_w4';

export default function Phase3Worksheet4() {
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
      frameworksApplied: '',
      activeLearningExample: '',
      theoryPracticeGap: '',
      iterationNotes: '',
      frameworkGrowth: '',
    },
    requiredFields: [{ key: 'frameworksApplied', label: 'Pedagogical frameworks applied' }],
    redirectPath: '/phase-3',
    approvedMsg: 'Your Pedagogical Frameworks Journal has been reviewed and approved.',
    submittedMsg: 'Pedagogical Frameworks Journal submitted for review.',
  });

  if (isBuddyApproved) return <BuddyApprovedView msg="Your Pedagogical Journal has been approved by your buddy." path="/phase-3" />;
  if (isApproved) return <ApprovedView msg="Your Pedagogical Frameworks Journal has been reviewed and approved." path="/phase-3" reviewerName={data._savedReviewerName} date={data._savedReviewedAt} />;
  if (isSubmitted) return <SubmittedView msg="Pedagogical Frameworks Journal submitted for review." path="/phase-3" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-3" label="Back to Phase 3" />
        <WorksheetHeader
          icon={BookOpen} title="Pedagogical Frameworks Application Journal"
          subtitle="Reflect on how educational theory translates into classroom practice" saveStatus={saveStatus}
        />
        <ReviewFeedback data={data} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You">
            <FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => updateField('employeeName', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Framework Application" subtitle="Document which pedagogical frameworks you've experimented with and how they landed.">
            <FieldGroup label="Which pedagogical frameworks or teaching strategies have you consciously applied this phase? (e.g., flipped classroom, think-pair-share, scaffolded instruction, peer instruction, problem-based learning)" required>
              <textarea className="lux-textarea" rows={2} value={data.frameworksApplied || ''}
                onChange={e => updateField('frameworksApplied', e.target.value)} placeholder="List the frameworks and briefly describe how you adapted them to your context..." />
            </FieldGroup>
            <FieldGroup label="Describe one specific instance where you used an active-learning technique. What was the student response, and what did you learn from it?">
              <textarea className="lux-textarea" rows={2} value={data.activeLearningExample || ''}
                onChange={e => updateField('activeLearningExample', e.target.value)} placeholder="What did you try, how did students react, and what would you do differently next time?" />
            </FieldGroup>
            <FieldGroup label="Where have you noticed the biggest gap between theory and practice — and how did you bridge it in the moment?">
              <textarea className="lux-textarea" rows={2} value={data.theoryPracticeGap || ''}
                onChange={e => updateField('theoryPracticeGap', e.target.value)} placeholder="Did a well-planned technique fall flat? How did you adapt?" />
            </FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Growth as an Educator" subtitle="Track your teaching evolution over Phase 3.">
            <FieldGroup label="What specific teaching behaviour have you iterated on most this phase — and what changed as a result?">
              <textarea className="lux-textarea" rows={2} value={data.iterationNotes || ''}
                onChange={e => updateField('iterationNotes', e.target.value)} placeholder="e.g. I started using exit tickets — now I can gauge understanding before the next class..." />
            </FieldGroup>
            <FieldGroup label="How has your personal teaching philosophy evolved since you started the onboarding program?">
              <textarea className="lux-textarea" rows={2} value={data.frameworkGrowth || ''}
                onChange={e => updateField('frameworkGrowth', e.target.value)} placeholder="What do you now believe about teaching that you didn't 90 days ago?" />
            </FieldGroup>
          </WorksheetSection>

          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-3')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
