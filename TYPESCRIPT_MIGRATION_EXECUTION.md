# TypeScript Migration — Execution Plan (10 Phases × 10 Tasks)

## Progress Tracking

**Phase 1:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Foundation & Config Types
**Phase 2:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Utility Files & Small Components
**Phase 3:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Hooks
**Phase 4:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Context & API
**Phase 5:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Simple Pages (Login, Signup, AuthCallback, NotFound, Stakeholders, Assessment)
**Phase 6:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Dashboard Pages (Dashboard, AdminDashboard, BuddyDashboard, OnboardingLeadDashboard)
**Phase 7:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Review Pages (WorksheetReview, PhaseReview, ReviewContent)
**Phase 8:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Phase Pages (Phase1, Phase2, Phase3) + Gate Controls
**Phase 9:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Phase 1 Worksheets (p1_w1..p1_w8)
**Phase 10:** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ (0/10) — Phase 2&3 Worksheets + Gate Controls + Cleanup

---

## Phase 1: Foundation & Config Types (10 tasks)

- [ ] 1.1 Create tsconfig.json (DONE)
- [ ] 1.2 Create src/vite-env.d.ts (DONE)
- [ ] 1.3 Update vite.config.js with path aliases (DONE)
- [ ] 1.4 Create src/types/supabase.ts (DONE)
- [ ] 1.5 Create src/types/worksheet.ts (DONE)
- [ ] 1.6 Create src/types/index.ts barrel export
- [ ] 1.7 Create src/types/config.ts — config-specific types
- [ ] 1.8 Create src/types/worksheets/p1_w1.ts — first worksheet type
- [ ] 1.9 Create src/types/worksheets/index.ts — worksheet barrel export
- [ ] 1.10 Rename config files that have no JSX: src/config/worksheetConfigData.js → .ts
       Verify `tsc --noEmit` passes

## Phase 2: Utility Files & Small Components (10 tasks)

- [ ] 2.1 Convert src/utils/errorHandling.js → .ts
- [ ] 2.2 Convert src/context/ProjectInfo.js → .ts
- [ ] 2.3 Convert src/components/SaveIndicator.jsx → .tsx
- [ ] 2.4 Convert src/components/Toast.jsx → .tsx
- [ ] 2.5 Convert src/components/ErrorBoundary.jsx → .tsx
- [ ] 2.6 Convert src/components/ProtectedRoute.jsx → .tsx
- [ ] 2.7 Convert src/config/worksheetConfig.jsx → .ts
- [ ] 2.8 Convert src/config/worksheetComponents.jsx → .tsx
- [ ] 2.9 Convert src/components/NotificationBell.jsx → .tsx
- [ ] 2.10 Convert src/components/Navbar.jsx → .tsx
       Verify: `tsc --noEmit` passes, `vite build` succeeds

## Phase 3: Hooks (10 tasks)

- [ ] 3.1 Convert src/hooks/useAutoSave.js → .ts
- [ ] 3.2 Convert src/hooks/useAutoPromote.js → .ts
- [ ] 3.3 Convert src/hooks/useDueDates.js → .ts
- [ ] 3.4 Convert src/hooks/useNotifications.js → .ts
- [ ] 3.5 Convert src/hooks/useWorksheet.js → .ts
- [ ] 3.6 Convert src/hooks/__tests__/useAutoSave.test.js → .ts
- [ ] 3.7 Convert src/hooks/__tests__/useAutoPromote.test.js → .ts
- [ ] 3.8 Convert src/hooks/__tests__/useDueDates.test.js → .ts
- [ ] 3.9 Convert src/hooks/__tests__/useNotifications.test.js → .ts
- [ ] 3.10 Convert src/hooks/__tests__/reviewFlow.test.js → .ts
       Verify: `tsc --noEmit` passes, `vitest run` passes, `vite build` succeeds

## Phase 4: Context & API (10 tasks)

- [ ] 4.1 Convert src/api/supabase.js → .ts
- [ ] 4.2 Convert src/context/AuthContext.jsx → .tsx
- [ ] 4.3 Convert src/main.jsx → .tsx
- [ ] 4.4 Convert src/App.jsx → .tsx (part 1: imports, routes)
- [ ] 4.5 Convert src/App.jsx → .tsx (part 2: full conversion)
- [ ] 4.6 Update src/api/index.js → .ts with type exports
- [ ] 4.7 Update src/hooks/index.js → .ts barrel export
- [ ] 4.8 Update src/config/index.js → .ts barrel export
- [ ] 4.9 Update src/utils/index.js → .ts barrel export
- [ ] 4.10 Fix all import paths across codebase for .ts/.tsx extensions
       Verify: `tsc --noEmit` passes, `vite build` succeeds

## Phase 5: Simple Pages (10 tasks)

- [ ] 5.1 Convert src/pages/Login.jsx → .tsx
- [ ] 5.2 Convert src/pages/Signup.jsx → .tsx
- [ ] 5.3 Convert src/pages/AuthCallback.jsx → .tsx
- [ ] 5.4 Convert src/pages/NotFound.jsx → .tsx
- [ ] 5.5 Convert src/pages/Stakeholders.jsx → .tsx
- [ ] 5.6 Convert src/pages/Assessment.jsx → .tsx
- [ ] 5.7 Verify Assessment — fix any type issues
- [ ] 5.8 Fix cross-file import references from converted pages
- [ ] 5.9 Run full type-check and fix remaining errors
- [ ] 5.10 Run build to verify
       Verify: `tsc --noEmit` passes, `vite build` succeeds

## Phase 6: Dashboard Pages (10 tasks)

- [ ] 6.1 Convert src/pages/Dashboard.jsx → .tsx
- [ ] 6.2 Convert src/pages/AdminDashboard.jsx → .tsx (part 1)
- [ ] 6.3 Convert src/pages/AdminDashboard.jsx → .tsx (part 2)
- [ ] 6.4 Convert src/pages/BuddyDashboard.jsx → .tsx
- [ ] 6.5 Convert src/pages/BuddyGatePass.jsx → .tsx (already new)
- [ ] 6.6 Convert src/pages/OnboardingLeadDashboard.jsx → .tsx
- [ ] 6.7 Add types for dashboard-specific data transformations
- [ ] 6.8 Fix cross-file import references
- [ ] 6.9 Run full type-check and fix remaining errors
- [ ] 6.10 Run build to verify
       Verify: `tsc --noEmit` passes, `vite build` succeeds

## Phase 7: Review Pages (10 tasks)

- [ ] 7.1 Convert src/components/ReviewContent.jsx → .tsx (part 1: types, FIELD_SECTIONS)
- [ ] 7.2 Convert src/components/ReviewContent.jsx → .tsx (part 2: renderField, MilestonesRenderer)
- [ ] 7.3 Convert src/pages/WorksheetReview.jsx → .tsx (part 1: general structure)
- [ ] 7.4 Convert src/pages/WorksheetReview.jsx → .tsx (part 2: review actions)
- [ ] 7.5 Convert src/pages/PhaseReview.jsx → .tsx
- [ ] 7.6 Add type for review workflows
- [ ] 7.7 Add type for review state machine
- [ ] 7.8 Fix cross-file import references
- [ ] 7.9 Run full type-check and fix remaining errors
- [ ] 7.10 Run build + tests to verify
       Verify: `tsc --noEmit` passes, `vitest run` passes, `vite build` succeeds

## Phase 8: Phase Pages & Gate Controls (10 tasks)

- [ ] 8.1 Convert src/pages/Phase1.jsx → .tsx
- [ ] 8.2 Convert src/pages/Phase2.jsx → .tsx
- [ ] 8.3 Convert src/pages/Phase3.jsx → .tsx
- [ ] 8.4 Convert src/pages/gate-controls/GateControl1.jsx → .tsx
- [ ] 8.5 Convert src/pages/gate-controls/GateControl2.jsx → .tsx
- [ ] 8.6 Convert src/pages/gate-controls/GateControl3.jsx → .tsx
- [ ] 8.7 Add gate control specific types
- [ ] 8.8 Fix cross-file import references
- [ ] 8.9 Run full type-check and fix remaining errors
- [ ] 8.10 Run build to verify
       Verify: `tsc --noEmit` passes, `vite build` succeeds

## Phase 9: Phase 1 Worksheets (10 tasks)

- [ ] 9.1 Convert Phase1Worksheet1.jsx → .tsx
- [ ] 9.2 Convert Phase1Worksheet2.jsx → .tsx
- [ ] 9.3 Convert Phase1Worksheet3.jsx → .tsx
- [ ] 9.4 Convert Phase1Worksheet4.jsx → .tsx
- [ ] 9.5 Convert Phase1Worksheet5.jsx → .tsx
- [ ] 9.6 Convert Phase1Worksheet6.jsx → .tsx
- [ ] 9.7 Convert Phase1Worksheet7.jsx → .tsx
- [ ] 9.8 Convert Phase1Worksheet8.jsx → .tsx
- [ ] 9.9 Add per-worksheet type definitions
- [ ] 9.10 Run type-check + build to verify
       Verify: `tsc --noEmit` passes, `vite build` succeeds

## Phase 10: Phase 2&3 Worksheets + Gate Controls + Cleanup (10 tasks)

- [ ] 10.1 Convert Phase2Worksheet1.jsx → .tsx
- [ ] 10.2 Convert Phase2Worksheet2.jsx → .tsx
- [ ] 10.3 Convert Phase2Worksheet3.jsx → .tsx
- [ ] 10.4 Convert Phase2Worksheet4.jsx → .tsx
- [ ] 10.5 Convert Phase3Worksheet1.jsx → .tsx
- [ ] 10.6 Convert Phase3Worksheet2.jsx → .tsx
- [ ] 10.7 Convert Phase3Worksheet3.jsx → .tsx
- [ ] 10.8 Convert Phase3Worksheet4.jsx → .tsx
- [ ] 10.9 Convert Phase3Worksheet5.jsx → .tsx
- [ ] 10.10 Final cleanup: remove barrel files + style.css conversions, verify all type checks pass
        Verify: `tsc --noEmit` passes, `vitest run` passes, `vite build` succeeds
