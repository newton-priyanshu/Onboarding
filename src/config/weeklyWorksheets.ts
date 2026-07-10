/**
 * Shared weekly worksheet metadata — single source of truth.
 * Eliminates duplicate worksheet arrays across Phase1.tsx and Week1-4.tsx.
 * Each week's worksheets are defined here and imported by both page types.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Monitor, Eye, BookText, Search, ClipboardList, Shield,
  Layers, FileEdit, Mic, Clock, MessageSquare, ClipboardCheck,
  Sword, MessageCircle, Users, BarChart, Heart,
} from 'lucide-react';

export interface WorksheetMeta {
  id: string;
  num: number;
  path: string;
  title: string;
  icon: LucideIcon;
  desc: string;
}

export const week1Worksheets: WorksheetMeta[] = [
  { id: 'p1_w5', num: 1, path: '/week-1/worksheet/p1_w5', title: 'Systems & Platform Walkthrough', icon: Monitor, desc: 'Product orientation — how the platform works end-to-end.' },
  { id: 'p1_w6', num: 2, path: '/week-1/worksheet/p1_w6', title: 'Structured Observation — Recorded Lectures', icon: Eye, desc: '3 recorded lectures with TLAC-lens observation sheet.' },
  { id: 'p1_w3', num: 3, path: '/week-1/worksheet/p1_w3', title: 'Culture-in-Delivery Opening', icon: BookText, desc: 'What NST believes about teaching — no student left behind.' },
  { id: 'w1_o1', num: 4, path: '/week-1/worksheet/w1_o1', title: 'Day 1 Logistics & Access', icon: ClipboardList, desc: 'Access verification, buddy contact, comms channels.' },
  { id: 'w1_e1', num: 5, path: '/week-1/worksheet/w1_e1', title: 'Contest Guidelines V3 Pre-read', icon: BookText, desc: 'Read Contest Guidelines V3 for W2-E1 receptivity build.' },
  { id: 'w1_o2', num: 6, path: '/week-1/worksheet/w1_o2', title: 'Playbook Scavenger Exercise', icon: Search, desc: 'Find-the-answer sheet across Playbook §1 to §5.' },
  { id: 'w1_g1', num: 7, path: '/week-1/worksheet/w1_g1', title: 'Gate 1 — Anchor Artifacts', icon: Shield, desc: 'Operational check, observation logs, scavenger sheet, reflection #0.' },
];

export const week2Worksheets: WorksheetMeta[] = [
  { id: 'p2_w3', num: 1, path: '/week-2/worksheet/p2_w3', title: 'Question Creation Mechanics', icon: FileEdit, desc: 'MCQ, coding, components, playgrounds — how to build them.' },
  { id: 'p1_w7', num: 2, path: '/week-2/worksheet/p1_w7', title: 'The Quality Standard', icon: ClipboardCheck, desc: 'Solved-by-creator, peer review, silent vs loud errors.' },
  { id: 'p1_w6', num: 3, path: '/week-2/worksheet/p1_w6', title: 'Recorded Lectures — TLAC Lens', icon: Eye, desc: '2 more recorded lectures, technique-spotting with TLAC 3.0.' },
  { id: 'w2_e1', num: 4, path: '/week-2/worksheet/w2_e1', title: "Bloom's Two-Pens Session", icon: Layers, desc: 'Tag real past questions using Bloom\'s Taxonomy v4.' },
  { id: 'w2_c3', num: 5, path: '/week-2/worksheet/w2_c3', title: 'Create & Peer Review', icon: FileEdit, desc: '3 MCQs + 2 coding questions; review a peer\'s set.' },
  { id: 'w2_d2', num: 6, path: '/week-2/worksheet/w2_d2', title: 'Micro-Teach #1', icon: Mic, desc: '10-minute segment to 3 peers — rubric-lite feedback.' },
  { id: 'w2_b1', num: 7, path: '/week-2/worksheet/w2_b1', title: 'Discipline Consistency', icon: Shield, desc: 'Customise your classroom discipline approach.' },
  { id: 'w2_o1', num: 8, path: '/week-2/worksheet/w2_o1', title: 'Invigilation & Exam Formalities', icon: ClipboardCheck, desc: 'Policy walkthrough plus scenario sheet.' },
  { id: 'w2_g1', num: 9, path: '/week-2/worksheet/w2_g1', title: 'Gate 2 — Co-create Artifacts', icon: Shield, desc: 'Q set, peer reviews, Bloom\'s tagging, discipline sheet.' },
];

export const week3Worksheets: WorksheetMeta[] = [
  { id: 'p2_w1', num: 1, path: '/week-3/worksheet/p2_w1', title: 'Engagement & Active Learning', icon: MessageSquare, desc: 'The "did you understand" anti-pattern — mirror moments inside K sessions.' },
  { id: 'p2_w2', num: 2, path: '/week-3/worksheet/p2_w2', title: 'Demo Dry-Run', icon: ClipboardCheck, desc: '30–40 min to peer classroom, observed on TLAC-based rubric.' },
  { id: 'p2_w4', num: 3, path: '/week-3/worksheet/p2_w4', title: 'Slot Creation & Attendance Flow', icon: FileEdit, desc: 'Hands-on with scheduling and attendance systems.' },
  { id: 'p3_w5', num: 4, path: '/week-3/worksheet/p3_w5', title: 'Build Full Lecture Package', icon: FileEdit, desc: 'Slides, quiz, assignment, notes for first real week.' },
  { id: 'w3_d1', num: 5, path: '/week-3/worksheet/w3_d1', title: 'Classroom Tech Hands-on', icon: Monitor, desc: 'Projectors, pentabs, portal joining, recording.' },
  { id: 'w3_d2', num: 6, path: '/week-3/worksheet/w3_d2', title: 'Planning & Time Management', icon: Clock, desc: '10-minute window planning, pacing, transitions.' },
  { id: 'w3_e1', num: 7, path: '/week-3/worksheet/w3_e1', title: 'Design Mini-Contest', icon: Sword, desc: '12-question contest against V3 + Bloom distribution.' },
  { id: 'w3_b1', num: 8, path: '/week-3/worksheet/w3_b1', title: 'Student Dialoguing Rehearsal', icon: MessageCircle, desc: 'At-risk 1:1s, rule challenges, "this is basic" moments.' },
  { id: 'w3_g1', num: 9, path: '/week-3/worksheet/w3_g1', title: 'Gate 3 — Co-deliver Artifacts', icon: Shield, desc: 'Demo rubric, lecture package v1, mini-contest L1 pass.' },
];

export const week4Worksheets: WorksheetMeta[] = [
  { id: 'p3_w1', num: 1, path: '/week-4/worksheet/p3_w1', title: 'Demo Final', icon: Users, desc: 'Feedback incorporated, Course Lead sign-off per A.7.' },
  { id: 'w4_d2', num: 2, path: '/week-4/worksheet/w4_d2', title: 'Co-Teach / Mock Classroom', icon: Users, desc: 'Live co-teach or mock classroom with edge-case scenarios.' },
  { id: 'p3_w5', num: 3, path: '/week-4/worksheet/p3_w5', title: 'Lecture Package v2 — Final Approval', icon: ClipboardCheck, desc: '20% rule: if reviewer edits >20%, fix the checklist.' },
  { id: 'w4_e1', num: 4, path: '/week-4/worksheet/w4_e1', title: 'Post-Contest Analysis & Calibration', icon: BarChart, desc: 'Predict solve rates, compare to actuals, write calibration note.' },
  { id: 'w4_o1', num: 5, path: '/week-4/worksheet/w4_o1', title: 'Pre-Semester Checklist', icon: ClipboardCheck, desc: 'Complete T-2-week checklist for your first teaching week.' },
  { id: 'w4_b1', num: 6, path: '/week-4/worksheet/w4_b1', title: 'Why We Reflect', icon: Heart, desc: 'Reflection cycle #1 — ownership & commitment ceremony.' },
  { id: 'w4_g1', num: 7, path: '/week-4/worksheet/w4_g1', title: 'Gate 4 — Independence Readiness', icon: Shield, desc: 'Final artifact review and independence sign-off.' },
];
