import { useState, useEffect, useCallback, useRef } from 'react';
import ACHIEVEMENTS, { type Achievement, type AchievementWithState } from '../config/achievements';
import type { WorksheetSubmission } from '../config/worksheetConfig';

// ─── Types ──────────────────────────────────────────────

interface UseAchievementsResult {
  achievements: AchievementWithState[];
  newlyUnlocked: AchievementWithState[];
  loading: boolean;
}

// ─── Storage helpers ────────────────────────────────────

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
    }

    // Track all unlocked for next comparison
    results.filter(r => r.unlocked).forEach(r => prevUnlockedRef.current.add(r.id));

    setAchievements(results);
    setLoading(false);
  }, [userId, submissions]);

  useEffect(() => {
    checkAchievements();
  }, [checkAchievements]);

  return { achievements, newlyUnlocked, loading };
}
