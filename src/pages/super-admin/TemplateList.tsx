import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import type { OnboardingTemplate, Campus } from '../../types/supabase';

export default function TemplateList() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<(OnboardingTemplate & { campus_name?: string })[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all templates
      const { data: templatesData, error: templatesErr } = await supabase
        .from('onboarding_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (templatesErr) throw templatesErr;

      // Fetch all campuses — select all fields to match Campus type
      const { data: campusesData, error: campusesErr } = await supabase
        .from('campuses')
        .select('*')
        .order('name');

      if (campusesErr) throw campusesErr;

      const campusMap = new Map((campusesData || []).map(c => [c.id, c]));

      const enriched = (templatesData || []).map(t => ({
        ...t,
        campus_name: campusMap.get(t.campus_id)?.name || 'Unknown Campus',
      }));

      setTemplates(enriched as (OnboardingTemplate & { campus_name?: string })[]);
      setCampuses(campusesData as Campus[] || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[TemplateList] Failed to load:', msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleActive(template: OnboardingTemplate) {
    try {
      const { error } = await supabase
        .from('onboarding_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[TemplateList] Failed to toggle:', msg);
    }
  }

  async function handleDelete(templateId: string) {
    if (!confirm('Are you sure you want to delete this template? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('onboarding_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[TemplateList] Failed to delete:', msg);
    }
  }

  // Filter logic
  const filtered = templates.filter(t => {
    if (filterCampus !== 'all' && t.campus_id !== filterCampus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = t.name.toLowerCase().includes(q);
      const matchesCampus = (t.campus_name || '').toLowerCase().includes(q);
      if (!matchesName && !matchesCampus) return false;
    }
    return true;
  });

  if (error) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem', width: '60px' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, marginBottom: '1rem' }}>Error Loading Templates</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>{error}</p>
          <button onClick={loadData} className="lux-btn lux-btn-sm" style={{ marginTop: '1.5rem' }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '3rem' }}>
        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-charcoal)', margin: 0 }}>
              Onboarding Templates
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)', marginTop: '0.5rem' }}>
              Manage onboarding templates across all campuses
            </p>
          </div>
          <button onClick={() => navigate('/super-admin/templates/new')} className="lux-btn lux-btn-primary" style={{ height: '40px' }}>
            <span className="gold-overlay" />
            <span className="btn-content">+ New Template</span>
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1, minWidth: '200px', padding: '8px 12px',
              border: '1px solid rgba(26,26,26,0.2)', background: 'transparent',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem',
              color: 'var(--color-charcoal)',
            }}
          />
          <select
            value={filterCampus}
            onChange={e => setFilterCampus(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid rgba(26,26,26,0.2)',
              background: 'transparent', fontFamily: 'var(--font-body)',
              fontSize: '0.8rem', color: 'var(--color-charcoal)',
            }}
          >
            <option value="all">All Campuses</option>
            {campuses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Loading */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-warm-grey)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
            Loading templates…
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <div style={{ border: '1px solid rgba(26,26,26,0.12)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(26,26,26,0.12)', background: 'rgba(26,26,26,0.03)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 500, color: 'var(--color-charcoal)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 500, color: 'var(--color-charcoal)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Campus</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 500, color: 'var(--color-charcoal)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Active</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 500, color: 'var(--color-charcoal)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Default</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 500, color: 'var(--color-charcoal)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.65rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-warm-grey)', fontSize: '0.8rem' }}>
                      No templates found.
                    </td>
                  </tr>
                )}
                {filtered.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <Link to={`/super-admin/templates/${t.id}`}
                        style={{ color: 'var(--color-charcoal)', textDecoration: 'none', fontWeight: 500 }}>
                        {t.name}
                      </Link>
                      {t.description && (
                        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>{t.description}</p>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-warm-grey)' }}>{t.campus_name}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleToggleActive(t)}
                        style={{
                          padding: '2px 10px', fontSize: '0.6rem', fontWeight: 500,
                          border: '1px solid', cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          color: t.is_active ? '#2E7D32' : '#C62828',
                          borderColor: t.is_active ? '#A5D6A7' : '#EF9A9A',
                          background: t.is_active ? '#E8F5E9' : '#FFEBEE',
                        }}
                      >
                        {t.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {t.is_default && (
                        <span style={{ fontSize: '0.6rem', color: '#D4A853', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          Default
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => navigate(`/super-admin/templates/${t.id}`)}
                          className="lux-btn lux-btn-sm"
                          style={{ fontSize: '0.6rem', padding: '4px 10px', height: 'auto' }}>
                          View
                        </button>
                        <button onClick={() => handleDelete(t.id)}
                          style={{
                            padding: '4px 10px', fontSize: '0.6rem', fontWeight: 500,
                            border: '1px solid rgba(198,40,40,0.3)', cursor: 'pointer',
                            fontFamily: 'var(--font-body)', background: 'transparent',
                            color: '#C62828', letterSpacing: '0.1em', textTransform: 'uppercase',
                          }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
