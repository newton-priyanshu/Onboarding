/* eslint-disable react-refresh/only-export-components */
import { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { WORKSHEET_COMPONENTS, WK_WORKSHEETS_MAP, getWorksheetName, getWeekWorksheetIds } from '../config/worksheetConfig';
import { t } from '../config/theme';
import { FileText } from 'lucide-react';
import { useWorksheetTemplate } from '../hooks';

interface WeekWorksheetPageProps {
  /**
   * The week number this route instance is mounted under (1-4). Passed
   * explicitly by App.tsx per-route so the worksheet can be validated
   * against the canonical week→worksheet mapping (WK_WORKSHEETS_MAP)
   * instead of trusting the worksheetId alone — this closes the gap where
   * /week-1/worksheet/w4_g1 could render week-4 content while bypassing
   * WeekAccessGuard for week 4.
   */
  weekNum: 1 | 2 | 3 | 4;
}

function NotFoundMessage({ worksheetId, reason }: { worksheetId: string; reason: string }) {
  return (
    <div className="lux-section">
      <div className="lux-container" style={{ textAlign: 'center', padding: '3rem 0' }}>
        <FileText size={24} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
        <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, marginBottom: '0.5rem' }}>
          Worksheet not found: <strong>{worksheetId}</strong>
        </p>
        <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>
          {reason}
        </p>
      </div>
    </div>
  );
}

/**
 * WeekWorksheetPage — Renders a specific worksheet component
 * within the week-based FTP navigation.
 * The worksheet ID is passed as a route parameter.
 */
export default function WeekWorksheetPage({ weekNum }: WeekWorksheetPageProps) {
  const { worksheetId } = useParams<{ worksheetId: string }>();
  const { template } = useWorksheetTemplate();

  if (!worksheetId) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>No worksheet specified.</p>
        </div>
      </div>
    );
  }

  // Validate that the requested worksheet actually belongs to this week.
  // First tries the campus template, then falls back to hardcoded WK_WORKSHEETS_MAP.
  // This prevents URL gating bypass.
  const templateWsIds = template ? getWeekWorksheetIds(weekNum, template) : null;
  const worksheetsForWeek = templateWsIds ?? (WK_WORKSHEETS_MAP[weekNum] ?? []);
  const belongsToWeek = (worksheetsForWeek as readonly string[]).includes(worksheetId);
  if (!belongsToWeek) {
    return (
      <NotFoundMessage
        worksheetId={worksheetId}
        reason={`This worksheet is not part of Week ${weekNum}.`}
      />
    );
  }

  const Component = WORKSHEET_COMPONENTS[worksheetId];
  if (!Component) {
    return (
      <NotFoundMessage
        worksheetId={worksheetId}
        reason="The component for this worksheet is not registered in WORKSHEET_COMPONENTS."
      />
    );
  }

  return (
    <Suspense fallback={<WorksheetLoading />}>
      <Component />
    </Suspense>
  );
}

/** Minimal loading state for lazy-loaded worksheets */
function WorksheetLoading() {
  return (
    <div className="lux-section">
      <div className="lux-container" style={{ maxWidth: '720px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
        <div className="lux-line" style={{ margin: '0 auto 1.5rem', width: '60px' }} />
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-warm-grey)' }}>Loading worksheet…</div>
      </div>
    </div>
  );
}

/**
 * WeekWorksheetLabel — Returns the display label for a worksheet within a week.
 */
export function useWeekWorksheetLabel(worksheetId: string): string {
  // Note: This is a simple helper — for template-aware labels, use
  // getWorksheetName(worksheetId, template) where template comes from useWorksheetTemplate().
  return getWorksheetName(worksheetId) || worksheetId;
}
