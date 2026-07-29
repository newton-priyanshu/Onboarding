import { Link, useLocation } from 'react-router-dom';
import { t } from '../config/theme';
import { WORKSHEET_NAMES } from '../config/worksheetConfigData';
import { PHASE_LABELS } from '../config/worksheetConfigData';
import { ChevronRight } from 'lucide-react';

// ─── Route-to-Label Mapping ────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  'phase-1': 'Phase 1: Orientation',
  'phase-2': 'Phase 2: Contribution',
  'phase-3': 'Phase 3: Ownership',
  admin: 'Admin Dashboard',
  'admin/users': 'User Management',
  'admin/reports': 'Reports',
  'admin/settings': 'Settings',
  buddy: 'Buddy Dashboard',
  'onboarding-lead': 'Onboarding Lead',
  stakeholders: 'Stakeholders',
  notifications: 'Notifications',
  assessment: 'Assessment',
  'campus-head': 'Campus Head Overview',
  progression: 'Progression Department',
  operations: 'Operations Department',
};

const DEPT_LABELS: Record<string, string> = {
  progression: 'Progression',
  operations: 'Operations',
};

interface BreadcrumbItem {
  label: string;
  path: string;
  isLast: boolean;
}

// ─── Helpers ────────────────────────────────────────────

/** Extract path segments, filtering out the campus slug and route params */
function getSegments(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean);

  // First segment is always the campus slug — skip it
  const segments = parts.slice(1);

  // Filter out route params: UUIDs, numeric-only, and segments after known param prefixes
  const PARAM_PREFIXES = new Set(['review', 'gate-pass', 'review-phase']);
  const result: string[] = [];
  let skipNext = false;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    // Skip segments that look like route params
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (isRouteParam(seg)) {
      continue;
    }

    // Check if this segment is a param prefix — skip the next segment
    if (PARAM_PREFIXES.has(seg)) {
      result.push(seg);
      skipNext = true;
      continue;
    }

    result.push(seg);
  }

  return result;
}

/** Check if a path segment looks like a route parameter (UUID, numeric, or "id"-like) */
function isRouteParam(seg: string): boolean {
  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  // Numeric-only (e.g., phase numbers used as params like /review-phase/:userId/:phaseNum)
  if (/^\d+$/.test(seg)) return true;
  // Ends in "-id" or "Id" like userId, campusId
  if (/^[a-zA-Z]+[Ii][Dd]$/.test(seg)) return true;
  return false;
}

/** Humanize a path segment into a readable label */
function humanizeSegment(seg: string): string {
  return seg
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Component ──────────────────────────────────────────

export default function Breadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname;

  // Don't show breadcrumbs on flat auth routes or root
  const FLAT_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback', '/select-campus', '/super-admin'];
  if (FLAT_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

  const segments = getSegments(pathname);
  if (segments.length === 0) return null;

  // Build breadcrumb items
  const items: BreadcrumbItem[] = [];

  // Root — always "Dashboard"
  items.push({
    label: 'Dashboard',
    path: '/',
    isLast: false,
  });

  let currentPath = '/';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const isLast = i === segments.length - 1;

    // Build the cumulative path
    currentPath = currentPath === '/' ? `/${seg}` : `${currentPath}/${seg}`;

    // Determine label
    let label = '';

    // Check route labels map
    const routeKey = segments.slice(0, i + 1).join('/');
    if (ROUTE_LABELS[routeKey]) {
      label = ROUTE_LABELS[routeKey];
    }
    // Check department prefix
    else if (DEPT_LABELS[seg]) {
      label = DEPT_LABELS[seg];
    }
    // Check if it's a worksheet ID
    else if (WORKSHEET_NAMES[seg]) {
      label = WORKSHEET_NAMES[seg] as string;
    }
    // Check if it's a worksheet route like '/phase-1/worksheet-1'
    else if (seg.startsWith('worksheet-')) {
      const wsNum = seg.replace('worksheet-', '');
      // Try to find the worksheet ID from adjacent phase segment
      const phaseSeg = segments[i - 1];
      if (phaseSeg) {
        const phaseNum = phaseSeg.replace('phase-', '');
        // Look up common worksheet IDs for this phase
        const candidateId = `p${phaseNum}_w${wsNum}`;
        label = WORKSHEET_NAMES[candidateId] || `Worksheet ${wsNum}`;
      } else {
        label = `Worksheet ${wsNum}`;
      }
    }
    // Check if it's a phase page like 'phase-1', 'phase-2'
    else if (seg.startsWith('phase-')) {
      const phaseNum = seg.replace('phase-', '');
      const phaseLabel = PHASE_LABELS[Number(phaseNum)];
      label = phaseLabel?.title || `Phase ${phaseNum}`;
    }
    // Check if it's a week page
    else if (seg.startsWith('week-')) {
      const weekNum = seg.replace('week-', '');
      label = `Week ${weekNum}`;
    }
    // Check if it's a review route
    else if (seg === 'review' && i > 0) {
      label = 'Review';
    }
    else if (seg === 'gate-pass' && i > 0) {
      label = 'Gate Pass';
    }
    else if (seg === 'review-phase' && i > 0) {
      label = 'Phase Review';
    }
    // Default: humanize
    else {
      label = humanizeSegment(seg);
    }

    items.push({ label, path: currentPath, isLast });
  }

  // Mark the last item
  if (items.length > 0) {
    items[items.length - 1]!.isLast = true;
  }

  // Don't show breadcrumbs when there's only "Dashboard"
  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" style={{
      padding: '0.75rem 0 0',
      fontFamily: t.body,
      fontSize: '0.65rem',
      letterSpacing: '0.02em',
    }}>
      <div className="lux-container" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <ol style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          listStyle: 'none', margin: 0, padding: 0,
          flexWrap: 'wrap',
        }}>
          {items.map((item, idx) => (
            <li key={item.path} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              {idx > 0 && (
                <ChevronRight size={10} strokeWidth={1.5} style={{
                  color: 'var(--color-warm-grey)', opacity: 0.4,
                  flexShrink: 0,
                }} aria-hidden="true" />
              )}
              {item.isLast ? (
                <span style={{
                  color: 'var(--color-charcoal)',
                  fontWeight: 500,
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                }} aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  style={{
                    color: 'var(--color-warm-grey)',
                    textDecoration: 'none',
                    transition: 'color 200ms var(--ease-lux)',
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                  }}
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--color-charcoal)'; }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--color-warm-grey)'; }}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
