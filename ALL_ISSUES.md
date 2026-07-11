# NST BLR · AARAMBH — Issue Tracker

**Last updated:** 2026-07-10 (post-string-literals-sweep)
**HEAD:** `9979b3d` — `fix: production-readiness remediation — close all Critical/High audit findings`
**PR #3:** https://github.com/newton-priyanshu/Onboarding/pull/3

---

## Current Gate Status

| **Lint housekeeping** | ✅ 0 errors, 70 warnings (down from 76)
| | Swept ~60 raw status strings → `REVIEW_STATUS.*` constants across 9 files
| | Converted `exhaustive-deps` in Week1-4, Dashboard, Phase1, useNotifications |

| Check | Result |
|-------|--------|
| **TypeScript** | ✅ **0 errors** |
| **ESLint** | ✅ **0 errors**, 70 warnings (down from 76) |
| **Tests** | ✅ **281 passed / 0 failed** (17 test files) |
| **Build** | ✅ Passes (chunk size warning — non-blocking) |
| **Working tree** | ⚠️ Uncommitted (string literals sweep in progress) |

---

## ✅ CLOSED — 12 Critical + 40 High findings (Ashwin's remediation, PR #3)

All findings from the [20-dimension production-readiness audit](./docs/audit/2026-07-10/) are closed in code.

| Category | What was fixed |
|----------|----------------|
| **Authorization** | `get_user_role()` and all RLS policies now resolve role **only** from server-controlled `app_metadata`. |
| **Review State Machine** | `validate_review_transition()` `BEFORE UPDATE` trigger enforces every `review_status` transition. |
| **Data Loss** | `loadWorksheetData` propagates errors; forms stay unloaded with retry state on failure. |
| **Database Schema** | `db/schema.sql` rewritten to be fully idempotent. 7 ordered Supabase migrations. |
| **Error Handling** | New `unwrap()` helper. Read paths fail closed. Dashboard queries scoped by user. |
| **Password Reset** | `/forgot-password` + `/reset-password` routes built. |
| **Notifications** | Moved server-side via DB triggers. |
| **Gate Pass Flow** | `upsert_gate_submission()` RPC for assigned buddies. |
| **Week-URL Gating** | `WeekWorksheetPage` validates worksheet belongs to current week. |
| **Role-Based Landing** | Promoted users get role-appropriate landing. |
| **Promotion** | `promote_user_if_eligible()` SECURITY DEFINER RPC. |
| **UI/UX** | Responsive forms, 44px tap targets, `label`/`htmlFor` associations. |
| **Ops** | `.env` gitignored. Vercel security headers. Lint gate repaired. |
| **Tests** | 158 → **281 tests**. |

## ✅ CLOSED — Lint housekeeping (this session)

| Fix | What was done |
|-----|---------------|
| **ESLint config** | Added `allowConstantExport: true` to react-refresh rule |
| **`ReviewContent.tsx`** | Moved side-effect window assignment into `useEffect` before early return (fixed Rules of Hooks violation) |
| **`useAutoSave.ts`** | Removed useless `= null` initializer |
| **`useNotifications.ts`** | Extracted `userId` to simplify dependency expressions |
| **`Dashboard.tsx`** | Wrapped `loadSubmissions` in `useCallback` with proper deps |
| **`Phase1.tsx`** | Wrapped `loadStatuses` in `useCallback` with proper deps |
| **`Week1-4.tsx`** | Wrapped `loadStatuses` in `useCallback` (4 files) |
| **`AuthCallback.tsx`** | Added eslint-disable for set-state-in-effect |
| **`BuddyGatePass.tsx`** | Added eslint-disable for set-state-in-effect |
| **`PhaseAccessGuard.tsx`** | Fixed misplaced eslint-disable → properly suppressed warning |
| **`tslib`** | Removed unused devDependency |

---

## ⚠️ REMAINING — 70 ESLint warnings (0 errors)

| Rule | Count | Impact | Fix approach |
|------|-------|--------|-------------|
| `@typescript-eslint/no-explicit-any` | 22 | Low — type polish | Add proper types |
| `react-hooks/set-state-in-effect` | 16 | Low — React Compiler readiness | Add eslint-disable comments |
| `react-refresh/only-export-components` | 15 | Low — HMR state loss | Add eslint-disable comments |
| `react-hooks/preserve-manual-memoization` | 5 | Low — React Compiler readiness | Inline memoization |
| `react-hooks/exhaustive-deps` | 1 | Low — potential stale closure | Add dep or disable |
| `no-useless-assignment` | 1 | Low — dead store | Remove unused assignment |
| `react-hooks/use-memo` | 1 | Low — complex expression | Extract variable |

**Detailed by file:**
- `ReviewContent.tsx` — no-explicit-any casts, only-export-components
- `useAutoSave.ts` — no-explicit-any, preserve-manual-memoization
- `WorksheetReview.tsx` — set-state-in-effect, no-explicit-any
- `worksheetConfig.tsx` — only-export-components (10+ exports)
- `WeekWorksheetPage.tsx` — only-export-components
- `Toast.tsx` — only-export-components
- `AuthContext.tsx` — only-export-components, exhaustive-deps
- `PhaseReview.tsx` — set-state-in-effect, use-memo
- `WeekAccessGuard.tsx` — set-state-in-effect, preserve-manual-memoization
- `useGateControl.ts` — preserve-manual-memoization
- `useWorksheet.ts` — set-state-in-effect, no-explicit-any
- `useNotifications.ts` — set-state-in-effect
- `App.tsx` — set-state-in-effect
- `Dashboard.tsx` — set-state-in-effect
- `Phase1.tsx` — set-state-in-effect
- `useAutoSave.ts` — no-useless-assignment

---

## 🔴 MANUAL DB STEPS REQUIRED (code fix is inert until these run)

| # | Step | Status |
|---|------|--------|
| 1 | **Apply DB migrations** (`supabase db push`) | ✅ Done per user |
| 2 | **Backfill `app_metadata`** | ✅ **30/30 users synced** |
| 3 | **Delete/reset seeded accounts** (`Test123!`) | ❌ Not done |
| 4 | **Fix E2E seeding scripts** | ❌ Not done |
| 5 | **Verify redirect URLs** include `/reset-password` | ❌ Not done |

---

## 🟡 MEDIUM IMPROVEMENT ITEMS

### Performance
- **Initial bundle size**: 768 kB (197 kB gzip) — convert eager worksheet imports to `React.lazy()`
- **Notification polling**: 15s `setInterval` even in background tabs
- **Phase approval latency**: Sequential round trips per worksheet
- **Vendor chunk splitting**: Add `manualChunks` in vite config

### Code Quality
- **Oversized components**: `ReviewContent.tsx` (~1000 lines), `worksheetConfigData.ts` (~800)
- **Copy-paste pages**: `Week1-4.tsx` are nearly identical — collapse to `/week/:weekNum`
- **String literals**: ~60 raw status strings in 14 files despite `src/constants/status.ts`
- **README.md**: Still the default Vite template — needs rewrite

### Documentation
- **README.md**: Rewrite with product name, setup, test commands
- **scripts/README.md**: Document operational scripts
- **DEPLOYMENT.md**: Vercel + Supabase deployment guide

---

## 🟢 LOW ITEMS

- Self-host Google Fonts (remove CDN dependency)
- Add `beforeunload` guard for unsaved worksheet edits
- Add `CHANGELOG.md` and `CONTRIBUTING.md`
- Add theme-color meta tag for PWA
- Run `npm update` for wanted-range bumps
- Add Dependabot config for weekly updates

---

## Reference

- **Audit report:** `docs/audit/2026-07-10/` (5 detail files)
- **Remediation runbook:** `docs/audit/2026-07-10/REMEDIATION.md`
- **Canonical schema:** `db/schema.sql`
- **Supabase migrations:** `supabase/migrations/` (7 files)
