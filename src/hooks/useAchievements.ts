import { useState, useEffect, useCallback, useRef } from 'react';
import ACHIEVEMENTS, { type Achievement, type AchievementWithState } from '../config/achievements';
import type { WorksheetSubmission } from '../config/worksheetConfig';
import { supabase } from '../api/supabase';

// ─── Types ──────────────────────────────────────────────

interface UseAchievementsResult {
  achievements: AchievementWithState[];
  newlyUnlocked: AchievementWithState[];
  loading: boolean;
}

// ─── Storage helpers (localStorage fallback; DB is the source of truth
//     once the gamification migration is applied) ──────────────────

function getStorageKey(userId: string): string {
  return `achievements_${userId}`;
}

interface StoredData {
  unlocked: Record<string, string>; // achievement id → ISO date string
}

function loadStorage(userId: string): StoredData {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) return JSON.parse(raw) as StoredData;
  } catch { /* ignore */ }
  return { unlocked: {} };
}

function saveStorage(userId: string, data: StoredData): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
  } catch { /* ignore */ }
}

// ─── Hook ──────────────────────────────────────────────

export function useAchievements(
  userId: string | null,
  submissions: WorksheetSubmission[]
): UseAchievementsResult {
  const [achievements, setAchievements] = useState<AchievementWithState[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const prevUnlockedRef = useRef<Set<string>>(new Set());

  const checkAchievements = useCallback(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const stored = loadStorage(userId);
    const prevUnlocked = prevUnlockedRef.current;

    const results: AchievementWithState[] = ACHIEVEMENTS.map((ach: Achievement) => {
      const isUnlocked = ach.check(submissions);
      const unlockedAt = stored.unlocked[ach.id] || null;

      return {
        ...ach,
        unlocked: isUnlocked,
        unlockedAt: isUnlocked ? (unlockedAt || new Date().toISOString()) : null,
      };
    });

    // Detect newly unlocked achievements
    const newOnes = results.filter(r =>
      r.unlocked && !prevUnlocked.has(r.id)
    );
    if (newOnes.length > 0) {
      // Persist the unlock date
      const updatedStored = { ...stored };
      newOnes.forEach(n => {
        updatedStored.unlocked[n.id] = new Date().toISOString();
        prevUnlockedRef.current.add(n.id);
      });
      saveStorage(userId, updatedStored);

      // Update results with the saved date
      newOnes.forEach(n => {
        const result = results.find(r => r.id === n.id);
        if (result) result.unlockedAt = new Date().toISOString();
      });

      setNewlyUnlocked(newOnes);
      // Clear the "new" state after 5 seconds
      setTimeout(() => setNewlyUnlocked([]), 5000);

      // Best-effort sync to the DB (no-op if the migration isn't applied yet).
      void syncUnlocksToDb(newOnes.map(n => n.id));
    }

    // Track all unlocked for next comparison
    results.filter(r => r.unlocked).forEach(r => prevUnlockedRef.current.add(r.id));

    setAchievements(results);
    setLoading(false);
  }, [userId, submissions]);

  // Hydrate persisted unlock dates from the DB on mount (idempotent — merges
  // over whatever localStorage already has).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_achievements')
          .select('achievement_id, unlocked_at')
          .eq('user_id', userId);
        if (error || !data || data.length === 0) return;
        if (cancelled) return;

        const stored = loadStorage(userId);
        let changed = false;
        for (const row of data as { achievement_id: string; unlocked_at: string }[]) {
          if (!stored.unlocked[row.achievement_id]) {
            stored.unlocked[row.achievement_id] = row.unlocked_at;
            prevUnlockedRef.current.add(row.achievement_id);
            changed = true;
          }
        }
        if (changed) saveStorage(userId, stored);
        // Re-run the check so DB-persisted unlocks show as unlocked immediately.
        checkAchievements();
      } catch { /* migration not applied / offline — localStorage covers us */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    checkAchievements();
  }, [checkAchievements]);

  return { achievements, newlyUnlocked, loading };
}

/** Fire-and-forget RPC sync — never blocks the UI, never throws. */
async function syncUnlocksToDb(ids: string[]): Promise<void> {
  try {
    await supabase.rpc('sync_achievement_unlocks', { p_achievement_ids: ids });
  } catch {
    // Migration not applied or offline — localStorage already has the unlock.
  }
}
