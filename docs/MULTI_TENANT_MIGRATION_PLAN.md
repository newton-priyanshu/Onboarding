# Multi-Tenant SaaS Migration Plan

**Application:** NST BLR · AARAMBH — Faculty Onboarding Programme  
**Architect:** Senior Full Stack Architect  
**Date:** 2026-07-27  
**Strategy:** Big-bang plan, phased execution  
**Tenant Strategy:** Path-based (`domain.com/campus-slug`)  
**Template Strategy:** Full migration to DB-backed onboarding templates  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0 — Foundation: Database Schema](#2-phase-0--foundation-database-schema)
3. [Phase 1 — Types & Infrastructure](#3-phase-1--types--infrastructure)
4. [Phase 2 — Auth & Context](#4-phase-2--auth--context)
5. [Phase 3 — RLS & Backend Security](#5-phase-3--rls--backend-security)
6. [Phase 4 — Dynamic RBAC](#6-phase-4--dynamic-rbac)
7. [Phase 5 — Configurable Onboarding Templates](#7-phase-5--configurable-onboarding-templates)
8. [Phase 6 — Super Admin Dashboard](#8-phase-6--super-admin-dashboard)
9. [Phase 7 — Campus Admin Capabilities](#9-phase-7--campus-admin-capabilities)
10. [Phase 8 — Route & Component Migration](#10-phase-8--route--component-migration)
11. [Phase 9 — Data Migration & Backward Compatibility](#11-phase-9--data-migration--backward-compatibility)
12. [Phase 10 — Testing & Validation](#12-phase-10--testing--validation)
13. [File-by-File Change Matrix](#13-file-by-file-change-matrix)
14. [Risk Register](#14-risk-register)

---

## 1. Architecture Overview

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19 SPA)                       │
│                                                                     │
│  /campus-a/dashboard     /campus-b/week-2     /admin/super         │
│         │                     │                     │               │
│         └──────────┬──────────┘─────────────────────┘               │
│                    ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  CampusProvider (tenant context from URL path)              │   │
│  │  AuthProvider + RBACProvider                                │   │
│  │  Every query auto-filters by active campus_id               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Supabase Client (RLS-enforced campus isolation)            │   │
│  │  - All tables have campus_id                                │   │
│  │  - All RLS policies filter by campus_id                     │   │
│  │  - Super Admin bypasses campus filter                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Supabase Project                            │
│  ┌────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │
│  │ campuses   │  │ user_profiles        │  │ onboarding_      │   │
│  │ (NEW)      │──│ + campus_id FK       │  │ templates (NEW)  │   │
│  └────────────┘  │ + super_admin role    │  │ - structure JSONB│   │
│                  └──────────────────────┘  │ - weeks/phases   │   │
│  ┌──────────────────────┐  ┌──────────────┐│ - worksheets     │   │
│  │ worksheet_submissions│  │ permissions  │└──────────────────┘   │
│  │ + campus_id FK       │──│ (NEW)        │                       │
│  └──────────────────────┘  │ - role-based │                       │
│  ┌──────────────────────┐  │ - action-based                     │
│  │ notifications        │  └──────────────┘                       │
│  │ + campus_id FK       │                                         │
│  └──────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tenant routing** | Path-based (`/campus-slug/...`) | Simplest to implement; no DNS/wildcard cert changes needed; works with Vercel SPA deployment |
| **Data isolation** | Shared DB with `campus_id` FK on all tables | Lower operational cost than separate DBs; Supabase RLS provides row-level isolation |
| **Template storage** | DB-backed with JSONB `structure` column | Flexible enough for any campus structure; no schema changes needed for new campuses |
| **Roles** | Hybrid: hardcoded defaults + DB-backed custom roles | Existing code uses role strings; new code reads from `permissions` table |
| **Approval flows** | DB-backed approval chain config | Each template defines its own approval steps (buddy → manager → HR, etc.) |
| **Super Admin** | Global role outside campus context | Has cross-tenant access via separate RLS bypass |

---

## 2. Phase 0 — Foundation: Database Schema

### 2.1 New Tables

#### `campuses`

```sql
CREATE TABLE public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,                              -- for future subdomain routing
  is_active BOOLEAN DEFAULT TRUE,
  branding JSONB DEFAULT '{}'::jsonb,       -- {logo_url, theme_color, welcome_message, email_template}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_campuses_slug ON public.campuses (slug);
```

#### `onboarding_templates`

```sql
CREATE TABLE public.onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Structure: { weeks: [{ num, title, subtitle, theme, phases: [{ name, worksheets: [{id, title, ...}] }] }] }
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_chain JSONB DEFAULT '["buddy","manager"]'::jsonb,  -- ordered list of reviewer roles
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_templates_campus ON public.onboarding_templates (campus_id);
```

#### `roles` and `permissions`

```sql
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,          -- system roles cannot be deleted
  campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,  -- NULL = global role
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,                   -- e.g. 'worksheet', 'user', 'template', 'campus'
  action TEXT NOT NULL,                     -- e.g. 'create', 'read', 'update', 'delete', 'approve'
  constraint_type TEXT DEFAULT 'allow',      -- 'allow' | 'deny'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_permissions_role ON public.permissions (role_id);
```

#### `audit_logs`

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                     -- e.g. 'campus.created', 'user.role_changed', 'worksheet.approved'
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_campus ON public.audit_logs (campus_id);
CREATE INDEX idx_audit_user ON public.audit_logs (user_id);
CREATE INDEX idx_audit_created ON public.audit_logs (created_at DESC);
```

### 2.2 Column Additions to Existing Tables

| Table | New Column | Type | Default | FK |
|-------|-----------|------|---------|----|
| `user_profiles` | `campus_id` | UUID | NULL | → `campuses(id)` ON DELETE SET NULL |
| `worksheet_submissions` | `campus_id` | UUID | NULL | → `campuses(id)` ON DELETE SET NULL |
| `notifications` | `campus_id` | UUID | NULL | → `campuses(id)` ON DELETE SET NULL |
| `promotion_required_worksheets` | `campus_id` | UUID | NULL | → `campuses(id)` ON DELETE CASCADE |

### 2.3 Role Updates

Add `super_admin` to `user_profiles_role_check`:

```sql
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('new_joinee', 'lab_instructor', 'lead_instructor',
                  'academic_head', 'onboarding_lead', 'acad_ops',
                  'super_admin', 'campus_admin'));
```

### 2.4 Default Roles & Permissions Seed

Seed the `roles` table with system roles:

```sql
INSERT INTO public.roles (name, description, is_system) VALUES
  ('super_admin', 'Global platform administrator', TRUE),
  ('campus_admin', 'Campus-level administrator', TRUE),
  ('academic_head', 'Campus academic head / manager', TRUE),
  ('onboarding_lead', 'Onboarding programme lead', TRUE),
  ('lead_instructor', 'Buddy / mentor', TRUE),
  ('new_joinee', 'New joiner completing onboarding', TRUE),
  ('lab_instructor', 'Lab instructor', TRUE),
  ('acad_ops', 'Academic operations', TRUE);
```

Seed the permissions for each role.

### 2.5 Default Campus & Template Seed

```sql
INSERT INTO public.campuses (name, slug) VALUES ('Default Campus', 'default');

INSERT INTO public.onboarding_templates (campus_id, name, structure, is_default, approval_chain)
VALUES (
  (SELECT id FROM public.campuses WHERE slug = 'default'),
  'Default Onboarding',
  '{"weeks": [...]}',  -- migrated from worksheetConfigData.ts
  TRUE,
  '["lead_instructor","academic_head"]'
);
```

### 2.6 Migration SQL File

Create: `supabase/migrations/20260727000001_multi_tenant_schema.sql`

**Tasks:**
- [ ] 2.1 Create `campuses` table
- [ ] 2.2 Create `onboarding_templates` table
- [ ] 2.3 Create `roles` table
- [ ] 2.4 Create `permissions` table
- [ ] 2.5 Create `audit_logs` table
- [ ] 2.6 Add `campus_id` to `user_profiles`
- [ ] 2.7 Add `campus_id` to `worksheet_submissions`
- [ ] 2.8 Add `campus_id` to `notifications`
- [ ] 2.9 Add `campus_id` to `promotion_required_worksheets`
- [ ] 2.10 Update `user_profiles_role_check` to include `super_admin` + `campus_admin`
- [ ] 2.11 Create indexes on all new `campus_id` columns
- [ ] 2.12 Seed default roles
- [ ] 2.13 Seed default permissions
- [ ] 2.14 Seed default campus
- [ ] 2.15 Seed default onboarding template (structure migrated from `worksheetConfigData.ts`)

---

## 3. Phase 1 — Types & Infrastructure

### 3.1 TypeScript Types (`src/types/`)

**Modify `src/types/supabase.ts`:**
- [ ] Add `Campus` interface: `{ id, name, slug, domain, is_active, branding, created_at, updated_at }`
- [ ] Add `OnboardingTemplate` interface: `{ id, campus_id, name, description, structure, approval_chain, is_active, is_default, created_at, updated_at }`
- [ ] Add `Role` interface: `{ id, name, description, is_system, campus_id, created_at }`
- [ ] Add `Permission` interface: `{ id, role_id, resource, action, constraint_type, created_at }`
- [ ] Add `AuditLog` interface: `{ id, campus_id, user_id, action, resource_type, resource_id, details, ip_address, created_at }`
- [ ] Add `campus_id` to `UserProfile` interface
- [ ] Add `campus_id` to `WorksheetSubmission` interface
- [ ] Add `campus_id` to `Notification` interface
- [ ] Add `'super_admin' | 'campus_admin'` to `UserRole` type
- [ ] Add `CampusContext` type: `{ currentCampus: Campus | null; campuses: Campus[]; isLoading: boolean; switchCampus: (slug: string) => void }`

**Modify `src/types/worksheet.ts`:**
- [ ] Add `TemplateStructure` type matching JSONB structure
- [ ] Add `ApprovalChain` type

**Modify `src/types/index.ts`:**
- [ ] Export all new types

### 3.2 API Layer (`src/api/`)

**Modify `src/api/supabase.ts`:**
- [ ] Add `getCampusClient(campusId: string)` — returns supabase client with campus context header
- [ ] Add `setCampusContext(campusId: string)` — sets header on global client
- [ ] Expose `withCampus` helper that auto-applies campus filter to queries

**Create `src/api/tenant.ts`:**
- [ ] `getCurrentCampusFromPath()` — extracts campus slug from URL
- [ ] `getCampusBySlug(slug: string)` — fetches campus from DB
- [ ] `campusSlugExists(slug: string)` — checks slug availability

**Create `src/api/permissions.ts`:**
- [ ] `checkPermission(roleId: string, resource: string, action: string)` — checks RBAC
- [ ] `getRolePermissions(roleId: string)` — fetches permissions for a role
- [ ] `hasAnyPermission(roleId: string, resource: string, actions: string[])` — OR check

---

## 4. Phase 2 — Auth & Context

### 4.1 Campus Context (`src/context/`)

**Create `src/context/CampusContext.tsx`:**
- [ ] `CampusProvider` component — wraps app, reads campus slug from URL
- [ ] `useCampus()` hook — returns current campus + campus list
- [ ] On mount: extract slug from `/campus-slug/path`, fetch campus from DB
- [ ] On error (campus not found): show 404 or redirect to campus selection
- [ ] Expose `switchCampus(slug)` for campus switcher UI
- [ ] Store active campus in context + localStorage

### 4.2 Modify Auth Context (`src/context/AuthContext.tsx`)

- [ ] Add `campus_id` to profile fetching
- [ ] Add `manageCampuses` function for super admin
- [ ] Update `signUp` to accept `campusId` parameter
- [ ] After login: validate user belongs to requested campus
- [ ] Add `isSuperAdmin` helper
- [ ] Store `availableCampuses` for multi-campus users

### 4.3 JWT & Session

- [ ] Ensure `campus_id` is in `app_metadata` for RLS
- [ ] Update `sync_role_to_app_metadata` trigger to also sync `campus_id`
- [ ] Create `get_user_campus()` SQL function for RLS policies

### 4.4 Route Guard Updates

**Modify `src/components/ProtectedRoute.tsx`:**
- [ ] Accept optional `campusSlug` prop
- [ ] Validate user belongs to the requested campus
- [ ] Redirect to campus selection if no campus match

**Create `src/components/CampusGuard.tsx`:**
- [ ] Wraps routes to ensure campus context is loaded
- [ ] Shows loading state while campus is resolving
- [ ] Shows error if campus not found or inactive

**Create `src/components/SuperAdminGuard.tsx`:**
- [ ] Only allows `super_admin` role
- [ ] Bypasses campus context entirely

---

## 5. Phase 3 — RLS & Backend Security

### 5.1 Update All RLS Policies

All existing RLS policies must be updated to include campus filtering. The pattern:

```sql
-- Instead of just:
auth.uid() = user_id

-- Add:
AND EXISTS (
  SELECT 1 FROM public.user_profiles up
  WHERE up.id = auth.uid()
    AND (up.campus_id = worksheet_submissions.campus_id OR public.get_user_role() = 'super_admin')
)
```

**Policies to update:**

| Policy | Table | Change |
|--------|-------|--------|
| Select own profile | user_profiles | Add super_admin bypass |
| Insert own profile | user_profiles | Add campus_id validation |
| Update own profile | user_profiles | Add campus isolation |
| Admin read all profiles | user_profiles | Add campus scope |
| Admin update profiles | user_profiles | Add campus scope |
| Select own submissions | worksheet_submissions | Add campus filter |
| Insert own submissions | worksheet_submissions | Add campus_id auto-set |
| Update own submissions | worksheet_submissions | Add campus filter |
| Reviewers select submissions | worksheet_submissions | Add campus filter |
| Buddy update submissions | worksheet_submissions | Add campus filter |
| Manager update submissions | worksheet_submissions | Add campus filter |
| Users can read own notifications | notifications | Add campus filter |
| Users can insert notifications | notifications | Add campus filter |
| Users can update own notifications | notifications | Add campus filter |

### 5.2 New RLS Policies

| Policy | Table | Purpose |
|--------|-------|---------|
| Super admin read all | worksheet_submissions | Bypass campus filter |
| Super admin read all | user_profiles | Bypass campus filter |
| Super admin read all | notifications | Bypass campus filter |
| Campus admin read campus | user_profiles | Read users in own campus |
| Campus admin update campus | user_profiles | Update users in own campus |

### 5.3 Helper SQL Functions

- [ ] `get_user_campus()` — Returns campus_id from JWT app_metadata
- [ ] `is_super_admin()` — Returns boolean check
- [ ] `assert_campus_access(target_campus_id)` — Raises exception if access denied

### 5.4 Audit Logging Trigger

- [ ] Create `log_audit_event()` trigger function
- [ ] Attach to `worksheet_submissions` for status changes
- [ ] Attach to `user_profiles` for role/assignment changes
- [ ] Attach to `campuses` for CRUD operations

---

## 6. Phase 4 — Dynamic RBAC

### 6.1 RBAC Provider

**Create `src/context/RBACContext.tsx`:**
- [ ] `RBACProvider` — fetches permissions for current user's role
- [ ] `usePermission(resource, action)` hook — returns boolean
- [ ] `useHasAnyPermission(resource, actions)` hook — returns boolean
- [ ] Cache permissions in context to avoid repeated fetches
- [ ] Fallback to hardcoded checks for system roles (backward compat)

### 6.2 RBAC Utility

**Create `src/utils/rbac.ts`:**
- [ ] `can(resource, action)` — standalone permission check
- [ ] `canAny(resource, actions)` — OR check
- [ ] `requirePermission(resource, action)` — throws if denied
- [ ] `getEffectiveRole(profile)` — resolve role with campus context

### 6.3 Update Existing Role Checks

Search and replace all hardcoded role checks throughout the codebase:

- [ ] `ProtectedRoute.tsx` — use `hasPermission` instead of `requiredRoles` where possible
- [ ] `AdminDashboard.tsx` — check `campus_admin` or `academic_head`
- [ ] `BuddyDashboard.tsx` — use permission-based checks
- [ ] `WorksheetReview.tsx` — use `can('worksheet', 'approve')`
- [ ] `PhaseReview.tsx` — use `can('phase', 'approve')`
- [ ] `Navbar.tsx` — use permission-based link visibility
- [ ] `PhaseAccessGuard.tsx` — use RBAC for access decisions
- [ ] `WeekAccessGuard.tsx` — use RBAC for access decisions
- [ ] All gate controls — use `can('gate', 'submit')`

---

## 7. Phase 5 — Configurable Onboarding Templates

### 7.1 Data Migration

**Create `scripts/migrate_templates.mjs`:**
- [ ] Read hardcoded structure from `worksheetConfigData.ts`
  - `WK_WORKSHEETS_MAP`, `WEEK_LABELS`, `PHASE_WORKSHEETS_MAP`, `WORKSHEET_NAMES`
  - `FTP_WEEK_SESSIONS`, `WORKSHEET_REVIEWER`, `FTP_GATE_ARTIFACTS`
  - `WORKSHEET_INFO`, `PHASE_LABELS`, `WORKSHEET_COMPONENTS`
- [ ] Serialize to JSONB structure matching `onboarding_templates.structure`
- [ ] Insert as default template for the default campus
- [ ] Verify structure integrity

### 7.2 Template Service

**Create `src/api/templates.ts`:**
- [ ] `getCampusTemplate(campusId)` — fetch active template for campus
- [ ] `getTemplateWeeks(template)` — extract week list from structure
- [ ] `getWeekWorksheets(template, weekNum)` — get worksheet list for a week
- [ ] `getPhaseWorksheets(template, phaseNum)` — get phase worksheet list
- [ ] `getApprovalChain(template)` — get configured approval steps
- [ ] `getWorksheetInfo(template, worksheetId)` — get title, reviewer, etc.
- [ ] `validateTemplateStructure(structure)` — validate JSONB against schema

### 7.3 Replace Hardcoded Config Lookups

The following modules read from hardcoded config maps. They need to accept a `template` parameter or fetch from the DB:

- [ ] **`src/config/worksheetConfigData.ts`**: Add `getTemplateConfig(template)` that returns same shape as hardcoded maps
- [ ] **`src/config/weeklyWorksheets.ts`**: Make dynamic based on template
- [ ] **`src/config/reviewContentConfig.ts`**: Add template-aware `getSectionLayout(template, worksheetId)`
- [ ] **`src/config/worksheetConfig.tsx`**: `WORKSHEET_COMPONENTS` stays hardcoded (component mapping doesn't change); worksheet-to-component mapping becomes template-driven

### 7.4 Component Registration System

The `WORKSHEET_COMPONENTS` map (`src/config/worksheetConfig.tsx`) stays as the registry of ALL known worksheet components. Templates reference worksheet IDs, and the system looks them up in this registry.

- [ ] Ensure all worksheet components are registered in `WORKSHEET_COMPONENTS`
- [ ] Add validation: template worksheet IDs must exist in registry
- [ ] Add fallback: if template references unknown worksheet ID, show "Worksheet not found" error

### 7.5 Template Admin UI

**Create Super Admin template management:**
- [ ] Template list view with search/filter
- [ ] Create template form (name, description, structure JSON editor)
- [ ] Visual template builder (add weeks, phases, worksheets via drag-and-drop)
- [ ] Template preview (render structure as tree)
- [ ] Assign template to campus
- [ ] Clone template from existing one

---

## 8. Phase 6 — Super Admin Dashboard

### 8.1 Routes

```
/super-admin                    → SuperAdminDashboard
/super-admin/campuses           → CampusList
/super-admin/campuses/new       → CampusCreate
/super-admin/campuses/:id       → CampusDetail
/super-admin/campuses/:id/edit  → CampusEdit
/super-admin/templates          → TemplateList
/super-admin/templates/new      → TemplateCreate
/super-admin/templates/:id      → TemplateDetail
/super-admin/users              → AllUsersList
/super-admin/analytics          → PlatformAnalytics
/super-admin/audit-log          → AuditLogView
```

### 8.2 Pages

**Create `src/pages/super-admin/SuperAdminDashboard.tsx`:**
- [ ] Platform stats cards (total campuses, active users, worksheets completed)
- [ ] Recent activity feed
- [ ] Campus health overview

**Create `src/pages/super-admin/CampusList.tsx`:**
- [ ] Table of all campuses with search/filter
- [ ] Status indicators (active/inactive)
- [ ] Quick actions (edit, deactivate, reset)

**Create `src/pages/super-admin/CampusCreate.tsx`:**
- [ ] Form: name, slug, domain, welcome message
- [ ] Slug availability checker
- [ ] Auto-create default template on campus creation

**Create `src/pages/super-admin/CampusDetail.tsx`:**
- [ ] Campus info card
- [ ] User list filtered by campus
- [ ] Template assignment
- [ ] Onboarding progress overview
- [ ] Danger zone (deactivate/delete/reset)

**Create `src/pages/super-admin/PlatformAnalytics.tsx`:**
- [ ] Total onboarding completion rate across all campuses
- [ ] Per-campus comparison charts
- [ ] Active joinees over time
- [ ] Avg onboarding duration per campus
- [ ] Buddy performance metrics

**Create `src/pages/super-admin/AuditLogView.tsx`:**
- [ ] Searchable/filterable audit log table
- [ ] Export to CSV
- [ ] Campus-scoped filtering

### 8.3 Components

**Create `src/components/super-admin/`:**
- [ ] `CampusCard.tsx` — Campus summary card
- [ ] `StatsCard.tsx` — Analytics stat card
- [ ] `CampusForm.tsx` — Create/edit campus form
- [ ] `TemplateSelector.tsx` — Template picker dropdown
- [ ] `AuditLogTable.tsx` — Audit log with pagination

---

## 9. Phase 7 — Campus Admin Capabilities

### 9.1 Routes

```
/campus-slug/admin              → CampusAdminDashboard
/campus-slug/admin/users        → CampusUserManagement
/campus-slug/admin/templates    → CampusTemplateManagement
/campus-slug/admin/reports      → CampusReports
/campus-slug/admin/settings     → CampusSettings
```

### 9.2 Pages

**Create `src/pages/campus-admin/CampusAdminDashboard.tsx`:**
- [ ] Campus-specific stats
- [ ] Pending approvals summary
- [ ] Joiner progress overview
- [ ] Recent activity

**Create `src/pages/campus-admin/CampusUserManagement.tsx`:**
- [ ] User list with role assignments
- [ ] Invite new user to campus
- [ ] Assign buddy/manager (existing functionality, scoped to campus)
- [ ] Deactivate user

**Create `src/pages/campus-admin/CampusReports.tsx`:**
- [ ] Joiner completion percentage
- [ ] Pending approvals
- [ ] Average onboarding duration
- [ ] Buddy performance
- [ ] Weekly completion statistics

**Create `src/pages/campus-admin/CampusSettings.tsx`:**
- [ ] Campus name, slug (if editable)
- [ ] Branding (future-ready: logo, theme color, welcome message)
- [ ] Template assignment
- [ ] Approval chain configuration

### 9.3 Refactor Existing Admin Dashboard

**Modify `src/pages/AdminDashboard.tsx`:**
- [ ] Add campus context awareness
- [ ] Filter data by `campus_id`
- [ ] Remove global user list (only show campus users)
- [ ] Keep existing tabs: Roster, Phases Ready, Assignments
- [ ] Add campus admin features behind `campus_admin` role check

**Modify `src/components/admin/RosterTab.tsx`:**
- [ ] Filter by campus
- [ ] Add campus-scoped user search

**Modify `src/components/admin/PhasesReadyTab.tsx`:**
- [ ] Filter by campus
- [ ] Keep existing phase review flow

**Modify `src/components/admin/AssignmentsTab.tsx`:**
- [ ] Filter by campus
- [ ] Scope buddy/manager assignment to campus users

---

## 10. Phase 8 — Route & Component Migration

### 10.1 URL Structure Change

| Old URL | New URL |
|---------|---------|
| `/` | `/campus-slug/dashboard` |
| `/login` | `/campus-slug/login` |
| `/signup` | `/campus-slug/signup` |
| `/phase-1` | `/campus-slug/phase-1` |
| `/week-1` | `/campus-slug/week-1` |
| `/admin` | `/campus-slug/admin` |
| `/buddy` | `/campus-slug/buddy` |
| `/forgot-password` | `/campus-slug/forgot-password` |
| — | `/super-admin/*` (global, no campus) |
| — | `/campus-select` (campus picker for users with multiple campuses) |

### 10.2 App.tsx Route Changes

**Modify `src/App.tsx`:**
- [ ] Add `CampusProvider` wrapping all routes
- [ ] Add campus slug parsing from URL (e.g., `/:campusSlug/*`)
- [ ] Add campus validation middleware
- [ ] Add Super Admin routes (no campus prefix)
- [ ] Update all route paths to include `/:campusSlug`
- [ ] Add redirect from root to `/campus-slug/dashboard` based on user's campus
- [ ] Add redirect from `/login` without campus to campus selection
- [ ] Add 404 for invalid campus slugs

### 10.3 Navbar Updates

**Modify `src/components/Navbar.tsx`:**
- [ ] Add campus name/badge display
- [ ] Add campus switcher dropdown (if user has access to multiple campuses)
- [ ] Update navigation links to include campus slug
- [ ] Add Super Admin link (visible only to super_admin)
- [ ] Keep all existing navigation items

### 10.4 Query Migration

Every Supabase query in the codebase must include `campus_id` filtering. There are two approaches:

**Approach A: Automatic (Recommended)**
- [ ] Add RLS policy that auto-filters by campus (no code changes needed)
- [ ] Add `get_user_campus()` function used by RLS
- [ ] Test that all existing queries work without modification

**Approach B: Explicit**
- [ ] Add `withCampus()` helper to `src/api/supabase.ts`
- [ ] Update every `.eq('campus_id', campusId)` in the codebase
- [ ] ~100+ query changes needed

**Decision: Use Approach A (RLS-based) as primary, Approach B helpers available for edge cases.**

### 10.5 Worksheet Page Migration

**Modify `src/pages/WeekPage.tsx`:**
- [ ] Accept campus-scoped template config
- [ ] Fetch week structure from template instead of hardcoded maps
- [ ] Keep rendering logic identical

**Modify `src/pages/Phase1.tsx`, `Phase2.tsx`, `Phase3.tsx`:**
- [ ] Accept campus-scoped template config
- [ ] Fetch phase structure from template
- [ ] Keep existing rendering and gating logic

**Modify `src/pages/WeekWorksheetPage.tsx`:**
- [ ] Validate worksheet against campus template
- [ ] Keep existing worksheet lookup logic

### 10.6 Dashboard Migration

**Modify `src/pages/Dashboard.tsx`:**
- [ ] Accept campus context for data loading
- [ ] Show buddy/manager info scoped to campus
- [ ] Keep existing roadmap/progress display

**Modify `src/pages/BuddyDashboard.tsx`:**
- [ ] Filter assigned joinees by campus
- [ ] Keep existing review queue UI

**Modify `src/pages/OnboardingLeadDashboard.tsx`:**
- [ ] Filter by campus
- [ ] Keep existing functionality

---

## 11. Phase 9 — Data Migration & Backward Compatibility

### 11.1 Migration Script

**Create `scripts/migrate_to_multi_tenant.mjs`:** ✅ *(2026-08-06)*
- [x] Create default campus if not exists
- [x] Set `campus_id` on all existing `user_profiles` rows (assign to default campus)
- [x] Set `campus_id` on all existing `worksheet_submissions` rows
- [x] Set `campus_id` on all existing `notifications` rows
- [x] Create default onboarding template from hardcoded config
- [x] Assign default template to default campus
- [x] Create audit log entries for migration
- [x] Verify data integrity (no orphaned rows)

### 11.2 Backward Compatibility

- [x] Existing URLs redirect to `/default/...` (default campus slug) — `LegacyRedirect` + smart 404 in `App.tsx`, route set in `utils/campusSlug.ts`
- [x] `campus_id` allows NULL during migration window (RLS handles NULL as access-denied) — Phase 3 RLS policies allow NULL campus rows
- [x] All existing API endpoints continue working with campus context — RLS-driven (Approach A), no query-level changes needed
- [x] Session tokens without `campus_id` in JWT default to user's profile campus — `sync_role_to_app_metadata` trigger + `AuthContext` fallback

### 11.3 Environment Changes

- [x] Add `VITE_DEFAULT_CAMPUS_SLUG=default` to `.env` (see `.env.example`)
- [x] Add migration flag: `VITE_MULTI_TENANT_ENABLED` to `.env` (see `.env.example`)
- [ ] Feature-flag approach: when disabled, behave like single-tenant (current behavior) — env var documented; full single-tenant fallback mode not implemented (multi-tenant is the live default)

---

## 12. Phase 10 — Testing & Validation

### 12.1 Unit Tests

- [x] Campus context provider tests — `src/context/__tests__/CampusContext.test.tsx` *(2026-08-06)*: URL slug / localStorage / default-slug resolution, `switchCampus`, error handling, URL-change re-resolution
- [x] RBAC permission checks — `src/utils/__tests__/rbac.test.ts` *(2026-08-06)*: full role matrix, `super_admin` wildcard, `can`/`canAny`/`canAll`/`requirePermission`, role helpers
- [x] Template structure parsing — `src/api/__tests__/templates.test.ts` *(2026-08-07)*: `parseTemplateStructure`, `validateTemplateStructure`, week/phase/gate/approval-chain/worksheet-info helpers, and `resolveReviewer` (test caught a real bug: the fallback map was dead code because `getWorksheetReviewer` always returns a truthy `'buddy'` — fixed)
- [x] RLS policy validation (with test users) — `scripts/validate_rls_isolation.mjs` *(2026-08-06)*: live-DB script that provisions two-campus test users and asserts isolation
- [x] Audit log creation — `src/api/__tests__/auditLogs.test.ts` *(2026-08-07)*: SQL-contract test locking the `audit_logs` table, the three creation triggers (`log_worksheet_review_action`, `log_profile_change`, `log_campus_change`), RLS insert/management policies, and consistent insert column sets

### 12.2 Integration Tests

- [x] Login with campus context — `scripts/validate_rls_isolation.mjs` *(2026-08-06)*: signs users in and verifies their `campus_id` assignment
- [x] Cross-campus isolation (User A cannot see Campus B data) — `scripts/validate_rls_isolation.mjs` + `src/api/__tests__/tenant.test.ts` (`validateCampusAccess`) + `src/utils/__tests__/campusSlug.test.ts` *(2026-08-06)*: profile reads, submissions, updates, forged inserts, notifications, `assert_campus_access` RPC
- [x] Super Admin cross-campus access — `scripts/validate_rls_isolation.mjs` (service-role bypass checks) + `rbac.test.ts` (`super_admin` wildcard) *(2026-08-06)*
- [x] Template-driven worksheet loading — `src/api/__tests__/templateDrivenWorksheetLoading.test.ts` *(2026-08-07)*: end-to-end integration (mocked supabase → `getCampusTemplate` → `worksheetConfigData` bridges `getPhaseWorksheetIds`/`getWorksheetName`/`getReviewerType`/`getWeekWorksheetIds`): template structure overrides hardcoded config, active→default→null template resolution, fallback to hardcoded config when template absent
- [x] Campus admin user management (scoped) — `src/pages/__tests__/CampusUserManagement.test.tsx` *(2026-08-07)*: renders the page as `campus_admin` and asserts every `user_profiles` query is campus-scoped via `withCampusIf` (`.eq('campus_id', …)`), assignment updates are user-scoped, notifications fire, and the no-campus state renders without querying; live-DB RLS checks added to `scripts/validate_rls_isolation.mjs` step 5.6 (promote a test user to `campus_admin` via service key, verify own-campus read/update allowed but cross-campus read/update + `assert_campus_access` denied, then restore the role)
- [ ] Template-driven worksheet loading
- [ ] Campus admin user management (scoped)

### 12.3 E2E Tests

- [ ] Full flow: Super Admin creates campus → Campus Admin assigns buddy → Joinee completes onboarding
- [ ] Multi-campus parallel flow (Campus A and Campus B independently)
- [ ] Campus deactivation (users redirected, data preserved)
- [ ] Template change mid-onboarding (worksheet structure updates)

### 12.4 Load Tests

- [ ] Verify RLS performance with campus_id filter
- [ ] Test with 100+ campuses, 1000+ users
- [ ] Measure query latency with and without campus filter

### 12.5 Regression Tests

- [x] All existing tests pass with campus context — full suite green (329 → 389 tests) *(2026-08-06)*
- [ ] Existing single-campus flow works via `/default/` prefix
- [ ] No existing functionality broken

---

## 13. File-by-File Change Matrix

### New Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/context/CampusContext.tsx` | 2 | Campus provider + hook |
| `src/context/RBACContext.tsx` | 4 | Permission provider + hook |
| `src/api/tenant.ts` | 1 | Tenant resolution helpers |
| `src/api/templates.ts` | 5 | Template service |
| `src/api/permissions.ts` | 4 | Permission API |
| `src/utils/rbac.ts` | 4 | RBAC utility functions |
| `src/components/CampusGuard.tsx` | 2 | Campus route guard |
| `src/components/SuperAdminGuard.tsx` | 6 | Super admin route guard |
| `src/pages/super-admin/SuperAdminDashboard.tsx` | 6 | Super admin dashboard |
| `src/pages/super-admin/CampusList.tsx` | 6 | Campus management |
| `src/pages/super-admin/CampusCreate.tsx` | 6 | Create campus |
| `src/pages/super-admin/CampusDetail.tsx` | 6 | Campus details |
| `src/pages/super-admin/CampusEdit.tsx` | 6 | Edit campus |
| `src/pages/super-admin/PlatformAnalytics.tsx` | 6 | Platform analytics |
| `src/pages/super-admin/AuditLogView.tsx` | 6 | Audit log viewer |
| `src/pages/super-admin/TemplateList.tsx` | 5 | Template management |
| `src/pages/super-admin/TemplateCreate.tsx` | 5 | Create template |
| `src/pages/super-admin/TemplateDetail.tsx` | 5 | Template details |
| `src/pages/campus-admin/CampusAdminDashboard.tsx` | 7 | Campus admin dashboard |
| `src/pages/campus-admin/CampusUserManagement.tsx` | 7 | Campus user management |
| `src/pages/campus-admin/CampusReports.tsx` | 7 | Campus reports |
| `src/pages/campus-admin/CampusSettings.tsx` | 7 | Campus settings |
| `src/components/super-admin/CampusCard.tsx` | 6 | Campus card component |
| `src/components/super-admin/StatsCard.tsx` | 6 | Stats card |
| `src/components/super-admin/CampusForm.tsx` | 6 | Campus form |
| `src/components/super-admin/TemplateSelector.tsx` | 6 | Template selector |
| `src/components/super-admin/AuditLogTable.tsx` | 6 | Audit log table |
| `supabase/migrations/20260727000001_multi_tenant_schema.sql` | 0 | DB migration |
| `scripts/migrate_templates.mjs` | 5 | Template data migration |
| `scripts/migrate_to_multi_tenant.mjs` | 9 | Full data migration |
| `.env.example` (updated) | 9 | Default campus slug |

### Existing Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src/types/supabase.ts` | 1 | Add campus types, update UserRole |
| `src/types/worksheet.ts` | 1 | Add template types |
| `src/types/index.ts` | 1 | Export new types |
| `src/api/supabase.ts` | 1 | Add campus context header support |
| `src/context/AuthContext.tsx` | 2 | Add campus_id to profile, signUp |
| `src/components/ProtectedRoute.tsx` | 2 | Accept campusSlug, validate campus |
| `src/App.tsx` | 8 | Restructure routes for campus path |
| `src/components/Navbar.tsx` | 8 | Add campus switcher, super admin link |
| `src/config/worksheetConfigData.ts` | 5 | Add template-aware lookups |
| `src/config/worksheetConfig.tsx` | 5 | Template-driven component mapping |
| `src/config/reviewContentConfig.ts` | 5 | Template-aware section layouts |
| `src/config/weeklyWorksheets.ts` | 5 | Dynamic worksheet lists |
| `src/pages/Dashboard.tsx` | 8 | Campus-scoped data |
| `src/pages/AdminDashboard.tsx` | 7 | Campus-scoped admin |
| `src/pages/BuddyDashboard.tsx` | 8 | Campus-scoped buddy |
| `src/pages/OnboardingLeadDashboard.tsx` | 8 | Campus-scoped lead |
| `src/pages/WeekPage.tsx` | 5 | Template-driven weeks |
| `src/pages/Phase1.tsx` | 5 | Template-driven phases |
| `src/components/admin/RosterTab.tsx` | 7 | Campus-scoped roster |
| `src/components/admin/PhasesReadyTab.tsx` | 7 | Campus-scoped phases |
| `src/components/admin/AssignmentsTab.tsx` | 7 | Campus-scoped assignments |
| `src/components/WeekAccessGuard.tsx` | 5 | Template-aware week gating |
| `src/components/PhaseAccessGuard.tsx` | 5 | Template-aware phase gating |
| `src/pages/WorksheetReview.tsx` | 4 | Permission-based review |
| `src/pages/PhaseReview.tsx` | 4 | Permission-based review |
| `src/pages/Signup.tsx` | 2 | Accept campus parameter |
| `src/pages/Login.tsx` | 2 | Campus-aware login |
| `src/hooks/useAutoSave.ts` | 3 | Campus-aware saves |
| `src/hooks/useWorksheet.ts` | 3 | Campus-aware loading |
| `src/hooks/useNotifications.ts` | 3 | Campus-aware notifications |
| `src/hooks/useAutoPromote.ts` | 3 | Campus-aware promotion |
| `src/hooks/useDueDates.ts` | 3 | Campus-aware dates |
| `src/hooks/useGateControl.ts` | 3 | Campus-aware gates |
| `src/utils/queryCache.ts` | 1 | Add campus key prefix |
| `src/constants/status.ts` | 4 | Add campus-related statuses |
| `src/utils/__tests__/campusSlug.test.ts` | 10 | campusPath / useCampusPath tests |
| `src/api/__tests__/tenant.test.ts` | 10 | Campus resolution + access validation tests |
| `src/utils/__tests__/rbac.test.ts` | 10 | RBAC permission matrix tests |
| `src/context/__tests__/CampusContext.test.tsx` | 10 | Campus provider tests |
| `scripts/validate_rls_isolation.mjs` | 10 | Live-DB cross-campus RLS validation |
| All worksheet components (40+) | 5 | Accept template via context |
| All gate control components (8) | 5 | Accept template via context |

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Data leak across campuses** | Low | Critical | RLS policies tested with multiple campus users; penetration testing |
| **Template migration data loss** | Medium | High | Verify script output against original hardcoded config; keep hardcoded fallback |
| **Existing routes break** | Medium | High | Feature flag (`VITE_MULTI_TENANT_ENABLED`); gradual rollout |
| **Performance with 100+ campuses** | Low | Medium | Indexes on campus_id; RLS query optimization |
| **Session token too large** | Low | Low | Store minimal metadata in JWT; fetch campus details separately |
| **Browser history / deep links broken** | Medium | Medium | Redirect middleware; `_redirects` file update for Vercel |
| **Third-party integrations break** | Low | Low | No third-party integrations currently; design with hooks for future |
| **Team productivity drops** | Medium | Medium | Execute phases sequentially; test each phase before moving on |

---

## Execution Order

```
Phase 0: Database schema (foundation — can be applied independently)
    ↓
Phase 1: Types & API infrastructure (no behavior change)
    ↓
Phase 2: Campus context + auth changes (start using campus_id)
    ↓
Phase 3: RLS policies (security isolation)
    ↓
Phase 4: Dynamic RBAC (permissions system)
    ↓
Phase 5: Configurable templates (data migration)
    ↓
Phase 6: Super Admin dashboard (new features)
    ↓
Phase 7: Campus Admin dashboard (new features)
    ↓
Phase 8: Route migration (URL structure change — biggest user-facing change)
    ↓
Phase 9: Data migration + backward compat
    ↓
Phase 10: Testing & validation
```

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **New database tables** | 5 |
| **New columns on existing tables** | 4 |
| **New SQL migrations** | 1 |
| **New TypeScript interfaces** | 8 |
| **New React files** | 30+ |
| **Existing files to modify** | 50+ |
| **Expected new routes** | 25+ |
| **New RLS policies** | 10 |
| **Modified RLS policies** | 15 |
| **Phases** | 10 |
| **Estimated total file changes** | 100+ |
