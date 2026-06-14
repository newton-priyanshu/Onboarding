import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { Shield, CheckCircle2, AlertCircle, Send, ArrowLeft } from 'lucide-react';

const milestones = [
  ['Confidently resolves student doubts independently', 'Observed by mentor during doubt session'],
  ['Runs lab sessions without guidance', 'Faculty Lead lab observation'],
  ['All content contributions reviewed and approved', 'Content audit by Faculty Lead'],
  ['Full advanced portal proficiency', 'Live portal demonstration'],
  ['All Phase 2 worksheets submitted', 'Compendium review by Faculty Lead'],
];

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function GateControl2() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [data, setData] = useState({
    employeeName: '',
    studentSupport: 3, labFacilitation: 3, contentCreation: 3, portalProficiency: 3, communication: 3,
    milestones: milestones.map(() => 'Not Met'),
    managerComments: '', decision: '', managerSignature: '', instructorSignature: '',
    status: 'In Progress', submittedAt: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const saved = await supabase.from('worksheet_submissions').select('*').eq('user_id', user.id).eq('worksheet_id', 'gc2').maybeSingle();
      if (saved?.worksheet_data) setData(p => ({ ...p, ...saved.worksheet_data, _savedReviewStatus: saved.review_status || '' }));
      else setData(p => ({ ...p, employeeName: profile?.full_name || user?.email?.split('@')[0] || '' }));
      setLoaded(true);
    })();
  }, [user?.id, profile]);

  useEffect(() => {
    if (!user?.id || data.status === 'Submitted' || !loaded) return;
    const t = setTimeout(async () => {
      await supabase.from('worksheet_submissions').upsert({
        user_id: user.id, worksheet_id: 'gc2', worksheet_data: data, phase: 'phase2', status: data.status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,worksheet_id' });
    }, 2000);
    return () => clearTimeout(t);
  }, [data, user?.id, loaded]);

  const u = (f, v) => setData(p => ({ ...p, [f]: v }));
  const toggleMs = (i) => setData(p => {
    const arr = [...p.milestones];
    const vals = ['Not Met', 'Partial', 'Met'];
    arr[i] = vals[(vals.indexOf(arr[i]) + 1) % vals.length];
    return { ...p, milestones: arr };
  });

  const handleSubmit = async () => {
    setError('');
    if (!data.employeeName.trim()) { setError('Please fill in your name.'); return; }
    setSubmitting(true);
    const isResubmit = data._savedReviewStatus === 'needs_revision';
    const review_status = isResubmit ? 'revision_submitted' : '';
    const d = { ...data, status: 'Submitted', submittedAt: new Date().toISOString(), _savedReviewStatus: review_status };
    setData(d);
    await supabase.from('worksheet_submissions').upsert({
      user_id: user.id, worksheet_id: 'gc2', worksheet_data: d, phase: 'phase2', status: 'Submitted',
      review_status, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,worksheet_id' });
    setSubmitting(false);
  };

  if (loaded && data._savedReviewStatus === 'approved') {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line lux-line-gold" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: '#1B5E20', marginBottom: '0.75rem' }}>✓ Gate Control 2 Approved</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>Your 60-day milestone review has been approved.</p>
          <button onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Back to Phase 2</span>
          </button>
        </div>
      </div>
    );
  }
  if (data.status === 'Submitted' && loaded && data._savedReviewStatus !== 'needs_revision') {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center' }}>
        <div className="lux-container" style={{ textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>Gate Control 2 Submitted</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>60-day review submitted.</p>
          <button onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" /><span className="btn-content">Back to Phase 2</span>
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) return <div className="lux-section" style={{ textAlign: 'center' }}><div className="lux-container"><p style={{ fontFamily: t.body, color: t.wg }}>Loading…</p></div></div>;

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <button onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Phase 2
        </button>

        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield size={22} strokeWidth={1.5} style={{ color: t.gd }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '2px' }}>
                Gate Control 2 — <em style={{ fontStyle: 'italic', color: t.gd }}>60-Day Milestone</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>Phase 2 · Required before advancing to Phase 3</p>
            </div>
          </div>
        </div>

        {data._savedReviewStatus === 'needs_revision' && (
          <div className="lux-alert lux-alert-info" style={{ marginBottom: '1.5rem' }}>
            <span>Revision requested. Please review feedback, make changes, and resubmit.</span>
          </div>
        )}
        <form onSubmit={e => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="Self Assessment (1–5)">
            {[
              { k: 'studentSupport', l: 'Student Support' },
              { k: 'labFacilitation', l: 'Lab Facilitation' },
              { k: 'contentCreation', l: 'Content Creation' },
              { k: 'portalProficiency', l: 'Portal Proficiency' },
              { k: 'communication', l: 'Communication' },
            ].map(item => (
              <Slider key={item.k} label={item.l} value={data[item.k]} onChange={v => u(item.k, v)} />
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

          <Section title="Manager Review">
            <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-comments">Manager Comments</label><textarea id="gc2-comments" className="lux-textarea" rows={3} value={data.managerComments} onChange={e => u('managerComments', e.target.value)} /></div>
            <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-decision">Decision</label><select id="gc2-decision" className="lux-select" value={data.decision} onChange={e => u('decision', e.target.value)}><option value="">Select...</option><option value="approved">Approved</option><option value="conditions">Approved with Conditions</option><option value="needs_improvement">Needs Improvement</option></select></div>
          </Section>

          <Section title="Approval Sign-Off">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-mgr-sig">Manager Signature</label><input id="gc2-mgr-sig" className="lux-input" value={data.managerSignature} onChange={e => u('managerSignature', e.target.value)} /></div>
              <div className="lux-form-group"><label className="lux-label" htmlFor="gc2-instr-sig">Instructor Signature</label><input id="gc2-instr-sig" className="lux-input" value={data.instructorSignature} onChange={e => u('instructorSignature', e.target.value)} /></div>
            </div>
          </Section>

          {error && <div className="lux-alert lux-alert-error"><AlertCircle size={16} strokeWidth={1.5} /><span>{error}</span></div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.1)' }}>
            <button type="button" onClick={() => navigate('/phase-2')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="lux-btn lux-btn-primary" style={{ minWidth: '180px' }}>
              <span className="gold-overlay" /><span className="btn-content">{submitting ? '…' : <><Send size={16} strokeWidth={1.5} /> Submit Gate Review</>}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.25rem 0' }}>
      <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ch, marginBottom: subtitle ? '4px' : '0.75rem' }}>{title}</h3>
      {subtitle && <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg, marginBottom: '0.75rem' }}>{subtitle}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
    </div>
  );
}

function Slider({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 500, color: t.ch }}>{label}</span>
        <span style={{ fontFamily: t.body, fontSize: '0.8rem', fontWeight: 600, color: t.gd }}>{value}/5</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)}
            style={{
              flex: 1, padding: '10px', border: value >= n ? '1px solid var(--color-charcoal)' : '1px solid rgba(26,26,26,0.15)',
              background: value >= n ? 'var(--color-charcoal)' : 'transparent',
              color: value >= n ? '#F9F8F6' : t.wg,
              fontWeight: 500, cursor: 'pointer', fontFamily: t.body, fontSize: '0.85rem',
              transition: 'all 300ms var(--ease-lux)',
            }}
            onMouseOver={e => { if (value < n) e.currentTarget.style.borderColor = 'var(--color-gold)'; }}
            onMouseOut={e => { if (value < n) e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
          >{n}</button>
        ))}
      </div>
    </div>
  );
}
