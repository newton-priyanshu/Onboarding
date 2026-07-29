import { useState, useRef, useEffect } from 'react';
import {
  Bell, CheckCheck, CheckCircle2, XCircle, RefreshCw, Clock,
  AlertTriangle, FileText, Shield, Star, ArrowUp, Award,
  ExternalLink, type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { t } from '../config/theme';

// ─── Types ──────────────────────────────────────────────

interface NotificationIconConfig {
  icon: LucideIcon;
  color: string;
  label: string;
}

// ─── Complete Worksheet → Route Mapping ─────────────────
// Every worksheet ID maps to its route path.
// This enables notification click → correct page navigation.

const WORKSHEET_ROUTES: Record<string, string> = {
  // ── Legacy Phase 1 ──
  p1_w1: '/phase-1', p1_w2: '/phase-1', p1_w3: '/week-1/worksheet/p1_w3',
  p1_w4: '/phase-1', p1_w5: '/week-1/worksheet/p1_w5',
  p1_w6: '/week-1/worksheet/p1_w6',
  p1_w7: '/phase-1', p1_w8: '/phase-1',
  gc1: '/phase-1',
  // ── Legacy Phase 2 ──
  p2_w1: '/phase-2', p2_w2: '/phase-2', p2_w3: '/phase-2', p2_w4: '/phase-2',
  gc2: '/phase-2',
  // ── Legacy Phase 3 ──
  p3_w1: '/phase-3', p3_w2: '/phase-3', p3_w3: '/phase-3',
  p3_w4: '/phase-3', p3_w5: '/phase-3',
  gc3: '/phase-3',
  // ── FTP Gate Artifacts ──
  w1_g1: '/week-1/worksheet/w1_g1',
  w2_g1: '/week-2/worksheet/w2_g1',
  w3_g1: '/week-3/worksheet/w3_g1',
  w4_g1: '/week-4/worksheet/w4_g1',
  // ── FTP Week 1 ──
  w1_o1: '/week-1/worksheet/w1_o1',
  w1_e1: '/week-1/worksheet/w1_e1',
  w1_o2: '/week-1/worksheet/w1_o2',
  // ── FTP Week 2 ──
  w2_e1: '/week-2/worksheet/w2_e1',
  w2_c3: '/week-2/worksheet/w2_c3',
  w2_d2: '/week-2/worksheet/w2_d2',
  w2_b1: '/week-2/worksheet/w2_b1',
  w2_o1: '/week-2/worksheet/w2_o1',
  // ── FTP Week 3 ──
  w3_d1: '/week-3/worksheet/w3_d1',
  w3_d2: '/week-3/worksheet/w3_d2',
  w3_e1: '/week-3/worksheet/w3_e1',
  w3_b1: '/week-3/worksheet/w3_b1',
  // ── FTP Week 4 ──
  w4_d2: '/week-4/worksheet/w4_d2',
  w4_e1: '/week-4/worksheet/w4_e1',
  w4_o1: '/week-4/worksheet/w4_o1',
  w4_b1: '/week-4/worksheet/w4_b1',
  // ── Progression Phase 1 ──
  pr_p1_w1: '/progression/phase-1', pr_p1_w2: '/progression/phase-1',
  pr_p1_w3: '/progression/phase-1', pr_p1_w4: '/progression/phase-1',
  pr_p1_w5: '/progression/phase-1', pr_p1_w6: '/progression/phase-1',
  pr_gc1: '/progression/phase-1',
  // ── Progression Phase 2 ──
  pr_p2_w1: '/progression/phase-2', pr_p2_w2: '/progression/phase-2',
  pr_p2_w3: '/progression/phase-2', pr_gc2: '/progression/phase-2',
  // ── Progression Phase 3 ──
  pr_p3_w1: '/progression/phase-3', pr_p3_w2: '/progression/phase-3',
  pr_p3_w3: '/progression/phase-3', pr_p3_w4: '/progression/phase-3',
  pr_gc3: '/progression/phase-3',
  // ── Operations Phase 1 ──
  op_p1_w1: '/operations/phase-1', op_p1_w2: '/operations/phase-1',
  op_p1_w3: '/operations/phase-1', op_p1_w4: '/operations/phase-1',
  op_p1_w5: '/operations/phase-1', op_p1_w6: '/operations/phase-1',
  op_gc1: '/operations/phase-1',
  // ── Operations Phase 2 ──
  op_p2_w1: '/operations/phase-2', op_p2_w2: '/operations/phase-2',
  op_p2_w3: '/operations/phase-2', op_gc2: '/operations/phase-2',
  // ── Operations Phase 3 ──
  op_p3_w1: '/operations/phase-3', op_p3_w2: '/operations/phase-3',
  op_p3_w3: '/operations/phase-3', op_p3_w4: '/operations/phase-3',
  op_gc3: '/operations/phase-3',
};

// ─── Notification Type Icons ────────────────────────────

const NOTIFICATION_ICONS: Record<string, NotificationIconConfig> = {
  submitted: { icon: FileText, color: t.info, label: 'Submitted' },
  revision_submitted: { icon: RefreshCw, color: t.pending, label: 'Re-submitted' },
  approved: { icon: CheckCircle2, color: t.success, label: 'Approved' },
  buddy_approved: { icon: Shield, color: t.purple, label: 'Buddy Approved' },
  needs_revision: { icon: XCircle, color: t.warning, label: 'Needs Revision' },
  phase_approved: { icon: Award, color: t.success, label: 'Phase Approved' },
  promoted: { icon: Star, color: '#D4A853', label: 'Promoted' },
  due_soon: { icon: Clock, color: t.warning, label: 'Due Soon' },
  overdue: { icon: AlertTriangle, color: t.error, label: 'Overdue' },
  assignment: { icon: ArrowUp, color: t.info, label: 'Assignment' },
};

// ─── Component ──────────────────────────────────────────

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications(user ?? null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const desktopNotified = useRef<Set<string>>(new Set());

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // ── Desktop Notification Support ─────────────────────────
  // Send browser desktop notifications for new unread notifications
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const unread = notifications.filter(n => !n.read && !desktopNotified.current.has(n.id));
    unread.forEach(n => {
      desktopNotified.current.add(n.id);
      try {
        new Notification('NST AARAMBH', {
          body: n.message,
          tag: n.id,
        });
      } catch {
        // Desktop notification failed silently — not critical
      }
    });
  }, [notifications]);

  if (!user) return null;

  // ── Navigation Helper ────────────────────────────────────
  // Determines the correct route when a notification is clicked.
  const getNotificationRoute = (n: { worksheet_id: string; from_user_id?: string | null; user_id?: string; type?: string }): string => {
    const isReviewer = ['lead_instructor', 'academic_head', 'progression_head', 'ops_head', 'campus_head', 'campus_admin', 'onboarding_lead'].includes(profile?.role ?? '');
    const worksheetId = n.worksheet_id;

    if (isReviewer && worksheetId) {
      // Reviewers navigate to the review page for this worksheet
      const reviewPath = profile?.role === 'onboarding_lead' ? 'onboarding-lead'
        : profile?.role === 'lead_instructor' ? 'buddy'
        : 'admin';
      const targetUserId = n.from_user_id || n.user_id;
      return `/${reviewPath}/review/${targetUserId}/${worksheetId}`;
    }

    // Joinee — navigate to their worksheet phase/week
    if (worksheetId && WORKSHEET_ROUTES[worksheetId]) {
      return WORKSHEET_ROUTES[worksheetId];
    }

    // Fallback — navigate based on notification type
    if (n.type === 'promoted' || n.type === 'phase_approved') {
      return '/';
    }

    return '/';
  };

  const handleNotificationClick = async (n: { id: string; worksheet_id: string; from_user_id?: string | null; user_id?: string; type?: string }) => {
    await markAsRead(n.id);
    setOpen(false);
    const route = getNotificationRoute(n);
    navigate(route);
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
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          padding: '8px',
          background: 'none',
          border: '1px solid ' + (open ? t.gd : 'rgba(26, 26, 26, 0.15)'),
          cursor: 'pointer',
          color: open ? t.gd : t.ch,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 200ms var(--ease-lux), color 200ms var(--ease-lux)',
        }}
        onMouseOver={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = t.gd; }}
        onMouseOut={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(26, 26, 26, 0.15)'; }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '18px',
            height: '18px',
            background: t.error,
            color: '#FFFFFF',
            fontSize: '0.55rem',
            fontWeight: 600,
            fontFamily: t.body,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          width: '380px',
          maxHeight: '520px',
          background: 'var(--color-alabaster)',
          border: '1px solid rgba(26, 26, 26, 0.2)',
          zIndex: 200,
          fontFamily: t.body,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid rgba(26, 26, 26, 0.12)',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: t.ch }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{ color: t.wg, fontWeight: 400, marginLeft: '4px' }}>
                  ({unreadCount} unread)
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: t.body, fontSize: '0.6rem', fontWeight: 500,
                  color: t.wg, display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px',
                }}>
                  <CheckCheck size={12} strokeWidth={1.5} /> Mark all read
                </button>
              )}
              <button onClick={refresh} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: t.wg, padding: '4px', display: 'flex',
              }}>
                <RefreshCw size={12} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: '380px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
                <Bell size={28} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '10px', opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem', color: t.wg, marginBottom: '4px' }}>No notifications yet</p>
                <p style={{ fontSize: '0.65rem', color: t.wg, opacity: 0.7 }}>
                  You'll see updates here when worksheets are submitted, approved, or need revision.
                </p>
              </div>
            ) : (
              notifications.slice(0, 25).map((n: { id: string; type: string; message: string; created_at: string; read: boolean; worksheet_id: string; from_user_id?: string | null }) => {
                const config = NOTIFICATION_ICONS[n.type] || { icon: Bell, color: t.wg, label: n.type };
                const Icon = config.icon;
                const isUnread = !n.read;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    style={{
                      display: 'flex', gap: '12px',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: isUnread ? 'rgba(26, 26, 26, 0.03)' : 'transparent',
                      borderBottom: '1px solid rgba(26, 26, 26, 0.06)',
                      transition: 'background 300ms var(--ease-lux)',
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(26, 26, 26, 0.06)'; }}
                    onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? 'rgba(26, 26, 26, 0.03)' : 'transparent'; }}
                  >
                    <div style={{
                      width: '32px', height: '32px',
                      border: '1px solid ' + config.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginTop: '2px',
                    }}>
                      <Icon size={15} strokeWidth={1.5} style={{ color: config.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: '0.78rem', color: t.ch, lineHeight: 1.4,
                        fontWeight: isUnread ? 500 : 400,
                        marginBottom: '3px',
                      }}>
                        {n.message}
                      </p>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        <span style={{ fontSize: '0.6rem', color: t.wg }}>
                          {timeAgo(n.created_at)}
                        </span>
                        <span style={{
                          fontSize: '0.5rem', fontWeight: 500, letterSpacing: '0.1em',
                          padding: '1px 6px', color: config.color,
                          border: '1px solid ' + config.color, opacity: 0.7,
                        }}>
                          {config.label}
                        </span>
                        {isUnread && (
                          <span style={{
                            width: '6px', height: '6px',
                            background: t.gd, display: 'inline-block', flexShrink: 0,
                          }} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer — View All */}
          {notifications.length > 0 && (
            <div style={{
              borderTop: '1px solid rgba(26, 26, 26, 0.12)',
              padding: '10px 16px',
              textAlign: 'center',
            }}>
              <button
                onClick={() => { setOpen(false); navigate('/notifications'); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: t.body, fontSize: '0.65rem', fontWeight: 500,
                  letterSpacing: '0.1em', color: t.ch,
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px',
                  transition: 'opacity 200ms var(--ease-lux)',
                }}
              >
                <ExternalLink size={12} strokeWidth={1.5} />
                View all notifications — {notifications.length > 25 ? `${notifications.length}+` : notifications.length} total
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
