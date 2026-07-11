# NST BLR · AARAMBH — Issue Tracker

**Last updated:** 2026-07-11 (post-E2E-audit session)
**HEAD:** `7c9487e` — `fix: code quality sweep - status strings to constants, lint fixes`

---

## Current Gate Status

| Check | Result |
|-------|--------|
| **TypeScript** | ✅ **0 errors** |
| **ESLint** | ✅ **0 errors**, 70 warnings (all `no-explicit-any` or React Compiler at `warn` level) |
| **Tests** | ✅ **281/281 passed** |
| **Build** | ✅ Passes |

---

## ✅ CLOSED — All previous sessions

### Critical + High audit findings (Ashwin's PR #3)
All findings from the 20-dimension production-readiness audit closed in code.

### Lint housekeeping (this session)
| Fix | Files affected |
|-----|----------------|
| ESLint config: `allowConstantExport: true` | `eslint.config.js` |
| Rules of Hooks: moved `useEffect` before early return | `ReviewContent.tsx` |
| `exhaustive-deps`: wrapped handlers in `useCallback` | `Dashboard.tsx`, `Phase1.tsx`, `Week1.tsx`, `Week2.tsx`, `Week3.tsx`, `Week4.tsx`, `useNotifications.ts` |
| `no-useless-assignment`: removed dead store | `useAutoSave.ts` |
| `set-state-in-effect`: added eslint-disable comments | `AuthCallback.tsx`, `BuddyGatePass.tsx`, `PhaseAccessGuard.tsx` |
| String literals sweep: ~60 raw status strings → `REVIEW_STATUS.*` | 9 files across pages, utils, config |
| `tslib` removal | `package.json` |

### E2E Testing (this session)
| Test | Result |
|------|--------|
| Auth pages (login, signup, forgot-password, reset-password) | ✅ Zero errors |
| Protected routes → redirect to /login (18+ routes) | ✅ All redirect correctly |
| Invalid login shows error | ✅ Shows "Invalid email or password" |
| **Full E2E: Signup → Login → Dashboard** | ✅ **Complete flow works** |
| Phase 1, Week 1 content | ✅ Renders correctly |
| Phase 2, Phase 3 locked | ✅ Shows locked messages |
| Week 3, Week 4 locked | ✅ Shows locked messages |
| 404 page | ✅ Beautiful page with nav links |
| Admin/Buddy redirect for joinee | ✅ Redirects to dashboard |
| Supabase connectivity | ✅ All tables accessible via RLS |

### Production Audit Report
✅ Created [`PRODUCTION_AUDIT_REPORT.md`](./PRODUCTION_AUDIT_REPORT.md) — 18-section comprehensive audit with scorecard (7.3/10) and prioritized action plan.

---

## 🔴 REMAINING — Critical Bug

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| B1 | **Week 2 stuck on "Loading…"** — `WeekAccessGuard` `.then()` without `.catch()` handler leaves component in perpetual loading state when query errors | `WeekAccessGuard.tsx` | Add `.catch()` handler |

## 🟡 REMAINING — Medium Priority

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| M1 | **No `beforeunload` guard** — users can navigate away mid-edit and lose unsaved work | `useWorksheet.ts` + WorksheetPage | Add `beforeunload` event listener |
| M2 | **AutoSave console error** — `[AutoSave] Failed to load start date for due-date calc: [object Object]` — poor error logging obscures the real failure | `useAutoSave.ts` | Show `error.message` instead of raw object |
| M3 | **70 ESLint warnings** — all at `warn` level, but housekeeping would be nice | Multiple files | Fix `no-explicit-any`, `set-state-in-effect`, `only-export-components` |

## 🟢 REMAINING — Low Priority / Code Quality

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| L1 | **ReviewContent.tsx ~1000 lines** | `src/components/` | Split into renderers + helpers |
| L2 | **Week1-4.tsx 95% identical** | `src/pages/` | Collapse to parameterized `<WeekPage>` |
| L3 | **Bundle size 768 kB** — 40+ eager worksheet imports | `worksheetConfig.tsx` | Convert to `React.lazy()` |
| L4 | **Notification polling every 15s** | `useNotifications.ts` | Switch to Supabase Realtime |
| L5 | **Self-host Google Fonts** | `index.css` | Remove CDN dependency |
| L6 | **Add CHANGELOG.md + CONTRIBUTING.md** | Root | Documentation |
| L7 | **Configure Dependabot** | `.github/` | Weekly dependency updates |

## 🔴 MANUAL DB STEPS REQUIRED (need Supabase Dashboard access)

| # | Step | Status |
|---|------|--------|
| DB1 | **Delete/reset seeded accounts** (`Test123!`) | ❌ Needs admin action |
| DB2 | **Fix E2E seeding scripts** to use service-role API | ❌ Needs admin action |
| DB3 | **Verify redirect URLs** include `/reset-password` in Supabase Auth settings | ❌ Needs admin action |
| DB4 | **Rotate exposed Supabase anon key** (was committed in git history) | ❌ **Critical security** — needs admin action |

---

## Reference

- **Production audit report:** `PRODUCTION_AUDIT_REPORT.md` (generated 2026-07-11)
- **Canonical schema:** `db/schema.sql`
- **Previous audit:** `docs/audit/2026-07-10/`
