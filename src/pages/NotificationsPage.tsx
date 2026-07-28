import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Bell, CheckCheck, CheckCircle2, XCircle, RefreshCw, Clock,
  AlertTriangle, FileText, Shield, Star, ArrowUp, Award,
  Search, Filter, ChevronLeft, ChevronRight,
  ArrowLeft, Loader2, Inbox,
} from 'lucide-react';
import { t } from '../config/theme';

// ─── Types ──────────────────────────────────────────────

interface NotificationItem {
  id: string;
  user_id: string;
  from_user_id: string | null;
  worksheet_id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  revision_submitted: 'Re-submitted',
  approved: 'Approved',
  buddy_approved: 'Buddy Approved',
  needs_revision: 'Needs Revision',
  phase_approved: 'Phase Approved',
  promoted: 'Promoted',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  assignment: 'Assignment',
};

const NOTIFICATION_TYPE_COLORS: Record<string, string> = {
  submitted: t.info,
  revision_submitted: t.pending,
  approved: t.success,
  buddy_approved: t.purple,
  needs_revision: t.error,
  phase_approved: t.success,
  promoted: '#D4A853',
  due_soon: t.warning,
  overdue: t.error,
  assignment: t.info,
};

const NOTIFICATION_TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  submitted: FileText,
  revision_submitted: RefreshCw,
  approved: CheckCircle2,
  buddy_approved: Shield,
  needs_revision: XCircle,
  phase_approved: Award,
  promoted: Star,
  due_soon: Clock,
  overdue: AlertTriangle,
  assignment: ArrowUp,
};

const ITEMS_PER_PAGE = 25;
const ALL_TYPES = ['all', ...Object.keys(NOTIFICATION_TYPE_LABELS)];

// ─── Navigation Helper (shared with NotificationBell) ───
// Determines the correct route when a notification is clicked.
// Must be kept in sync with NotificationBell's getNotificationRoute.
function getNotificationRoute(
  n: { worksheet_id: string; from_user_id?: string | null; user_id?: string; type?: string },
  profileRole?: string | null
): string {
  const isReviewer = ['lead_instructor', 'academic_head', 'progression_head', 'ops_head', 'campus_head', 'campus_admin', 'onboarding_lead'].includes(profileRole ?? '');
  if (isReviewer && n.worksheet_id) {
    const reviewPath = profileRole === 'onboarding_lead' ? 'onboarding-lead'
      : profileRole === 'lead_instructor' ? 'buddy'
      : 'admin';
    const targetUserId = n.from_user_id || n.user_id;
    return `/${reviewPath}/review/${targetUserId}/${n.worksheet_id}`;
  }
  // Joinee worksheet route map
  const WORKSHEET_ROUTES: Record<string, string> = {
    p1_w1: '/phase-1', p1_w2: '/phase-1', p1_w3: '/week-1/worksheet/p1_w3',
    p1_w4: '/phase-1', p1_w5: '/week-1/worksheet/p1_w5',
    p1_w6: '/week-1/worksheet/p1_w6', p1_w7: '/phase-1', p1_w8: '/phase-1',
    gc1: '/phase-1', gc2: '/phase-2', gc3: '/phase-3',
    p2_w1: '/phase-2', p2_w2: '/phase-2', p2_w3: '/phase-2', p2_w4: '/phase-2',
    p3_w1: '/phase-3', p3_w2: '/phase-3', p3_w3: '/phase-3',
    p3_w4: '/phase-3', p3_w5: '/phase-3',
    w1_g1: '/week-1/worksheet/w1_g1', w2_g1: '/week-2/worksheet/w2_g1',
    w3_g1: '/week-3/worksheet/w3_g1', w4_g1: '/week-4/worksheet/w4_g1',
    w1_o1: '/week-1/worksheet/w1_o1', w1_e1: '/week-1/worksheet/w1_e1',
    w1_o2: '/week-1/worksheet/w1_o2',
    w2_e1: '/week-2/worksheet/w2_e1', w2_c3: '/week-2/worksheet/w2_c3',
    w2_d2: '/week-2/worksheet/w2_d2', w2_b1: '/week-2/worksheet/w2_b1',
    w2_o1: '/week-2/worksheet/w2_o1',
    w3_d1: '/week-3/worksheet/w3_d1', w3_d2: '/week-3/worksheet/w3_d2',
    w3_e1: '/week-3/worksheet/w3_e1', w3_b1: '/week-3/worksheet/w3_b1',
    w4_d2: '/week-4/worksheet/w4_d2', w4_e1: '/week-4/worksheet/w4_e1',
    w4_o1: '/week-4/worksheet/w4_o1', w4_b1: '/week-4/worksheet/w4_b1',
    pr_p1_w1: '/progression/phase-1', pr_p1_w2: '/progression/phase-1',
    pr_p1_w3: '/progression/phase-1', pr_p1_w4: '/progression/phase-1',
    pr_p1_w5: '/progression/phase-1', pr_p1_w6: '/progression/phase-1',
    pr_gc1: '/progression/phase-1', pr_gc2: '/progression/phase-2',
    pr_gc3: '/progression/phase-3',
    pr_p2_w1: '/progression/phase-2', pr_p2_w2: '/progression/phase-2',
    pr_p2_w3: '/progression/phase-2',
    pr_p3_w1: '/progression/phase-3', pr_p3_w2: '/progression/phase-3',
    pr_p3_w3: '/progression/phase-3', pr_p3_w4: '/progression/phase-3',
    op_p1_w1: '/operations/phase-1', op_p1_w2: '/operations/phase-1',
    op_p1_w3: '/operations/phase-1', op_p1_w4: '/operations/phase-1',
    op_p1_w5: '/operations/phase-1', op_p1_w6: '/operations/phase-1',
    op_gc1: '/operations/phase-1', op_gc2: '/operations/phase-2',
    op_gc3: '/operations/phase-3',
    op_p2_w1: '/operations/phase-2', op_p2_w2: '/operations/phase-2',
    op_p2_w3: '/operations/phase-2',
    op_p3_w1: '/operations/phase-3', op_p3_w2: '/operations/phase-3',
    op_p3_w3: '/operations/phase-3', op_p3_w4: '/operations/phase-3',
  };
  if (n.worksheet_id && WORKSHEET_ROUTES[n.worksheet_id]) {
    return WORKSHEET_ROUTES[n.worksheet_id]!;
  }
  if (n.type === 'promoted' || n.type === 'phase_approved') {
    return '/';
  }
  return '/';
}

// ─── Component ──────────────────────────────────────────

export default function NotificationsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const userId = (user as { id?: string } | null)?.id;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('id, user_id, from_user_id, worksheet_id, type, message, read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);

      const { data, error } = await query;
      if (error) throw error;
      setNotifications((data || []) as NotificationItem[]);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Filtering ────────────────────────────────────────────
  const filtered = notifications.filter(n => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    if (readFilter === 'unread' && n.read) return false;
    if (readFilter === 'read' && !n.read) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return n.message.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // ── Bulk Actions ─────────────────────────────────────────
  const handleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map(n => n.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedIds.size === 0) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', Array.from(selectedIds));
    if (!error) {
      setNotifications(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, read: true } : n));
      setSelectedIds(new Set());
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unreadIds);
    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setSelectedIds(new Set());
    }
  };

  const timeAgo = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!userId) {
    return (
      <div className="lux-section" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="lux-container" style={{ maxWidth: '500px' }}>
          <Bell size={32} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>Please sign in to view notifications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '900px' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div className="lux-line lux-line-gold" style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Bell size={18} strokeWidth={1.5} style={{ color: t.ch }} />
                <span style={{ fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.ch, padding: '3px 10px', border: '1px solid ' + t.ch }}>Notifications Center</span>
              </div>
              <h1 style={{ fontFamily: t.heading, fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.02em', color: t.ch, marginBottom: '4px' }}>Notifications</h1>
              <p style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.wg }}>
                {notifications.length} total · {unreadCount} unread
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={fetchNotifications} disabled={loading} style={{
                fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                background: 'transparent', border: '1px solid ' + t.ch, color: t.ch, padding: '8px 16px', cursor: 'pointer',
              }}>
                <RefreshCw size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Refresh
              </button>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllAsRead} style={{
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                  background: t.ch, border: '1px solid ' + t.ch, color: '#F9F8F6', padding: '8px 16px', cursor: 'pointer',
                }}>
                  <CheckCheck size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Mark All Read
                </button>
              )}
              <button onClick={() => navigate(-1)} style={{
                fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
                background: 'transparent', border: '1px solid rgba(26,26,26,0.2)', color: t.wg, padding: '8px 16px', cursor: 'pointer',
              }}>
                <ArrowLeft size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Back
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: t.wg, pointerEvents: 'none' }} />
            <input type="text" placeholder="Search notifications…" value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{ fontFamily: t.body, fontSize: '0.8rem', color: t.ch, width: '100%', padding: '10px 12px 10px 36px', border: '1px solid rgba(26,26,26,0.15)', background: 'transparent', outline: 'none' }}
              onFocus={e => e.currentTarget.style.borderColor = t.ch}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'}
            />
          </div>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.ch, padding: '10px 12px', border: '1px solid rgba(26,26,26,0.15)', background: 'transparent', cursor: 'pointer', outline: 'none', minWidth: '130px' }}>
            {ALL_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : NOTIFICATION_TYPE_LABELS[t] || t}</option>
            ))}
          </select>
          <select value={readFilter} onChange={e => { setReadFilter(e.target.value as 'all' | 'unread' | 'read'); setCurrentPage(1); }}
            style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.ch, padding: '10px 12px', border: '1px solid rgba(26,26,26,0.15)', background: 'transparent', cursor: 'pointer', outline: 'none', minWidth: '100px' }}>
            <option value="all">All Status</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
          <button onClick={() => setBulkMode(!bulkMode)} style={{
            fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em',
            padding: '10px 14px', border: '1px solid ' + (bulkMode ? t.gd : 'rgba(26,26,26,0.15)'),
            background: bulkMode ? 'rgba(0,0,0,0.03)' : 'transparent', color: bulkMode ? t.gd : t.wg,
            cursor: 'pointer', outline: 'none',
          }}>
            <Filter size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} /> {bulkMode ? 'Exit Bulk' : 'Bulk'}
          </button>
        </div>

        {/* Bulk Actions Bar */}
        {bulkMode && selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 16px', marginBottom: '1rem',
            background: 'rgba(0, 100, 148, 0.06)',
            border: '1px solid rgba(0, 100, 148, 0.15)',
          }}>
            <span style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.ch }}>
              {selectedIds.size} selected
            </span>
            <button onClick={handleMarkSelectedAsRead} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em',
              padding: '6px 14px', border: '1px solid ' + t.ch, background: t.ch, color: '#FFF', cursor: 'pointer',
            }}>
              <CheckCheck size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Mark as Read
            </button>
            <button onClick={() => setSelectedIds(new Set())} style={{
              fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em',
              padding: '6px 14px', border: '1px solid rgba(26,26,26,0.2)', background: 'transparent', color: t.wg, cursor: 'pointer',
            }}>
              Clear Selection
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Loader2 size={20} strokeWidth={1.5} className="spin-icon" style={{ color: t.wg }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div className="lux-line" style={{ margin: '0 auto 1rem' }} />
            <Inbox size={40} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem', opacity: 0.3 }} />
            <h2 style={{ fontFamily: t.heading, fontSize: '1.25rem', fontWeight: 400, color: t.ch, marginBottom: '0.5rem' }}>No Notifications Found</h2>
            <p style={{ fontFamily: t.body, fontSize: '0.85rem', color: t.wg, maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
              {searchQuery || typeFilter !== 'all' || readFilter !== 'all'
                ? 'No notifications match your current filters. Try adjusting the search or filter criteria.'
                : 'You have no notifications yet. They will appear here when worksheets are submitted, reviewed, or approved.'}
            </p>
          </div>
        ) : (
          <>
            {/* Notification List */}
            <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.1)' }}>
              {/* Column Headers (bulk mode only) */}
              {bulkMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(26,26,26,0.08)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
                    <input type="checkbox" checked={selectedIds.size === paginated.length && paginated.length > 0}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }} />
                    Select all
                  </label>
                </div>
              )}

              {paginated.map((n, idx) => {
                const Icon = NOTIFICATION_TYPE_ICONS[n.type] || Bell;
                const color = NOTIFICATION_TYPE_COLORS[n.type] || t.wg;
                return (
                  <div
                    key={n.id}
                    onClick={async () => {
                      // Mark as read and navigate
                      if (!n.read) {
                        await supabase.from('notifications').update({ read: true }).eq('id', n.id);
                        setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
                      }
                      const route = getNotificationRoute(n, profile?.role);
                      navigate(route);
                    }}
                    style={{
                      display: 'flex', gap: '12px', alignItems: 'flex-start',
                      padding: '14px 0',
                      borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                      opacity: 0, animation: `luxFadeIn 0.4s ${idx * 0.025}s forwards`,
                      background: !n.read ? 'rgba(26, 26, 26, 0.02)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 200ms var(--ease-lux)',
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(26, 26, 26, 0.06)'; }}
                    onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.background = !n.read ? 'rgba(26, 26, 26, 0.02)' : 'transparent'; }}
                  >
                    {/* Bulk checkbox (stops propagation so bulk selection doesn't navigate) */}
                    {bulkMode && (
                      <input type="checkbox" checked={selectedIds.has(n.id)}
                        onChange={(e) => { e.stopPropagation(); handleToggleSelect(n.id); }}
                        style={{ marginTop: '8px', cursor: 'pointer' }} />
                    )}

                    {/* Icon */}
                    <div style={{
                      width: '36px', height: '36px',
                      border: '1px solid ' + color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: '2px',
                      background: !n.read ? color + '08' : 'transparent',
                    }}>
                      <Icon size={16} strokeWidth={1.5} style={{ color }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontFamily: t.body, fontSize: '0.85rem', color: t.ch, lineHeight: 1.5,
                        fontWeight: !n.read ? 500 : 400,
                        marginBottom: '4px',
                      }}>
                        {n.message}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: t.body, fontSize: '0.6rem', color: t.wg }}>
                          {timeAgo(n.created_at)}
                        </span>
                        <span style={{
                          fontFamily: t.body, fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.1em',
                          padding: '2px 8px', color, border: '1px solid ' + color, opacity: 0.8,
                        }}>
                          {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                        </span>
                        {!n.read && (
                          <span style={{
                            width: '6px', height: '6px',
                            background: t.gd, display: 'inline-block',
                          }} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: '8px', marginTop: '2rem',
                fontFamily: t.body, fontSize: '0.75rem', color: t.wg,
              }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  style={{ background: 'none', border: '1px solid rgba(26,26,26,0.15)', padding: '6px 12px', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, color: t.ch }}>
                  <ChevronLeft size={14} strokeWidth={1.5} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setCurrentPage(p)}
                    style={{
                      background: p === currentPage ? t.ch : 'transparent',
                      border: '1px solid ' + (p === currentPage ? t.ch : 'rgba(26,26,26,0.15)'),
                      color: p === currentPage ? '#F9F8F6' : t.ch,
                      padding: '6px 12px', cursor: 'pointer', minWidth: '32px',
                      fontFamily: t.body, fontSize: '0.75rem',
                    }}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  style={{ background: 'none', border: '1px solid rgba(26,26,26,0.15)', padding: '6px 12px', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1, color: t.ch }}>
                  <ChevronRight size={14} strokeWidth={1.5} />
                </button>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: '1.5rem', padding: '12px 0', borderTop: '1px solid rgba(26,26,26,0.08)', display: 'flex', justifyContent: 'space-between', fontFamily: t.body, fontSize: '0.65rem', color: t.wg }}>
              <span>Showing {paginated.length} of {filtered.length} notifications</span>
              {unreadCount > 0 && <span>{unreadCount} unread</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
