import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import type { Campus, OnboardingTemplate } from '../../types/supabase';
import { Plus, Building, Check, X, Edit2, Trash2, AlertCircle, Search, Loader2, FileText } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface CampusForm {
  name: string;
  slug: string;
  domain: string;
}

// ─── Helpers ────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Component ──────────────────────────────────────────

export default function CampusManagement() {
  const navigate = useNavigate();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [templateCounts, setTemplateCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState<CampusForm>({ name: '', slug: '', domain: '' });

  // ── Fetch campuses ───────────────────────────────────────
  async function fetchCampuses() {
    setIsLoading(true);
    setError(null);
    try {
      const [campusResult, templateResult] = await Promise.all([
        supabase.from('campuses').select('*').order('name'),
        supabase.from('onboarding_templates').select('id, campus_id'),
      ]);

      if (campusResult.error) throw campusResult.error;

      // Build template count per campus
      const counts: Record<string, number> = {};
      if (templateResult.data) {
        for (const t of templateResult.data as Pick<OnboardingTemplate, 'id' | 'campus_id'>[]) {
          counts[t.campus_id] = (counts[t.campus_id] || 0) + 1;
        }
      }
      setTemplateCounts(counts);
      setCampuses((campusResult.data as Campus[]) || []);
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to load campuses');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchCampuses(); }, []);

  // ── Create campus ────────────────────────────────────────
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: createError } = await supabase
        .from('campuses')
        .insert({
          name: form.name.trim(),
          slug: form.slug.trim().toLowerCase(),
          domain: form.domain.trim() || null,
          is_active: true,
          branding: {},
        });

      if (createError) throw createError;

      setSuccessMsg(`Campus "${form.name}" created successfully!`);
      setForm({ name: '', slug: '', domain: '' });
      setShowCreateForm(false);
      await fetchCampuses();

      // Clear success after 3s
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to create campus');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Update campus ────────────────────────────────────────
  async function handleUpdate(id: string) {
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('campuses')
        .update({
          name: form.name.trim(),
          slug: form.slug.trim().toLowerCase(),
          domain: form.domain.trim() || null,
        })
        .eq('id', id);

      if (updateError) throw updateError;

      setSuccessMsg('Campus updated successfully!');
      setEditingId(null);
      setForm({ name: '', slug: '', domain: '' });
      await fetchCampuses();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to update campus');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Toggle active ────────────────────────────────────────
  async function handleToggleActive(campus: Campus) {
    try {
      const { error: toggleError } = await supabase
        .from('campuses')
        .update({ is_active: !campus.is_active })
        .eq('id', campus.id);

      if (toggleError) throw toggleError;
      await fetchCampuses();
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to toggle campus status');
    }
  }

  // ── Delete campus ────────────────────────────────────────
  async function handleDelete(id: string) {
    setSubmitting(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('campuses')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setSuccessMsg('Campus deleted successfully!');
      setDeletingId(null);
      await fetchCampuses();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to delete campus');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Start editing ────────────────────────────────────────
  function startEdit(campus: Campus) {
    setEditingId(campus.id);
    setForm({
      name: campus.name,
      slug: campus.slug,
      domain: campus.domain || '',
    });
    setShowCreateForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ name: '', slug: '', domain: '' });
  }

  // ── Filter campuses ──────────────────────────────────────
  const filteredCampuses = campuses.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div className="lux-line" style={{ marginBottom: '1.5rem' }} />
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '2.5rem',
            fontWeight: 400,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}>
            Campus Management
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>
            Create and manage colleges / campuses on the platform.
          </p>
        </div>

        {/* Notifications */}
        {error && (
          <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
            <AlertCircle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="lux-alert" style={{
            marginBottom: '1.5rem',
            background: 'rgba(76, 175, 80, 0.08)',
            border: '1px solid rgba(76, 175, 80, 0.3)',
            color: '#2E7D32',
          }}>
            <Check size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          marginBottom: '2rem', flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={14} strokeWidth={1.5} style={{
              position: 'absolute', left: '12px', top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-warm-grey)',
              pointerEvents: 'none',
            }} />
            <input
              className="lux-input"
              placeholder="Search campuses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px', fontSize: '0.8rem' }}
            />
          </div>
          <button
            onClick={() => { setShowCreateForm(!showCreateForm); setEditingId(null); setForm({ name: '', slug: '', domain: '' }); }}
            className="lux-btn lux-btn-primary"
            style={{ whiteSpace: 'nowrap' }}
          >
            <Plus size={14} strokeWidth={1.5} />
            <span className="btn-content">New Campus</span>
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid rgba(26, 26, 26, 0.12)',
            background: 'rgba(26, 26, 26, 0.02)',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-heading)', fontSize: '1.1rem',
              fontWeight: 400, marginBottom: '1.25rem',
            }}>
              Create New Campus
            </h3>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="lux-form-group">
                  <label className="lux-label">Campus Name</label>
                  <input className="lux-input" value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                    placeholder="e.g. Newton School of Technology" required />
                </div>
                <div className="lux-form-group">
                  <label className="lux-label">Slug</label>
                  <input className="lux-input" value={form.slug}
                    onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="e.g. newton-school" required
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
                </div>
              </div>
              <div className="lux-form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="lux-label">Domain (optional)</label>
                <input className="lux-input" value={form.domain}
                  onChange={(e) => setForm(f => ({ ...f, domain: e.target.value }))}
                  placeholder="e.g. newtonschool.co" />
                <p style={{ fontSize: '0.65rem', color: 'var(--color-warm-grey)', marginTop: '4px' }}>
                  Users with email addresses matching this domain will auto-select this campus.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={submitting} className="lux-btn lux-btn-primary">
                  {submitting ? <Loader2 size={14} strokeWidth={1.5} className="spin-icon" /> : <Plus size={14} strokeWidth={1.5} />}
                  <span className="btn-content">{submitting ? 'Creating…' : 'Create Campus'}</span>
                </button>
                <button type="button" onClick={() => setShowCreateForm(false)}
                  className="lux-btn lux-btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Campus List */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--color-warm-grey)' }}>
            <Loader2 size={24} strokeWidth={1.5} className="spin-icon" style={{ marginBottom: '1rem' }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>Loading campuses…</p>
          </div>
        ) : filteredCampuses.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '4rem 0',
            border: '1px dashed rgba(26, 26, 26, 0.2)',
            borderRadius: '8px',
          }}>
            <Building size={32} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)', marginBottom: '1rem' }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-warm-grey)' }}>
              {searchQuery ? 'No campuses match your search.' : 'No campuses yet. Create your first one!'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCampuses.map((campus) => (
              <div key={campus.id} style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '16px 20px',
                border: `1px solid ${campus.is_active ? 'rgba(26, 26, 26, 0.12)' : 'rgba(26, 26, 26, 0.06)'}`,
                background: campus.is_active ? 'transparent' : 'rgba(26, 26, 26, 0.02)',
                opacity: campus.is_active ? 1 : 0.6,
                transition: 'opacity 200ms var(--ease-lux), border-color 200ms var(--ease-lux)',
              }}>
                {/* Edit form */}
                {editingId === campus.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <input className="lux-input" value={form.name}
                        onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Campus name" style={{ fontSize: '0.8rem' }} />
                      <input className="lux-input" value={form.slug}
                        onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                        placeholder="slug" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }} />
                    </div>
                    <input className="lux-input" value={form.domain}
                      onChange={(e) => setForm(f => ({ ...f, domain: e.target.value }))}
                      placeholder="Domain (optional)" style={{ fontSize: '0.8rem' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleUpdate(campus.id)} disabled={submitting}
                        className="lux-btn lux-btn-sm" style={{ background: 'var(--color-charcoal)', color: '#FFFFFF' }}>
                        {submitting ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} disabled={submitting}
                        className="lux-btn lux-btn-sm lux-btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Status indicator */}
                    <div style={{ flexShrink: 0 }}>
                      <div style={{
                        width: '8px', height: '8px',
                        borderRadius: '50%',
                        background: campus.is_active ? '#4CAF50' : '#BDBDBD',
                      }} />
                    </div>

                    {/* Campus info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: '1rem',
                        fontWeight: 500,
                        color: 'var(--color-charcoal)',
                        marginBottom: '2px',
                      }}>
                        {campus.name}
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        color: 'var(--color-warm-grey)',
                        flexWrap: 'wrap',
                      }}>
                        <span style={{ fontFamily: 'monospace' }}>{campus.slug}</span>
                        {campus.domain && (
                          <>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>{campus.domain}</span>
                          </>
                        )}
                        <span style={{ opacity: 0.3 }}>|</span>
                        <span>Created {new Date(campus.created_at).toLocaleDateString()}</span>
                        <span style={{ opacity: 0.3 }}>|</span>
                        <button onClick={() => navigate(`/super-admin/templates?campus=${campus.slug}`)}
                          title="View templates for this campus"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-body)', fontSize: '0.65rem',
                            color: 'var(--color-charcoal)', padding: '2px 6px',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            textDecoration: 'underline', textUnderlineOffset: '2px',
                            textDecorationColor: 'rgba(26,26,26,0.2)',
                          }}>
                          <FileText size={11} strokeWidth={1.5} />
                          {(templateCounts[campus.id] || 0)} templates
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => startEdit(campus)}
                        className="icon-btn-lux"
                        title="Edit campus"
                        style={{
                          padding: '6px', border: '1px solid rgba(26,26,26,0.15)',
                          background: 'transparent', cursor: 'pointer',
                          color: 'var(--color-warm-grey)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'color 200ms var(--ease-lux), border-color 200ms var(--ease-lux)',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-charcoal)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.3)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-warm-grey)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
                      >
                        <Edit2 size={14} strokeWidth={1.5} />
                      </button>
                      <button onClick={() => handleToggleActive(campus)}
                        className="icon-btn-lux"
                        title={campus.is_active ? 'Deactivate campus' : 'Activate campus'}
                        style={{
                          padding: '6px', border: '1px solid rgba(26,26,26,0.15)',
                          background: 'transparent', cursor: 'pointer',
                          color: campus.is_active ? '#4CAF50' : 'var(--color-warm-grey)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'color 200ms var(--ease-lux), border-color 200ms var(--ease-lux)',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.3)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
                      >
                        {campus.is_active ? <Check size={14} strokeWidth={1.5} /> : <X size={14} strokeWidth={1.5} />}
                      </button>
                      {deletingId === campus.id ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => handleDelete(campus.id)} disabled={submitting}
                            style={{
                              padding: '6px 10px', border: '1px solid var(--color-error)',
                              background: 'var(--color-error)', color: '#FFFFFF',
                              fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500,
                              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
                            }}>
                            {submitting ? '…' : 'Confirm'}
                          </button>
                          <button onClick={() => setDeletingId(null)} disabled={submitting}
                            style={{
                              padding: '6px 10px', border: '1px solid rgba(26,26,26,0.15)',
                              background: 'transparent', cursor: 'pointer',
                              fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500,
                              color: 'var(--color-warm-grey)',
                            }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setDeletingId(campus.id); setEditingId(null); }}
                          className="icon-btn-lux"
                          title="Delete campus"
                          style={{
                            padding: '6px', border: '1px solid rgba(26,26,26,0.15)',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--color-warm-grey)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'color 200ms var(--ease-lux), border-color 200ms var(--ease-lux)',
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.borderColor = 'var(--color-error)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--color-warm-grey)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; }}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {!isLoading && campuses.length > 0 && (
          <p style={{
            textAlign: 'center', marginTop: '2rem',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            color: 'var(--color-warm-grey)',
          }}>
            {campuses.filter(c => c.is_active).length} active / {campuses.length} total campuses
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
