import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAutoSave, loadWorksheetData, getOAuthName } from '../../hooks/useAutoSave';
import { BookText, AlertCircle, Send } from 'lucide-react';
import { WorksheetHeader, WorksheetSection, FieldGroup, ActionBar, SubmittedView, LoadingView, BackButton, ErrorAlert } from '../../worksheetComponents';

const WS = 'p1_w3';

export default function Phase1Worksheet3() {
  const navigate = useNavigate(); const { user } = useAuth();
  const [data, setData] = useState(() => ({
    employeeName: '',
    culturePhilosophy: '', cultureIndustryDiff: '', culturePsychSafety: '',
    partnerStructure: '', semesterStructure: '', studentExpectations: '',
    behaviour1: '', behaviour2: '', behaviour3: '',
    employeeSignature: '', status: 'In Progress', dateSubmitted: '', _savedReviewStatus: '',
  }));
  const [loaded, setLoaded] = useState(false); const [submitting, setSubmitting] = useState(false); const [submitError, setSubmitError] = useState('');
  const { saveStatus, flushSave } = useAutoSave(user, data, WS, 'phase-1');

  useEffect(() => {
    if (!user?.id) return; (async () => {
      const saved = await loadWorksheetData(user.id, WS);
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
      else { const n = await getOAuthName(); if (n) setData(p => ({ ...p, employeeName: n })); }
      setLoaded(true);
    })();
  }, [user?.id]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const requiredFields = [{ key: 'employeeName', label: 'Full Name' }, { key: 'culturePhilosophy', label: 'Teaching Philosophy reflection' }];

  function validateRequired() {
    const missing = requiredFields.filter(f => !data[f.key]?.trim());
    if (missing.length > 0) { setSubmitError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return false; }
    return true;
  }

  const handleSubmit = async () => {
    setSubmitError(''); if (!validateRequired()) return;
    setSubmitting(true); const d = { ...data, status: 'submitted', dateSubmitted: new Date().toLocaleDateString('en-IN') };
    setData(d); await flushSave(d); setSubmitting(false);
  };

  if (data.status === 'submitted' && loaded) return <SubmittedView msg="Culture & Teaching Philosophy submitted." path="/phase-1" />;
  if (!loaded) return <LoadingView />;

  return (
    <div className="lux-section">
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 1rem' }}>
        <BackButton to="/phase-1" label="Back to Phase 1" />
        <WorksheetHeader icon={BookText} title="Organisational Culture & Teaching Philosophy Reflection" subtitle="Days 1-14 · Demonstrate understanding of Newton School's teaching philosophy." saveStatus={saveStatus} />
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column' }}>
          <WorksheetSection title="About You"><FieldGroup label="Full Name" required><input className="lux-input" value={data.employeeName} onChange={e => u('employeeName', e.target.value)} /></FieldGroup></WorksheetSection>
          <WorksheetSection title="Section A: Culture Understanding" subtitle="Industry professionals often find this phase counter-intuitive — acknowledge and document the mindset shift.">
            <FieldGroup label="Describe Newton School's teaching philosophy in your own words (min. 80 words):" required><textarea className="lux-textarea" rows={4} value={data.culturePhilosophy} onChange={e => u('culturePhilosophy', e.target.value)} /></FieldGroup>
            <FieldGroup label="How does teaching at Newton School differ from communication in your previous industry role?"><textarea className="lux-textarea" rows={3} value={data.cultureIndustryDiff} onChange={e => u('cultureIndustryDiff', e.target.value)} /></FieldGroup>
            <FieldGroup label="What does 'psychological safety in the classroom' mean, and how will you actively create it?"><textarea className="lux-textarea" rows={3} value={data.culturePsychSafety} onChange={e => u('culturePsychSafety', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Section B: University Partnership Model">
            <FieldGroup label="How are Newton School and the affiliated universities structured as partners?"><textarea className="lux-textarea" rows={3} value={data.partnerStructure} onChange={e => u('partnerStructure', e.target.value)} /></FieldGroup>
            <FieldGroup label="How is the academic semester / cohort structured? (Key dates, milestones, exam windows):"><textarea className="lux-textarea" rows={3} value={data.semesterStructure} onChange={e => u('semesterStructure', e.target.value)} /></FieldGroup>
            <FieldGroup label="What do students at this institution primarily expect from their instructors?"><textarea className="lux-textarea" rows={3} value={data.studentExpectations} onChange={e => u('studentExpectations', e.target.value)} /></FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Section C: Personal Commitment">
            <FieldGroup label="List three specific behaviours you will consciously practise in your first lecture:">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input className="lux-input" placeholder="Behaviour 1" value={data.behaviour1} onChange={e => u('behaviour1', e.target.value)} />
                <input className="lux-input" placeholder="Behaviour 2" value={data.behaviour2} onChange={e => u('behaviour2', e.target.value)} />
                <input className="lux-input" placeholder="Behaviour 3" value={data.behaviour3} onChange={e => u('behaviour3', e.target.value)} />
              </div>
            </FieldGroup>
          </WorksheetSection>
          <WorksheetSection title="Verification"><FieldGroup label="Employee Signature"><input className="lux-input" value={data.employeeSignature} onChange={e => u('employeeSignature', e.target.value)} /></FieldGroup></WorksheetSection>
          <ErrorAlert message={submitError} />
          <ActionBar onCancel={() => navigate('/phase-1')} onSubmit={handleSubmit} submitting={submitting} />
        </form>
      </div>
    </div>
  );
}
