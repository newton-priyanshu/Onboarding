export { supabase, withCampus, withCampusIf } from './supabase';
export {
  getCurrentCampusFromPath,
  withCampusPath,
  getCampusBySlug,
  campusSlugExists,
  getActiveCampuses,
} from './tenant';
export {
  checkPermission,
  getRolePermissions,
  hasAnyPermission,
  hasAllPermissions,
  checkDefaultPermission,
  invalidatePermissionsCache,
} from './permissions';

export {
  getCampusTemplate,
  getCampusTemplates,
  invalidateTemplateCache,
  parseTemplateStructure,
  getTemplateWeeks,
  getWeek,
  getWeekWorksheets,
  getWorksheetEntry,
  getTemplatePhases,
  getPhase,
  getPhaseWorksheetIds,
  getGateArtifacts,
  getAllGateArtifacts,
  getApprovalChain,
  isReviewerInChain,
  getWorksheetTitle,
  getWorksheetReviewer,
  getWorksheetEngineTag,
  isGateWorksheet,
  resolveReviewer,
  validateTemplateStructure,
} from './templates';

export type {
  TemplateWorksheetEntry,
  TemplateWeekEntry,
  TemplatePhaseEntry,
  GateArtifactEntry,
  ParsedTemplateStructure,
} from './templates';

// validateCampusAccess available via tenant.ts for future Phase 8 route migration

