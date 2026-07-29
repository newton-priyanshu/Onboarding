import { PHASE_WORKSHEETS_MAP, type WorksheetSubmission } from './worksheetConfig';
import { REVIEW_STATUS } from '../constants/status';

// ─── Types ──────────────────────────────────────────────

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Emoji icon for display */
  icon: string;
  /** Hint shown when locked */
  hint: string;
  /** Check function — returns true when achievement is earned */
  check: (submissions: WorksheetSubmission[]) => boolean;
}

export interface AchievementWithState extends Achievement {
  unlocked: boolean;
  unlockedAt: string | null; // ISO date string
}

// ─── Rank-ordered achievements ──────────────────────────

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_submission',
    title: 'First Submission',
    description: 'Submitted your first worksheet',
    icon: '✨',
    hint: 'Submit your first worksheet to unlock',
    check: (subs) => subs.some(s => s.status === 'submitted'),
  },
  {
    id: 'week1_complete',
    title: 'Week 1 Complete',
    description: 'Completed all Week 1 worksheets',
    icon: '🌱',
    hint: 'Complete all Week 1 worksheets',
    check: (subs) => {
      // Week 1 worksheets from FTP structure
      const week1Ids = ['p1_w5', 'p1_w6', 'p1_w3', 'w1_o1', 'w1_e1', 'w1_o2', 'w1_g1'];
      return week1Ids.every(id => {
        const sub = subs.find(s => s.worksheet_id === id);
        return sub && (sub.review_status === REVIEW_STATUS.APPROVED || sub.review_status === REVIEW_STATUS.BUDDY_APPROVED);
      });
    },
  },
  {
    id: 'fast_starter',
    title: 'Fast Starter',
    description: 'Completed Phase 1 within 15 days of starting',
    icon: '⚡',
    hint: 'Complete Phase 1 within 15 days',
    check: (subs) => {
      // Check if all Phase 1 worksheets are approved
      const phase1Ids = PHASE_WORKSHEETS_MAP[1] || [];
      const allApproved = phase1Ids.every(id => {
        const sub = subs.find(s => s.worksheet_id === id);
        return sub?.review_status === REVIEW_STATUS.APPROVED;
      });
      if (!allApproved || phase1Ids.length === 0) return false;

      // Find earliest and latest Phase 1 submissions
      const phase1Subs = subs.filter(s =>
        phase1Ids.includes(s.worksheet_id) && s.updated_at
      );
      if (phase1Subs.length < 2) return false;

      const dates = phase1Subs
        .map(s => new Date(s.updated_at as string).getTime())
        .filter(t => !isNaN(t))
        .sort();

      if (dates.length < 2) return false;
      const lastDate = dates[dates.length - 1];
      const firstDate = dates[0];
      if (lastDate === undefined || firstDate === undefined) return false;
      const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
      return daysDiff <= 15;
    },
  },
  {
    id: 'perfectionist',
    title: 'Perfectionist',
    description: 'Got a worksheet approved on the first review — no revisions needed',
    icon: '🎯',
    hint: 'Get approved without any revision requests',
    check: (subs) => {
      return subs.some(s => {
        const history = (s as { review_history?: Array<{ action: string }> }).review_history;
        if (!history || history.length === 0) return false;
        // First review action must be 'approved' or 'buddy_approved'
        const firstAction = history[0]?.action;
        return firstAction === 'approved' || firstAction === 'buddy_approved';
      });
    },
  },
  {
    id: 'resilient',
    title: 'Resilient',
    description: 'Completed a worksheet after it required revisions',
    icon: '💪',
    hint: 'Revise and resubmit a worksheet',
    check: (subs) => {
      return subs.some(s => {
        const history = (s as { review_history?: Array<{ action: string }> }).review_history;
        if (!history || history.length < 2) return false;
        // Has at least one needs_revision followed by an approval
        const hasRevision = history.some(h => h.action === 'needs_revision');
        const hasApproval = history.some(h => h.action === 'approved' || h.action === 'buddy_approved');
        return hasRevision && hasApproval;
      });
    },
  },
  {
    id: 'collaborator',
    title: 'Collaborator',
    description: 'Got 5 worksheets buddy-approved',
    icon: '🤝',
    hint: 'Get 5 worksheets buddy-approved',
    check: (subs) => {
      const buddyApproved = subs.filter(s =>
        s.review_status === REVIEW_STATUS.BUDDY_APPROVED || s.review_status === REVIEW_STATUS.APPROVED
      );
      return buddyApproved.length >= 5;
    },
  },
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Completed 5 worksheets ahead of schedule',
    icon: '🌅',
    hint: 'Stay ahead of your deadlines',
    check: (subs) => {
      const completed = subs.filter(s =>
        s.review_status === REVIEW_STATUS.APPROVED || s.review_status === REVIEW_STATUS.BUDDY_APPROVED
      );
      return completed.length >= 5;
    },
  },
  {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Submitted a worksheet after 10 PM',
    icon: '🦉',
    hint: 'Submit a worksheet after 10 PM',
    check: (subs) => {
      return subs.some(s => {
        const updated = s.updated_at as string | undefined;
        if (!updated) return false;
        const hour = new Date(updated).getHours();
        return hour >= 22 || hour < 5;
      });
    },
  },
  {
    id: 'phase_master',
    title: 'Phase Master',
    description: 'Completed all 3 onboarding phases',
    icon: '🏆',
    hint: 'Complete all 3 onboarding phases',
    check: (subs) => {
      return [1, 2, 3].every(phaseNum => {
        const phaseIds = PHASE_WORKSHEETS_MAP[phaseNum] || [];
        return phaseIds.every(id => {
          const sub = subs.find(s => s.worksheet_id === id);
          return sub?.review_status === REVIEW_STATUS.APPROVED;
        });
      });
    },
  },
  {
    id: 'full_circle',
    title: 'Full Circle',
    description: 'Completed the entire onboarding program — welcome to the faculty!',
    icon: '🎓',
    hint: 'Complete the full onboarding program',
    check: (subs) => {
      // Full circle = phase_master + assessed
      const allPhaseApproved = [1, 2, 3].every(phaseNum => {
        const phaseIds = PHASE_WORKSHEETS_MAP[phaseNum] || [];
        return phaseIds.every(id => {
          const sub = subs.find(s => s.worksheet_id === id);
          return sub?.review_status === REVIEW_STATUS.APPROVED;
        });
      });
      if (!allPhaseApproved) return false;
      // Check if the user has been assessed (overall_status === 'assessed')
      // This requires profile data which comes from the hook
      return allPhaseApproved;
    },
  },
];

export default ACHIEVEMENTS;
