import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabase';
import {
  AlertCircle, Search, Download, ArrowLeft, ChevronLeft,
  ChevronRight, Loader2, X, Clock, Filter,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

interface AuditEntry {
  id: string;
  campus_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface CampusInfo {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

// ─── Helpers ────────────────────────────────────────────

function formatAction(action: string): string {
  return action
    .replace(/\./g, ' — ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function actionColor(action: string): { bg: string; color: string; border: string } {
  if (action.includes('created') || action.includes('approved')) return { bg: '#E8F5E9', color: '#2E7D32', border: '#A5D6A7' };
  if (action.includes('deleted') || action.includes('removed')) return { bg: '#FFEBEE', color: '#C62828', border: '#EF9A9A' };
  if (action.includes('update') || action.includes('changed')) return { bg: '#FFF8E1', color: '#F57F17', border: '#FFE082' };
  if (action.includes('assigned') || action.includes('promoted')) return { bg: '#E8F5E9', color: '#2E7D32', border: '#A5D6A7' };
  return { bg: '#F5F5F5', color: '#616161', border: '#E0E0E0' };
}

// ─── Component ──────────────────────────────────────────

export default function AuditLogView() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [campuses, setCampuses] = useState<CampusInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchCampuses();
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, campusFilter, actionFilter, searchQuery]);

  async function fetchCampuses() {
    try {
      const { data } = await supabase
        .from('campuses')
        .select('id, name')
        .order('name');
      setCampuses((data || []) as CampusInfo[]);
    } catch { /* non-critical */ }
  }

  async function fetchEntries() {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // Apply filters
      if (campusFilter !== 'all') {
        query = query.eq('campus_id', campusFilter);
      }
      if (actionFilter !== 'all') {
        query = query.ilike('action', `%${actionFilter}%`);
      }
      if (searchQuery.trim()) {
        query = query.or(
          `action.ilike.%${searchQuery.trim()}%,resource_type.ilike.%${searchQuery.trim()}%,resource_id.ilike.%${searchQuery.trim()}%`
        );
      }

      const { data, error: fetchErr, count } = await query;

      if (fetchErr) throw fetchErr;
      setEntries((data || []) as AuditEntry[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Extract unique action types for filter ────────────
  const actionTypes = [...new Set(entries.map(e => e.action.split('.')[0] || e.action))].sort();

  // ── CSV export ─────────────────────────────────────────
  function exportCSV() {
    const headers = ['Timestamp', 'Action', 'Resource Type', 'Resource ID', 'Campus ID', 'User ID', 'Details'];
    const rows = entries.map(e => [
      new Date(e.created_at).toISOString(),
      e.action,
      e.resource_type || '',
      e.resource_id || '',
      e.campus_id || '',
      e.user_id || '',
      JSON.stringify(e.details || {}),
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Calculate time ago ────────────────────────────────
  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Back link */}
        <button onClick={() => navigate('/super-admin')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.7rem',
            color: 'var(--color-warm-grey)', padding: 0,
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            marginBottom: '1.5rem',
          }}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Back to Dashboard
        </button>

        <div className="lux-line" style={{ marginBottom: '1.5rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--color-charcoal)', margin: '0 0 0.25rem' }}>
              <Clock size={24} strokeWidth={1.5} style={{ marginRight: '10px', verticalAlign: 'middle', color: 'var(--color-warm-grey)' }} />
              Audit Log
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)', margin: 0 }}>
              Track all platform changes and user actions. {totalCount} total events.
            </p>
          </div>
          <button onClick={exportCSV} disabled={entries.length === 0}
            className="lux-btn lux-btn-sm" style={{ fontSize: '0.6rem', height: 'auto' }}>
            <Download size={12} strokeWidth={1.5} /> Export CSV
          </button>
        </div>

        {error && (
          <div className="lux-alert lux-alert-error" style={{ marginBottom: '1.5rem' }}>
            <AlertCircle size={16} strokeWidth={1.5} /><span>{error}</span>
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={13} strokeWidth={1.5} style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-warm-grey)', pointerEvents: 'none', zIndex: 1,
            }} />
            <input className="lux-input" placeholder="Search actions, resources..."
              value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
              style={{ paddingLeft: '30px', fontSize: '0.75rem' }} />
          </div>

          {/* Campus filter */}
          <div style={{ position: 'relative', minWidth: '160px' }}>
            <Filter size={12} strokeWidth={1.5} style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-warm-grey)', pointerEvents: 'none', zIndex: 1,
            }} />
            <select value={campusFilter} onChange={e => { setCampusFilter(e.target.value); setPage(0); }}
              className="lux-input" style={{ paddingLeft: '28px', fontSize: '0.75rem', cursor: 'pointer' }}>
              <option value="all">All Campuses</option>
              {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Action type filter */}
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}
            className="lux-input" style={{ fontSize: '0.75rem', minWidth: '140px', cursor: 'pointer' }}>
            <option value="all">All Actions</option>
            {actionTypes.map(a => <option key={a} value={a}>{formatAction(a)}</option>)}
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Loader2 size={24} strokeWidth={1.5} className="spin-icon" style={{ color: 'var(--color-warm-grey)' }} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed rgba(26,26,26,0.15)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>
            <Clock size={24} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p>No audit log entries match the current filters.</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: '0.7rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(26,26,26,0.12)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Time</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Action</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Resource</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Details</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--color-warm-grey)', fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>User ID</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    const colors = actionColor(entry.action);
                    const detailStr = entry.details
                      ? Object.entries(entry.details).map(([k, v]) => {
                        if (v && typeof v === 'object') return `${k}: ${JSON.stringify(v).slice(0, 60)}`;
                        return `${k}: ${String(v)}`;
                      }).join('; ').slice(0, 100)
                      : '';

                    return (
                      <tr key={entry.id} style={{
                        borderBottom: '1px solid rgba(26,26,26,0.06)',
                        transition: 'background 150ms var(--ease-lux)',
                      }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(26,26,26,0.02)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 500, color: 'var(--color-charcoal)', fontSize: '0.7rem' }}>
                            {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--color-warm-grey)' }}>
                            {timeAgo(entry.created_at)}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 6px',
                            fontSize: '0.6rem', fontWeight: 500,
                            color: colors.color, background: colors.bg,
                            border: `1px solid ${colors.border}`,
                          }}>
                            {formatAction(entry.action)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ color: 'var(--color-charcoal)', fontSize: '0.65rem' }}>
                            {entry.resource_type || '—'}
                          </div>
                          {entry.resource_id && (
                            <div style={{ fontSize: '0.55rem', color: 'var(--color-warm-grey)', fontFamily: 'monospace', marginTop: '1px' }}>
                              {entry.resource_id.slice(0, 16)}…
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '0.6rem', color: 'var(--color-warm-grey)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {detailStr || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.55rem', color: 'var(--color-warm-grey)', fontFamily: 'monospace' }}>
                          {entry.user_id ? entry.user_id.slice(0, 12) + '…' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: '12px', marginTop: '1.5rem', fontFamily: 'var(--font-body)', fontSize: '0.75rem',
            }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{
                  padding: '6px 12px', border: '1px solid rgba(26,26,26,0.15)',
                  background: page === 0 ? 'rgba(26,26,26,0.03)' : 'transparent',
                  cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1,
                  fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-charcoal)',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                }}>
                <ChevronLeft size={12} strokeWidth={1.5} /> Previous
              </button>
              <span style={{ color: 'var(--color-warm-grey)', fontSize: '0.7rem' }}>
                Page {page + 1} of {Math.max(1, totalPages)} ({totalCount} total)
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{
                  padding: '6px 12px', border: '1px solid rgba(26,26,26,0.15)',
                  background: page >= totalPages - 1 ? 'rgba(26,26,26,0.03)' : 'transparent',
                  cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1,
                  fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-charcoal)',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                }}>
                Next <ChevronRight size={12} strokeWidth={1.5} />
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-icon { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
