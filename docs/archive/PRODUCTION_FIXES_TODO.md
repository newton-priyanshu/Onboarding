# Newton Onboarding — Production Fixes TODO

> Last updated: 2026-07-10 — All sessions complete
>
> ✅ = Completed & verified

## ✅ Completed Fixes

### Session 1 — Status Casing & Basic Audits
| Item | Files | Status |
|------|-------|--------|
| Status casing bug (gate controls) | `useGateControl.ts` | ✅ |
| Dashboard 'Submitted' comparison | `Dashboard.tsx` | ✅ |
| WorksheetReview workaround patch | `WorksheetReview.tsx` | ✅ |
| SubmissionStatus type mismatch | `types/supabase.ts` | ✅ |
| useWorksheet hardcoded strings → constants | `useWorksheet.ts` | ✅ |
| PhaseWorksheetList hardcoded strings → constants | `PhaseWorksheetList.tsx` | ✅ |
| WeekAccessGuard hardcoded strings → constants | `WeekAccessGuard.tsx` | ✅ |

### Session 2 — Critical & High Priority Fixes
| Item | Files | Status |
|------|-------|--------|
| PHASE_WORKSHEETS_MAP circular deadlock | `worksheetConfigData.ts` | ✅ |
| Auto-promotion message hardcoded '20' | `useAutoPromote.ts` | ✅ |
| useGateControl fail-OPEN → fail-CLOSED | `useGateControl.ts` | ✅ |
| useAutoSave retry counter reset on success | `useAutoSave.ts` | ✅ |
| ErrorBoundary scope (Navbar/footer outside) | `App.tsx`, `ErrorBoundary.tsx` | ✅ |
| Env var crash guard (Proxy pattern) | `supabase.ts` | ✅ |
| PhaseAccessGuard race condition (cancelled flag) | `PhaseAccessGuard.tsx` | ✅ |
| Forgot password link on login page | `Login.tsx` | ✅ |
| AuthCallback timeout cleanup | `AuthCallback.tsx` | ✅ (verified: already correct) |
| AuthContext memoization (useCallback/useMemo) | `AuthContext.tsx` | ✅ (already done in codebase) |

### Sessions 3-4 — Architecture, Infrastructure & Code Quality
| Item | Files | Status |
|------|-------|--------|
| Script URL/key hardcoding → env vars (11 scripts) | Multiple scripts | ✅ |
| Shared helper extraction (isWorksheetComplete, etc.) | `worksheetHelpers.ts` + 7 pages | ✅ |
| CI/CD pipeline | `.github/workflows/ci.yml` | ✅ |
| React.lazy code splitting (6 heavy pages) | `App.tsx` | ✅ |
| tsc --noEmit in build script | `package.json` | ✅ |
| useGateControl tests | `__tests__/useGateControl.test.ts` | ✅ |
| run_migration.cjs paths fix | `run_migration.cjs` | ✅ |
| ReviewContent FIELD_SECTIONS (mentorName/mentorEmail) | `ReviewContent.tsx` | ✅ |
| Engines field (node >=20) | `package.json` | ✅ |
| Error handling Phase2/3/Week1-4 (try/catch) | 6 page files | ✅ |

### Session 5 (Final) — Remaining Audit Items
| Item | Files | Status |
|------|-------|--------|
| **SPA routing fallback** — vercel.json, public/_redirects, public/404.html | `vercel.json`, `public/_redirects`, `public/404.html` | ✅ |
| **serve-app.mjs path traversal fix** | `serve-app.mjs` | ✅ |
| **create-admin.cjs env var name fix** | `scripts/setup/create-admin.cjs` | ✅ |
| **db/schema.sql — notifications table, due_date, WITH CHECK, triggers** | `db/schema.sql` | ✅ |
| **Exhaustive-deps fixes (6 files)** | `Dashboard.tsx`, `Phase1.tsx`, `PhaseReview.tsx`, `WorksheetReview.tsx`, `AdminDashboard.tsx`, `BuddyDashboard.tsx`, `OnboardingLeadDashboard.tsx` | ✅ |
| **29 `: any` type annotations fixed (13 files)** | GateArtifact2, Phase1Worksheet1-8, Phase2Worksheet1-3, Phase3Worksheet1/3 | ✅ |
| **Shared week worksheet metadata config** | `src/config/weeklyWorksheets.ts` | ✅ |

### SQL Migrations — Applied Successfully ✅
- [x] **🔧 RLS-1:** Switch JWT role from `user_metadata` → `app_metadata` ✅
- [x] **🔧 RLS-2:** Add `WITH CHECK` to all UPDATE policies ✅
- [x] **🔧 RLS-3:** Fix signup — prevent client-supplied role ✅
- [x] **🔧 RLS-4:** Restrict notifications INSERT policy ✅
- [x] **🔧 RLS-5:** Add missing columns (due_date, review_history) ✅
- [x] **🔧 Review state machine:** DB trigger to validate transitions ✅

## Summary
| Area | Total | Done | Remaining |
|------|:-----:|:----:|:---------:|
| Application Code | 17 | **17** | 0 |
| Scripts & Cleanup | 5 | **5** | 0 |
| Infrastructure | 8 | **8** | 0 |
| Testing | 3 | **3** | 0 |
| SQL Migrations | 6 | **6** | 0 |
| **Total** | **39** | **39** | **0** ✅ |
