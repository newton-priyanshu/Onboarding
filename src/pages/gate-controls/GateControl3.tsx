import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabase';
import { Shield, AlertCircle, Send, ArrowLeft } from 'lucide-react';
import { Section, Slider, BuddyApprovedView } from '../../config/worksheetComponents';
import { t } from '../../config/theme';

interface GateData {
  employeeName: string;
  selfProud: string;
  selfUncomfortable: string;
  selfSkills: string;
  selfPhilosophy: string;
  teachingRating: number;
  commRating: number;
  contentRating: number;
  studentRating: number;
  assessmentRating: number;
  ownershipRating: number;
  professionalismRating: number;
  milestones: string[];
  decision: string;
  finalComments: string;
  facultyLeadSignature: string;
  instructorSignature: string;
  status: string;
  submittedAt: string;
  [key: string]: unknown;
}

const milestones: [string, string][] = [
  ['Independent lecture delivery (min. 2 full sessions)', 'Faculty Lead lecture observation'],
  ['Student awareness — knows names, cohorts, needs', 'Instructor-led student walkthrough'],
  ['End-to-end assessment creation and management', 'Review of created assessment artefacts'],
  ['Applied pedagogical frameworks in class', 'Classroom observation + self-assessment'],
  ['Active course improvement contributor', 'Written proposal submitted (WS 3.5)'],
  ['All Phase 3 worksheets submitted and reviewed', 'Compendium review by Faculty Lead'],
];

interface GateControlProps {
  targetUserId?: string;
}

export default function GateControl3({ targetUserId }: GateControlProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const activeUserId = (targetUserId || user?.id || '') as string;
  const isBuddyMode = !!targetUserId;
  const [data, setData] = useState<GateData>({
    employeeName: '',
    selfProud: '', selfUncomfortable: '', selfSkills: '', selfPhilosophy: '',
    teachingRating: 3, commRating: 3, contentRating: 3, studentRating: 3, assessmentRating: 3, ownershipRating: 3, professionalismRating: 3,
    milestones: milestones.map(() => 'Not Met'),
    decision: '', finalComments: '', facultyLeadSignature: '', instructorSignature: '',
    status: 'In Progress', submittedAt: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeUserId) return;
    (async () => {
      const { data: saved } = await supabase.from('worksheet_submissions').select('*').eq('user_id', activeUserId).eq('worksheet_id', 'gc3').maybeSingle();
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data as Record<string, unknown>, _savedReviewStatus: saved.review_status || '', _savedReviewComment: saved.review_comment || '', _savedReviewerName: saved.reviewer_name || '', _savedReviewHistory: saved.review_history || [], _savedReviewedAt: saved.reviewed_at || '' }));
      else {
        if (isBuddyMode && targetUserId) {
          const { data: joinee } = await supabase.from('user_profiles').select('full_name').eq('id', targetUserId).single();
          if (joinee) setData(p => ({ ...p, employeeName: joinee.full_name }));
        } else {
          setData(p => ({ ...p, employeeName: profile?.full_name || user?.email?.split('@')[0] || '' }));
        }
      }
      setLoaded(true);
    })();
  }, [activeUserId, user?.id, profile, isBuddyMode, targetUserId]);

  useEffect(() => {
    if (!activeUserId || data.status === 'submitted' || !loaded) return;
    const t = setTimeout(async () => {
      await supabase.from('worksheet_submissions').upsert({
        user_id: activeUserId, worksheet_id: 'gc3', worksheet_data: data, phase: 'phase3', status: data.status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,worksheet_id' });
    }, 2000);
    return () => clearTimeout(t);
  }, [data, activeUserId, loaded]);

  const u = (f: string, v: unknown) => setData(p => ({ ...p, [f]: v }));
  const toggleMs = (i: number) => setData(p => {
    const arr = [...p.milestones];
    const vals: string[] = ['Not Met', 'Partial', 'Met'];
    arr[i] = vals[(vals.indexOf(arr[i]!) + 1) % vals.length]!;
    return { ...p, milestones: arr };
  });

  const handleSubmit = async () => {
    setError('');
    if (!data.employeeName.trim()) { setError('Please fill in the instructor name.'); return; }
    if (!data.decision) { setError('Please select a final readiness rating.'); return; }
    setSubmitting(true);
    const review_status = isBuddyMode ? 'buddy_approved' : (data._savedReviewStatus === 'needs_revision' ? 'revision_submitted' : '');
    const d = { ...data, status: 'submitted', submittedAt: new Date().toISOString(), _savedReviewStatus: review_status };
    setData(d);

    const payload: Record<string, unknown> = {
      user_id: activeUserId,
      worksheet_id: 'gc3',
      worksheet_data: d,
      phase: 'phase3',
      status: 'submitted',
      review_status,
      updated_at: new Date().toISOString(),
      reviewed_by: isBuddyMode ? user?.id : null,
      reviewed_at: isBuddyMode ? new Date().toISOString() : null,
      reviewer_name: isBuddyMode ? ((profile?.full_name as string) || 'Buddy') : null,
    };
    await supabase.from('worksheet_submissions').upsert(payload, { onConflict: 'user_id,worksheet_id' });
    setSubmitting(false);
  };

  if (loaded && data._savedReviewStatus === 'buddy_approved') {
    return <BuddyApprovedView msg="Your Gate Control 3 has been approved by your buddy." path="/phase-3" />;
  }
  if (loaded && data._savedReviewStatus === 'approved') {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: '#1B5E20', marginBottom: '0.5rem' }}>✓ Onboarding Complete — Approved</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>
            Your 90-day readiness assessment has been reviewed and approved. Congratulations on completing the faculty onboarding program!
          </p>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }
  if (data.status === 'submitted' && loaded && data._savedReviewStatus !== 'needs_revision' && data._savedReviewStatus !== 'buddy_approved' && data._savedReviewStatus !== 'revision_submitted') {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>Onboarding Complete</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>
            Your 90-day readiness assessment has been submitted. Congratulations on completing the faculty onboarding program!
          </p>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Go to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) return <div className="lux-section" style={{ textAlign: 'center' }}><div className="lux-container"><p style={{ fontFamily: t.body, color: t.wg }}>Loading...</p></div></div>;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <button onClick={() => navigate('/phase-3')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Phase 3
        </button>

        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '2px' }}>
                Gate Control 3 — <em style={{ fontStyle: 'italic', color: t.gd }}>Final Readiness</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Phase 3 · Full Deployment Board — determines independence level</p>
            </div>
          </div>
        </div>

        {(data._savedReviewStatus === 'needs_revision' || data._savedReviewStatus === 'revision_submitted') && !!data._savedReviewComment && (
          <div style={{ marginBottom: '1.5rem', border: '1px solid #C62828', background: '#FFF5F5', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <div style={{ width: '6px', height: '6px', background: '#C62828', flexShrink: 0 }} />
              <span style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#C62828' }}>Revision Feedback</span>
            </div>
            <div style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.ch, lineHeight: 1.6, marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{data._savedReviewComment as string}</div>
            {!!data._savedReviewerName && <div style={{ fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>— {data._savedReviewerName as string}</div>}
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(198, 40, 40, 0.06)', fontFamily: t.body, fontSize: '0.75rem', color: '#C62828' }}>Please review the feedback above, make changes, and resubmit.</div>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="New Instructor Self Reflection">
            {[
              { k: 'selfProud', l: 'What am I most proud of?' },
              { k: 'selfUncomfortable', l: 'What still makes me uncomfortable?' },
              { k: 'selfSkills', l: 'What skills require further development?' },
              { k: 'selfPhilosophy', l: 'How has my teaching philosophy evolved?' },
            ].map(item => (
              <div key={item.k} className="lux-form-group">
                <label className="lux-label" htmlFor={`gc3-${item.k}`}>{item.l}</label>
                <textarea id={`gc3-${item.k}`} className="lux-textarea" rows={2} value={data[item.k] as string} onChange={e => u(item.k, e.target.value)} />
              </div>
            ))}
          </Section>

          <Section title="Faculty Lead Assessment (1–5)">
            {[
              { k: 'teachingRating', l: 'Teaching' },
              { k: 'commRating', l: 'Communication' },
              { k: 'contentRating', l: 'Content Creation' },
              { k: 'studentRating', l: 'Student Handling' },
              { k: 'assessmentRating', l: 'Assessment Design' },
              { k: 'ownershipRating', l: 'Ownership' },
              { k: 'professionalismRating', l: 'Professionalism' },
            ].map(item => (
              <Slider key={item.k} label={item.l} value={data[item.k] as number} onChange={v => u(item.k, v)} />
            ))}
          </Section>

          <Section title="Required Milestone Outcomes" subtitle="Click to toggle: Met → Partial → Not Met">
            {milestones.map(([outcome, verify], i) => {
              const status = data.milestones[i];
              const statusColor = status === 'Met' ? '#1B5E20' : status === 'Partial' ? '#E65100' : t.wg;
              return (
                <div key={i} onClick={() => toggleMs(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer', borderLeft: '1px solid ' + statusColor }}>
                  <div style={{ width: '8px', height: '8px', background: statusColor, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: t.body, fontSize: '0.85rem', fontWeight: 500, color: t.ch }}>{outcome}</span>
                    <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, margin: '2px 0 0' }}>{verify}</p>
                  </div>
                  <span style={{ fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', color: statusColor, whiteSpace: 'nowrap' }}>{status}</span>
                </div>
              );
            })}
          </Section>

          <Section title="Final Readiness Rating">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {[
                { k: 'fully_independent', l: 'Fully Independent', d: 'Can teach, create assessments, and contribute without supervision.' },
                { k: 'needs_minor_support', l: 'Needs Minor Support', d: 'Proficient in most areas; occasional guidance needed.' },
                { k: 'needs_development', l: 'Needs Development', d: 'Gaps in teaching fluency; remediation required.' },
              ].map(opt => {
                const isSelected = data.decision === opt.k;
                return (
                  <div key={opt.k} onClick={() => u('decision', opt.k)}
                    style={{
                      padding: '16px', cursor: 'pointer',
                      borderTop: isSelected ? '3px solid var(--color-gold)' : '1px solid rgba(26,26,26,0.15)',
                      textAlign: 'center', transition: 'border-color 500ms var(--ease-lux)',
                    }}>
                    <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch, display: 'block', marginBottom: '4px' }}>{opt.l}</span>
                    <p style={{ fontFamily: t.body, fontSize: '0.7rem', color: t.wg, lineHeight: 1.5 }}>{opt.d}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Final Decision">
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="gc3-comments">Final Comments</label>
              <textarea id="gc3-comments" className="lux-textarea" rows={3} value={data.finalComments} onChange={e => u('finalComments', e.target.value)} />
            </div>
          </Section>

          <Section title="Approval Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc3-fl-sig">Faculty Lead Signature</label><input id="gc3-fl-sig" className="lux-input" value={data.facultyLeadSignature} onChange={e => u('facultyLeadSignature', e.target.value)} /></div>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc3-instr-sig">Instructor Signature</label><input id="gc3-instr-sig" className="lux-input" value={data.instructorSignature} onChange={e => u('instructorSignature', e.target.value)} /></div>
            </div>
          </Section>

          {error && <div className="lux-alert lux-alert-error"><AlertCircle size={16} strokeWidth={1.5} /><span>{error}</span></div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/phase-3')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '200px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '...' : <><Send size={16} strokeWidth={1.5} /> Submit Final Assessment</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
