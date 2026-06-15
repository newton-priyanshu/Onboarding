import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * useNotifications — Fetches and manages notifications for a user.
 *
 * @param {object} user - Supabase auth user
 * @param {number} [pollInterval=15000] - How often to poll for new notifications (ms)
 */
export function useNotifications(user, pollInterval = 15000) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data && mountedRef.current) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user?.id]);

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
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
  }, [user?.id, fetchNotifications, pollInterval]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!user?.id) return;
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }, [user?.id, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}

/**
 * triggerNotification — Creates a notification in the database.
 * Can be called from anywhere (submit, approve, revision actions).
 *
 * @param {object} opts
 * @param {string} opts.userId       - Who receives the notification
 * @param {string} opts.fromUserId   - Who triggered the notification
 * @param {string} opts.worksheetId  - Related worksheet
 * @param {string} opts.type         - Notification type
 * @param {string} opts.message      - Notification message text
 */
export async function triggerNotification({ userId, fromUserId, worksheetId, type, message }) {
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
 *
 * @param {string} reviewerType - 'buddy' | 'manager' | 'onboarding_lead'
 * @returns {Promise<string[]>} Array of user IDs
 */
export async function getReviewerUserIds(reviewerType) {
  const roleMap = {
    buddy: 'lead_instructor',
    manager: 'academic_head',
    onboarding_lead: 'onboarding_lead',
  };
  const role = roleMap[reviewerType];
  if (!role) return [];

  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', role);
    return (data || []).map(p => p.id);
  } catch (err) {
    console.error('Error fetching reviewer IDs:', err);
    return [];
  }
}

/**
 * getJoineeUserId — Returns the assigned reviewer user IDs for a specific joinee.
 * Checks both assigned_lead_id and assigned_buddy_id.
 *
 * @param {string} joineeUserId
 * @param {string} reviewerType - 'buddy' | 'manager'
 * @returns {Promise<string[]>} Array of user IDs
 */
export async function getAssignedReviewerIds(joineeUserId, reviewerType) {
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('assigned_lead_id, assigned_buddy_id')
      .eq('id', joineeUserId)
      .single();

    if (!data) return [];

    if (reviewerType === 'buddy' && data.assigned_buddy_id) {
      return [data.assigned_buddy_id];
    }
    if (reviewerType === 'manager' && data.assigned_lead_id) {
      return [data.assigned_lead_id];
    }
    return [];
  } catch (err) {
    console.error('Error fetching assigned reviewer:', err);
    return [];
  }
}
