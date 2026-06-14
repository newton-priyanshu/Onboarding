import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { FileText, AlertCircle, Star } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p1_w7';
const materialTypes = ['Lecture Slide Decks (PPTs)', 'Worksheets & Problem Sets', 'Coding Question Bank', 'MCQ Bank', 'Previous Exam / Contest Papers', 'Assignment Sets', 'Lab Exercises'];
const blankReview = () => ({ subject: '', items: '', quality: '', gaps: '' });

export default function Phase1Worksheet7() {
  const n = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    reviews: materialTypes.map(() => blankReview()),
    narrativeAchieve: '', narrativeProgression: '', narrativeStruggle: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-1');

  useEffect(() => {
    if (!user?.id) return; (async () => {
      const saved = await loadWorksheetData(user.id, WS);
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
      else { const name = await getOAuthName(); if (name) setData(p => ({ ...p, employeeName: name })); }
      setLoaded(true);
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const uRev = (i, f, v) => setData(p => { const arr = [...p.reviews]; arr[i] = { ...arr[i], [f]: v }; return { ...p, reviews: arr }; });
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const hSub = async () => { setSubmitError(''); if (!validateRequired()) return; setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') }; setData(d); await flushSave(d); setSubmitting(false); };

  if (loaded && data._savedReviewStatus === 'approved') return <ApprovedView msg="Your Courseware Review has been reviewed and approved." path="/phase-1" />;
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision') return <SubmittedView msg="Courseware review submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={FileText} title="Existing Courseware & Question Bank Review Matrix" subtitle="Days 7-28 · Systematically review all existing course material." saveStatus={saveStatus} />
        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review the feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>

          <WorksheetSection title="Courseware Review Log" subtitle="Review each material type and rate its quality, quantity, and gaps.">
            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 0.8fr 0.8fr 1.8fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--color-charcoal)' }}>
              {['Material Type', 'Subject', 'Items', 'Quality 1-5', 'Gaps / Improvements'].map(h => <span key={h} style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)' }}>{h}</span>)}
            </div>
            {materialTypes.map((type, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 0.8fr 0.8fr 1.8fr', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', color: 'var(--color-charcoal)' }}>{type}</span>
                <input className="lux-input" placeholder="Subject" value={data.reviews[i].subject} onChange={e => uRev(i, 'subject', e.target.value)} />
                <input className="lux-input" placeholder="Count" value={data.reviews[i].items} onChange={e => uRev(i, 'items', e.target.value)} />
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} type="button" onClick={() => uRev(i, 'quality', v)}
                      style={{
                        padding: '4px 4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                        background: 'transparent',
                        color: v <= parseInt(data.reviews[i].quality || 0) ? 'var(--color-gold)' : 'rgba(26,26,26,0.15)',
                        transition: 'color 300ms var(--ease-lux)',
                      }}>
                      <Star size={14} strokeWidth={1.5} fill={v <= parseInt(data.reviews[i].quality || 0) ? 'var(--color-gold)' : 'transparent'} />
                    </button>
                  ))}
                </div>
                <input className="lux-input" placeholder="Gaps?" value={data.reviews[i].gaps} onChange={e => uRev(i, 'gaps', e.target.value)} />
              </div>
            ))}
          </WorksheetSection>

          <WorksheetSection title="Content Narrative" subtitle="Reflect on the course's overall design and student challenges.">
            <FieldGroup label="What is the course trying to achieve? (Write the learning outcome in your own words):"><textarea className="lux-textarea" rows={2} value={data.narrativeAchieve} onChange={e => u('narrativeAchieve', e.target.value)} /></FieldGroup>
            <FieldGroup label="How does the difficulty level progress across weeks? Map it briefly:"><textarea className="lux-textarea" rows={2} value={data.narrativeProgression} onChange={e => u('narrativeProgression', e.target.value)} /></FieldGroup>
            <FieldGroup label="Where do students historically struggle most, and what does existing content do to address this?"><textarea className="lux-textarea" rows={2} value={data.narrativeStruggle} onChange={e => u('narrativeStruggle', e.target.value)} /></FieldGroup>
          </WorksheetSection>

          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => n('/phase-1')} onSubmit={hSub} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
