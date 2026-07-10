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

// ─── FTP Engine Tags (K = Knowledge gap, B = Behaviour gap) ─
export type EngineTag = 'K' | 'B';

// ─── FTP Week Numbers ────────────────────────────────────
export type FtpWeek = 1 | 2 | 3 | 4;

// ─── FTP Track Names ─────────────────────────────────────
export type FtpTrack = 'Culture' | 'Product' | 'Content' | 'Delivery' | 'Evaluation' | 'Operations';

// ─── Worksheet IDs (all known worksheets, legacy + FTP) ───
export type WorksheetId =
  // Legacy Phase 1 — Orientation
  | 'p1_w1' | 'p1_w2' | 'p1_w3' | 'p1_w4' | 'p1_w5'
  | 'p1_w6' | 'p1_w7' | 'p1_w8'
  // Legacy Phase 2 — Contribution
  | 'p2_w1' | 'p2_w2' | 'p2_w3' | 'p2_w4'
  // Legacy Phase 3 — Ownership
  | 'p3_w1' | 'p3_w2' | 'p3_w3' | 'p3_w4' | 'p3_w5'
  // Legacy Gate Controls
  | 'gc1' | 'gc2' | 'gc3'
  // FTP Week 1 — Anchor (Observe begins)
  | 'w1_a1' | 'w1_o1' | 'w1_o2' | 'w1_e1' | 'w1_g1'
  // FTP Week 2 — Co-create (Observe deepens)
  | 'w2_e1' | 'w2_c3' | 'w2_d2' | 'w2_b1' | 'w2_o1' | 'w2_g1'
  // FTP Week 3 — Co-deliver begins
  | 'w3_d1' | 'w3_d2' | 'w3_e1' | 'w3_b1' | 'w3_g1'
  // FTP Week 4 — Co-deliver closes, Independence review
  | 'w4_d2' | 'w4_e1' | 'w4_o1' | 'w4_b1' | 'w4_g1';

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
export type SubmissionStatus = 'Not Started' | 'In Progress' | 'submitted' | 'Reviewed';

// ─── Engine Tag Info for a session ───────────────────────
export interface EngineTagInfo {
  tag: EngineTag;
  label: string;
  description: string;
}

// ─── FTP Session Entry ────────────────────────────────────
export interface FtpSession {
  sessionId: string;         // e.g. 'W1-A1'
  week: FtpWeek;
  track: FtpTrack;
  engineTag: EngineTag;
  title: string;
  subtitle: string;
  worksheetId?: WorksheetId; // Maps to existing or new worksheet
  isNew?: boolean;           // True if this is a new worksheet that needs a component
  isGate?: boolean;
  artifacts?: string[];      // For gates: list of required artifacts
  suggestedFacilitator?: string;
}

// ─── Review History Entry ────────────────────────────────
export interface ReviewHistoryEntry {
  action: 'approved' | 'needs_revision' | 'buddy_approved' | 'phase_approved';
  reviewer_name: string;
  reviewer_id: string;
  comment: string | null;
  timestamp: string;
}

// ─── Peer Review Entry ───────────────────────────────────
export interface PeerReviewEntry {
  peer_name: string;
  peer_id: string;
  rating: number;           // 1-5 scale
  comment: string;
  criteria_met: string[];
  criteria_unmet: string[];
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
