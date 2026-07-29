import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase';

// ─── Types ──────────────────────────────────────────────

export interface KudosItem {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  created_at: string;
  /** Joined from user_profiles — sender's name */
  from_name?: string;
  /** Joined from user_profiles — sender's role */
  from_role?: string;
}

interface UseKudosResult {
  /** Kudos received by the current user */
  receivedKudos: KudosItem[];
  /** Kudos sent by the current user */
  sentKudos: KudosItem[];
  loading: boolean;
  error: string | null;
  /** Send a kudos message to a user */
  sendKudos: (toUserId: string, message: string) => Promise<void>;
  /** Refetch kudos */
  refresh: () => Promise<void>;
}

// ─── Hook ───────────────────────────────────────────────

export function useKudos(userId: string | null): UseKudosResult {
  const [receivedKudos, setReceivedKudos] = useState<KudosItem[]>([]);
  const [sentKudos, setSentKudos] = useState<KudosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKudos = useCallback(async () => {
    if (!userId) {
      setReceivedKudos([]);
      setSentKudos([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('kudos')
        .select(`
          id,
          from_user_id,
          to_user_id,
          message,
          created_at,
          from_user:from_user_id ( full_name, role )
        `)
        .or(`to_user_id.eq.${userId},from_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      const items = (data || []) as unknown as KudosItem[];
      // Enrich with sender name from the join
      const enriched = items.map((k: KudosItem & { from_user?: { full_name: string; role: string } }) => ({
        ...k,
        from_name: k.from_user?.full_name || 'Someone',
        from_role: k.from_user?.role || '',
      }));

      setReceivedKudos(enriched.filter(k => k.to_user_id === userId));
      setSentKudos(enriched.filter(k => k.from_user_id === userId));
      setError(null);
    } catch (err) {
      console.error('Failed to fetch kudos:', err);
      setError('Could not load kudos.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchKudos();
  }, [fetchKudos]);

  const sendKudos = useCallback(async (toUserId: string, message: string) => {
    if (!userId) throw new Error('You must be signed in to send kudos.');
    if (!message.trim()) throw new Error('Please write a message.');
    if (message.trim().length > 500) throw new Error('Message is too long (max 500 chars).');

    const { error: insertError } = await supabase
      .from('kudos')
      .insert({
        from_user_id: userId,
        to_user_id: toUserId,
        message: message.trim(),
      });

    if (insertError) throw insertError;

    // Refresh to see the new kudos
    await fetchKudos();
  }, [userId, fetchKudos]);

  return {
    receivedKudos,
    sentKudos,
    loading,
    error,
    sendKudos,
    refresh: fetchKudos,
  };
}
