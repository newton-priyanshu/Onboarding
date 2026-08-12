# Changelog

All notable changes to NST BLR · AARAMBH (Faculty Onboarding Programme) will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Notifications on Supabase Realtime** (audit P5 / L4 — no more 15s polling):
  - `supabase/migrations/20260730000002_notifications_realtime.sql` — adds `public.notifications` to the `supabase_realtime` publication (idempotent) and sets `REPLICA IDENTITY FULL` so `postgres_changes` UPDATE/DELETE events carry the full row for the `user_id` filter.
  - `src/hooks/useNotifications.ts` — event-driven `postgres_changes` subscription on INSERT/UPDATE/DELETE (was INSERT-only): INSERT dedupes against the initial fetch, UPDATE syncs read-state across tabs/devices, DELETE removes the row. Channel names are unique per hook instance (navbar mounts two bells) and per user. `unreadCount` is now derived from the list (single source of truth) instead of delta bookkeeping.
  - `src/pages/NotificationsPage.tsx` — subscribes to live INSERT/UPDATE/DELETE and refetches, so the full page stays current without polling.

- **Audit leftovers — Sentry, pagination, PWA** (findings D3, R2, load-rec #1, step-13 #6/#8/#12):
  - `src/utils/sentry.ts` — guarded Sentry init (enabled only when `VITE_SENTRY_DSN` is set, no-op in tests) + `captureError`/`captureMessage`; wired into `main.tsx`, `ErrorBoundary.componentDidCatch`, and `notifyError`. CSP `connect-src` in `vercel.json` now allows `*.ingest.sentry.io`; `VITE_SENTRY_DSN` documented in `.env.example` + typed in `vite-env.d.ts`.
  - `fetchAllPages()` in `src/api/db.ts` — range-based paging helper for bulk reads (no more silent truncation at fixed `.limit()` caps); applied to the Admin, Onboarding-Lead, and Campus-Head dashboards (worksheet_submissions + campus-head user_profiles fetches).
  - `public/sw.js` — offline-first service worker (precaches app shell, network-first navigations with offline fallback, stale-while-revalidate for hashed assets); registered in `main.tsx` on `window.load` (production only); `vercel.json` serves `sw.js` with `no-cache, no-store, must-revalidate`.

- **Multi-Tenant Phase 10 — Cross-Campus Isolation & RLS Validation Tests**:
  - `src/context/__tests__/CampusContext.test.tsx` — CampusProvider tests: URL/localStorage/default-slug resolution, `switchCampus`, error handling, URL-change re-resolution (via a router navigation probe).
  - `src/api/__tests__/tenant.test.ts` — campus path parsing, `withCampusPath`, `validateCampusAccess` (cross-campus access control), `getCampusBySlug`/`getActiveCampuses` fallback with mocked supabase.
  - `src/utils/__tests__/rbac.test.ts` — full RBAC permission matrix incl. `super_admin` wildcard, `can`/`canAny`/`canAll`/`requirePermission`, and role helpers.
  - `src/utils/__tests__/campusSlug.test.ts` — `campusPath` prefixing/flat-path handling (incl. query strings + OAuth hash fragments) and `useCampusPath`.
  - `scripts/validate_rls_isolation.mjs` — live-DB RLS validation: provisions test users in two campuses, signs them in, and asserts cross-campus isolation (profile reads, submissions, updates, forged inserts, notifications, `assert_campus_access` RPC) plus service-role bypass. Exits non-zero on any failed check.
  - Fixed `campusPath` to preserve query strings/hash fragments when prefixing (OAuth `?code=` / `#access_token=` callbacks now stay flat).
  - `src/api/__tests__/templates.test.ts` — 39 tests for `parseTemplateStructure`, `validateTemplateStructure`, week/phase/gate/approval-chain/worksheet-info helpers, and `resolveReviewer`. Caught a real bug: `resolveReviewer`'s hardcoded fallback map was unreachable because `getWorksheetReviewer` always returns a truthy `'buddy'` default — fixed to consult `getWorksheetEntry` directly.
  - `src/api/__tests__/auditLogs.test.ts` — SQL-contract test (Vite `?raw` import, no `@types/node`) locking the `audit_logs` table, the three server-side creation triggers, RLS insert/management policies, and consistent insert column sets.
  - Test count: 389 → 428 (39 new unit tests across 2 new files).
  - `src/api/__tests__/templateDrivenWorksheetLoading.test.ts` — integration test (12.2): a campus template fetched via `getCampusTemplate` drives worksheet loading through the `worksheetConfigData` bridges (phase lists, names, reviewers, week lists), overriding hardcoded config with fallback when absent.
  - `src/pages/__tests__/CampusUserManagement.test.tsx` — integration test (12.2): campus-admin user management is campus-scoped (`withCampusIf` adds `.eq('campus_id', …)` to every query), assignment updates are user-scoped and notify, and the no-campus state never queries. Live-DB RLS checks added to `scripts/validate_rls_isolation.mjs` step 5.6 (campus-admin cross-campus read/update blocked, own-campus allowed).
  - Test count: 428 → 443 (15 new integration tests across 2 new files).

- **Multi-Tenant Phase 9 — Data Migration & Backward Compatibility**:
  - `scripts/migrate_to_multi_tenant.mjs` — idempotent backfill script that creates the default campus, assigns `campus_id` to all existing rows (`user_profiles`, `worksheet_submissions`, `notifications`, `promotion_required_worksheets`), seeds the default onboarding template, writes audit-log entries, and verifies data integrity (no NULL `campus_id`, no orphaned rows). Supports `--dry-run`.
  - `scripts/template_structure.mjs` — shared onboarding structure module, extracted from `migrate_templates.mjs` so both migration scripts stay in sync.
  - Legacy URL redirects — pre-migration flat URLs (`/phase-1`, `/week-2`, `/admin`, …) now redirect to the default campus (`/default/...`) via `LegacyRedirect` + a smart 404 in `App.tsx`; route list centralized in `src/utils/campusSlug.ts`.
  - `VITE_DEFAULT_CAMPUS_SLUG` + `VITE_MULTI_TENANT_ENABLED` env vars documented in `.env.example`; `CampusContext` and `campusSlug.ts` now read the configured default campus slug instead of hardcoding `'default'`.

---

## [1.0.0-beta] — 2026-07-11

### Added

- **Onboarding Phases 1–3**: 20+ worksheet components covering anchor, contribution, and ownership phases.
- **FTP (Faculty Training Programme) Weeks 1–4**: Week-gated curriculum with 30+ worksheet components covering anchor, co-create, co-deliver, and independence stages.
- **Gate Controls**: 3 phase gates (GC1–GC3) + 4 FTP artifact gates, each with self-assessment, milestone tracking, and manager sign-off.
- **Review Flow**: Worksheet review UI with sectioned layout, table renderers, score grids, milestone tracking, signature badges.
- **Week/Phase Gating**: Server-authoritative access control — Phase 2/3 locked until prior phase completion; Week 2–4 locked until prior week completion.
- **Auto-Save & Due Dates**: Background auto-save with granular debouncing; due-date calculation from user start date.
- **Auto-Promotion Engine**: State-machine-driven promotion across phases with `pending → submitted → approved → reviewing → buddy_approved` transitions.
- **Notification System**: 15-second polling for pending reviews, with bell badge on navbar.
- **Admin Dashboard**: Overview of all joinees with phase/worksheet status, review actions.
- **Buddy Dashboard**: Assignment review queue with per-user filtering.
- **Role-Based Access**: `new_joinee`, `lab_instructor`, `lead_instructor`, `academic_head`, `onboarding_lead` roles with corresponding route guards.
- **PWA Support**: Service worker, manifest, icon set, offline-ready `<meta>` tags.
- **E2E Testing**: Full flow scripts (signup → login → dashboard → phases/weeks), 20+ page test coverage.
- **Supabase Integration**: Row-Level Security (RLS), triggers for auto-promotion, state machine enforcement.
- **Toast Notifications**: Context-based toast system with success/error states.
- **Error Boundary**: Graceful error handling with fallback UI.

### Fixed

- **[Week 2 Loading Bug]**: `WeekAccessGuard` missing `.then()` rejection handler caused perpetual loading state on query failure — added fallback to `setCanAccess(false)` + error display.
- **[AutoSave Console Error]**: `[AutoSave] Failed to load start date` logged `[object Object]` — changed to `error?.message || error` for readable output.
- **[beforeunload Guard]**: Users navigating away mid-edit lost unsaved work — added `beforeunload` event listener that activates when `dirty=true` and form not approved.
- **[No-useless-assignment]**: Removed dead `= null` initializer in `useAutoSave.ts`.
- **[ESLint Warnings ~70]**: Fixed `only-export-components`, `exhaustive-deps`, `no-useless-assignment`, `set-state-in-effect` across 15+ files.
- **[Status Strings → Constants]**: Migrated ~60 raw status strings to `REVIEW_STATUS.*` enum across 9 files.

### Changed

- **ESLint config**: Added `allowConstantExport: true`, relaxed `project` reference.
- **Auth redirect**: Role-based landing (`/admin`, `/buddy`, `/dashboard`) for each user role.
- **Phase/Week guards**: Added `lead_instructor` to allowed roles for Phase 1–3 viewing.

### Security

- **RLS hardening**: All `worksheet_submissions` and `user_profiles` queries scoped to authenticated user only.
- **Supabase anon key rotation**: Post-audit, keys exposed in git history require rotation in Supabase dashboard.

---

## [0.9.0] — 2026-07-10

### Added

- 20-dimension production-readiness audit by Principal Architect.
- PRODUCTION_AUDIT_REPORT.md with scorecard (7.3/10) and prioritized action plan.

### Fixed

- 39 production-readiness fixes across all audit dimensions.
- SQL RLS policy — allow joinee `review_status` transitions.
- Critical RLS security, silent data loss, week gating, taxonomy reconciliation.

---

## [0.8.0] — 2026-07-09

### Added

- PWA icons, manifest, icon generation script.
- Rebranding from "Newton Onboarding" to "NST BLR · AARAMBH".

### Fixed

- E2E test scripts for signup → login → dashboard flow.
- UI polish, Phase/Week merge, loading skeletons, color standardization.
