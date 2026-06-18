// ─── Phase 1, Worksheet 1: Stakeholder Mapping ──────────

export interface Stakeholder {
  name: string;
  role: string;
  team: string;
  responsibility: string;
}

export interface Conversation {
  instructorName: string;
  date: string;
  takeaways: string;
}

export interface P1W1Data {
  employeeName: string;
  department: string;
  mentorName: string;
  mentorEmail: string;
  stakeholders: Stakeholder[];
  conversations: Conversation[];
  buddyName: string;
  buddyAssignmentDate: string;
  buddyChannel: string;
  buddySyncDay: string;
  reflectionLearningFrom: string;
  status: string;
  dateSubmitted: string;
  _savedReviewStatus?: string;
}
