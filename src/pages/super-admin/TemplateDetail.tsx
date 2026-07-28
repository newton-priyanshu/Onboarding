import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import { validateTemplateStructure, parseTemplateStructure } from '../../api/templates';
import type { OnboardingTemplate } from '../../types/supabase';
import type { ParsedTemplateStructure } from '../../api/templates';

export default function TemplateDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<OnboardingTemplate | null>(null);
  const [parsed, setParsed] = useState<ParsedTemplateStructure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    if (templateId) loadTemplate(templateId);
  }, [templateId]);

  async function loadTemplate(id: string) {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('onboarding_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;
      if (!data) throw new Error('Template not found');

      const t = data as OnboardingTemplate;
      setTemplate(t);

      const parsed = parseTemplateStructure(t.structure);
      setParsed(parsed);

      const errors = validateTemplateStructure(t.structure);
      setValidationErrors(errors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>Loading template…</span>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, marginBottom: '1rem' }}>Error</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>{error || 'Template not found'}</p>
          <button onClick={() => navigate('/super-admin/templates')} className="lux-btn lux-btn-sm" style={{ marginTop: '1.5rem' }}>
            ← Back to Templates
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '3rem' }}>
        <button onClick={() => navigate('/super-admin/templates')} className="lux-btn lux-btn-sm" style={{ marginBottom: '1.5rem' }}>
          ← Back to Templates
        </button>

        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-charcoal)', margin: 0 }}>
            {template.name}
          </h1>
          {template.description && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-warm-grey)', marginTop: '0.5rem' }}>
              {template.description}
            </p>
          )}
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <span style={{ padding: '3px 10px', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
            border: '1px solid', fontFamily: 'var(--font-body)',
            color: template.is_active ? '#2E7D32' : '#C62828',
            borderColor: template.is_active ? '#A5D6A7' : '#EF9A9A',
            background: template.is_active ? '#E8F5E9' : '#FFEBEE',
          }}>
            {template.is_active ? 'Active' : 'Inactive'}
          </span>
          {template.is_default && (
            <span style={{ padding: '3px 10px', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
              border: '1px solid rgba(212,168,83,0.3)', fontFamily: 'var(--font-body)',
              color: '#D4A853', background: 'rgba(212,168,83,0.08)',
            }}>
              Default
            </span>
          )}
          <span style={{ padding: '3px 10px', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.05em',
            border: '1px solid rgba(26,26,26,0.2)', fontFamily: 'var(--font-body)',
            color: 'var(--color-warm-grey)',
          }}>
            ID: {template.id.slice(0, 8)}…
          </span>
        </div>

        {/* Validation warnings */}
        {validationErrors.length > 0 && (
          <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #FFE082', background: '#FFF8E1' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, color: '#F57F17', marginBottom: '0.5rem' }}>
              ⚠ Structure Validation Warnings
            </p>
            {validationErrors.map((err, i) => (
              <p key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: '#795548', margin: '2px 0' }}>{err}</p>
            ))}
          </div>
        )}

        {/* Structure overview */}
        {parsed && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 400, color: 'var(--color-charcoal)', marginBottom: '1rem' }}>
              Structure Overview
            </h2>

            {/* Weeks */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', marginBottom: '0.75rem' }}>
                Weeks ({parsed.weeks.length})
              </h3>
              {parsed.weeks.map(w => (
                <div key={w.num} style={{
                  marginBottom: '0.75rem', padding: '1rem',
                  border: '1px solid rgba(26,26,26,0.12)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-charcoal)' }}>
                      Week {w.num}: {w.title}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-warm-grey)', fontFamily: 'var(--font-body)' }}>
                      {w.days} · {w.worksheets.length} worksheets
                    </span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-warm-grey)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                    {w.theme}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {w.worksheets.map(ws => (
                      <span key={ws.id} style={{
                        padding: '2px 6px', fontSize: '0.6rem',
                        fontFamily: 'var(--font-body)',
                        border: '1px solid rgba(26,26,26,0.12)',
                        color: 'var(--color-charcoal)',
                      }}>
                        {ws.id}{ws.isGate ? ' 🚪' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Phases */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', marginBottom: '0.75rem' }}>
                Phases ({parsed.phases.length})
              </h3>
              {parsed.phases.map(p => (
                <div key={p.num} style={{ marginBottom: '0.5rem', padding: '0.75rem 1rem', border: '1px solid rgba(26,26,26,0.06)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-charcoal)' }}>
                    Phase {p.num}: {p.title}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)', marginLeft: '0.75rem' }}>
                    {p.days} · {p.worksheets.length} worksheets
                  </span>
                </div>
              ))}
            </div>

            {/* Gate artifacts */}
            {parsed.gateArtifacts && Object.keys(parsed.gateArtifacts).length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', marginBottom: '0.75rem' }}>
                  Gate Artifacts ({Object.keys(parsed.gateArtifacts).length} gates)
                </h3>
                {Object.entries(parsed.gateArtifacts).map(([gateId, artifacts]) => (
                  <div key={gateId} style={{ marginBottom: '0.5rem', padding: '0.75rem 1rem', border: '1px solid rgba(26,26,26,0.06)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-charcoal)' }}>
                      {gateId}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-warm-grey)', marginLeft: '0.75rem' }}>
                      {artifacts.length} artifacts ({artifacts.filter(a => a.required).length} required)
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Approval chain */}
            <div>
              <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', marginBottom: '0.5rem' }}>
                Approval Chain
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {(Array.isArray(template.approval_chain) ? template.approval_chain : ['lead_instructor', 'academic_head']).map((role, i, arr) => (
                  <span key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      padding: '3px 10px', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.05em',
                      fontFamily: 'var(--font-body)',
                      border: '1px solid rgba(212,168,83,0.3)',
                      color: '#D4A853', background: 'rgba(212,168,83,0.08)',
                    }}>
                      {role}
                    </span>
                    {i < arr.length - 1 && <span style={{ color: 'var(--color-warm-grey)', fontSize: '0.7rem' }}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Raw JSON toggle */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(26,26,26,0.12)', paddingTop: '1.5rem' }}>
          <button onClick={() => setShowRawJson(!showRawJson)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: '0.7rem',
              fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-warm-grey)', padding: 0,
            }}>
            {showRawJson ? '− Hide Raw JSON' : '+ Show Raw JSON'}
          </button>
          {showRawJson && (
            <pre style={{
              marginTop: '1rem', padding: '1rem', overflow: 'auto',
              fontFamily: 'monospace', fontSize: '0.65rem', lineHeight: 1.5,
              background: 'rgba(26,26,26,0.03)', border: '1px solid rgba(26,26,26,0.12)',
              maxHeight: '500px',
            }}>
              {JSON.stringify(template.structure, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
