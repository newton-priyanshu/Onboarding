import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../api/supabase';

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
  [key: string]: unknown;
}

interface NotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  /** Set when the last fetch failed — the returned notifications may be stale. */
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface TriggerOpts {
  userId: string;
  fromUserId?: string;
  worksheetId: string;
  type: string;
  message: string;
}

const ROLE_MAP: Record<string, string> = {
  buddy: 'lead_instructor',
  manager: 'academic_head',
  onboarding_lead: 'onboarding_lead',
  buddy_approved: 'academic_head',
};

// ─── Hook ───────────────────────────────────────────────

/**
 * useNotifications — Fetches and manages notifications for a user.
 */
export function useNotifications(
  user: object | null,
  pollInterval: number = 15000
): NotificationsResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const userId = (user as { id?: string } | null)?.id;

  const fetchNotifications = useCallback(async () => {
    const u = user as { id?: string } | null;
    if (!u?.id) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('id, user_id, from_user_id, worksheet_id, type, message, read, created_at')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (fetchError) throw fetchError;
      if (mountedRef.current) {
        const items = (data || []) as NotificationItem[];
        setNotifications(items);
        setUnreadCount(items.filter(n => !n.read).length);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      // A failed fetch must not silently look like "no notifications" —
      // keep whatever was last loaded and surface the failure instead.
      if (mountedRef.current) setError('Failed to load notifications.');
    }
    if (mountedRef.current) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    fetchNotifications();

    // Poll for new notifications
    pollRef.current = setInterval(fetchNotifications, pollInterval);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [userId, fetchNotifications, pollInterval]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!userId) return;
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);
      if (updateError) throw updateError;
      // Only reflect the change locally once the write is confirmed —
      // an optimistic update here would misrepresent DB state on failure.
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds);
      if (updateError) throw updateError;
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [userId, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}

// ─── Standalone Helpers ─────────────────────────────────

/**
 * triggerNotification — Creates a notification in the database.
 *
 * NOTE (security audit, contract item 5): DB triggers now create reviewer
 * notifications on submission transitions into pending_review/revision_submitted,
 * and on new-signup — those client-side inserts have been removed at their
 * call sites. This helper remains for other, non-workflow-state notifications
 * (e.g. buddy/manager assignment, phase approval, promotion) that are not
 * covered by those triggers. Do not use this to re-announce a review_status
 * transition that a DB trigger already handles.
 */
export async function triggerNotification({ userId, fromUserId, worksheetId, type, message }: TriggerOpts): Promise<void> {
  if (!userId) return;
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      from_user_id: fromUserId,
      worksheet_id: worksheetId,
      type,
      message,
    });
    if (error) throw error;
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

/**
 * getReviewerUserIds — Returns the user IDs of all users who can review
 * a given reviewer type (buddy, manager, onboarding_lead).
 */
export async function getReviewerUserIds(reviewerType: string): Promise<string[]> {
  const role = ROLE_MAP[reviewerType];
  if (!role) return [];

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', role);
    if (error) throw error;
    return (data || []).map(p => (p as { id: string }).id);
  } catch (err) {
    console.error('Error fetching reviewer IDs:', err);
    return [];
  }
}

/**
 * getAssignedReviewerIds — Returns the assigned reviewer user IDs for a specific joinee.
 */
export async function getAssignedReviewerIds(joineeUserId: string, reviewerType: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('assigned_lead_id, assigned_buddy_id')
      .eq('id', joineeUserId)
      .single();

    if (error) throw error;
    if (!data) return [];

    const d = data as { assigned_lead_id: string | null; assigned_buddy_id: string | null };

    if (reviewerType === 'buddy' && d.assigned_buddy_id) {
      return [d.assigned_buddy_id];
    }
    if (reviewerType === 'manager' && d.assigned_lead_id) {
      return [d.assigned_lead_id];
    }
    return [];
  } catch (err) {
    console.error('Error fetching assigned reviewer:', err);
    return [];
  }
}
