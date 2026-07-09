import { useParams } from 'react-router-dom';
import { WORKSHEET_COMPONENTS } from '../config/worksheetConfig';
import { WORKSHEET_NAMES } from '../config/worksheetConfigData';
import { t } from '../config/theme';
import { FileText } from 'lucide-react';

/**
 * WeekWorksheetPage — Renders a specific worksheet component
 * within the week-based FTP navigation.
 * The worksheet ID is passed as a route parameter.
 */
export default function WeekWorksheetPage() {
  const { worksheetId } = useParams<{ worksheetId: string }>();

  if (!worksheetId) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg }}>No worksheet specified.</p>
        </div>
      </div>
    );
  }

  const Component = WORKSHEET_COMPONENTS[worksheetId];
  if (!Component) {
    return (
      <div className="lux-section">
        <div className="lux-container" style={{ textAlign: 'center', padding: '3rem 0' }}>
          <FileText size={24} strokeWidth={1.5} style={{ color: t.wg, marginBottom: '1rem' }} />
          <p style={{ fontFamily: t.body, fontSize: '0.875rem', color: t.wg, marginBottom: '0.5rem' }}>
            Worksheet not found: <strong>{worksheetId}</strong>
          </p>
          <p style={{ fontFamily: t.body, fontSize: '0.75rem', color: t.wg }}>
            The component for this worksheet is not registered in WORKSHEET_COMPONENTS.
          </p>
        </div>
      </div>
    );
  }

  return <Component />;
}

/**
 * WeekWorksheetLabel — Returns the display label for a worksheet within a week.
 */
export function useWeekWorksheetLabel(worksheetId: string): string {
  return WORKSHEET_NAMES[worksheetId] || worksheetId;
}
