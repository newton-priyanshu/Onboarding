// =====================================================
// worksheetConfig.tsx — React-specific re-exports
//
// Pure data/config/helper functions live in worksheetConfigData.ts
// (no React dependencies, directly testable).
// This file re-exports everything from worksheetConfigData.ts
// and adds React-dependent components (ReviewerBadge,
// WORKSHEET_COMPONENTS).
// =====================================================

import type { FC } from 'react';

export {
  WORKSHEET_REVIEWER,
  REVIEWER_LABELS,
  REVIEWER_STYLES,
  REVIEWER_ICONS,
  ALL_WORKSHEETS,
  WORKSHEET_INFO,
  WORKSHEET_NAMES,
  PHASE_LABELS,
  getReviewerType,
  PHASE_WORKSHEETS_MAP,
  getPhaseReviewStatus,
  getBuddyApprovedSheets,
  getPhaseWorksheetsByStatus,
  getWorksheetsForReviewer,
  getReviewerLabel,
  isPhaseApproved,
  getApprovedPhases,
  getMaxAccessiblePhase,
  canAccessPhase,
  WK_WORKSHEETS_MAP,
} from './worksheetConfigData';

export type { WorksheetSubmission, UserProfile } from '../types/supabase';

import Phase1Worksheet1 from '../pages/worksheets/Phase1Worksheet1';
import Phase1Worksheet2 from '../pages/worksheets/Phase1Worksheet2';
import Phase1Worksheet3 from '../pages/worksheets/Phase1Worksheet3';
import Phase1Worksheet4 from '../pages/worksheets/Phase1Worksheet4';
import Phase1Worksheet5 from '../pages/worksheets/Phase1Worksheet5';
import Phase1Worksheet6 from '../pages/worksheets/Phase1Worksheet6';
import Phase1Worksheet7 from '../pages/worksheets/Phase1Worksheet7';
import Phase1Worksheet8 from '../pages/worksheets/Phase1Worksheet8';
import Phase2Worksheet1 from '../pages/worksheets/Phase2Worksheet1';
import Phase2Worksheet2 from '../pages/worksheets/Phase2Worksheet2';
import Phase2Worksheet3 from '../pages/worksheets/Phase2Worksheet3';
import Phase2Worksheet4 from '../pages/worksheets/Phase2Worksheet4';
import Phase3Worksheet1 from '../pages/worksheets/Phase3Worksheet1';
import Phase3Worksheet2 from '../pages/worksheets/Phase3Worksheet2';
import Phase3Worksheet3 from '../pages/worksheets/Phase3Worksheet3';
import Phase3Worksheet4 from '../pages/worksheets/Phase3Worksheet4';
import Phase3Worksheet5 from '../pages/worksheets/Phase3Worksheet5';
import GateControl1 from '../pages/gate-controls/GateControl1';
import GateControl2 from '../pages/gate-controls/GateControl2';
import GateControl3 from '../pages/gate-controls/GateControl3';
// FTP New Worksheet Templates
import W1O1 from '../pages/worksheets/ftp/W1O1';
import W1E1 from '../pages/worksheets/ftp/W1E1';
import W1O2 from '../pages/worksheets/ftp/W1O2';
import W2E1 from '../pages/worksheets/ftp/W2E1';
import W2C3 from '../pages/worksheets/ftp/W2C3';
import W2D2 from '../pages/worksheets/ftp/W2D2';
import W2B1 from '../pages/worksheets/ftp/W2B1';
import W2O1 from '../pages/worksheets/ftp/W2O1';
import W3D1 from '../pages/worksheets/ftp/W3D1';
import W3D2 from '../pages/worksheets/ftp/W3D2';
import W3E1 from '../pages/worksheets/ftp/W3E1';
import W3B1 from '../pages/worksheets/ftp/W3B1';
import W4D2 from '../pages/worksheets/ftp/W4D2';
import W4E1 from '../pages/worksheets/ftp/W4E1';
import W4O1 from '../pages/worksheets/ftp/W4O1';
import W4B1 from '../pages/worksheets/ftp/W4B1';
// FTP Artifact Gate Controls
import GateArtifact1 from '../pages/gate-controls/GateArtifact1';
import GateArtifact2 from '../pages/gate-controls/GateArtifact2';
import GateArtifact3 from '../pages/gate-controls/GateArtifact3';
import GateArtifact4 from '../pages/gate-controls/GateArtifact4';

import { getReviewerType, REVIEWER_LABELS, REVIEWER_STYLES } from './worksheetConfigData';

/**
 * Map of worksheet ID → React component for dynamic worksheet routing.
 */
// GateControl components need targetUserId prop, worksheets don't.
// Using a loose prop type since these are runtime-mapped components
// that receive props dynamically from the routing system.
export const WORKSHEET_COMPONENTS: Record<string, FC<Record<string, unknown>>> = {
  p1_w1: Phase1Worksheet1, p1_w2: Phase1Worksheet2, p1_w3: Phase1Worksheet3,
  p1_w4: Phase1Worksheet4, p1_w5: Phase1Worksheet5, p1_w6: Phase1Worksheet6,
  p1_w7: Phase1Worksheet7, p1_w8: Phase1Worksheet8, gc1: GateControl1,
  p2_w1: Phase2Worksheet1, p2_w2: Phase2Worksheet2, p2_w3: Phase2Worksheet3,
  p2_w4: Phase2Worksheet4, gc2: GateControl2,
  p3_w1: Phase3Worksheet1, p3_w2: Phase3Worksheet2, p3_w3: Phase3Worksheet3,
  p3_w4: Phase3Worksheet4, p3_w5: Phase3Worksheet5, gc3: GateControl3,
  // FTP Week 1
  w1_o1: W1O1, w1_e1: W1E1, w1_o2: W1O2, w1_g1: GateArtifact1,
  // FTP Week 2
  w2_e1: W2E1, w2_c3: W2C3, w2_d2: W2D2, w2_b1: W2B1, w2_o1: W2O1, w2_g1: GateArtifact2,
  // FTP Week 3
  w3_d1: W3D1, w3_d2: W3D2, w3_e1: W3E1, w3_b1: W3B1, w3_g1: GateArtifact3,
  // FTP Week 4
  w4_d2: W4D2, w4_e1: W4E1, w4_o1: W4O1, w4_b1: W4B1, w4_g1: GateArtifact4,
};

interface ReviewerBadgeProps {
  worksheetId: string;
  style?: React.CSSProperties;
}

/**
 * ReviewerBadge — Shows the reviewer type for a worksheet.
 * Renders with Luxury/Editorial styling (0px radius, uppercase tracking).
 */
export function ReviewerBadge({ worksheetId, style: extraStyle = {} }: ReviewerBadgeProps) {
  const type = getReviewerType(worksheetId);
  const style = REVIEWER_STYLES[type]!;
  const label = REVIEWER_LABELS[type] || 'Reviewer';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 0,
      border: '1px solid ' + style.color,
      color: style.color,
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)',
      ...extraStyle,
    }}>
      {label}
    </span>
  );
}
