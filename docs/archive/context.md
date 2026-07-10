# Newton School of Technology — Faculty Onboarding Portal
## Complete Application Context & Documentation

**Generated:** June 23, 2026  
**Stack:** React 19 + Vite 8 + Supabase + TypeScript 6 + Tailwind CSS v4  
**Project Root:** `/Users/priyanshuverma/Desktop/untitled folder 3`

---

## Table of Contents

1. [High-Level Product Overview](#1-high-level-product-overview)
2. [Folder Structure](#2-folder-structure)
3. [Technology Stack](#3-technology-stack)
4. [Application Architecture](#4-application-architecture)
5. [Routing](#5-routing)
6. [Components](#6-components)
7. [State Management](#7-state-management)
8. [API Documentation](#8-api-documentation)
9. [Database](#9-database)
10. [Authentication](#10-authentication)
11. [User Roles](#11-user-roles)
12. [Business Logic](#12-business-logic)
13. [Forms](#13-forms)
14. [Error Handling](#14-error-handling)
15. [Security](#15-security)
16. [Performance](#16-performance)
17. [UI/UX Review](#17-uiux-review)
18. [Code Quality](#18-code-quality)
19. [Dependencies](#19-dependencies)
20. [Testing](#20-testing)
21. [Hidden Features](#21-hidden-features)
22. [Environment Configuration](#22-environment-configuration)
23. [Deployment](#23-deployment)
24. [Known Issues](#24-known-issues)
25. [Improvement Opportunities](#25-improvement-opportunities)
26. [Complete User Journey](#26-complete-user-journey)
27. [Developer Onboarding Guide](#27-developer-onboarding-guide)
28. [Executive Summary](#28-executive-summary)

---

## 1. High-Level Product Overview

### What This Application Is

The **Newton School of Technology — Faculty Onboarding Portal** is a structured, multi-phase web application that guides new faculty instructors through a **30–60–90 day onboarding programme**. The portal replaces ad-hoc onboarding (paper forms, email chains, spreadsheets) with a formalised, auditable digital workflow.

### What Problem It Solves

- **Standardisation:** Every new joiner follows the same 20-worksheet, 3-gate-control programme
- **Accountability:** Reviewers (Buddies, Managers, Onboarding Leads) formally approve each worksheet
- **Progress Visibility:** Dashboards for joinees, buddies, admins, and onboarding leads show real-time status
- **Gating:** Phases unlock sequentially (Phase 1 → Phase 2 → Phase 3), and gate controls block advancement until all phase worksheets are complete
- **Auto-Promotion:** When all 20 worksheets across all 3 phases are approved, the joinee is automatically promoted to `lead_instructor` (Buddy/Mentor) status

### Who the Users Are

| Role | Description |
|------|-------------|
| **New Joinee** (`new_joinee`) | New instructor going through onboarding |
| **Lab Instructor** (`lab_instructor`) | Instructor with lab focus, same onboarding path |
| **Buddy / Mentor** (`lead_instructor`) | Reviews buddy-assigned worksheets and fills gate passes |
| **Manager / Academic Head** (`academic_head`) | Approves phases at the phase level, assigns buddies/managers |
| **Onboarding Lead** (`onboarding_lead`) | Monitors progress, reviews procedural worksheets (read-only) |
| **Acad Ops** (`acad_ops`) | Administrative support role |

### Major Use Cases

1. **Joinee fills worksheets** → auto-saved every 1.5s, submitted explicitly for review
2. **Buddy reviews worksheets** → approves (buddy_approved) or requests revision
3. **Manager approves phases** → approves entire phase once all worksheets are buddy_approved
4. **Auto-promotion** → when all 3 phases are approved, joinee becomes a buddy
5. **Gate controls** → 30-day, 60-day, 90-day milestone reviews at the end of each phase
6. **Notifications** → real-time polling for submission/approval/revision events
7. **Due dates** → calculated based on onboarding start date, with overdue/due-soon indicators

### Overall Architecture

```
Browser (React SPA)
  │
  ├── React Router v7 (client-side routing)
  ├── AuthContext (Supabase Auth state management)
  ├── useAutoSave (periodic upsert to Supabase)
  ├── useWorksheet (orchestrates load/save/submit)
  │
  ▼
Supabase (Backend-as-a-Service)
  │
  ├── Auth (email/password + Google OAuth)
  ├── PostgreSQL (user_profiles, worksheet_submissions, notifications, onboarding_submissions)
  ├── Row-Level Security (all authorization logic)
  └── Realtime (polling-based notifications)
```

### Core Workflow

```
Joinee signs up → Dashboard
  → Phase 1 (8 worksheets + GC1)
    → Buddy reviews each worksheet (buddy_approved)
    → Manager approves Phase 1 (all → approved)
  → Phase 2 (4 worksheets + GC2)
    → Buddy reviews each worksheet
    → Manager approves Phase 2
  → Phase 3 (5 worksheets + GC3)
    → Buddy reviews each worksheet
    → Manager approves Phase 3
  → Auto-promotion to lead_instructor (all 20/20 approved)
```

---

## 2. Folder Structure

```
project-root/
│
├── index.html                      # Entry point HTML
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.js                  # Vite build configuration
├── eslint.config.js                # ESLint flat config
├── .gitignore
├── README.md                       # Minimal (auto-generated)
│
├── context.md                      # THIS FILE - full project context
├── ARCHITECTURE_PLAN.md            # Architecture plan for due dates, notifications, review flow
├── REVIEW_FLOW.md                  # Complete review state machine documentation
├── TYPESCRIPT_MIGRATION_PLAN.md    # Migration plan from JSX to TSX
├── TYPESCRIPT_MIGRATION_EXECUTION.md # Execution tracking for TS migration
├── QA_REPORT.md                    # QA test report
├── SYSTEM_ANALYSIS.md              # Deep system audit
├── UI_IMPROVEMENTS.md              # UI/UX improvement suggestions
├── Newton_Onboarding_Engineering_Review.txt # External engineering review
│
├── db/                             # Database schema & migration SQL files
│   ├── schema.sql                  # DEFINITIVE combined schema (run this)
│   ├── supabase_schema.sql         # Original schema
│   ├── supabase_role_migration.sql # Role system migration
│   ├── supabase_reviewer_migration.sql # Buddy/onboarding-lead system
│   ├── setup_correct.sql           # Complete setup with test data
│   ├── seed_worksheets.sql         # Seed worksheet submissions for QA users
│   ├── create_32_users.sql         # 32 test users creation script
│   └── __*.sql                     # Migration/fix scripts (chronological)
│
├── scripts/                        # Utility scripts
│   ├── run_migration.cjs           # Run Supabase migrations
│   ├── pre-commit.sh               # CodeRabbit pre-commit hook
│   └── setup/                      # Setup scripts (create users, etc.)
│
├── src/                            # Application source
│   ├── main.tsx                    # Entry point (React 19 + StrictMode)
│   ├── App.tsx                     # Root component (Router + Layout)
│   │
│   ├── types/                      # TypeScript type definitions
│   │   ├── index.ts                # Barrel export
│   │   ├── supabase.ts             # Supabase-related types (UserProfile, Worksheet, etc.)
│   │   ├── worksheet.ts            # Worksheet metadata types
│   │   ├── config.ts               # Config-specific types
│   │   └── worksheets/
│   │       ├── index.ts
│   │       └── p1_w1.ts            # P1W1 worksheet data shape
│   │
│   ├── context/                    # React contexts
│   │   ├── AuthContext.tsx          # Authentication state management
│   │   └── ProjectInfo.ts          # Project metadata constant
│   │
│   ├── api/                        # API layer (Supabase client)
│   │   ├── supabase.ts             # Supabase client initialization
│   │   └── index.ts                # Barrel export
│   │
│   ├── config/                     # Application configuration
│   │   ├── theme.js                # Theme tokens (CSS variables)
│   │   ├── worksheetConfig.tsx     # React worksheet config + ReviewerBadge
│   │   ├── worksheetConfigData.ts  # Pure data (WORKSHEET_REVIEWER, WORKSHEET_NAMES, etc.)
│   │   ├── worksheetComponents.tsx # Reusable UI components (WorksheetHeader, Section, etc.)
│   │   └── index.ts                # Barrel export
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useAutoSave.ts          # Auto-save worksheet data to Supabase
│   │   ├── useWorksheet.ts         # Orchestrates worksheet load/save/submit
│   │   ├── useDueDates.ts          # Due date calculations & display
│   │   ├── useNotifications.ts     # Notifications fetching & management
│   │   ├── useAutoPromote.ts       # Auto-promotion logic
│   │   ├── index.ts                # Barrel export
│   │   └── __tests__/              # Hook unit tests
│   │       ├── reviewFlow.test.ts
│   │       ├── useDueDates.test.ts
│   │       ├── useNotifications.test.ts
│   │       ├── useAutoPromote.test.ts
│   │       └── useAutoSave.test.ts
│   │
│   ├── utils/                      # Utility functions
│   │   ├── errorHandling.ts        # Toast event system
│   │   └── index.ts                # Barrel export
│   │
│   ├── styles/                     # Styles
│   │   └── index.css               # All CSS (Tailwind v4 + luxury design tokens)
│   │
│   ├── components/                 # Reusable components
│   │   ├── Navbar.tsx              # Navigation bar
│   │   ├── ProtectedRoute.tsx      # Role-based route protection
│   │   ├── NotificationBell.tsx    # Notification bell with dropdown
│   │   ├── PhaseWorksheetList.tsx  # Phase page worksheet list
│   │   ├── WorksheetPage.tsx       # Worksheet page wrapper (shared across all worksheets)
│   │   ├── ReviewContent.tsx       # Review content renderer
│   │   ├── Toast.tsx               # Toast notification system
│   │   ├── ErrorBoundary.tsx       # React error boundary
│   │   └── admin/
│   │       ├── PhasesReadyTab.tsx  # Admin phases-ready tab
│   │       └── AssignmentsTab.tsx  # Admin assignments tab
│   │
│   └── pages/                      # Page components
│       ├── Dashboard.tsx           # Joinee dashboard
│       ├── Login.tsx               # Login page
│       ├── Signup.tsx              # Signup page
│       ├── AuthCallback.tsx        # OAuth callback handler
│       ├── NotFound.tsx            # 404 page
│       ├── Stakeholders.tsx        # Stakeholder info page
│       ├── Assessment.tsx          # Final readiness assessment form
│       ├── AdminDashboard.tsx      # Admin dashboard (managers + onboarding leads)
│       ├── BuddyDashboard.tsx      # Buddy review dashboard
│       ├── OnboardingLeadDashboard.tsx # Onboarding lead monitoring panel
│       ├── BuddyGatePass.tsx       # Buddy gate pass wrapper
│       ├── WorksheetReview.tsx     # Individual worksheet review page
│       ├── PhaseReview.tsx         # Phase-level review page
│       ├── Phase1.tsx              # Phase 1 page
│       ├── Phase2.tsx              # Phase 2 page (gated)
│       ├── Phase3.tsx              # Phase 3 page (gated)
│       │
│       ├── worksheets/             # 17 worksheet pages (one per worksheet)
│       │   ├── Phase1Worksheet1.tsx through Phase1Worksheet8.tsx
│       │   ├── Phase2Worksheet1.tsx through Phase2Worksheet4.tsx
│       │   └── Phase3Worksheet1.tsx through Phase3Worksheet5.tsx
│       │
│       └── gate-controls/          # 3 gate control pages
│           ├── GateControl1.tsx    # 30-day milestone
│           ├── GateControl2.tsx    # 60-day milestone
│           └── GateControl3.tsx    # 90-day milestone (final)
```

---

## 3. Technology Stack

### Frontend

| Technology | Version | Purpose | Location | Alternatives | Pros | Cons |
|-----------|---------|---------|----------|-------------|------|------|
| React | 19.2.6 | UI framework | All components | Vue, Svelte | Latest React, concurrent features | Bundle size |
| TypeScript | 6.0.3 | Type safety | All `.ts`/`.tsx` files | JavaScript, JSDoc | Compile-time error detection, better DX | Learning curve, build time |
| Vite | 8.0.12 | Build tool & dev server | `vite.config.js` | Webpack, Parcel, Turbopack | Fast HMR, ESM-native, esbuild minification | Less mature than Webpack ecosystem |
| React Router | 7.18.0 | Client-side routing | `App.tsx`, all pages | TanStack Router, Next.js | Standard, well-documented, dynamic routes | Bundle size |
| Supabase JS | 2.108.2 | Backend client | `api/supabase.ts`, all hooks | Firebase, custom API | Direct DB access, RLS, realtime | Coupling to Supabase |
| Lucide React | 1.21.0 | Icons | All components | Heroicons, Phosphor | Lightweight, tree-shakeable, MIT | Limited icon set vs FontAwesome |
| Tailwind CSS | 4.3.1 | Utility CSS | `src/styles/index.css` | Pure CSS, SCSS, styled-components | Rapid prototyping, consistent design | Verbose JSX, CSS-in-JS vs utility debate |
| ESLint | 10.3.0 | Linting | `eslint.config.js` | Prettier, Biome | TypeScript-aware rules, flat config | Configuration complexity |
| Vitest | 4.1.9 | Unit testing | `*.test.ts` files | Jest, Playwright | Fast, Vite-native, same config as build | Fewer integrations than Jest |

### Backend (Supabase)

| Service | Purpose | Details |
|---------|---------|---------|
| **Supabase Auth** | Authentication | Email/password + Google OAuth + email confirmation |
| **Supabase PostgreSQL** | Database | `user_profiles`, `worksheet_submissions`, `notifications`, `onboarding_submissions` |
| **Row-Level Security (RLS)** | Authorization | All access control in SQL policies, not app code |
| **Supabase JS Client** | API | Direct DB queries from frontend (SPA pattern, no custom backend) |

### Database

- **PostgreSQL** via Supabase
- **Tables:** `user_profiles`, `worksheet_submissions`, `onboarding_submissions`, `notifications`
- **No ORM** — direct SQL queries via Supabase JS client
- **JSONB** for flexible worksheet data storage
- **RLS** for all authorization

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | Yes |

---

## 4. Application Architecture

### Architectural Pattern

**React SPA + Backend-as-a-Service (Supabase)** with:

- **Client-side routing** (React Router v7)
- **Direct database access** from the frontend via Supabase JS SDK
- **Row-Level Security** as the only authorization layer
- **No custom backend server** — all business logic lives in the frontend and in SQL triggers/policies
- **Hook-driven state management** — `useAuth`, `useWorksheet`, `useAutoSave`, `useNotifications`

### Data Flow

```
┌─────────────────┐
│   Browser SPA   │
│  (React Router) │
└────────┬────────┘
         │
    ┌────┴────┐
    │  Auth   │
    │ Context │
    └────┬────┘
         │ user + profile
    ┌────┴──────┐
    │ Protected │
    │  Route    │
    └────┬──────┘
         │
    ┌────┴──────────────────┐
    │  Page Component       │
    │  (e.g., Dashboard,    │
    │   Worksheet, Review)  │
    └────┬──────────────────┘
         │
    ┌────┴──────┐
    │   Hooks   │
    │ useAutoSave │
    │ useWorksheet│
    │ useDueDates │
    │ useNotifs   │
    └────┬──────┘
         │ Supabase JS SDK
    ┌────┴──────────────────┐
    │   Supabase            │
    │   ├── Auth            │
    │   ├── PostgreSQL      │
    │   └── RLS Policies    │
    └───────────────────────┘
```

### Request Lifecycle (Worksheet Page)

1. User navigates to `/phase-1/worksheet-1`
2. `ProtectedRoute` checks auth → redirects to `/login` if not authenticated
3. `Phase1Worksheet1` renders → calls `useWorksheet` hook
4. `useWorksheet` calls `useAutoSave` with worksheet metadata
5. `useEffect` in `useWorksheet` fetches saved data via `loadWorksheetData(userId, worksheetId)`
6. If saved data exists → hydrates local state
7. If no saved data → prefills `employeeName` from OAuth metadata
8. User edits form → state updates → `useAutoSave` debounces 1.5s → upserts to `worksheet_submissions`
9. User clicks Submit → `handleSubmit` sets `status: 'submitted'`, `review_status: 'pending_review'`
10. Form re-renders as `SubmittedView` on next load

### Authentication Flow

```
User visits any protected route
  → ProtectedRoute checks `loading`
  → If loading → render spinner
  → If no `user` → redirect to `/login` with `from` state
  → If `user` but no `profile` → AuthProvider.fetchProfile()
  → If role mismatch → redirect to `/`

Login:
  → Email/password → supabase.auth.signInWithPassword()
  → Google OAuth → supabase.auth.signInWithOAuth() → /auth/callback
  → On success → AuthProvider sets user + profile → redirect to original route

Signup:
  → Email/password + name + role → supabase.auth.signUp()
  → Creates auth.users entry
  → Manually inserts user_profiles row
  → Notifies admins of new joinee
  → Shows "Check your email" confirmation page
```

### Review Flow State Machine

```
                    ┌──────────────────┐
                    │  IN PROGRESS     │
                    │  (status: '' or  │
                    │   'In Progress') │
                    └────────┬─────────┘
                             │
                     Joinee submits
                             │
                             ▼
                    ┌──────────────────┐
                    │  PENDING REVIEW  │◄────────────────────┐
                    │(pending_review)  │                     │
                    └────────┬─────────┘                     │
                             │                               │
                    ┌────────┴────────┐                      │
                    │                 │                       │
            Buddy approves     Buddy requests revision
                    │                 │                       │
                    ▼                 ▼                       │
          ┌──────────────────┐  ┌──────────────────┐         │
          │  BUDDY APPROVED  │  │ NEEDS REVISION   │─────────┘
          │(buddy_approved)  │  │(needs_revision)  │
          └────────┬─────────┘  └──────────────────┘
                   │                    │
                   │            Joinee resubmits
                   │                    │
                   │                    ▼
                   │           ┌──────────────────┐
                   │           │ REVISION         │
                   │           │ SUBMITTED        │───────┐
                   │           │(revision_submitted)      │
                   │           └──────────────────┘       │
                   │                    │                  │
                   │            ┌───────┘                  │
                   │            │  Buddy re-reviews        │
                   │            │  (back to pending_review)│
                   │            └──────────────────────────┘
                   │
                   │   Manager approves entire phase
                   │   (all buddy_approved → approved)
                   │
                   ▼
          ┌──────────────────┐
          │     APPROVED     │
          │    (approved)    │
          └──────────────────┘
```

---

## 5. Routing

All routes are defined in `src/App.tsx`. Routes are organized as:

### Auth Routes

| Route | Component | Protection | Purpose |
|-------|-----------|------------|---------|
| `/login` | `Login` | Public | Sign in with email/password or Google OAuth |
| `/signup` | `Signup` | Public | Create account with role selection |
| `/auth/callback` | `AuthCallback` | Public | Google OAuth redirect handler |

### Protected Routes

| Route | Component | Required Roles | Purpose |
|-------|-----------|----------------|---------|
| `/` | `Dashboard` | Any authenticated | Joinee dashboard with phase roadmap |
| `/dashboard` | Redirect to `/` | Any authenticated | Legacy redirect |
| `/phase-1` | `Phase1` | `new_joinee`, `lab_instructor` | Phase 1 worksheet list |
| `/phase-2` | `Phase2` | `new_joinee`, `lab_instructor` | Phase 2 (gated: Phase 1 must be approved) |
| `/phase-3` | `Phase3` | `new_joinee`, `lab_instructor` | Phase 3 (gated: Phase 2 must be approved) |
| `/assessment` | `Assessment` | Any authenticated | Final readiness assessment form |
| `/stakeholders` | `Stakeholders` | Any authenticated | Stakeholder information page |
| `/admin` | `AdminDashboard` | `academic_head`, `onboarding_lead` | Admin dashboard with overview + assignments |
| `/buddy` | `BuddyDashboard` | `lead_instructor`, `academic_head` | Buddy review dashboard |
| `/onboarding-lead` | `OnboardingLeadDashboard` | `onboarding_lead` | Onboarding lead monitoring panel |

### Review Routes

| Route | Component | Required Roles | Params |
|-------|-----------|----------------|--------|
| `/admin/review/:userId/:worksheetId` | `WorksheetReview` | `academic_head`, `onboarding_lead` | userId, worksheetId |
| `/buddy/review/:userId/:worksheetId` | `WorksheetReview` | `lead_instructor`, `academic_head` | userId, worksheetId |
| `/onboarding-lead/review/:userId/:worksheetId` | `WorksheetReview` | `onboarding_lead`, `academic_head` | userId, worksheetId |
| `/admin/review-phase/:userId/:phaseNum` | `PhaseReview` | `academic_head`, `onboarding_lead` | userId, phaseNum |
| `/onboarding-lead/review-phase/:userId/:phaseNum` | `PhaseReview` | `onboarding_lead`, `academic_head` | userId, phaseNum |
| `/buddy/gate-pass/:userId/:gateId` | `BuddyGatePass` | `lead_instructor`, `academic_head` | userId, gateId |

### Dynamic Worksheet Routes

Worksheet routes are generated dynamically from `ALL_WORKSHEETS` + `WORKSHEET_COMPONENTS`:

```
/{phase-name}/worksheet-{num}
  e.g. /phase-1/worksheet-1, /phase-2/worksheet-3, /phase-3/worksheet-5
```

| Parameter | Source |
|-----------|--------|
| `{phase-name}` | Phase name lowercased with spaces replaced by `-` (e.g., "Phase 1" → "phase-1") |
| `{num}` | Number extracted from worksheet ID after `_w` (e.g., `p1_w3` → `3`) |

### Catch-All

| Route | Component | Purpose |
|-------|-----------|---------|
| `*` | `NotFound` | 404 catch-all page |

### Navigation Flow

```
Login/Signup → Dashboard → Phase 1 → Worksheet pages
                                    → Gate Control 1
                           → Phase 2 (if Phase 1 approved) → Worksheet pages
                                                           → Gate Control 2
                           → Phase 3 (if Phase 2 approved) → Worksheet pages
                                                           → Gate Control 3
                           → Assessment (final readiness)
                           → Stakeholders (info page)
                         → Admin Dashboard (academic_head / onboarding_lead)
                         → Buddy Dashboard (lead_instructor)
                         → Onboarding Lead Dashboard (onboarding_lead)
```

---

## 6. Components

### Leaf Components (Reusable)

| Component | File | Props | Internal State | Key Lifecycle | Event Handlers | Purpose |
|-----------|------|-------|---------------|---------------|----------------|---------|
| `Navbar` | `src/components/Navbar.tsx` | `progress?: number` | Mobile drawer open/close, user menu open/close | — | `handleLogout`, `handleMobileToggle` | Navigation bar with role-based links, user menu, notification bell, mobile drawer |
| `ProtectedRoute` | `src/components/ProtectedRoute.tsx` | `children`, `requiredRoles?: UserRole[]` | (none — pure guard) | — | — | Route-level auth guard; redirects to `/login` with `from` state if unauthorized |
| `NotificationBell` | `src/components/NotificationBell.tsx` | (none, reads auth context) | `open: boolean` (dropdown visibility), `ref: RefObject` (outside-click detection) | `useEffect` for outside-click listener (add/remove on open toggle) | `handleNotificationClick` (mark read + navigate), `handleClickOutside` (close dropdown) | Bell icon with unread count + dropdown notification list; navigates to worksheet/review on click |
| `PhaseWorksheetList` | `src/components/PhaseWorksheetList.tsx` | `worksheets: WorksheetMeta[]`, `statuses: Record<string, StatusInfo>` | (none — pure render) | — | — | Worksheet list with badges, due dates, reviewer labels |
| `WorksheetPage` | `src/components/WorksheetPage.tsx` | `worksheetId, phase, icon, title, subtitle, backTo, defaultData, children, requiredFields?, approvedMsg?, submittedMsg?, buddyApproveMsg?` | Delegates to `useWorksheet` hook | `useWorksheet` handles load/save lifecycle | `handleSubmit` (via hook), cancel (navigate back) | Shared wrapper for all 17 worksheet forms; renders status views (Submitted, Approved, BuddyApproved) or form via render-prop |
| `ReviewContent` | `src/components/ReviewContent.tsx` | `data: Record<string, unknown>`, `worksheetId: string` | (none — pure render) | — | — | Renders submitted worksheet data in organized sections |
| `Toast` | `src/components/Toast.tsx` | (provider pattern) | `toasts: ToastItem[]` (queue), `timersRef` (auto-dismiss timers) | `useEffect` subscribes to `onToast` event bridge on mount; cleanup on unmount | `showToast`, `removeToast`, `clearToasts` via context | Toast notification system with success/error/warning/info types; auto-dismiss after 5s; enter/exit animations |
| `ErrorBoundary` | `src/components/ErrorBoundary.tsx` | `children`, `fallback?`, `locationKey?` | `hasError: boolean`, `error: Error | null` | `getDerivedStateFromError` (catch error), `componentDidCatch` (log), `componentDidUpdate` (auto-reset on route change) | `handleReset` (clear error), `handleReload` (window reload) | React class-based error boundary with retry/reload capabilities; auto-resets when locationKey prop changes |

### Worksheet Shared Components (from `src/config/worksheetComponents.tsx`)

| Component | Purpose |
|-----------|---------|
| `WorksheetHeader` | Worksheet title with icon, subtitle, save status |
| `WorksheetSection` | Section card with title and subtitle |
| `FieldGroup` | Form field with label, required indicator, hint |
| `FieldGrid` | Responsive grid layout for form fields |
| `SaveIndicator` | Auto-save status (saving/saved/error) |
| `ActionBar` | Submit/cancel buttons |
| `SubmittedView` | Read-only view after submission |
| `BuddyApprovedView` | View showing buddy-approved status |
| `ApprovedView` | View showing manager-approved status |
| `LoadingView` | Loading state |
| `ReviewFeedback` | Revision feedback banner with history |
| `ErrorAlert` | Error alert display |
| `GridTable` | Table grid renderer for array data |
| `Section` | Gate control section |
| `Slider` | 1-5 rating slider |
| `BackButton` | Navigation back button |
| `ReviewerBadge` | Badge showing reviewer type for a worksheet |

### Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| `PhasesReadyTab` | `src/components/admin/PhasesReadyTab.tsx` | Lists phases ready for manager approval |
| `AssignmentsTab` | `src/components/admin/AssignmentsTab.tsx` | Manager/buddy assignment form |

### Component Hierarchy (Page-level)

```
App (BrowserRouter)
├── AuthProvider
│   └── ToastProvider
│       └── ErrorBoundaryRouteResetter (resets on route change via location.key)
│           ├── Navbar
│           │   └── NotificationBell (uses useNotifications hook + outside-click detection)
│           └── Routes
│               ├── Dashboard
│               │   └── Phase Roadmap → Links to Phase pages
│               ├── Phase1 / Phase2 / Phase3
│               │   └── PhaseWorksheetList (shared component)
│               ├── WorksheetPage (wraps Phase1Worksheet1–Phase3Worksheet5 via render-prop)
│               │   ├── BackButton
│               │   ├── WorksheetHeader (icon, title, save indicator)
│               │   ├── ReviewFeedback (revision banner with history timeline)
│               │   ├── form → children (render-prop context: data, updateField, handleSubmit)
│               │   │   ├── WorksheetSection
│               │   │   ├── FieldGroup / FieldGrid
│               │   │   └── ... (worksheet-specific fields)
│               │   ├── ErrorAlert
│               │   └── ActionBar (Cancel + Submit)
│               ├── WorksheetReview
│               │   └── ReviewContent (renders FIELD_SECTIONS)
│               ├── GateControl1–3 (independent, NOT wrapped by WorksheetPage)
│               │   ├── Section
│               │   ├── Slider (1-5 rating)
│               │   ├── Milestone toggles
│               │   └── Approval Sign-Off fields
│               └── ...
```

### Component State Patterns

- **Hook-driven data fetching:** `useWorksheet` manages loading/saving/submission; worksheets never call Supabase directly
- **Status views as early returns:** `WorksheetPage` checks `isBuddyApproved → isApproved → isSubmitted → loaded` in order, returning different components
- **Render-prop form pattern:** `children` can be a function receiving `WorksheetContext` (data, updateField, handleSubmit, etc.), giving worksheets full control over layout while sharing save/load logic
- **Class-based ErrorBoundary:** Required because React error boundaries must use `componentDidCatch` — cannot be functional components
- **Outside-click detection:** `NotificationBell` uses a `ref` + `mousedown` event listener, added only when dropdown is open

---

## 7. State Management

### Global State

| Context | File | State | Purpose |
|---------|------|-------|---------|
| `AuthContext` | `src/context/AuthContext.tsx` | `user`, `profile`, `loading` | Authentication state for entire app |
| `ToastContext` | `src/components/Toast.tsx` | `toasts` array | Toast notification queue |

### Local State (per page/component)

- **Worksheet forms:** `useState` in each worksheet component, managed centrally by `useWorksheet` hook
- **Dashboard:** `useState` for submissions, loading, filtering
- **Review pages:** `useState` for comment, action loading, action messages
- **Admin Dashboard:** `useState` for instructors, worksheets, tabs, filters

### Custom Hooks

| Hook | File | Return Value | Purpose |
|------|------|--------------|---------|
| `useAutoSave` | `src/hooks/useAutoSave.ts` | `{ saveStatus, flushSave }` | Periodic auto-save + explicit submission |
| `useWorksheet` | `src/hooks/useWorksheet.ts` | `{ data, setData, loaded, submitting, submitError, saveStatus, updateField, handleSubmit, isApproved, isBuddyApproved, isSubmitted, reviewData, flushSave, setSubmitError, setSubmitting }` | Orchestrates entire worksheet lifecycle |
| `useDueDates` | `src/hooks/useDueDates.ts` | `DueDateMap` (Record<string, string>) | Fetch/sync due dates for worksheets |
| `useNotifications` | `src/hooks/useNotifications.ts` | `{ notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh }` | Fetch/manage notifications with polling |

### Caching & Persistence

| Storage Key | Purpose | Set By | Read By |
|-------------|---------|--------|--------|
| `onboarding_progress` | Percentage of total worksheets approved (0-100) | `App.tsx` via `progressUpdate` custom event | `App.tsx` on mount, `Navbar` for progress bar |
| `onboarding_start_date` | Start date for due date calculations | `useDueDates` hook on first load | `useDueDates` hook for worksheet due dates |

- **No client-side cache:** All Supabase queries are fresh on every load
- **No offline support:** The app requires a live network connection — auto-save fails gracefully with retry
- **No stale-while-revalidate:** Every page navigation triggers a fresh Supabase query

### Cross-Component Event System

- **`progressUpdate` custom event:** Dispatched via `window.dispatchEvent(new CustomEvent('progressUpdate', { detail: percentage }))`. Used by worksheet components to update the Navbar progress bar without prop drilling. The App.tsx root listens for this event and syncs it to localStorage.
- **Global toast events:** The `onToast`/`dispatchToast` pattern in `src/utils/errorHandling.ts` uses a subscriber list (`Set<ToastListener>`) to bridge non-React code (error utilities) with the React ToastProvider. Any module can call `dispatchToast(message, type)` without importing React.

### The `_saved*` Property Convention

Worksheet data objects use a convention of `_saved*` prefixed keys to persist review metadata alongside form data within the same JSONB `worksheet_data` column:

| Property | Type | Purpose |
|----------|------|---------|
| `_savedReviewStatus` | string | Current review state (e.g., `approved`, `needs_revision`, `buddy_approved`) |
| `_savedReviewComment` | string | Most recent reviewer feedback comment |
| `_savedReviewerName` | string | Display name of the reviewer |
| `_savedReviewedBy` | string (UUID) | ID of the reviewer |
| `_savedReviewedAt` | string (ISO) | Timestamp of the review action |
| `_savedReviewHistory` | array | Append-only timeline of all review actions (action, reviewer, comment, timestamp) |

This convention allows the form state (name, fields, etc.) and review state to travel together through the same auto-save pipeline, avoiding separate Supabase columns for review metadata on every row.

---

## 8. API Documentation

This application uses **Supabase JS SDK** directly — there is no custom REST API. All "endpoints" are Supabase table queries.

### Supabase Tables & Common Operations

#### `worksheet_submissions`

| Operation | Method | Triggered By | Description |
|-----------|--------|--------------|-------------|
| SELECT | `supabase.from('worksheet_submissions').select('*').eq(...)` | Page loads | Fetch worksheet data |
| UPSERT | `supabase.from('worksheet_submissions').upsert(...)` | Auto-save timer | Save worksheet data |
| UPDATE | `supabase.from('worksheet_submissions').update(...).eq(...)` | Reviewer actions | Approve/reject worksheets |

**Key Query Patterns:**

```typescript
// Load single worksheet for a user
supabase.from('worksheet_submissions')
  .select('*')
  .eq('user_id', userId)
  .eq('worksheet_id', worksheetId)
  .maybeSingle()

// Load all worksheets for a user
supabase.from('worksheet_submissions')
  .select('*')
  .eq('user_id', user.id)

// Upsert (save) worksheet data
supabase.from('worksheet_submissions')
  .upsert({
    user_id, worksheet_id, worksheet_data, phase,
    reviewer_type, status, review_status, updated_at
  }, { onConflict: 'user_id,worksheet_id' })
```

#### `user_profiles`

| Operation | Method | Triggered By |
|-----------|--------|--------------|
| SELECT | `supabase.from('user_profiles').select('*').eq('id', userId)` | Auth check, page loads |
| INSERT | `supabase.from('user_profiles').insert(...)` | Signup |
| UPDATE | `supabase.from('user_profiles').update(...).eq('id', userId)` | Assignments |

#### `notifications`

| Operation | Method | Triggered By |
|-----------|--------|--------------|
| SELECT | `supabase.from('notifications').select('*').eq('user_id', userId)` | Polling interval |
| INSERT | `supabase.from('notifications').insert(...)` | Submit/approve/revision actions |
| UPDATE | `supabase.from('notifications').update({ read: true }).eq('id', ...)` | Mark as read |

#### `onboarding_submissions`

| Operation | Method | Triggered By |
|-----------|--------|--------------|
| SELECT | `supabase.from('onboarding_submissions').select('id').eq('email', email)` | Assessment submission |
| INSERT | `supabase.from('onboarding_submissions').insert(...)` | Assessment form |
| UPDATE | `supabase.from('onboarding_submissions').update(...).eq('id', ...)` | Assessment update |

### Auth API

| Method | Parameters | Description |
|--------|------------|-------------|
| `supabase.auth.signUp()` | `{ email, password, options: { data: { full_name, role } } }` | Email/password signup |
| `supabase.auth.signInWithPassword()` | `{ email, password }` | Email/password login |
| `supabase.auth.signInWithOAuth()` | `{ provider: 'google', options: { redirectTo } }` | Google OAuth |
| `supabase.auth.signOut()` | (none) | Sign out |
| `supabase.auth.getSession()` | (none) | Get current session |
| `supabase.auth.getUser()` | (none) | Get current user metadata |
| `supabase.auth.onAuthStateChange()` | (callback) | Listen for auth events |

### Error Responses

Supabase errors have the shape `{ message: string, code: string, details: string }`.
Common codes:
- `PGRST116` — No rows found (handled gracefully)
- `42P01` — Table does not exist (shown as error message in Assessment page)
- `23505` — Unique violation (on conflict)

---

## 9. Database

The definitive schema is in `db/schema.sql`. Key tables:

### `user_profiles`

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PK, REFERENCES auth.users(id) | User ID (matches auth.users) |
| `email` | TEXT | | User email |
| `full_name` | TEXT | | Display name |
| `role` | TEXT | CHECK: new_joinee, lab_instructor, lead_instructor, academic_head, onboarding_lead, acad_ops | User role for RBAC |
| `department` | TEXT | | Optional department |
| `assigned_lead_id` | UUID | REFERENCES user_profiles(id) | Assigned manager |
| `assigned_buddy_id` | UUID | REFERENCES auth.users(id) | Assigned buddy/mentor |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record created timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW(), auto-updated | Last modified timestamp |

**RLS Policies:**
- Users can read/insert/update their own profile
- Users with role academic_head, lead_instructor, onboarding_lead can read all profiles (via JWT `user_metadata.role`)
- Users with role academic_head, lead_instructor, onboarding_lead can update any profile

### `worksheet_submissions`

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Row ID |
| `user_id` | UUID | REFERENCES auth.users(id) | Owner (joinee) |
| `worksheet_id` | TEXT | NOT NULL | Worksheet identifier (e.g., p1_w1) |
| `worksheet_data` | JSONB | DEFAULT '{}' | Form field values |
| `phase` | TEXT | NOT NULL | Phase identifier (e.g., phase-1) |
| `status` | TEXT | DEFAULT 'Not Started' | Instructor-facing status |
| `review_status` | TEXT | CHECK: '', pending_review, buddy_approved, needs_revision, revision_submitted, approved | Review state machine |
| `reviewer_type` | TEXT | CHECK: buddy, manager, onboarding_lead | Who should review |
| `reviewed_by` | UUID | REFERENCES auth.users(id) | Who performed review |
| `reviewer_name` | TEXT | | Reviewer display name |
| `review_comment` | TEXT | | Review feedback |
| `reviewed_at` | TIMESTAMPTZ | | When review happened |
| `review_history` | JSONB | DEFAULT '[]' | Append-only review timeline |
| `due_date` | DATE | | When worksheet is due |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record created |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW(), auto-updated | Last modified |
| | | UNIQUE(user_id, worksheet_id) | Enables upsert |

**RLS Policies:**
- Joinees can read/insert/update their own submissions
- Reviewers (lead_instructor, academic_head via JWT or assigned via user_profiles) can read all submissions
- Reviewers (lead_instructor, academic_head via JWT or assigned) can update submissions

### `notifications`

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Row ID |
| `user_id` | UUID | REFERENCES auth.users(id), NOT NULL | Notification recipient |
| `from_user_id` | UUID | REFERENCES auth.users(id) | Who triggered the notification |
| `worksheet_id` | TEXT | NOT NULL | Related worksheet |
| `type` | TEXT | CHECK: submitted, revision_submitted, approved, buddy_approved, needs_revision, due_soon, overdue | Notification type |
| `message` | TEXT | NOT NULL | Notification text |
| `read` | BOOLEAN | DEFAULT false | Whether notification has been read |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | When notification was created |

### `onboarding_submissions`

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Row ID |
| `user_id` | UUID | REFERENCES auth.users(id) | User ID |
| `new_instructor_name` | TEXT | NOT NULL | Instructor name |
| `email` | TEXT | NOT NULL | Instructor email |
| `phase1_completed` | BOOLEAN | DEFAULT false | Phase 1 completion flag |
| `phase2_completed` | BOOLEAN | DEFAULT false | Phase 2 completion flag |
| `phase3_completed` | BOOLEAN | DEFAULT false | Phase 3 completion flag |
| `phase1_data` | JSONB | DEFAULT '{}' | Phase 1 assessment data |
| `phase2_data` | JSONB | DEFAULT '{}' | Phase 2 assessment data |
| `phase3_data` | JSONB | DEFAULT '{}' | Phase 3 assessment data |
| `assessment_level` | TEXT | CHECK: fully_independent, needs_minor_support, needs_development | Final readiness level |
| `assessment_data` | JSONB | DEFAULT '{}' | Assessment details |
| `overall_status` | TEXT | CHECK: not_started, phase1_complete, phase2_complete, phase3_complete, assessed | Onboarding progress status |

### Indexes

```sql
-- onboarding_submissions
idx_onboarding_email      ON onboarding_submissions (email)
idx_onboarding_status     ON onboarding_submissions (overall_status)

-- worksheet_submissions
idx_worksheets_user       ON worksheet_submissions (user_id)
idx_worksheets_id         ON worksheet_submissions (worksheet_id)
idx_worksheets_review     ON worksheet_submissions (review_status)
idx_worksheets_reviewer_type ON worksheet_submissions (reviewer_type)

-- user_profiles
idx_profiles_role         ON user_profiles (role)
idx_profiles_lead         ON user_profiles (assigned_lead_id)
idx_profiles_buddy        ON user_profiles (assigned_buddy_id)

-- notifications
idx_notifications_user_read ON notifications (user_id, read)
idx_notifications_created   ON notifications (created_at DESC)
```

---

## 10. Authentication

### Signup (`src/pages/Signup.tsx`)

1. User fills in name, email, password, and selects role
2. `signUp()` in `AuthContext.tsx` calls `supabase.auth.signUp()` with `options.data: { full_name, role }`
3. If successful, manually inserts into `user_profiles`
4. Notifies all managers + onboarding leads about new joinee
5. Shows "Account Created — check your email" page

### Login (`src/pages/Login.tsx`)

1. Email/password → `supabase.auth.signInWithPassword()`
2. Google OAuth → `supabase.auth.signInWithOAuth({ provider: 'google' })`
3. On success, `AuthProvider` detects `SIGNED_IN` event, fetches profile
4. Redirects to original route (stored in `location.state.from`)

### OAuth Callback (`src/pages/AuthCallback.tsx`)

1. Receives OAuth callback with session token
2. Checks for `error_description` in URL params
3. Attempts to get session → redirects to `/` on success, `/login` on failure

### Session Management

- Sessions are managed via Supabase's built-in JWT + refresh token system
- `AuthProvider` subscribes to `onAuthStateChange` for real-time auth state changes
- On `SIGNED_IN` → fetch profile
- On `SIGNED_OUT` → clear user + profile state
- `getSession()` on mount to restore existing session

### Role-Based Authorization

- **Route level:** `ProtectedRoute` checks `requiredRoles` against `profile.role`
- **UI level:** Components hide/show features based on role (e.g., `hasRole('academic_head')`)
- **Database level:** RLS policies use `auth.jwt() -> 'user_metadata' ->> 'role'` to avoid recursion

### Known Limitation

Role changes require **re-login** because the JWT token is not refreshed immediately when the `user_profiles` table changes. The `supabase.auth.updateUser()` API is used during auto-promotion to update the JWT metadata, but this only works for the current user.

---

## 11. User Roles

| Role | Description | Can Submit Worksheets | Can Review Buddy Worksheets | Can Review Manager Worksheets | Can Approve Phases | Can Assign Buddies/Managers | Can Read All Profiles |
|------|-------------|:---:|:---:|:---:|:---:|:---:|:---:|
| `new_joinee` | New instructor | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lab_instructor` | Lab instructor | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `lead_instructor` | Buddy / Mentor | ❌ | ✅ | ✅ (all) | ❌ | ❌ | ✅ |
| `academic_head` | Manager | ❌ | ✅ (read) | ✅ (read) | ✅ | ✅ | ✅ |
| `onboarding_lead` | Onboarding Lead | ❌ | ❌ (read-only) | ❌ (read-only) | ❌ | ✅ | ✅ |
| `acad_ops` | Acad Ops | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Permission Matrix

| Action | new_joinee | lab_instructor | lead_instructor | academic_head | onboarding_lead | acad_ops |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| View own dashboard | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View buddy dashboard | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View admin dashboard | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| View monitoring panel | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Fill worksheets | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Submit worksheets | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve (buddy_approved) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Approve phase (approved) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Request revision | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Fill gate pass (buddy) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Assign buddy/manager | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Read-only monitoring | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Read assessments | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View stakeholders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Allowed Pages by Role

| Page | new_joinee | lab_instructor | lead_instructor | academic_head | onboarding_lead | acad_ops |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| `/` Dashboard | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/phase-1` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/phase-2` | ✅ (gated) | ✅ (gated) | ❌ | ❌ | ❌ | ❌ |
| `/phase-3` | ✅ (gated) | ✅ (gated) | ❌ | ❌ | ❌ | ❌ |
| `/buddy` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `/admin` | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `/onboarding-lead` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `/assessment` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/stakeholders` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 12. Business Logic

### Worksheet Submission Flow

1. Joinee opens a worksheet → `useWorksheet` loads saved data from `worksheet_submissions`
2. Joinee fills form → `useAutoSave` auto-saves every 1.5 seconds via upsert
3. Joinee clicks Submit → `handleSubmit`:
   - Validates required fields (from `requiredFields` config)
   - Sets `status: 'submitted'`, `dateSubmitted: now`
   - Calls `flushSave()` which upserts with `review_status` logic:
     - If previous was `needs_revision` → `revision_submitted`
     - If previous was `buddy_approved` → preserve `buddy_approved`
     - If previous was `approved` → preserve `approved`
     - Otherwise → `pending_review`
4. Sends notification to assigned reviewer
5. Worksheet re-renders as `SubmittedView`

### Reviewer Flow (Buddy)

1. Buddy dashboard shows all pending worksheets from assigned instructors
2. Buddy opens `WorksheetReview` page → sees submitted content via `ReviewContent`
3. Buddy can:
   - **Approve** → sets `review_status: 'buddy_approved'`, appends to `review_history`
   - **Request Revision** → sets `review_status: 'needs_revision'`, requires comment
4. Notifications sent to joinee for both actions

### Reviewer Flow (Manager — Phase Approval)

1. Manager sees phases that are ready (all worksheets buddy_approved) in Admin Dashboard
2. Opens `PhaseReview` page → sees all worksheets in the phase with their statuses
3. Clicks "Approve Phase" → all buddy_approved worksheets get `review_status: 'approved'`
4. After approval:
   - Notifies joinee and assigned buddy
   - Runs `checkAndPromote()` to check if all 3 phases are now complete

### Auto-Promotion Logic (`src/hooks/useAutoPromote.ts`)

1. Triggered after every phase approval
2. Queries all 20 worksheet IDs across all 3 phases
3. If ALL 20 have `review_status === 'approved'`:
   - Updates `user_profiles.role` to `lead_instructor`
   - Updates auth metadata via `supabase.auth.updateUser()`
   - Sends promotion notification to the user
   - Sends notification to all managers
4. If not all approved, returns count of approved/total

### Phase Gating Logic

- **Phase 2** requires Phase 1 to be fully approved (`isPhaseApproved(userId, 1, submissions)`)
- **Phase 3** requires Phase 1 AND Phase 2 to be fully approved
- Verified in `src/config/worksheetConfigData.ts` via `canAccessPhase()`
- Phase pages show a "Locked" view with a link to the previous phase

### Due Date Logic (`src/hooks/useDueDates.ts`)

- Each worksheet has a default day offset from onboarding start date
- Phase 1: Days 1–30, Phase 2: Days 31–60, Phase 3: Days 61–90
- Start date defaults to 30 days ago (for demo) or `localStorage.onboarding_start_date`
- Display: "Due in Xd", "Due today", "Overdue by Xd"
- Color-coded: green (normal), orange (due soon, ≤2 days), red (overdue)

### Notification Logic (`src/hooks/useNotifications.ts`)

- Polls every 15 seconds for new notifications
- Types: `submitted`, `revision_submitted`, `approved`, `buddy_approved`, `needs_revision`, `due_soon`, `overdue`
- Notifications are created:
  - On new signup (joinee → admins notified)
  - On worksheet submit (joinee → assigned reviewer notified)
  - On buddy approve (buddy → joinee notified, manager notified)
  - On revision request (reviewer → joinee notified)
  - On phase approve (manager → joinee + buddy notified)
  - On auto-promotion (system → user + managers notified)

---

## 13. Forms

### WorksheetPage Render-Prop Pattern

The `WorksheetPage` component (`src/components/WorksheetPage.tsx`) uses a **render-prop** pattern where `children` can be either static JSX or a function receiving a `WorksheetContext` object:

```tsx
<WorksheetPage worksheetId="p1_w1" phase="phase-1" icon={Users} title="..." subtitle="..." backTo="/phase-1" defaultData={{...}}>
  {(ctx) => (
    <>
      <WorksheetSection title="About You">
        <FieldGroup label="Your Name" required>
          <input className="lux-input" value={ctx.data.employeeName as string}
            onChange={e => ctx.updateField('employeeName', e.target.value)} />
        </FieldGroup>
      </WorksheetSection>
    </>
  )}
</WorksheetPage>
```

The `WorksheetContext` provides: `data, setData, loaded, submitting, submitError, saveStatus, updateField, updateArrayItem, updateArrayItemEvent, handleSubmit, isApproved, isBuddyApproved, isSubmitted`. This pattern eliminates the need for each worksheet to manage its own save/load/submit state.

### FieldGroup / FieldGrid Composition

| Component | File | Purpose |
|-----------|------|---------|
| `FieldGroup` | `src/config/worksheetComponents.tsx` | Wraps a form field with label, required asterisk, optional hint text. Props: `label`, `required?`, `id?`, `hint?` |
| `FieldGrid` | `src/config/worksheetComponents.tsx` | Responsive CSS grid layout for fields. Props: `cols` (number of columns) |
| `WorksheetSection` | `src/config/worksheetComponents.tsx` | Section card with title and subtitle, separates form into logical groups |

Example: `<FieldGrid cols={2}><FieldGroup label="Name">...<FieldGroup label="Email">...</FieldGrid>`

### Worksheet Forms (17 worksheets + 3 gate controls)

Each worksheet follows the same pattern:

**Validation:**
- `requiredFields` array specifies which fields must be non-empty before submission
- Example: `[{ key: 'employeeName', label: 'Instructor Name' }, { key: 'department', label: 'Department' }]`
- Validation happens client-side before `flushSave`
- Missing fields are listed in the error message

**Submission Flow:**
1. User edits form → local state updates
2. Auto-save triggers after 1.5s of inactivity (debounced)
3. User clicks Submit → `handleSubmit()` validates → `flushSave()` upserts with `status: 'submitted'`
4. `useAutoSave` sets review_status based on previous state:
   - If previous was `needs_revision` → `revision_submitted`
   - If previous was `buddy_approved` → preserve `buddy_approved`
   - If previous was `approved` → preserve `approved`
   - Otherwise → `pending_review`
5. Triggers notification to assigned reviewer
6. Page switches to `SubmittedView` (read-only) on reload

**Error Handling:**
- Auto-save failures: `setSaveStatus('error')`, retries once after 5s
- Submit validation errors: `setSubmitError('Please fill in: [field names]')`
- Supabase errors: `notifyError()` triggers toast via global event bridge

**Loading State:**
- `useWorksheet` returns `loaded` boolean
- While loading: `LoadingView` component shown
- After loading: form rendered with saved data (or empty for new)

**Reset Logic:**
- No explicit reset — "Cancel" button navigates back to phase page
- Data remains saved (no "undo" for form data)

**Accessibility:**
- Labels use `htmlFor` / `id` associations
- Radio buttons on Signup use visually-hidden pattern (clip: rect)
- Form inputs have `required` attributes
- Inputs have `autocomplete` attributes (name, email, new-password)
- Select dropdowns have custom chevron via CSS background-image
- Textareas have `rows` attribute and `resize: vertical`

### Gate Control Forms (GC1, GC2, GC3)

Gate controls **bypass** the `WorksheetPage` wrapper and use `useWorksheet` directly, duplicating form infrastructure:

- **Self-assessment sliders** — `Slider` component renders 5 numbered buttons (1-5 rating). Clicking a number sets the value; value <= n buttons get dark fill. Hover transitions on buttons.
- **Milestone toggles** — `toggleMilestone(i)` cycles through `['Not Met', 'Partial', 'Met']` on click. Visual indicator (colored dot + left border) changes with status color: green (Met), orange (Partial), grey (Not Met).
- **Manager review section** — Textareas for strengths/risks, select for readiness decision
- **Signature fields** — Two text inputs (manager + instructor signature)
- **Submit** — `handleSubmit` directly manages `_saved*` fields, calls `flushSave(d)` with explicit data object (not relying on auto-save debounce)
- **Revision banner** — Duplicated inline (not using shared `ReviewFeedback` component), shows revision feedback + resubmit instructions

### Assessment Form

- Instructor name, email, faculty lead name
- Readiness level selection (Fully Independent / Needs Minor Support / Needs Development)
- Criteria checklist for each level
- Comments textarea
- Submits to `onboarding_submissions` table
- Handles both INSERT and UPDATE (checks for existing record via `onboarding_submissions.id`)

---

## 14. Error Handling

### Client Errors

| Scenario | Handling | Location |
|----------|----------|----------|
| Missing Supabase env vars | Console error with styled message | `src/api/supabase.ts` |
| Auth signup error | Error message displayed in form | `src/pages/Signup.tsx` |
| Auth login error | Specific messages for "Invalid credentials" vs "Email not confirmed" | `src/pages/Login.tsx` |
| Google OAuth error | Error message in URL params → displayed in AuthCallback | `src/pages/AuthCallback.tsx` |
| Supabase query error | `console.error()` + toast notification via `notifyError()` | Various |
| RLS recursion detected | Console warning + fallback to auth metadata | `src/context/AuthContext.tsx` |

### Server Errors

| Scenario | Handling | Location |
|----------|----------|----------|
| Table not found (42P01) | Specific error message suggesting SQL schema | `src/pages/Assessment.tsx` |
| Auto-save failure | Retry once after 5s, show error indicator | `src/hooks/useAutoSave.ts` |
| Network error in fetch | `console.error()`, attempt continues | Various |

### Error Boundary

- `ErrorBoundary` component (`src/components/ErrorBoundary.tsx`) wraps the entire app below Navbar
- **Class-based** React error boundary (must use `componentDidCatch`)
- Catches unhandled React errors via `getDerivedStateFromError`
- Shows error UI with "Refresh Page" (`window.location.reload()`) and "Try Again" (`setState({ hasError: false })`) buttons
- Displays error message in monospace font for debugging
- **Auto-resets on route change** via `ErrorBoundaryRouteResetter` wrapper in `App.tsx` — passes `locationKey={location.key}` prop. When `componentDidUpdate` detects a key change, it clears the error state, allowing seamless navigation recovery
- Logs errors to console via `componentDidCatch(error, errorInfo)`

### Toast System

- `ToastProvider` at app root, wraps entire component tree
- Provides `showToast`, `removeToast`, `clearToasts` via `ToastContext`
- **Global bridge:** `src/utils/errorHandling.ts` exports `dispatchToast(message, type)` and `onToast(listener)`. `ToastProvider` subscribes via `onToast` on mount. This means ANY code (hooks, utilities, even non-React) can trigger toasts without importing React context.
- Types: `success` (green left border), `error` (red), `warning` (orange), `info` (charcoal)
- Auto-dismiss after 5000ms (configurable per call), uses `setTimeout` stored in `timersRef`
- Stacked vertically at bottom-right, `z-index: 9999`
- Enter animation: fade in + slide up (500ms `var(--ease-lux)`)
- Dismiss button (`X`) on each toast
- Cleanup on unmount clears all pending timers

### 404 Handling

- `NotFound` page for unknown routes
- Links back to Dashboard and Login
- Gold decorative line + large "404" heading
- Styled with the luxury design system (Playfair Display heading, Inter body)

### Loading States

- `LoadingView` component (centered "Loading..." text in worksheet context)
- Loading skeletons in `WorksheetReview` page (while fetching worksheet data)
- Loading spinners in `AuthCallback` page (while resolving OAuth session)
- Loading indicators for all dashboard data fetches (set `loading` state → conditional render)
- `setLoading(false)` in `finally` blocks (with some gaps noted in Known Issues)

### Dashboard Empty States

- **Dashboard:** When no submissions exist, the phase roadmap shows worksheets as "Not Started" and overall progress bar is hidden. Status legend badges are shown regardless.
- **Admin Dashboard:** When no phases are ready, shows "All Caught Up" message with explanation. When no assignments exist, shows "No assignments yet."
- **Buddy Dashboard:** Shows empty states for each tab (Pending Review, Buddy Approved, My Instructors) when no worksheets match the filter.
- **NotificationBell:** Shows "No notifications yet" with a subdued bell icon when the notifications list is empty.

---

## 15. Security

### Authentication

- **Email/password** via Supabase Auth (bcrypt hashed)
- **Google OAuth** via Supabase + Google provider
- **Email confirmation** required (default Supabase setting)
- **No password reset flow** yet (not implemented)

### Authorization

- **Row-Level Security (RLS)** on all tables:
  - `user_profiles`: users read own, admins read all (via JWT role check)
  - `worksheet_submissions`: owners CRUD, reviewers read/update (via JWT or assignment)
  - `notifications`: users read own, any auth user can insert
  - `onboarding_submissions`: owners CRUD, admins read all
- **ProtectedRoute** for frontend route protection
- **Role checks** in components (hide/show UI elements)
- **JWT-based role checks** in RLS (`auth.jwt() -> 'user_metadata' ->> 'role'`) to avoid recursion

### Known Security Issues

1. **Role self-selection on signup:** Users can select any role when signing up (`src/pages/Signup.tsx` line 87). There is no server-side restriction on what role a new user can choose. This is a critical security gap — a user could sign up as `academic_head` or `onboarding_lead` and gain elevated access.

2. **No rate limiting on auth:** No explicit rate limiting on login/signup attempts (handled by Supabase defaults).

3. **Environment variables:** Supabase URL and anon key are bundled into the frontend build. The anon key is designed to be public (RLS is the security layer), but the `service_role` key must never be exposed.

4. **No CSRF protection:** The app uses token-based auth (Bearer token), which is inherently CSRF-resistant for API calls. The anon key is public.

5. **No XSS sanitization:** Worksheet data is stored as JSONB and rendered via React's JSX (which escapes by default), but there's no explicit sanitization layer.

### Recommended Improvements

1. Disable role self-selection on signup; default all new users to `new_joinee` and let admins promote them
2. Add role verification on the server side using Supabase Auth hooks or triggers
3. Add CAPTCHA to auth forms in production
4. Implement proper password reset flow

---

## 16. Performance

### Bundle Size

- **Dependencies:** React 19, React Router 7, Supabase JS, Lucide Icons
- **Build time:** ~170ms (Vite with esbuild)
- **No code splitting** currently — entire app is one bundle
- Tree-shaking enabled via ESM imports

### Rendering

- **No React.memo** on any components — all re-renders are uncontrolled
- Worksheet forms re-render on every keystroke (no debounced state updates)
- `useAutoSave` uses 1.5s debounce to reduce write frequency, but re-renders still happen
- Phase pages animate worksheets with staggered CSS animations (0.04s per worksheet × 8 = 0.32s total delay)

### Memoization

- `useCallback` used for: `updateField`, `updateArrayItem`, `updateArrayItemEvent`, `validate`, `handleSubmit` in `useWorksheet`
- `useMemo` used for: `reviewData` in `useWorksheet`
- No `React.memo` on any component

### Lazy Loading

- **None.** All worksheets are eagerly imported in `worksheetConfig.tsx`
- All pages are eagerly imported in `App.tsx`

### Pagination

- **None.** All data fetches load all rows (e.g., all worksheets for a user, all user_profiles for admin)
- Admin/Buddy/OnboardingLead dashboards load ALL submissions from Supabase

### Caching

- **None.** Every page load re-fetches data from Supabase
- localStorage only used for `onboarding_progress` (percentage) and `onboarding_start_date`

### Database Optimization

- Indexes exist on: `user_id`, `worksheet_id`, `review_status`, `reviewer_type`, `role`, `assigned_lead_id`, `assigned_buddy_id`, `email`, `overall_status`, `user_id + read`, `created_at DESC`
- No N+1 query issues identified (single-table queries)
- No complex JOIN queries — all data fetched separately

### Performance Risks

1. Admin dashboard loads ALL worksheet submissions (no pagination) — will slow with many users
2. Buddy dashboard loads all worksheets for assigned instructors — same issue
3. No code splitting — initial bundle includes all 17 worksheets + 3 gate controls
4. No image optimization needed (no images)
5. Frequent re-renders during worksheet editing

---

## 17. UI/UX Review

### Design System

The app follows a **Luxury/Editorial** design system defined in `src/styles/index.css`:

- **Colors:** Alabaster (#F9F8F6) background, Charcoal (#1A1A1A) text, Gold (#D4AF37) accents, Warm Grey (#6C6863) secondary text
- **Typography:** Playfair Display (serif) for headings, Inter (sans-serif) for body
- **Border radius:** 0px throughout (sharp, editorial look)
- **Animations:** Custom `--ease-lux` cubic-bezier easing, 500ms default transitions
- **Paper noise texture:** Subtle SVG noise overlay for "expensive paper" feel
- **Shadows:** Very subtle layered shadows for cards and buttons

### Layout

- `lux-container`: max-width 1600px, responsive padding
- `lux-section`: vertical padding sections
- Mobile breakpoint at 768px and 850px (navbar)
- Desktop nav at ≥850px, mobile drawer at <850px

### Consistency

- Status colors are hardcoded as raw hexes throughout (not CSS variables)
- Page max-width varies: Dashboard uses `lux-container` (1600px), Phase pages use 900px, Worksheet pages use 720px
- Button hover transitions use 500ms (too slow for interactive feedback)
- Phase page animations stagger at 0.04s × number of worksheets

### Accessibility

- ✅ Labels use `htmlFor` / `id` associations on admin dashboard selects
- ✅ Autocomplete attributes on signup inputs (name, email, new-password)
- ✅ Favicon exists at `/favicon.svg`
- ✅ `lux-btn` has `:focus-visible` outline (1px solid charcoal, offset 2px)
- ✅ `aria-label` on NotificationBell button (includes unread count when >0)
- ✅ `aria-label="Dismiss"` on toast dismiss buttons
- ✅ `role` and `tabIndex` on clickable phase cards for keyboard accessibility
- ✅ Reduced motion media query (`prefers-reduced-motion: reduce`) disables all animations, removes gold overlay hover on primary buttons
- ❌ Radio buttons on Signup use `display: none` on the actual input, removing native focus indicators (fixed with visually-hidden CSS instead)
- ❌ No skip-to-content link for keyboard users
- ❌ No ARIA landmarks beyond native HTML5 semantics
- ❌ Form validation errors are not associated with inputs via `aria-describedby`
- ❌ Focus order after submit error is not managed (focus stays on submit button)
- ❌ No `aria-live` region for dynamic content updates (toast messages use their own rendering)

### Mobile Responsiveness

- **Desktop-first design:** The app is primarily designed for desktop (1600px max-width container)
- **Breakpoints:** 768px (tablet), 850px (navbar collapse), 640px (grid single column), 1024px (section padding increase)
- **Navbar:** Desktop nav at >=850px, mobile drawer (slide-in menu) at <850px. Hamburger toggle button appears below 850px.
- **Page layouts:** `lux-container` uses `padding: 0 1rem` on mobile, `padding: 0 4rem` on desktop
- **Phase layout:** 2-column grid collapses to 1 column at 640px
- **Worksheet forms:** Single column layout (FieldGrid cols=2 may wrap on small screens)
- **Admin dashboard:** Grid layouts use `auto-fit, minmax(200px, 1fr)` for flexible column wrapping
- **Notification dropdown:** Fixed width 360px, max-height 480px with scroll — positioned at right edge
- **Font scaling:** Dashboard hero uses `clamp(2.25rem, 4.5vw, 3.5rem)` for responsive heading sizing
- **Touch targets:** Buttons have `min-height: 44px` (WCAG touch target recommendation). `-webkit-tap-highlight-color: transparent` removes mobile highlight.
- **Paper noise texture:** Fixed position, z-index 50, pointer-events none — renders on all screen sizes

### Color Contrast Analysis

| Element | Foreground | Background | Ratio | WCAG AA |
|---------|-----------|-----------|-------|---------|
| Body text | #1A1A1A (charcoal) | #F9F8F6 (alabaster) | 15.8:1 | ✅ Pass |
| Secondary text | #6C6863 (warm grey) | #F9F8F6 (alabaster) | 6.2:1 | ✅ Pass |
| Gold accent text | #D4AF37 (gold) | #F9F8F6 (alabaster) | 2.4:1 | ❌ Fail (decorative only) |
| White on black | #FFFFFF | #1A1A1A | 17.2:1 | ✅ Pass |
| Purple badge | #381E72 | #F9F8F6 | 8.4:1 | ✅ Pass |
| Red badge | #C62828 | #F9F8F6 | 5.8:1 | ✅ Pass |
| Green badge | #1B5E20 | #F9F8F6 | 9.1:1 | ✅ Pass |
| Hover state | #D4AF37 | #F9F8F6 | 2.4:1 | ❌ Fail (ghost button hover) |

**Note:** Gold (#D4AF37) is used decoratively (accents, lines, hover overlays) and does not carry critical information. Ghost button hover to gold fails AA but is a transient interactive state.

### UI Components

- **Buttons:** Primary (dark bg, gold slide-in hover), Secondary (bordered, fill on hover), Ghost (text only)
- **Inputs:** Underline-only design, gold focus indicator, italic placeholders
- **Cards:** Defined by top border + shadow only, no background
- **Badges:** Editorial style with border
- **Progress bars:** Thin (2px) minimalist design
- **Alerts:** Left border accent design

---

## 18. Code Quality

### Folder Organization

- Clean separation: `types/`, `config/`, `hooks/`, `utils/`, `api/`, `context/`, `components/`, `pages/`
- Worksheets organized by phase in `pages/worksheets/`
- Gate controls in `pages/gate-controls/`
- Admin sub-components in `components/admin/`

### Naming Conventions

- PascalCase for components, camelCase for functions/variables, SCREAMING_SNAKE_CASE for constants
- Worksheet IDs follow pattern: `p{phase}_w{num}` (e.g., `p1_w3`, `p3_w5`)
- Gate control IDs: `gc1`, `gc2`, `gc3`
- Types follow Supabase type names: `UserProfile`, `WorksheetSubmission`, `ReviewStatus`

### Clean Code

- ✅ Single responsibility: hooks, config, components all have clear purposes
- ✅ DRY: `useWorksheet` eliminates ~60 lines of boilerplate per worksheet
- ✅ KISS: Direct Supabase queries instead of custom API layer
- ✅ Re-export pattern: `config/index.ts` re-exports from sub-modules
- ✅ Theme tokens: `t` object in `theme.js` provides CSS variable aliases
- ❌ No barrel exports for all pages (App.tsx has individual imports)
- ❌ Gate controls have duplicated form logic (not using `WorksheetPage` wrapper)

### Good Patterns (Concrete Examples)

1. **`useWorksheet` hook abstraction** (`src/hooks/useWorksheet.ts`): Centralizes load, save, validate, and submit logic for all 17 worksheets. Each worksheet page only needs to call `useWorksheet()` and render fields. Saves ~60 lines of boilerplate per worksheet (~1,000 lines total saved).

2. **`extractEventValue` helper**: Normalizes event values across input types (text inputs, textareas, checkboxes, selects) into a single pattern. Used by `updateField` to handle `e.target.value`, `e.target.checked`, and null edge cases.

3. **Render-prop WorksheetPage** (`src/components/WorksheetPage.tsx`): Separates layout (header, action bar, status views) from content (form fields). Worksheets only provide JSX or a render function — layout and lifecycle are shared.

4. **Barrel exports**: Each module folder has `index.ts` that re-exports all public symbols. Importers use `import { useWorksheet, useAutoSave } from '../hooks'` instead of deep imports.

5. **Theme token object** (`src/config/theme.js`): The `t` object aliases CSS variables (`t.ch` → `var(--color-charcoal)`), providing both IDE autocomplete and runtime access for inline styles.

6. **Error event bridge** (`src/utils/errorHandling.ts`): Uses a simple subscriber pattern (`Set<ToastListener>`) to decouple error utilities from React's component tree. Non-React code can call `dispatchToast()` without importing React.

### Bad Patterns (Technical Debt)

1. **Gate control duplication**: GC1, GC2, GC3 each independently manage save/load/submit, duplicating code from `useWorksheet` and `WorksheetPage`. Bug fixes to the shared hook don't apply to gate controls. Estimated ~80 lines of duplicated logic per gate control (240 total). Gate controls also use a different `handleSubmit` that directly sets `_savedReviewStatus` instead of going through the shared submission pipeline (e.g., no notifications triggered on gate control submit).

2. **Hardcoded status colors**: Status badge colors (`#1B5E20`, `#C62828`, `#381E72`, `#7D5260`, `#E65100`) are hardcoded in 15+ component files instead of using CSS variables from `theme.js`. Changing the color scheme requires find-and-replace across the codebase.

3. **Inline RevisionBanner in gate controls**: Regular worksheets use the shared `ReviewFeedback` component, but gate controls duplicate the revision feedback UI inline with hardcoded strings and styles.

4. **Inconsistent import paths**: Some files import from `'../hooks/useNotifications'` while others import from `'../../hooks/useNotifications'` — barrel exports exist but aren't consistently used.

5. **`index.html` references `main.jsx`**: Should reference `main.tsx` but Vite resolves the extension automatically.

6. **Old `.jsx` files in git history**: The JSX-to-TSX migration added new `.tsx` files and deleted old `.jsx` files. The git history retains the deleted files, and any `git cherry-pick` or merge could reintroduce them.

### TypeScript Usage

- ✅ Strict mode enabled in `tsconfig.json`
- ✅ No unused locals/parameters
- ✅ No unchecked indexed access
- ✅ Union types for roles, worksheet IDs, review statuses
- ✅ `as` casts used sparingly (mostly for Supabase response casting)
- ❌ Some `any` usage (marked as warning in ESLint config)

---

## 19. Dependencies

### Production Dependencies

| Package | Version | Purpose | Can It Be Removed? | Security Concern? |
|---------|---------|---------|:---:|:---:|
| `@supabase/supabase-js` | ^2.108.2 | Supabase backend client | No | Low (well-maintained) |
| `dotenv` | ^17.4.2 | Environment variables | Yes (Vite handles env) | Low |
| `lucide-react` | ^1.21.0 | Icon library | No (heavily used) | Low (MIT) |
| `react` | ^19.2.6 | UI framework | No | Low |
| `react-dom` | ^19.2.6 | React DOM renderer | No | Low |
| `react-router-dom` | ^7.18.0 | Client-side routing | No | Low |
| `tslib` | ^2.8.1 | TypeScript helpers | Yes (tslib is helper) | Low |
| `ws` | ^8.21.0 | WebSocket (Supabase realtime) | Yes (if realtime not used) | Low |

### Dev Dependencies

| Package | Version | Purpose | Can It Be Removed? |
|---------|---------|---------|:---:|
| `@eslint/js` | ^10.0.1 | ESLint config | No |
| `@tailwindcss/vite` | ^4.3.1 | Tailwind CSS Vite plugin | No |
| `@testing-library/jest-dom` | ^6.9.1 | DOM matchers for tests | No |
| `@testing-library/react` | ^16.3.2 | React testing utilities | No |
| `@types/react` | ^19.2.17 | React type definitions | No |
| `@types/react-dom` | ^19.2.3 | React DOM type definitions | No |
| `@typescript-eslint/eslint-plugin` | ^8.61.1 | TypeScript ESLint plugin | No |
| `@typescript-eslint/parser` | ^8.61.1 | TypeScript parser | No |
| `@vitejs/plugin-react` | ^6.0.1 | React plugin for Vite | No |
| `esbuild` | ^0.28.1 | JavaScript bundler | No (Vite dependency) |
| `eslint` | ^10.3.0 | Linter | No |
| `eslint-plugin-react-hooks` | ^7.1.1 | React hooks rules | No |
| `eslint-plugin-react-refresh` | ^0.5.3 | React Refresh rules | No |
| `globals` | ^17.6.0 | Global definitions for ESLint | No |
| `jsdom` | ^29.1.1 | DOM environment for tests | No |
| `tailwindcss` | ^4.3.1 | CSS framework | No |
| `typescript` | ^6.0.3 | TypeScript compiler | No |
| `vite` | ^8.0.12 | Build tool | No |
| `vitest` | ^4.1.9 | Test runner | No |

---

## 20. Testing

### Existing Tests

All tests are in `src/hooks/__tests__/` and use **Vitest**.

| Test File | Tests | Lines | Status |
|-----------|-------|-------|--------|
| `reviewFlow.test.ts` | 13 tests across 3 `describe` blocks | ~200 | ✅ Passes |
| `useDueDates.test.ts` | 8 tests across 2 `describe` blocks | ~100 | ✅ Passes |
| `useNotifications.test.ts` | 9 tests across 3 `describe` blocks | ~150 | ✅ Passes |
| `useAutoPromote.test.ts` | 6 tests across 1 `describe` block | ~130 | ✅ Passes |
| `useAutoSave.test.ts` | 6 tests across 2 `describe` blocks | ~100 | ✅ Passes |

**Total: ~42 tests** across 5 files (from QA report: 30/30 pass, but likely more now)

### What's Tested

- **Phase review status logic:** `getPhaseReviewStatus`, `getBuddyApprovedSheets`, `getPhaseWorksheetsByStatus`
- **Due date calculations:** `calculateDueDate` for all known worksheet IDs, `getDueDateInfo` for overdue/due-soon
- **Notification triggers:** `triggerNotification`, `getReviewerUserIds`, `getAssignedReviewerIds`
- **Auto-promotion:** `checkAndPromote` with various approval states
- **Auto-save helpers:** `loadWorksheetData`, `getOAuthName`

### What's NOT Tested

- **No component tests** — no tests for any `.tsx` component
- **No integration tests** — no full flow tests (e.g., submit → review → approve)
- **No end-to-end tests** — no Playwright/Cypress tests
- **No snapshot tests**
- **No accessibility tests**

### Test Quality

- ✅ Supabase calls are properly mocked using `vi.mock()`
- ✅ Edge cases covered: null/empty inputs, errors, missing data
- ✅ Pure data functions tested directly (no mocking needed for worksheetConfigData)
- ✅ Test descriptions are clear and structured

---

## 21. Hidden Features

### Feature Flags

- **None.** No feature flags or A/B testing infrastructure.

### Admin-Only Pages

| Page | Route | Visibility |
|------|-------|------------|
| Admin Dashboard | `/admin` | Only `academic_head` and `onboarding_lead` |
| Buddy Dashboard | `/buddy` | Only `lead_instructor` and `academic_head` |
| Onboarding Lead Dashboard | `/onboarding-lead` | Only `onboarding_lead` |
| Phase Review | `/admin/review-phase/:userId/:phaseNum` | Only `academic_head` and `onboarding_lead` |
| Buddy Gate Pass | `/buddy/gate-pass/:userId/:gateId` | Only `lead_instructor` and `academic_head` |
| Worksheet Review | `/buddy/review/:userId/:worksheetId` etc. | Only reviewers |

### Unused APIs

- **`/dashboard` route:** Defined in App.tsx as `<Navigate to="/" replace />` — legacy redirect
- **`PhaseReview` page for leads:** Onboarding leads can view but not approve (read-only monitoring)

### Incomplete Modules

- **Due date automated notifications:** The SQL function `check_due_date_notifications()` exists but `pg_cron` scheduling is commented out. Automated due_soon/overdue notifications are not running.
- **Password reset:** Not implemented. The Login form has no "Forgot password?" link.
- **Email confirmation:** Required by Supabase but the account creation message says "Check your email to confirm your account" without clear instructions.

### The `_saved*` Convention (Hidden from New Developers)

The entire worksheet data model relies on a convention of `_saved*` prefixed keys within the JSONB `worksheet_data` column. These keys are:
1. Set by `loadWorksheetData()` when hydrating state from Supabase
2. Read by `useAutoSave.flushSave()` to determine the new `review_status`
3. Written by review actions (approve/revision) in `WorksheetReview` and gate controls
4. Read by `ReviewFeedback` and status views (ApprovedView, BuddyApprovedView) for display

This convention is **not documented in types** (they appear as `data['_savedReviewStatus']` without TypeScript definitions) and is invisible to anyone reading the database schema or worksheet components. New developers must discover this convention by tracing the full save/load pipeline.

### `progressUpdate` Custom Event

`App.tsx` registers a `window.addEventListener('progressUpdate', handler)` listener. Any component can dispatch:
```js
window.dispatchEvent(new CustomEvent('progressUpdate', { detail: 42 }));
```
This updates the Navbar progress bar without prop drilling through the component tree. The event also syncs the value to `localStorage.onboarding_progress`. This entirely bypasses React's state management — it was likely introduced to solve a specific cross-component communication need without adding a context.

### `__reviewWorksheetId` (Window Global)

The `WorksheetReview` page sets `window.__reviewWorksheetId = worksheetId` for debugging purposes. This allows developers to inspect the current review context from the browser console without navigating React devtools.

### SQL-Level Hidden Features

- **`pg_cron` scheduling for notifications:** The file `db/__due_date_notifications.sql` contains a complete `check_due_date_notifications()` function but the cron job call (`SELECT cron.schedule(...)`) is commented out. The SQL infrastructure exists but is dormant.
- **Test user scripts:** `db/create_32_users.sql` creates 32 test users across all roles, but the passwords are hardcoded (security concern for production).
- **Demo data seeding:** `db/seed_worksheets.sql` populates realistic worksheet submissions for QA users — useful for demos but would pollute production data.

### Commented Code

- **`db/__due_date_notifications.sql`:** pg_cron scheduling is commented out
- **`db/__cleanup_test_users.sql`:** Contains instructions for cleaning test data
- **`App.tsx`:** The progress update event listener has eslint-disable comment

---

## 22. Environment Configuration

### Required Environment Variables

| Variable | Purpose | Where Used | Fallback |
|----------|---------|------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | `src/api/supabase.ts` | Console error message |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | `src/api/supabase.ts` | Console error message |

### Configuration Details

```env
# .env file (create in project root)
VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Both variables are prefixed with `VITE_` (Vite's requirement for client-exposed env vars).
The Supabase project ID is `fuoqoryqndtdooujslee`.

### Production Considerations

- All `VITE_` variables are bundled into the frontend build (visible in source)
- The anon key is designed to be public — RLS is the security layer
- Never expose the `service_role` Supabase key to the client
- Set `sourcemap: false` in production build (already configured)

---

## 23. Deployment

### Build Process

```bash
npm run build   # Runs: vite build
```

- Outputs to `dist/` directory
- Bundle includes: HTML, CSS, JavaScript, assets
- esbuild minification enabled
- Sourcemaps disabled in production
- CSS code splitting enabled

### Deployment Steps

1. Run `npm run build` to create production build
2. Deploy `dist/` directory to any static hosting:
   - Vercel (recommended)
   - Netlify
   - GitHub Pages
   - Any S3-compatible storage + CDN
3. Set environment variables in hosting provider
4. Configure Supabase project settings:
   - Enable email confirmation
   - Add deployment domain to allowed OAuth redirect URLs
   - Run database migrations (`db/schema.sql`)

### Required Services

1. **Supabase project** (already configured: project ID `fuoqoryqndtdooujslee`)
2. **Google OAuth credentials** (configured in Supabase dashboard)
3. **Static hosting** (Vercel, Netlify, or similar)
4. **Custom domain** (optional)

### Production Checklist

- [ ] Run `db/schema.sql` in Supabase SQL Editor
- [ ] Run `db/seed_worksheets.sql` for test data (optional)
- [ ] Verify all RLS policies are active
- [ ] Set `email_confirmation` to enabled in Supabase Auth settings
- [ ] Add production domain to Supabase Auth allowed URLs
- [ ] Add CAPTCHA to auth forms
- [ ] Disable role self-selection on signup (security critical)
- [ ] Test full submit → review → approve flow
- [ ] Run `npm test` to verify tests pass
- [ ] Run `npm run build` to verify build succeeds

### Rollback Strategy

- Deploy previous build from CI/CD pipeline
- Database rollback: restore from Supabase backup
- Feature flag toggles: not implemented (would need to be added)

---

## 24. Known Issues

### Critical

1. **Role self-selection on signup** — Users can select any role when creating an account, including `academic_head` and `onboarding_lead`, gaining elevated privileges. Fix: Default all new signups to `new_joinee` and let admins change roles.

### High

2. **Gate control status case mismatch** — Gate control `handleSubmit` sets `status: 'submitted'` (lowercase) but Supabase may store mixed case. Phase pages check for lowercase `'submitted'` and uppercase `'Submitted'` inconsistently.

3. **No loading guard before first auto-save** — `useAutoSave` may fire before data is fully loaded, overwriting saved data with empty state. The `initialSaveDoneRef` guard exists but may not cover all race conditions.

4. **Getting OAuth name may fail** — `getOAuthName()` in `useAutoSave.ts` may return empty string on slow connections or missing metadata, leaving `employeeName` blank for new worksheets.

### Medium

5. **No conflict resolution for auto-save** — If a user has the portal open in two browser tabs, the last write wins silently, discarding changes from the other tab.

6. **Gate controls don't check phase completion** — GC1/GC2/GC3 can be submitted even if not all phase worksheets are approved. No UI guard prevents this.

7. **Auto-save failures can show "Saved" incorrectly** — If Supabase returns an error, the SaveIndicator may not update properly (the error state is set but could be overwritten by a subsequent success).

8. **`ReviewContent` FIELD_SECTIONS drift** — If a worksheet adds new fields but `FIELD_SECTIONS` in `ReviewContent.tsx` is not updated, the new fields are invisible to reviewers. A dev-time console warning exists but only runs in dev mode.

### Low

9. **Phase pages show gate control in progress counter** — The progress bar includes the gate control (`worksheets.length + 1`), implying 9/9 when only worksheets are done but the gate isn't submitted.

10. **Navbar shows all phases for joinees** — Phase 2 and 3 links are always visible in the navbar; the phase pages themselves handle the lock check, but users can see locked phases exist.

11. **No pagination on admin/buddy dashboards** — All data is fetched in one query; will become slow with many users.

12. **`index.html` references `main.jsx`** — Should be `main.tsx` but Vite resolves the extension automatically.

13. **Google OAuth may fail on non-production domains** — If the Supabase redirect URL list doesn't include all deployment domains, OAuth fails silently.

---

## 25. Improvement Opportunities

### Quick Wins (Low Effort, High Impact)

1. **Disable role self-selection on signup** — Default all new users to `new_joinee`. This is a critical security fix.

2. **Add pagination to admin/buddy dashboards** — Load 50 records at a time with "Load More" or infinite scroll.

3. **Add search on admin dashboard** — Already partially implemented (search input exists) but could be improved.

4. **Refactor status colors to CSS variables** — Replace hardcoded hexes (`#1B5E20`, `#C62828`, `#381E72`, `#7D5260`) with CSS custom properties defined in `index.css`.

5. **Fix `index.html` reference** — Change `main.jsx` to `main.tsx`.

6. **Add gate completion check** — Before allowing gate control submission, verify all phase worksheets are `buddy_approved` or `approved`.

### Medium Improvements

7. **Refactor GateControls to use `useWorksheet`** — GC1, GC2, GC3 should use the same `WorksheetPage` wrapper and `useWorksheet` hook as regular worksheets, eliminating duplicated save/load/submit logic.

8. **Add conflict resolution for auto-save** — Store `updated_at` timestamp, compare on save, show warning on conflict.

9. **Add offline detection and queued save** — Detect when network is down, queue saves, retry when online.

10. **Improve `ReviewContent` FIELD_SECTIONS maintenance** — Add a unit test that validates FIELD_SECTIONS keys match the expected worksheet data shapes.

11. **Split `useAutoSave` into auto-save + explicit submit hooks** — Separate concerns for better error handling and race condition prevention.

12. **Add pagination API** — Replace full-table queries with paginated queries on worksheet_submissions and user_profiles.

### Long-Term Architecture Improvements

13. **Add structured metadata columns** — Add `submitted_at`, `approved_at`, `revision_count` to worksheet_submissions for analytics queries instead of relying solely on JSONB and review_history.

14. **Implement proper server-side validation** — Add Supabase Database Functions or Edge Functions for critical operations (submit, approve) rather than relying solely on the frontend.

15. **Add end-to-end testing** — Use Playwright to test the full submit → review → approve → promote flow.

16. **Add worksheet schema versioning** — Store `worksheet_schema_version` in worksheet_submissions to handle field name changes across deployments.

17. **Add audit logging** — Log all assignment changes (who assigned whom, when) to an `audit_log` table.

18. **Implement password reset flow** — Add "Forgot password?" link to Login page and handle password reset emails.

19. **Add dark mode support** — Already partially prepared (CSS transition on body), but needs full implementation.

20. **Add code splitting** — Lazy-load worksheets and gate controls to reduce initial bundle size.

---

## 26. Complete User Journey

### New Joinee Journey

```
1. Visitor lands on Login page
   └── Option A: Signs up with email/password + selects "New Joinee" role
   └── Option B: Signs in with Google OAuth
   └── Option C: Signs in with existing credentials

2. Redirected to Dashboard (/)
   └── Sees welcome message with "Welcome to Your Onboarding Journey"
   └── Sees 3 phases: Orientation, Contribution, Ownership
   └── Sees overall progress bar (0/20)
   └── Sees Quick Links section

3. Clicks Phase 1 → Orientation (/phase-1)
   └── Sees 8 worksheets + 1 gate control
   └── Each worksheet has status badge: "Not Started"
   └── Each worksheet shows reviewer badge (Buddy/Mentor or Onboarding Lead)

4. Clicks Worksheet 1 → Team Introduction (/phase-1/worksheet-1)
   └── Sees form with sections: About You, Stakeholders, Conversations, Buddy Assignment, Reflection
   └── Employee name is pre-filled from OAuth
   └── Fills form → auto-save indicator shows "Saved" after 1.5s
   └── Clicks Submit → validation checks required fields
   └── On success → "Worksheet Submitted" view with "Back to Phase 1" button
   └── Notification sent to assigned buddy: "A worksheet (p1_w1) was submitted in Phase 1"

5. Buddy reviews the worksheet
   └── Buddy approves → status changes to "Buddy Approved" (purple badge)
   └── Notification sent: "Your worksheet has been approved by your buddy"

6. (If revision requested)
   └── Joinee sees revision banner with reviewer's comment
   └── Edits worksheet, resubmits → status: "Revision Submitted"
   └── Buddy re-reviews → approve or request revision again

7. Continues through all 8 Phase 1 worksheets + Gate Control 1

8. When all worksheets in Phase 1 are buddy_approved:
   └── Manager approves Phase 1 → all worksheets → "Approved" (green badge)
   └── Phase 2 unlocked

9. Repeats steps 4-8 for Phase 2, then Phase 3

10. After Phase 3 is approved:
    └── Auto-promotion triggers: role changes to `lead_instructor`
    └── Notification: "Congratulations! You have been promoted to Buddy/Mentor!"
    └── User can now access Buddy Dashboard and review other instructors' worksheets
```

### Buddy Journey

```
1. Buddy signs in → sees Navbar with "Reviews" link
2. Clicks Reviews → Buddy Dashboard (/buddy)
   └── Sees assigned instructors
   └── Sees pending worksheets, buddy_approved, approved counts
   └── Tabs: Pending Review, Buddy Approved, My Instructors

3. Clicks a pending worksheet → /buddy/review/:userId/:worksheetId
   └── Sees submitted content organized by sections
   └── Sees review history timeline (if any previous reviews)
   └── Can approve (→ buddy_approved) or request revision
   └── If approving: optional comment
   └── If revision: comment is required

4. After approving:
   └── Notification sent to joinee
   └── Notification sent to manager: "Worksheet buddy-approved and ready for phase-level review"
   └── Redirected back to dashboard

5. From My Instructors tab:
   └── Sees which phases are ready for gate pass
   └── Clicks "Fill Gate Pass" → BuddyGatePass page with GateControl component
   └── Fills gate control form for the joinee
   └── Submits → status: buddy_approved → sent to manager for final approval
```

### Manager Journey

```
1. Manager signs in → sees Navbar with "Admin" and "Reviews" links
2. Clicks Admin → Admin Dashboard (/admin)
   └── Sees summary stats: Joinees, Pending, Buddy Approved, Approved, Revision
   └── Overview tab: list of all joinees with per-phase progress bars
   └── Phases Ready tab: shows phases where all worksheets are buddy_approved
   └── Assignments tab: assign managers/buddies to joinees

3. From Phases Ready tab:
   └── Clicks "Approve Phase" → /admin/review-phase/:userId/:phaseNum
   └── Sees all worksheets in the phase with their statuses
   └── Can view individual worksheet content
   └── Clicks "Approve Phase N" button
   └── All buddy_approved worksheets → approved
   └── Notifications sent to joinee and buddy
   └── Auto-promotion check runs

4. Can also review individual worksheets:
   └── /admin/review/:userId/:worksheetId
   └── Read-only for manager (can't approve at worksheet level)
   └── Can request revision (if needed)
```

### Onboarding Lead Journey

```
1. Onboarding Lead signs in → sees Navbar with "Monitoring" and "Admin" links
2. Clicks Monitoring → Onboarding Lead Dashboard (/onboarding-lead)
   └── Sees all joinees with phase progress
   └── All views are read-only
   └── Can filter by phase and status
   └── Can view phase content but cannot approve

3. Can access Admin Dashboard for assignment management
   └── Can assign managers and buddies to joinees
```

---

## 27. Developer Onboarding Guide

### Project Setup

```bash
# Prerequisites: Node.js 18+, npm

# 1. Clone the repository
git clone <repo-url>
cd "untitled folder 3"

# 2. Install dependencies
npm install

# 3. Create environment file
echo "VITE_SUPABASE_URL=https://fuoqoryqndtdooujslee.supabase.co" > .env
echo "VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>" >> .env

# 4. Start development server
npm run dev
# Opens at http://localhost:5173

# 5. Run tests
npm test
```

### Database Setup

1. Go to Supabase Dashboard → SQL Editor
2. Paste and run `db/schema.sql` (definitive schema — includes all migrations)
3. (Optional) Run `db/create_32_users.sql` for test users
4. (Optional) Run `db/setup_correct.sql` for assignment + demo data
5. (Optional) Run `db/seed_worksheets.sql` for realistic worksheet submissions

### Test Users

After running `db/create_32_users.sql`:

| Name | Email | Role | Password |
|------|-------|------|----------|
| Arjun Mehta | arjun.qa@newton.edu | New Joinee | Test123! |
| Sneha Patel | sneha.qa@newton.edu | New Joinee | Test123! |
| Vikram Singh | vikram.qa@newton.edu | New Joinee | Test123! |
| Neha Kapoor | neha.qa@newton.edu | Buddy/Mentor | Test123! |
| Dr. Priya Sharma | priya.qa@newton.edu | Manager (AH) | Test123! |
| Ravi Deshmukh | ravi.qa@newton.edu | Onboarding Lead | Test123! |

### Common Commands

```bash
npm run dev          # Start dev server (port 5173)
npm run build        # Production build
npm run preview      # Preview production build
npm test             # Run all tests
npm run lint         # Run ESLint
npm run cr-review    # CodeRabbit review for uncommitted changes
```

### Development Workflow

1. The codebase uses **TypeScript** — all files are `.ts` or `.tsx`
2. **No custom backend** — all data flows through Supabase JS client
3. **RLS policies** are the only authorization layer — understand them before modifying data access
4. **Worksheet pattern:** Creating a new worksheet requires:
   - Add worksheet type to `src/types/supabase.ts` (WorksheetId union)
   - Add reviewer mapping in `src/config/worksheetConfigData.ts` (WORKSHEET_REVIEWER, WORKSHEET_INFO, WORKSHEET_NAMES)
   - Add component import in `src/config/worksheetConfig.tsx` (WORKSHEET_COMPONENTS)
   - Create worksheet page in `src/pages/worksheets/`
   - Add FIELD_SECTIONS layout in `src/components/ReviewContent.tsx`
5. **Hooks pattern:** Use `useWorksheet` for all worksheets (not direct Supabase calls)
6. **CSS:** Use the luxury design system classes (`lux-container`, `lux-btn`, `lux-input`, etc.) or inline styles with theme tokens (`t.ch`, `t.wg`, etc.)

### Common Pitfalls

1. **RLS recursion:** If you get "infinite recursion" errors when querying `user_profiles`, it's because RLS policies are querying `user_profiles` recursively. The fix is to use `auth.jwt() -> 'user_metadata' ->> 'role'` instead of subqueries.

2. **Auto-save race conditions:** The `useAutoSave` hook debounces writes. If you modify the hook, ensure the `initialSaveDoneRef` and `mountedRef` guards are in place.

3. **Review status values:** The state machine has specific values: `''`, `'pending_review'`, `'buddy_approved'`, `'needs_revision'`, `'revision_submitted'`, `'approved'`. Using incorrect values will cause SQL CHECK constraint violations.

4. **JWT role path:** When checking roles in RLS, use `auth.jwt() -> 'user_metadata' ->> 'role'` — NOT `auth.jwt() ->> 'role'`. The role is nested inside `user_metadata` in the JWT payload.

5. **Environment variables:** Always prefix with `VITE_` for Vite client exposure. Never commit `.env` to git.

### Best Practices

1. Always read the RLS policies in `db/schema.sql` before modifying data access
2. Use TypeScript strict mode — avoid `any` casts
3. Follow the worksheet pattern for consistency
4. Use the `t` theme tokens for all colors/fonts
5. Write tests for any new pure functions
6. Keep `ReviewContent.tsx` FIELD_SECTIONS in sync with worksheet data shapes
7. Use `useWorksheet` for all new worksheets (not direct Supabase queries)
8. Run `npm test` before committing

---

## 28. Executive Summary

### What Is Excellent

- **Clean hook architecture:** `useWorksheet` eliminates massive boilerplate duplication across 17 worksheets
- **RLS as single authorization layer:** All access control in one place (SQL policies), making security audit clear
- **TypeScript migration:** Successful migration from JSX to TSX with strict mode enabled
- **Comprehensive documentation:** Multiple markdown files (ARCHITECTURE_PLAN, REVIEW_FLOW, QA_REPORT, etc.)
- **Design system:** Luxury/Editorial theme is visually distinctive and well-implemented
- **Review state machine:** Well-designed workflow with buddy_approved → approved flow
- **Auto-promotion:** Elegant completion → promotion flow
- **Phase gating:** Proper sequential unlocking of phases

### What Is Average

- **Code reuse:** Gate controls have duplicated logic (not using shared hooks)
- **Error handling:** Relies heavily on `console.error` and toasts; no Sentry/logging integration
- **Testing coverage:** Good unit tests for pure functions, zero component/integration/E2E tests
- **Performance:** No pagination, no code splitting, no lazy loading
- **Styling consistency:** Status colors hardcoded as hexes, varying page widths

### What Is Poor

- **Security:** Role self-selection on signup is a critical vulnerability
- **Offline support:** No offline detection or queued saves
- **Conflict resolution:** No mechanism to handle concurrent edits (two-tab scenario)
- **Accessibility:** Radio button focus visibility is broken, no skip-to-content, no ARIA landmarks

### Biggest Risks

1. **Security gap:** Role self-selection on signup allows privilege escalation
2. **Data loss:** Auto-save race conditions with no conflict resolution
3. **Scalability:** Full-table queries will degrade with user growth
4. **Maintainability:** Gate controls diverge from worksheet pattern over time

### Biggest Strengths

1. **Well-defined state machine:** Review flow is clearly specified and enforced
2. **Single responsibility:** Hooks, config, components have clean separation
3. **TypeScript adoption:** Full type safety across the codebase
4. **Documentation:** Extensive project documentation for new developers

### Scores

| Category | Score | Rationale |
|----------|:-----:|-----------|
| **Security** | 5/10 | Critical role self-selection bug; otherwise solid RLS |
| **Performance** | 6/10 | Fast build, but no pagination or code splitting |
| **Code Quality** | 7/10 | Clean architecture, but some duplication in gate controls |
| **UI/UX** | 7/10 | Beautiful design system, but accessibility gaps |
| **Scalability** | 5/10 | Will struggle beyond ~100 users without pagination |
| **Testing** | 5/10 | Good unit tests, zero component/E2E tests |
| **Documentation** | 9/10 | Extensive project documentation |
| **Overall** | **6.5/10** | Solid foundation with clear improvement path |

---

*This document was generated by systematically analyzing every file in the project codebase. All conclusions are based on the actual code and configuration as of June 23, 2026.*
