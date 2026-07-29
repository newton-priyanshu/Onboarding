import { useMemo } from 'react';
import type { AchievementWithState } from '../config/achievements';
import type { WorksheetSubmission } from '../config/worksheetConfig';
import type { KudosItem } from './useKudos';
import { REVIEW_STATUS } from '../constants/status';
import { PHASE_WORKSHEETS_MAP } from '../config/worksheetConfig';

// ─── Types ──────────────────────────────────────────────

export interface MilestoneItem {
  id: string;
  /** ISO timestamp for sorting */
  timestamp: string;
  /** Category for icon rendering */
  type: 'kudos' | 'achievement' | 'worksheet_approved' | 'phase_completed';
  /** Primary label */
  title: string;
  /** Secondary description */
  description: string;
  /** Who or what this is about */
  subject?: string;
}

interface UseMilestonesOpts {
  submissions: WorksheetSubmission[];
  achievements: AchievementWithState[];
  receivedKudos: KudosItem[];
}

interface UseMilestonesResult {
  milestones: MilestoneItem[];
  /** Most recent 5 milestones for compact display */
  recentMilestones: MilestoneItem[];
}

// ─── Helpers ────────────────────────────────────────────

function detectPhaseCompletions(
  submissions: WorksheetSubmission[]
): MilestoneItem[] {
  const completed: MilestoneItem[] = [];

  for (const phaseNum of [1, 2, 3] as const) {
    const phaseIds = PHASE_WORKSHEETS_MAP[phaseNum];
    if (!phaseIds || phaseIds.length === 0) continue;

    // Find the most recent approval timestamp for this phase
    const approvedSubs = submissions.filter(
      s =>
        phaseIds.includes(s.worksheet_id) &&
        s.review_status === REVIEW_STATUS.APPROVED &&
        s.updated_at
    ).sort(
      (a, b) => new Date(b.updated_at as string).getTime() - new Date(a.updated_at as string).getTime()
    );

    // Phase is complete only if ALL worksheets are approved
    const allApproved = phaseIds.every(id =>
      submissions.some(
        s => s.worksheet_id === id && s.review_status === REVIEW_STATUS.APPROVED
      )
    );

    if (allApproved && approvedSubs.length > 0) {
      completed.push({
        id: `phase_${phaseNum}_completed`,
        timestamp: approvedSubs[0]!.updated_at as string,
        type: 'phase_completed',
        title: `Phase ${phaseNum} Complete`,
        description: `All ${phaseIds.length} worksheets approved for Phase ${phaseNum}`,
      });
    }
  }

  return completed;
}

function detectWorksheetApprovals(
  submissions: WorksheetSubmission[]
): MilestoneItem[] {
  return submissions
    .filter(s => s.review_status === REVIEW_STATUS.APPROVED && s.updated_at)
    .map(s => ({
      id: `ws_approved_${s.worksheet_id}`,
      timestamp: s.updated_at as string,
      type: 'worksheet_approved' as const,
      title: 'Worksheet Approved',
      description: s.worksheet_id
        ? `Worksheet "${s.worksheet_id.replace(/_/g, ' ').toUpperCase()}" was reviewed and approved`
        : 'A worksheet was approved',
      subject: s.worksheet_id as string,
    }))
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

function detectAchievementMilestones(
  achievements: AchievementWithState[]
): MilestoneItem[] {
  return achievements
    .filter(a => a.unlocked && a.unlockedAt)
    .map(a => ({
      id: `achievement_${a.id}`,
      timestamp: a.unlockedAt as string,
      type: 'achievement' as const,
      title: `Achievement: ${a.title}`,
      description: a.description,
      subject: a.icon,
    }))
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

function detectKudosMilestones(
  kudos: KudosItem[]
): MilestoneItem[] {
  return kudos.map(k => ({
    id: `kudos_${k.id}`,
    timestamp: k.created_at,
    type: 'kudos' as const,
    title: `Kudos from ${k.from_name || 'Someone'}`,
    description: k.message,
    subject: k.from_name,
  }))
  .sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// ─── Hook ───────────────────────────────────────────────

export function useMilestones({
  submissions,
  achievements,
  receivedKudos,
}: UseMilestonesOpts): UseMilestonesResult {
  const allMilestones = useMemo(() => {
    const items: MilestoneItem[] = [
      ...detectKudosMilestones(receivedKudos),
      ...detectAchievementMilestones(achievements),
      ...detectWorksheetApprovals(submissions),
      ...detectPhaseCompletions(submissions),
    ];

    // Sort newest first
    items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return items;
  }, [receivedKudos, achievements, submissions]);

  const recentMilestones = useMemo(
    () => allMilestones.slice(0, 5),
    [allMilestones]
  );

  return { milestones: allMilestones, recentMilestones };
}
