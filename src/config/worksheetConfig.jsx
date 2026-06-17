// =====================================================
// worksheetConfig.jsx — React-specific re-exports
//
// Pure data/config/helper functions live in worksheetConfig.js
// (no React dependencies, directly testable).
// This file re-exports everything from worksheetConfig.js
// and adds React-dependent components (ReviewerBadge,
// WORKSHEET_COMPONENTS).
// =====================================================

export {
  WORKSHEET_REVIEWER,
  REVIEWER_LABELS,
  REVIEWER_STYLES,
  REVIEWER_ICONS,
  ALL_WORKSHEETS,
  WORKSHEET_INFO,
  getReviewerType,
  PHASE_WORKSHEETS_MAP,
  getPhaseReviewStatus,
  getBuddyApprovedSheets,
  getPhaseWorksheetsByStatus,
  getWorksheetsForReviewer,
  getReviewerLabel,
} from './worksheetConfigData.js';

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

import { getReviewerType, REVIEWER_LABELS, REVIEWER_STYLES } from './worksheetConfigData.js';

/**
 * Map of worksheet ID → React component for dynamic worksheet routing.
 */
export const WORKSHEET_COMPONENTS = {
  p1_w1: Phase1Worksheet1, p1_w2: Phase1Worksheet2, p1_w3: Phase1Worksheet3,
  p1_w4: Phase1Worksheet4, p1_w5: Phase1Worksheet5, p1_w6: Phase1Worksheet6,
  p1_w7: Phase1Worksheet7, p1_w8: Phase1Worksheet8, gc1: GateControl1,
  p2_w1: Phase2Worksheet1, p2_w2: Phase2Worksheet2, p2_w3: Phase2Worksheet3,
  p2_w4: Phase2Worksheet4, gc2: GateControl2,
  p3_w1: Phase3Worksheet1, p3_w2: Phase3Worksheet2, p3_w3: Phase3Worksheet3,
  p3_w4: Phase3Worksheet4, p3_w5: Phase3Worksheet5, gc3: GateControl3,
};

/**
 * ReviewerBadge — Shows the reviewer type for a worksheet.
 * Renders with Luxury/Editorial styling (0px radius, uppercase tracking).
 */
export function ReviewerBadge({ worksheetId, style: extraStyle = {} }) {
  const type = getReviewerType(worksheetId);
  const style = REVIEWER_STYLES[type];
  const label = REVIEWER_LABELS[type];
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
