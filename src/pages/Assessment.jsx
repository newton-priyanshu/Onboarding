import { useState } from 'react';
import { supabase } from '../supabase';
import { Award, CheckCircle2, Send, AlertCircle, BarChart3, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const levels = [
  {
    id: 'fully_independent',
    label: 'Fully Independent',
    description: 'Ready for a full lecture schedule without supervision.',
    color: '#1B5E20',
    criteria: [
      'Consistently delivers high-quality lectures',
      'Manages classroom effectively',
      'Designs assessments independently',
      'Provides excellent student support',
    ],
  },
  {
    id: 'needs_minor_support',
    label: 'Needs Minor Support',
    description: 'Requires 2–3 more weeks of mentor shadowing.',
    color: '#E65100',
    criteria: [
      'Delivers good lectures with occasional guidance',
      'Shows promise in assessment design',
      'May need support with challenging classroom situations',
    ],
  },
  {
    id: 'needs_development',
    label: 'Needs Further Development',
    description: 'Requires a targeted 30-day improvement plan.',
    color: '#C62828',
    criteria: [
      'Requires significant guidance for lecture delivery',
      'Needs to strengthen content knowledge',
      'Would benefit from structured mentoring plan',
    ],
  },
];

const t = {
  body: 'var(--font-body)', heading: 'var(--font-heading)',
  ch: 'var(--color-charcoal)', wg: 'var(--color-warm-grey)', gd: 'var(--color-gold)',
  ease: 'var(--ease-lux)',
};

export default function Assessment() {
  const navigate = useNavigate();
  const [instructorName, setInstructorName] = useState('');
  const [email, setEmail] = useState('');
  const [facultyLeadName, setFacultyLeadName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!instructorName.trim() || !email.trim() || !facultyLeadName.trim() || !selectedLevel) {
      setError('Please fill in all required fields and select a readiness level.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: existing } = await supabase.from('onboarding_submissions').select('id').eq('email', email).maybeSingle();
      const data = {
        assessment_level: selectedLevel,
        assessment_data: { facultyLead: facultyLeadName, comments, assessedAt: new Date().toISOString() },
        overall_status: 'assessed',
      };
      let result;
      if (existing) result = await supabase.from('onboarding_submissions').update(data).eq('id', existing.id);
      else result = await supabase.from('onboarding_submissions').insert({ new_instructor_name: instructorName, email, ...data });
      if (result.error) {
        if (result.error.code === '42P01') setError('Database table not found. Please run the SQL schema first (see supabase_schema.sql).');
        else setError(`Submission error: ${result.error.message}`);
        setSubmitting(false); return;
      }
      setSubmitted(true);
    } catch (err) { setError(`Network error: ${err.message}`); setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className="lux-section" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lux-container" style={{ width: '100%', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h1 style={{ fontFamily: t.heading, fontSize: '2.5rem', fontWeight: 400, color: t.ch, marginBottom: '0.75rem' }}>Assessment Submitted</h1>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '0.5rem' }}>
            Assessment recorded for <strong>{instructorName}</strong>.
          </p>
          <p style={{ fontFamily: t.body, fontSize: '0.9rem', color: t.wg, marginBottom: '2rem' }}>
            Level: <strong style={{ color: levels.find(l => l.id === selectedLevel)?.color }}>{levels.find(l => l.id === selectedLevel)?.label}</strong>
          </p>
          <button onClick={() => navigate('/')} className="lux-btn lux-btn-primary">
            <span className="gold-overlay" />
            <span className="btn-content">Back to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back
        </button>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1.5rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', border: '1px solid var(--color-charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Award size={22} strokeWidth={1.5} style={{ color: t.ch }} />
            </div>
            <div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>
                Final Readiness <em style={{ fontStyle: 'italic', color: t.gd }}>Assessment</em>
              </h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                To be completed by the Faculty Lead after all 3 phases
              </p>
            </div>
          </div>
          <div className="lux-alert lux-alert-info" style={{ marginTop: '1rem' }}>
            <BarChart3 size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>This assessment evaluates the instructor's readiness to teach independently after completing the 30–60–90 day onboarding program.</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Section 1: Information */}
          <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.5rem 0', marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.25rem' }}>
              Assessment Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="assess-name">Instructor Name *</label>
                <input id="assess-name" className="lux-input" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} placeholder="e.g. Jane Smith" required />
              </div>
              <div className="lux-form-group">
                <label className="lux-label" htmlFor="assess-email">Instructor Email *</label>
                <input id="assess-email" type="email" className="lux-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. jane@newton.edu" required />
              </div>
            </div>
            <div className="lux-form-group">
              <label className="lux-label" htmlFor="assess-faculty">Faculty Lead (Assessor) *</label>
              <input id="assess-faculty" className="lux-input" value={facultyLeadName} onChange={(e) => setFacultyLeadName(e.target.value)} placeholder="e.g. Dr. John Doe" required />
            </div>
          </div>

          {/* Section 2: Readiness Level */}
          <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.5rem 0', marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '1.25rem' }}>
              Readiness Level *
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {levels.map((level) => {
                const isSelected = selectedLevel === level.id;
                return (
                  <label key={level.id} style={{
                    display: 'flex', gap: '1rem', padding: '1.25rem 1.5rem',
                    borderTop: isSelected ? `3px solid ${level.color}` : '1px solid rgba(26, 26, 26, 0.15)',
                    cursor: 'pointer', transition: 'border-color 500ms var(--ease-lux)',
                    background: isSelected ? 'rgba(249, 248, 246, 0.5)' : 'transparent',
                  }}>
                    <div style={{
                      width: '20px', height: '20px', flexShrink: 0, marginTop: '2px',
                      border: isSelected ? `6px solid ${level.color}` : '1px solid var(--color-warm-grey)',
                      transition: 'border 500ms var(--ease-lux)',
                    }} />
                    <input type="radio" name="readiness" value={level.id}
                      checked={isSelected} onChange={() => setSelectedLevel(level.id)}
                      style={{ display: 'none' }} />
                    <div>
                      <div style={{ fontFamily: t.body, fontSize: '0.9rem', fontWeight: 500, color: level.color, marginBottom: '4px' }}>{level.label}</div>
                      <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg, marginBottom: '8px', lineHeight: 1.5 }}>{level.description}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {level.criteria.map((c, i) => (
                          <span key={i} style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>— {c}</span>
                        ))}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 3: Comments */}
          <div style={{ borderTop: '1px solid var(--color-charcoal)', padding: '1.5rem 0', marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: t.body, fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.wg, marginBottom: '0.75rem' }}>
              Assessor Comments
            </h3>
            <div className="lux-form-group">
              <textarea className="lux-textarea" value={comments} onChange={(e) => setComments(e.target.value)}
                placeholder="Provide detailed feedback on the instructor's readiness, strengths, and areas for improvement..." rows={5} />
            </div>
          </div>

          {error && (
            <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
              <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '1rem', borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
            <button type="button" onClick={() => navigate('/')} className="lux-btn lux-btn-secondary">Cancel</button>
            <button type="submit" className="lux-btn lux-btn-primary" disabled={submitting}>
              <span className="gold-overlay" />
              <span className="btn-content">
                {submitting ? 'Saving…' : <><Send size={16} strokeWidth={1.5} /> Submit Assessment</>}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
