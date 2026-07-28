import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { validateTemplateStructure } from '../../api/templates';
import TemplateBuilder from './templates/TemplateBuilder';
import type { Campus } from '../../types/supabase';

export default function TemplateCreate() {
  const navigate = useNavigate();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampus, setSelectedCampus] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jsonInput, setJsonInput] = useState('{\n  "weeks": [],\n  "phases": [],\n  "gateArtifacts": {}\n}');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    loadCampuses();
  }, []);

  async function loadCampuses() {
    try {
      const { data, error: fetchErr } = await supabase
        .from('campuses')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (fetchErr) throw fetchErr;
      setCampuses(data as Campus[] || []);
      if (data && data.length > 0) setSelectedCampus(data[0].id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[TemplateCreate] Failed to load campuses:', msg);
    }
  }

  function handlePreview() {
    try {
      const parsed = JSON.parse(jsonInput);
      const errors = validateTemplateStructure(parsed);
      setValidationErrors(errors);
      if (errors.length === 0) {
        alert('✅ Structure is valid!');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setValidationErrors([`Invalid JSON: ${msg}`]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setValidationErrors([]);

    // Validate
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!selectedCampus) {
      setError('Please select a campus');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Invalid JSON structure: ${msg}`);
      return;
    }

    const errors = validateTemplateStructure(parsed);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setError('Structure validation failed. See warnings below.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: insertErr } = await supabase
        .from('onboarding_templates')
        .insert({
          campus_id: selectedCampus,
          name: name.trim(),
          description: description.trim() || null,
          structure: parsed,
          approval_chain: ['lead_instructor', 'academic_head'],
          is_active: true,
          is_default: false,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      navigate(`/super-admin/templates/${data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '3rem' }}>
        <button onClick={() => navigate('/super-admin/templates')} className="lux-btn lux-btn-sm" style={{ marginBottom: '1.5rem' }}>
          ← Back to Templates
        </button>

        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />

        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-charcoal)', marginBottom: '2rem' }}>
          Create New Template
        </h1>

        {error && (
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #EF9A9A', background: '#FFEBEE' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#C62828' }}>{error}</p>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #FFE082', background: '#FFF8E1' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: '#F57F17', marginBottom: '0.5rem' }}>
              ⚠ Validation Warnings
            </p>
            {validationErrors.map((v, i) => (
              <p key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: '#795548', margin: '2px 0' }}>{v}</p>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Name */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Default Onboarding"
              style={{
                width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                color: 'var(--color-charcoal)',
              }}
            />
          </div>

          {/* Campus */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>
              Campus
            </label>
            <select
              value={selectedCampus}
              onChange={e => setSelectedCampus(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                color: 'var(--color-charcoal)',
              }}
            >
              <option value="">Select a campus…</option>
              {campuses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this template"
              rows={2}
              style={{
                width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: '0.85rem',
                color: 'var(--color-charcoal)', resize: 'vertical',
              }}
            />
          </div>

          {/* Template Structure — Visual Builder */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-charcoal)', marginBottom: '0.5rem' }}>
              Structure
            </label>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)', marginBottom: '0.75rem' }}>
              Define weeks, phases, worksheets, and gate artifacts. Use the Visual Builder or switch to Advanced for raw JSON editing.
            </p>
            <TemplateBuilder
              jsonInput={jsonInput}
              onJsonChange={setJsonInput}
            />
            <button type="button" onClick={handlePreview}
              style={{
                marginTop: '0.75rem', padding: '6px 14px',
                border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-charcoal)',
              }}>
              Preview & Validate
            </button>
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(26,26,26,0.12)' }}>
            <button type="submit" disabled={isSubmitting} className="lux-btn lux-btn-primary" style={{ height: '44px', minWidth: '180px' }}>
              <span className="gold-overlay" />
              <span className="btn-content">{isSubmitting ? 'Creating…' : 'Create Template'}</span>
            </button>
            <button type="button" onClick={() => navigate('/super-admin/templates')}
              style={{
                padding: '0 20px', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--color-warm-grey)',
              }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
