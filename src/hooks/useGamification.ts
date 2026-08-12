import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../api/supabase';
import { XP_RULES, getLevelProgress, type LevelProgress } from '../config/gamification';
import type { WorksheetSubmission } from '../config/worksheetConfig';
import { REVIEW_STATUS } from '../constants/status';

// ─── Types ──────────────────────────────────────────────

export interface GamificationProfile {
  user_id: string;
  campus_id: string | null;
  total_xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface XpEvent {
  id: string;
  event_type: string;
  amount: number;
  source_id: string | null;
  created_at: string;
}

export interface PersistedAchievement {
  achievement_id: string;
  unlocked_at: string;
}

export interface CompletionCertificate {
  id: string;
  certificate_number: string;
  issued_at: string;
}

interface UseGamificationResult {
  profile: GamificationProfile | null;
  level: LevelProgress;
  recentEvents: XpEvent[];
  persistedAchievements: PersistedAchievement[];
  certificate: CompletionCertificate | null;
  loading: boolean;
  /** True when the DB tables exist (migration applied). When false, the UI
   *  should degrade gracefully and not show DB-backed sections. */
  dbAvailable: boolean;
  refresh: () => Promise<void>;
}

const EVENT_LABELS: Record<string, string> = {
  submit: 'Submitted a worksheet',
  revision_submit: 'Resubmitted after revision',
  buddy_approved: 'Worksheet buddy-approved',
  manager_approved: 'Worksheet manager-approved',
  phase_complete: 'Completed a full phase',
  onboarding_complete: 'Completed onboarding',
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] || 'Earned XP';
}

// ─── Fallback: client-side profile when DB tables don't exist ──
// Used until the gamification migration is applied to the live DB, so the
// joinee still sees a level/XP readout. Not authoritative — DB is once applied.

export function computeFallbackProfile(submissions: WorksheetSubmission[]): GamificationProfile {
  let xp = 0;
  let submitDays = new Set<string>();

  const add = (n: number) => { xp += n; };

  // Track unique per-worksheet progression to avoid double counting.
  const bySheet = new Map<string, { submitted: boolean; buddy: boolean; manager: boolean; dates: string[] }>();
  for (const s of submissions) {
    const entry = bySheet.get(s.worksheet_id) || { submitted: false, buddy: false, manager: false, dates: [] };
    if (s.review_status === REVIEW_STATUS.PENDING_REVIEW) entry.submitted = true;
    if (s.review_status === REVIEW_STATUS.REVISION_SUBMITTED) { entry.submitted = true; }
    if (s.review_status === REVIEW_STATUS.NEEDS_REVISION) { /* stays submitted */ }
    if (s.review_status === REVIEW_STATUS.BUDDY_APPROVED) { entry.submitted = true; entry.buddy = true; }
    if (s.review_status === REVIEW_STATUS.APPROVED) { entry.submitted = true; entry.buddy = true; entry.manager = true; }
    if (s.updated_at) entry.dates.push(s.updated_at);
    bySheet.set(s.worksheet_id, entry);
  }

  for (const e of bySheet.values()) {
    if (e.submitted) add(XP_RULES.submit);
    if (e.buddy) add(XP_RULES.buddy_approved);
    if (e.manager) add(XP_RULES.manager_approved);
    for (const d of e.dates) {
      const day = new Date(d).toISOString().slice(0, 10);
      if (!Number.isNaN(new Date(d).getTime())) submitDays.add(day);
    }
  }

  const level = Math.floor(Math.max(0, xp) / 250) + 1;

  // Streak (fallback): the most recent run of consecutive activity days. This
  // is a best-effort mirror of the DB trigger — "current" may include a stale
  // run if the joinee hasn't submitted recently (DB is authoritative).
  const days = [...submitDays].sort();
  let longest = 0;
  let current = 0;
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && dayDiff(days[i - 1]!, days[i]!) === 1) {
      current += 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
  }

  return {
    user_id: '',
    campus_id: null,
    total_xp: xp,
    level,
    current_streak: current,
    longest_streak: longest,
    last_activity_date: days[days.length - 1] || null,
    created_at: '',
    updated_at: '',
  };
}

function dayDiff(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

// ─── Hook ───────────────────────────────────────────────

export function useGamification(
  userId: string | null,
  submissions: WorksheetSubmission[] = []
): UseGamificationResult {
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [recentEvents, setRecentEvents] = useState<XpEvent[]>([]);
  const [persistedAchievements, setPersistedAchievements] = useState<PersistedAchievement[]>([]);
  const [certificate, setCertificate] = useState<CompletionCertificate | null>(null);
  const [dbAvailable, setDbAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef({ submissions });

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profRes, eventsRes, achRes, certRes] = await Promise.all([
        supabase.from('gamification_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('xp_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
        supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', userId),
        supabase.from('completion_certificates').select('*').eq('user_id', userId).maybeSingle(),
      ]);

      // Any of these failing with "relation does not exist" means the
      // migration isn't applied — degrade to the client-side fallback.
      const firstErr = profRes.error || eventsRes.error || achRes.error || certRes.error;
      if (firstErr) {
        if (isRelationMissing(firstErr)) {
          setDbAvailable(false);
          const fb = computeFallbackProfile(ref.current.submissions);
          setProfile(fb);
          setRecentEvents([]);
          setPersistedAchievements([]);
          setCertificate(null);
          setLoading(false);
          return;
        }
        throw firstErr;
      }

      setDbAvailable(true);
      setProfile(profRes.data as GamificationProfile | null);
      setRecentEvents((eventsRes.data || []) as XpEvent[]);
      setPersistedAchievements((achRes.data || []) as PersistedAchievement[]);
      setCertificate((certRes.data as CompletionCertificate | null) || null);
    } catch (err) {
      console.error('Failed to load gamification:', err);
      const fb = computeFallbackProfile(ref.current.submissions);
      setProfile(fb);
      setDbAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    ref.current.submissions = submissions;
    if (submissions.length > 0 && dbAvailable) {
      // refresh profile numbers when submissions change (XP awarded via trigger)
      fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, fetchAll]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    profile,
    level: getLevelProgress(profile?.total_xp || 0),
    recentEvents,
    persistedAchievements,
    certificate,
    loading,
    dbAvailable,
    refresh: fetchAll,
  };
}

function isRelationMissing(err: { message?: string; code?: string; details?: string }): boolean {
  const msg = `${err.message || ''} ${err.details || ''} ${err.code || ''}`;
  return /relation .* does not exist|42P01|PGRST205/i.test(msg);
}
