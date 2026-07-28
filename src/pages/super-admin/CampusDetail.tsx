import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import {
  Building, Users, FileText, AlertCircle,
  ArrowLeft, ChevronRight, Loader2, Search, Trash2, X, Edit2,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import type { Campus, OnboardingTemplate } from '../../types/supabase';

// ─── Types ──────────────────────────────────────────────

interface CampusUser {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  department: string | null;
  created_at: string;
}

interface CampusStats {
  totalUsers: number;
  newJoiners: number;
  buddies: number;
  heads: number;
  leads: number;
  pendingApprovals: number;
  completedWorksheets: number;
}

const ROLE_LABELS: Record<string, string> = {
  new_joinee: 'New Joiner',
  lead_instructor: 'Buddy / Mentor',
  academic_head: 'Academic Head',
  onboarding_lead: 'Onboarding Lead',
  progression_head: 'Progression Head',
  ops_head: 'Ops Head',
  campus_head: 'Campus Head',
  campus_admin: 'Campus Admin',
};

const ROLE_COLORS: Record<string, string> = {
  new_joinee: '#006494',
  lead_instructor: '#2E7D32',
  academic_head: '#C62828',
  onboarding_lead: '#D4A853',
  progression_head: '#7B1FA2',
  ops_head: '#E65100',
  campus_head: '#37474F',
  campus_admin: '#1565C0',
};

// ─── Component ──────────────────────────────────────────

export default function CampusDetail() {
  const { campusId } = useParams<{ campusId: string }>();
  const navigate = useNavigate();

  const [campus, setCampus] = useState<Campus | null>(null);
  const [users, setUsers] = useState<CampusUser[]>([]);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch data ─────────────────────────────────────────
  useEffect(() => {
    if (!campusId) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch campus
        const { data: campusData, error: campusErr } = await supabase
          .from('campuses')
          .select('*')
          .eq('id', campusId)
          .single();

        if (campusErr) throw campusErr;
        if (!campusData) { setError('Campus not found'); return; }
        if (cancelled) return;
        setCampus(campusData as Campus);

        // Fetch users for this campus
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, role, department, created_at')
          .eq('campus_id', campusId)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        const usersList = (usersData || []) as CampusUser[];
        setUsers(usersList);

        // Fetch templates for this campus
        const { data: templatesData } = await supabase
          .from('onboarding_templates')
          .select('*')
          .eq('campus_id', campusId)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        setTemplates((templatesData || []) as OnboardingTemplate[]);

        // Fetch worksheet stats
        const { count: pendingCount } = await supabase
          .from('worksheet_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('campus_id', campusId)
          .eq('review_status', 'pending_review');

        const { count: completedCount } = await supabase
          .from('worksheet_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('campus_id', campusId)
          .eq('review_status', 'approved');

        if (cancelled) return;

        setStats({
          totalUsers: usersList.length,
          newJoiners: usersList.filter(u => u.role === 'new_joinee').length,
          buddies: usersList.filter(u => u.role === 'lead_instructor').length,
          heads: usersList.filter(u => u.role === 'academic_head' || u.role === 'progression_head' || u.role === 'ops_head' || u.role === 'campus_head').length,
          leads: usersList.filter(u => u.role === 'onboarding_lead').length,
          pendingApprovals: pendingCount ?? 0,
          completedWorksheets: completedCount ?? 0,
        });
      } catch (err) {
        if (!cancelled) setError((err as { message?: string }).message || 'Failed to load campus details');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [campusId]);

  // ── Toggle active ──────────────────────────────────────
  async function handleToggleActive() {
    if (!campus) return;
    try {
      const { error: toggleErr } = await supabase
        .from('campuses')
        .update({ is_active: !campus.is_active })
        .eq('id', campus.id);
      if (toggleErr) throw toggleErr;
      setCampus({ ...campus, is_active: !campus.is_active });
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to toggle campus status');
    }
  }

  // ── Delete campus ──────────────────────────────────────
  async function handleDelete() {
    if (!campus) return;
    setDeleteLoading(true);
    try {
      const { error: deleteErr } = await supabase
        .from('campuses')
        .delete()
        .eq('id', campus.id);
      if (deleteErr) throw deleteErr;
      navigate('/super-admin/campuses');
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to delete campus');
      setDeleteLoading(false);
    }
  }

  // ── Filter users ────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return !!(u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    return true;
  });

  // ── Loading ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center', paddingTop: '6rem' }}>
          <Loader2 size={28} strokeWidth={1.5} className="spin-icon" style={{ color: 'var(--color-warm-grey)' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)', marginTop: '1rem' }}>Loading campus details…</p>
        </div>
      </div>
    );
  }

  if (error && !campus) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
          <div className="lux-line" style={{ margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, marginBottom: '1rem' }}>Error</h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-warm-grey)' }}>{error}</p>
          <button onClick={() => navigate('/super-admin/campuses')} className="lux-btn lux-btn-sm" style={{ marginTop: '1.5rem' }}>
            <ArrowLeft size={14} strokeWidth={1.5} /> Back to Campuses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Back link */}
        <button onClick={() => navigate('/super-admin/campuses')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            color: 'var(--color-warm-grey)', padding: 0,
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            marginBottom: '1.5rem',
          }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Campuses
        </button>

        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />

        {/* Error alert */}
        {error && (
          <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
            <AlertCircle size={16} strokeWidth={1.5} /><span>{error}</span>
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Campus Info Card */}
        {campus && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{
                width: '48px', height: '48px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(212, 168, 83, 0.12)',
              }}>
                <Building size={22} strokeWidth={1.5} style={{ color: '#D4A853' }} />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 400, color: 'var(--color-charcoal)', margin: 0 }}>
                  {campus.name}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace' }}>{campus.slug}</span>
                  {campus.domain && <><span style={{ opacity: 0.3 }}>|</span><span>{campus.domain}</span></>}
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span>Created {new Date(campus.created_at).toLocaleDateString()}</span>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span style={{
                    padding: '2px 8px', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.05em',
                    color: campus.is_active ? '#2E7D32' : '#C62828',
                    border: `1px solid ${campus.is_active ? '#A5D6A7' : '#EF9A9A'}`,
                    background: campus.is_active ? '#E8F5E9' : '#FFEBEE',
                  }}>
                    {campus.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleToggleActive} className="lux-btn lux-btn-sm lux-btn-secondary"
                  style={{ fontSize: '0.6rem', height: 'auto' }}>
                  {campus.is_active ? <ToggleLeft size={12} strokeWidth={1.5} /> : <ToggleRight size={12} strokeWidth={1.5} />}
                  {campus.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => navigate(`/super-admin/campuses/edit/${campus.id}`)}
                  className="lux-btn lux-btn-sm" style={{ fontSize: '0.6rem', height: 'auto' }}>
                  <Edit2 size={12} strokeWidth={1.5} /> Edit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '1px', background: 'rgba(26, 26, 26, 0.1)',
            marginBottom: '2rem',
          }}>
            {[
              { label: 'Total Users', value: stats.totalUsers, color: '#006494' },
              { label: 'New Joiners', value: stats.newJoiners, color: '#2E7D32' },
              { label: 'Buddies', value: stats.buddies, color: '#7B1FA2' },
              { label: 'Heads & Leads', value: stats.heads + stats.leads, color: '#D4A853' },
              { label: 'Pending Approval', value: stats.pendingApprovals, color: '#C62828' },
              { label: 'Completed', value: stats.completedWorksheets, color: '#2E7D32' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--color-alabaster)', padding: '1.25rem', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 400, color: s.color, margin: '0 0 4px' }}>
                  {s.value}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-warm-grey)', margin: 0 }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Onboarding Templates Section */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 400, color: 'var(--color-charcoal)', margin: 0 }}>
              <FileText size={16} strokeWidth={1.5} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--color-warm-grey)' }} />
              Onboarding Templates ({templates.length})
            </h2>
            <button onClick={() => navigate(`/super-admin/templates/create?campus=${campus?.slug || ''}`)}
              className="lux-btn lux-btn-sm lux-btn-primary" style={{ fontSize: '0.6rem', height: 'auto' }}>
              <span className="gold-overlay" /><span className="btn-content">+ New Template</span>
            </button>
          </div>
          {templates.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed rgba(26,26,26,0.15)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
              <FileText size={24} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
              <p>No onboarding templates for this campus yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {templates.map(t => (
                <button key={t.id} onClick={() => navigate(`/super-admin/templates/${t.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                    border: '1px solid rgba(26,26,26,0.12)', background: 'transparent',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'border-color 200ms var(--ease-lux), background 200ms var(--ease-lux)',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#D4A853'; e.currentTarget.style.background = 'rgba(212,168,83,0.04)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.12)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <FileText size={16} strokeWidth={1.5} style={{ color: '#D4A853', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-charcoal)' }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: '0.65rem', color: 'var(--color-warm-grey)', marginTop: '2px' }}>{t.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {t.is_active && (
                      <span style={{ padding: '2px 6px', fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.05em', border: '1px solid #A5D6A7', color: '#2E7D32', background: '#E8F5E9' }}>Active</span>
                    )}
                    {t.is_default && (
                      <span style={{ padding: '2px 6px', fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.05em', border: '1px solid ' + '#D4A853' + '40', color: '#D4A853', background: 'rgba(212,168,83,0.08)' }}>Default</span>
                    )}
                  </div>
                  <ChevronRight size={14} strokeWidth={1.5} style={{ color: 'var(--color-warm-grey)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Users Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 400, marginBottom: '1rem', color: 'var(--color-charcoal)' }}>
            <Users size={16} strokeWidth={1.5} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--color-warm-grey)' }} />
            Users ({users.length})
          </h2>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={13} strokeWidth={1.5} style={{
                position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--color-warm-grey)', pointerEvents: 'none', zIndex: 1,
              }} />
              <input className="lux-input" placeholder="Search by name or email..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '30px', fontSize: '0.75rem' }} />
            </div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="lux-input" style={{ fontSize: '0.75rem', minWidth: '130px', cursor: 'pointer' }}>
              <option value="all">All Roles</option>
              <option value="new_joinee">New Joiners</option>
              <option value="lead_instructor">Buddies</option>
              <option value="academic_head">Academic Heads</option>
              <option value="onboarding_lead">Onboarding Leads</option>
              <option value="progression_head">Progression Heads</option>
              <option value="ops_head">Ops Heads</option>
            </select>
          </div>

          {filteredUsers.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed rgba(26,26,26,0.15)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
              <Users size={24} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
              <p>No users match the current filters.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(26,26,26,0.12)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Role</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Department</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} style={{
                      borderBottom: '1px solid rgba(26,26,26,0.06)',
                      transition: 'background 150ms var(--ease-lux)',
                    }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(26,26,26,0.02)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--color-charcoal)' }}>{u.full_name || 'Unknown'}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', fontSize: '0.6rem', fontWeight: 500,
                          color: ROLE_COLORS[u.role] || 'var(--color-warm-grey)',
                          border: `1px solid ${ROLE_COLORS[u.role] || 'transparent'}20`,
                          background: `${ROLE_COLORS[u.role] || 'rgba(0,0,0,0)'}08`,
                        }}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.7rem', color: 'var(--color-warm-grey)' }}>
                        {u.department || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.65rem', color: 'var(--color-warm-grey)' }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div style={{
          marginTop: '3rem', padding: '1.5rem',
          border: '1px solid rgba(198, 40, 40, 0.2)',
          background: 'rgba(198, 40, 40, 0.03)',
        }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 500, color: '#C62828', margin: '0 0 0.5rem' }}>
            ⚠ Danger Zone
          </h3>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-warm-grey)', marginBottom: '1rem', lineHeight: 1.5 }}>
            This will permanently delete the campus and all associated data. This action cannot be undone.
            All user profiles, worksheets, notifications, and templates linked to this campus will be affected.
          </p>
          {showDeleteConfirm ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleDelete} disabled={deleteLoading}
                style={{
                  padding: '8px 16px', border: '1px solid #C62828',
                  background: '#C62828', color: '#FFFFFF',
                  fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500,
                  cursor: deleteLoading ? 'default' : 'pointer', opacity: deleteLoading ? 0.6 : 1,
                }}>
                {deleteLoading ? 'Deleting…' : 'Yes, delete this campus'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading}
                style={{
                  padding: '8px 16px', border: '1px solid rgba(26,26,26,0.2)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500,
                  color: 'var(--color-charcoal)',
                }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '8px 16px', border: '1px solid rgba(198,40,40,0.3)',
                background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500,
                color: '#C62828',
              }}>
              <Trash2 size={12} strokeWidth={1.5} style={{ marginRight: '6px' }} />
              Delete Campus
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
