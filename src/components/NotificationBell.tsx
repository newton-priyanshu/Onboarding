import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, CheckCircle2, XCircle, RefreshCw, Clock, AlertTriangle, FileText, Shield, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

import { t } from '../config/theme';

// ─── Types ──────────────────────────────────────────────

interface NotificationIconConfig {
  icon: LucideIcon;
  color: string;
}

interface PhaseMap {
  [key: string]: string;
}

// ─── Constants ──────────────────────────────────────────

const NOTIFICATION_ICONS: Record<string, NotificationIconConfig> = {
  submitted: { icon: FileText, color: '#0369A1' },
  revision_submitted: { icon: RefreshCw, color: t.pending },
  approved: { icon: CheckCircle2, color: t.success },
  buddy_approved: { icon: Shield, color: t.purple },
  needs_revision: { icon: XCircle, color: t.error },
  due_soon: { icon: Clock, color: t.warning },
  overdue: { icon: AlertTriangle, color: t.error },
};

const PHASE_MAP: PhaseMap = {
  p1_w1: 'phase-1', p1_w2: 'phase-1', p1_w3: 'phase-1', p1_w4: 'phase-1',
  p1_w5: 'phase-1', p1_w6: 'phase-1', p1_w7: 'phase-1', p1_w8: 'phase-1',
  gc1: 'phase-1',
  p2_w1: 'phase-2', p2_w2: 'phase-2', p2_w3: 'phase-2', p2_w4: 'phase-2',
  gc2: 'phase-2',
  p3_w1: 'phase-3', p3_w2: 'phase-3', p3_w3: 'phase-3', p3_w4: 'phase-3', p3_w5: 'phase-3',
  gc3: 'phase-3',
};

// ─── Component ──────────────────────────────────────────

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications(user ?? null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

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

  // Only show for users with notifications (all logged-in users)
  if (!user) return null;

  const handleNotificationClick = async (notification: { id: string; from_user_id?: string | null; user_id?: string; worksheet_id: string }) => {
    await markAsRead(notification.id);
    setOpen(false);

    // Navigate to the relevant worksheet review or worksheet page
    const isReviewer = ['lead_instructor', 'academic_head', 'onboarding_lead'].includes(profile?.role ?? '');
    if (isReviewer) {
      // Route to the correct review URL based on the reviewer's role
      const reviewPath = profile?.role === 'onboarding_lead' ? 'onboarding-lead'
        : profile?.role === 'lead_instructor' ? 'buddy'
        : 'admin';
      navigate(`/${reviewPath}/review/${notification.from_user_id || notification.user_id}/${notification.worksheet_id}`);
    } else {
      // Joinee — navigate to their worksheet
      const phase = PHASE_MAP[notification.worksheet_id] || 'phase-1';
      navigate(`/${phase}`);
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          padding: '8px',
          background: 'none',
          border: '1px solid rgba(26, 26, 26, 0.15)',
          cursor: 'pointer',
          color: t.ch,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 500ms var(--ease-lux)',
        }}
        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = t.gd; }}
        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(26, 26, 26, 0.15)'; }}
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
          width: '360px',
          maxHeight: '480px',
          background: 'var(--color-alabaster)',
          border: '1px solid rgba(26, 26, 26, 0.2)',
          zIndex: 200,
          fontFamily: t.body,
          display: 'flex',
          flexDirection: 'column',
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
          <div style={{
            overflowY: 'auto', flex: 1,
            maxHeight: '400px',
          }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <Bell size={24} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '8px', opacity: 0.4 }} />
                <p style={{ fontSize: '0.8rem', color: t.wg }}>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 30).map((n: { id: string; type: string; message: string; created_at: string; read: boolean; worksheet_id: string; from_user_id?: string | null }) => {
                const config = NOTIFICATION_ICONS[n.type] || { icon: Bell, color: t.wg };
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
                      width: '28px', height: '28px',
                      border: '1px solid ' + config.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={14} strokeWidth={1.5} style={{ color: config.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: '0.78rem', color: t.ch, lineHeight: 1.4,
                        fontWeight: isUnread ? 500 : 400,
                        marginBottom: '2px',
                      }}>
                        {n.message}
                      </p>
                      <p style={{
                        fontSize: '0.6rem', color: t.wg,
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        {timeAgo(n.created_at)}
                        {isUnread && (
                          <span style={{
                            width: '6px', height: '6px',
                            background: t.gd, display: 'inline-block',
                          }} />
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
