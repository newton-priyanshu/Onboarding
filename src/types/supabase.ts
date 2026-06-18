// ─── User Roles ──────────────────────────────────────────
export type UserRole =
  | 'new_joinee'
  | 'lab_instructor'
  | 'lead_instructor'
  | 'academic_head'
  | 'onboarding_lead'
  | 'acad_ops';

// ─── User Profile ────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  assigned_lead_id: string | null;
  assigned_buddy_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Worksheet IDs (union of all known worksheets) ────────
export type WorksheetId =
  | 'p1_w1' | 'p1_w2' | 'p1_w3' | 'p1_w4' | 'p1_w5'
  | 'p1_w6' | 'p1_w7' | 'p1_w8'
  | 'p2_w1' | 'p2_w2' | 'p2_w3' | 'p2_w4'
  | 'p3_w1' | 'p3_w2' | 'p3_w3' | 'p3_w4' | 'p3_w5'
  | 'gc1' | 'gc2' | 'gc3';

// ─── Reviewer Types ──────────────────────────────────────
export type ReviewerType = 'buddy' | 'manager' | 'onboarding_lead';

// ─── Review Status (state machine) ───────────────────────
export type ReviewStatus =
  | ''
  | 'pending_review'
  | 'needs_revision'
  | 'revision_submitted'
  | 'buddy_approved'
  | 'approved';

// ─── Submission Status ───────────────────────────────────
export type SubmissionStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Reviewed';

// ─── Review History Entry ────────────────────────────────
export interface ReviewHistoryEntry {
  action: 'approved' | 'needs_revision';
  reviewer_name: string;
  reviewer_id: string;
  comment: string | null;
  timestamp: string;
}

// ─── Worksheet Submission (row) ──────────────────────────
export interface WorksheetSubmission {
  id: string;
  user_id: string;
  worksheet_id: WorksheetId;
  worksheet_data: Record<string, unknown>;
  phase: string;
  status: SubmissionStatus;
  review_status: ReviewStatus;
  reviewer_type: ReviewerType;
  reviewed_by: string | null;
  reviewer_name: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  review_history: ReviewHistoryEntry[];
  created_at: string;
  updated_at: string;
}

// ─── Assessment Levels ───────────────────────────────────
export type AssessmentLevel = 'fully_independent' | 'needs_minor_support' | 'needs_development';
export type OnboardingStatus = 'not_started' | 'phase1_complete' | 'phase2_complete' | 'phase3_complete' | 'assessed';

// ─── Onboarding Submission ───────────────────────────────
export interface OnboardingSubmission {
  id: string;
  user_id: string | null;
  new_instructor_name: string;
  email: string;
  phase1_completed: boolean;
  phase2_completed: boolean;
  phase3_completed: boolean;
  assessment_level: AssessmentLevel | null;
  overall_status: OnboardingStatus;
}

// ─── Notification ────────────────────────────────────────
export type NotificationType =
  | 'submitted'
  | 'revision_submitted'
  | 'approved'
  | 'needs_revision'
  | 'due_soon'
  | 'overdue';

export interface Notification {
  id: string;
  user_id: string;
  from_user_id: string | null;
  worksheet_id: WorksheetId;
  type: NotificationType;
  message: string;
  read: boolean;
  created_at: string;
}
