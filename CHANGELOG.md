# Changelog

All notable changes to NST BLR · AARAMBH (Faculty Onboarding Programme) will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
