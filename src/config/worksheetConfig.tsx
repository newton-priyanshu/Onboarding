/* eslint-disable react-refresh/only-export-components */
// =====================================================
// worksheetConfig.tsx — React-specific re-exports
//
// Pure data/config/helper functions live in worksheetConfigData.ts
// (no React dependencies, directly testable).
// This file re-exports everything from worksheetConfigData.ts
// and adds React-dependent components (ReviewerBadge,
// WORKSHEET_COMPONENTS).
//
// All worksheet components are lazy-loaded (React.lazy) for
// automatic code-splitting. Each worksheet becomes its own
// chunk, loaded on demand.
// =====================================================

import { lazy, type ComponentType } from 'react';

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
  // Template-aware lookup helpers
  getWorksheetName,
  getWorksheetInfoById,
  getWeekWorksheetIds,
  getPhaseWorksheetIds,
  getPhaseLabel,
  getGateArtifactList,
} from './worksheetConfigData';

export type { WorksheetSubmission, UserProfile } from '../types/supabase';

import { getReviewerType, REVIEWER_LABELS, REVIEWER_STYLES } from './worksheetConfigData';

/**
 * Lazy-loaded worksheet components — each becomes its own chunk.
 *
 * Vite/Rollup uses the static import() paths to create separate output
 * chunks at build time. The modules are only fetched when the user
 * navigates to a worksheet for the first time.
 */
const Phase1Worksheet1 = lazy(() => import('../pages/worksheets/Phase1Worksheet1'));
const Phase1Worksheet2 = lazy(() => import('../pages/worksheets/Phase1Worksheet2'));
const Phase1Worksheet3 = lazy(() => import('../pages/worksheets/Phase1Worksheet3'));
const Phase1Worksheet4 = lazy(() => import('../pages/worksheets/Phase1Worksheet4'));
const Phase1Worksheet5 = lazy(() => import('../pages/worksheets/Phase1Worksheet5'));
const Phase1Worksheet6 = lazy(() => import('../pages/worksheets/Phase1Worksheet6'));
const Phase1Worksheet7 = lazy(() => import('../pages/worksheets/Phase1Worksheet7'));
const Phase1Worksheet8 = lazy(() => import('../pages/worksheets/Phase1Worksheet8'));
const Phase2Worksheet1 = lazy(() => import('../pages/worksheets/Phase2Worksheet1'));
const Phase2Worksheet2 = lazy(() => import('../pages/worksheets/Phase2Worksheet2'));
const Phase2Worksheet3 = lazy(() => import('../pages/worksheets/Phase2Worksheet3'));
const Phase2Worksheet4 = lazy(() => import('../pages/worksheets/Phase2Worksheet4'));
const Phase3Worksheet1 = lazy(() => import('../pages/worksheets/Phase3Worksheet1'));
const Phase3Worksheet2 = lazy(() => import('../pages/worksheets/Phase3Worksheet2'));
const Phase3Worksheet3 = lazy(() => import('../pages/worksheets/Phase3Worksheet3'));
const Phase3Worksheet4 = lazy(() => import('../pages/worksheets/Phase3Worksheet4'));
const Phase3Worksheet5 = lazy(() => import('../pages/worksheets/Phase3Worksheet5'));
const GateControl1 = lazy(() => import('../pages/gate-controls/GateControl1'));
const GateControl2 = lazy(() => import('../pages/gate-controls/GateControl2'));
const GateControl3 = lazy(() => import('../pages/gate-controls/GateControl3'));

// FTP New Worksheet Templates
const W1O1 = lazy(() => import('../pages/worksheets/ftp/W1O1'));
const W1E1 = lazy(() => import('../pages/worksheets/ftp/W1E1'));
const W1O2 = lazy(() => import('../pages/worksheets/ftp/W1O2'));
const W2E1 = lazy(() => import('../pages/worksheets/ftp/W2E1'));
const W2C3 = lazy(() => import('../pages/worksheets/ftp/W2C3'));
const W2D2 = lazy(() => import('../pages/worksheets/ftp/W2D2'));
const W2B1 = lazy(() => import('../pages/worksheets/ftp/W2B1'));
const W2O1 = lazy(() => import('../pages/worksheets/ftp/W2O1'));
const W3D1 = lazy(() => import('../pages/worksheets/ftp/W3D1'));
const W3D2 = lazy(() => import('../pages/worksheets/ftp/W3D2'));
const W3E1 = lazy(() => import('../pages/worksheets/ftp/W3E1'));
const W3B1 = lazy(() => import('../pages/worksheets/ftp/W3B1'));
const W4D2 = lazy(() => import('../pages/worksheets/ftp/W4D2'));
const W4E1 = lazy(() => import('../pages/worksheets/ftp/W4E1'));
const W4O1 = lazy(() => import('../pages/worksheets/ftp/W4O1'));
const W4B1 = lazy(() => import('../pages/worksheets/ftp/W4B1'));

// FTP Artifact Gate Controls
const GateArtifact1 = lazy(() => import('../pages/gate-controls/GateArtifact1'));
const GateArtifact2 = lazy(() => import('../pages/gate-controls/GateArtifact2'));
const GateArtifact3 = lazy(() => import('../pages/gate-controls/GateArtifact3'));
const GateArtifact4 = lazy(() => import('../pages/gate-controls/GateArtifact4'));

// Department worksheet components (shared generic component)
import DepartmentWorksheet from '../pages/worksheets/DepartmentWorksheet';
import type { Department } from '../types/supabase';

/** Creates a DepartmentWorksheet wrapper with fixed props */
function DeptWs(wsId: string, dept: Department, phaseNum: number) {
  const Ws = function DeptWsInner() {
    return <DepartmentWorksheet worksheetId={wsId} phase={`${dept}/phase-${phaseNum}`} backTo={`/${dept}/phase-${phaseNum}`} />;
  };
  Ws.displayName = `DeptWs_${wsId}`;
  return Ws;
}

/**
 * Map of worksheet ID → React component for dynamic worksheet routing.
 *
 * Components are lazy-loaded — each maps to a separate chunk
 * that is fetched when the worksheet is first visited.
 *
 * GateControl components need targetUserId prop, worksheets don't.
 * Using a loose prop type since these are runtime-mapped components
 * that receive props dynamically from the routing system.
 */
export const WORKSHEET_COMPONENTS: Record<string, ComponentType<Record<string, unknown>>> = {
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
  // Progression Department — Phase 1
  pr_p1_w1: DeptWs('pr_p1_w1', 'progression', 1),
  pr_p1_w2: DeptWs('pr_p1_w2', 'progression', 1),
  pr_p1_w3: DeptWs('pr_p1_w3', 'progression', 1),
  pr_p1_w4: DeptWs('pr_p1_w4', 'progression', 1),
  pr_p1_w5: DeptWs('pr_p1_w5', 'progression', 1),
  pr_p1_w6: DeptWs('pr_p1_w6', 'progression', 1),
  pr_gc1: DeptWs('pr_gc1', 'progression', 1),
  // Progression — Phase 2
  pr_p2_w1: DeptWs('pr_p2_w1', 'progression', 2),
  pr_p2_w2: DeptWs('pr_p2_w2', 'progression', 2),
  pr_p2_w3: DeptWs('pr_p2_w3', 'progression', 2),
  pr_gc2: DeptWs('pr_gc2', 'progression', 2),
  // Progression — Phase 3
  pr_p3_w1: DeptWs('pr_p3_w1', 'progression', 3),
  pr_p3_w2: DeptWs('pr_p3_w2', 'progression', 3),
  pr_p3_w3: DeptWs('pr_p3_w3', 'progression', 3),
  pr_p3_w4: DeptWs('pr_p3_w4', 'progression', 3),
  pr_gc3: DeptWs('pr_gc3', 'progression', 3),
  // Operations Department — Phase 1
  op_p1_w1: DeptWs('op_p1_w1', 'operations', 1),
  op_p1_w2: DeptWs('op_p1_w2', 'operations', 1),
  op_p1_w3: DeptWs('op_p1_w3', 'operations', 1),
  op_p1_w4: DeptWs('op_p1_w4', 'operations', 1),
  op_p1_w5: DeptWs('op_p1_w5', 'operations', 1),
  op_p1_w6: DeptWs('op_p1_w6', 'operations', 1),
  op_gc1: DeptWs('op_gc1', 'operations', 1),
  // Operations — Phase 2
  op_p2_w1: DeptWs('op_p2_w1', 'operations', 2),
  op_p2_w2: DeptWs('op_p2_w2', 'operations', 2),
  op_p2_w3: DeptWs('op_p2_w3', 'operations', 2),
  op_gc2: DeptWs('op_gc2', 'operations', 2),
  // Operations — Phase 3
  op_p3_w1: DeptWs('op_p3_w1', 'operations', 3),
  op_p3_w2: DeptWs('op_p3_w2', 'operations', 3),
  op_p3_w3: DeptWs('op_p3_w3', 'operations', 3),
  op_p3_w4: DeptWs('op_p3_w4', 'operations', 3),
  op_gc3: DeptWs('op_gc3', 'operations', 3),
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
