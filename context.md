# Newton School Faculty Onboarding Portal — Complete Context

## Overview
React SPA (Vite) + Supabase for onboarding new faculty instructors through a 30–60–90 day program across 3 phases (17 worksheets + 3 gate controls). Instructors fill worksheets, submit them, then get reviewed by their assigned Buddy, Manager, or Onboarding Lead through a buddy-first review flow with phase-level manager approval.

## Tech Stack
- **Frontend**: React 19 + Vite 8 + react-router-dom v7
- **Styling**: Custom CSS design system (luxury/editorial theme), no Tailwind
- **Icons**: lucide-react
- **Backend**: Supabase (PostgreSQL + Auth + RLS policies + pg_cron for notifications)
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **Testing**: Vitest (57 tests across 5 test suites)

## Project Structure
```
src/
├── main.jsx                        # Entry point, renders <App/>
├── App.jsx                         # Router + providers + dynamic worksheet routes + 404 page
├── styles/
│   └── index.css                   # Global luxury design system
├── api/
│   └── supabase.js                 # Supabase client init from env vars
├── context/
│   ├── AuthContext.jsx              # Auth provider + signup notification triggers
│   └── ProjectInfo.js              # Static project metadata
├── config/
│   ├── worksheetConfig.jsx         # WORKSHEET_REVIEWER, ALL_WORKSHEETS, WORKSHEET_COMPONENTS
│   ├── worksheetConfigData.js      # FIELD_SECTIONS layout for ReviewContent + status helpers
│   └── worksheetComponents.jsx     # Shared UI: WorksheetHeader, Section, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, ErrorAlert, BackButton
├── hooks/
│   ├── useAutoSave.js              # Auto-save + submit + load worksheet data + notification triggers
│   ├── useAutoPromote.js           # Auto-promote joinee to lead_instructor after Phase 3 completion + notifications
│   ├── useDueDates.js              # Due date tracking and overdue detection
│   ├── useNotifications.js         # Notification system (triggerNotification, getReviewerUserIds, markAsRead, fetchNotifications)
│   ├── useWorksheet.js             # Worksheet data loading + review history
│   └── __tests__/
│       ├── useAutoSave.test.js     # 12 tests
│       ├── useAutoPromote.test.js  # 18 tests
│       ├── useDueDates.test.js     # 8 tests
│       ├── useNotifications.test.js# 11 tests
│       └── reviewFlow.test.js      # 8 tests
├── utils/
│   └── errorHandling.js            # Toast event system (onToast, dispatchToast, notifyError)
├── components/
│   ├── Navbar.jsx                   # Sticky nav + progress bar + role links + notification bell + user menu
│   ├── NotificationBell.jsx         # Notification bell icon + dropdown with unread count
│   ├── ProtectedRoute.jsx           # Auth gate + role-based access control
│   ├── ReviewContent.jsx            # Renders submitted worksheet data for reviewers (FIELD_SECTIONS layout + tables)
│   ├── ErrorBoundary.jsx            # React error boundary with refresh/try-again
│   ├── Toast.jsx                    # Toast notification system (success/error/warning/info)
│   └── SaveIndicator.jsx           # "Saving…" / "Saved" indicator badge
├── pages/
│   ├── Login.jsx                    # Email/password + Google OAuth login
│   ├── Signup.jsx                   # Registration with 4 role options
│   ├── AuthCallback.jsx            # OAuth redirect handler
│   ├── Dashboard.jsx               # Home — phase roadmap, worksheet cards with status, progress
│   ├── NotFound.jsx                 # 404 page with Go Home link
│   ├── Phase1.jsx                  # Phase 1 worksheet cards (8 + GC1)
│   ├── Phase2.jsx                  # Phase 2 worksheet cards (4 + GC2)
│   ├── Phase3.jsx                  # Phase 3 worksheet cards (5 + GC3)
│   ├── AdminDashboard.jsx          # Admin: overview stats, pending review queue, assignments tab + notification triggers
│   ├── BuddyDashboard.jsx          # Buddy: filtered review queues by review_status and reviewer_type
│   ├── OnboardingLeadDashboard.jsx # Onboarding Lead: procedural worksheet review panel
│   ├── PhaseReview.jsx             # Phase-level manager approval (after all buddy_approved, manager approves whole phase)
│   ├── WorksheetReview.jsx         # Review page: content view + approve/request revision + notification triggers
│   ├── Assessment.jsx              # Final readiness assessment (Faculty Lead only)
│   ├── Stakeholders.jsx            # Static onboarding roles page
│   ├── gate-controls/
│   │   ├── GateControl1.jsx        # 30-Day milestone + manager sign-off
│   │   ├── GateControl2.jsx        # 60-Day milestone + manager sign-off
│   │   └── GateControl3.jsx        # 90-Day final readiness + faculty lead sign-off
│   └── worksheets/
│       ├── Phase1Worksheet[1-8].jsx # 8 Phase 1 worksheets
│       ├── Phase2Worksheet[1-4].jsx # 4 Phase 2 worksheets
│       └── Phase3Worksheet[1-5].jsx # 5 Phase 3 worksheets
```

## Roles & Permissions
| Role | Identifier | Permissions |
|---|---|---|
| New Joinee | `new_joinee` | Fill & submit own worksheets, view dashboard |
| Lab Instructor | `lab_instructor` | (Same as new_joinee) |
| Lead Instructor (Buddy/Mentor) | `lead_instructor` | Review buddy-type worksheets, access `/buddy` |
| Academic Head | `academic_head` | Admin access + approve phases at `/admin` + `/phase-review` |
| Onboarding Lead | `onboarding_lead` | Full admin + procedural worksheet review |
| Acad Ops | `acad_ops` | Reserved for future use |

## Database (PostgreSQL via Supabase)
### Key Tables
- **`user_profiles`** — Extends auth.users with `full_name`, `role`, `assigned_lead_id`, `assigned_buddy_id`
- **`worksheet_submissions`** — Core table: `user_id`, `worksheet_id`, `worksheet_data` (JSONB), `status`, `review_status`, `reviewer_type`, `reviewed_by`, `review_comment`, `review_history` (JSONB array), `phase`, `due_date` (DATE)
- **`notifications`** — Notification system: `user_id`, `from_user_id`, `worksheet_id`, `type`, `message`, `read`, `created_at`

### Review Status State Machine
```
'' → 'pending_review' → 'buddy_approved' → 'approved' (buddy-first flow)
                       → 'needs_revision' → 'revision_submitted' → 'buddy_approved' → 'approved'
```
- `''` = In Progress
- `pending_review` = Submitted, awaiting buddy review
- `buddy_approved` = Buddy approved, awaiting manager phase-level approval
- `needs_revision` = Reviewer requested changes
- `revision_submitted` = Instructor resubmitted after revision
- `approved` = Phase-level approved (by manager)

### Notification Types
- `'submitted'` — Worksheet submitted for review
- `'revision_submitted'` — Resubmitted after revision
- `'buddy_approved'` — Buddy approved a worksheet
- `'approved'` — Manager approved a phase
- `'needs_revision'` — Reviewer requested changes
- `'due_soon'` — Due date approaching (pg_cron job)
- `'overdue'` — Worksheet overdue (pg_cron job)

### RLS Policies
All tables use Row Level Security. Key patterns:
- Users read/write own data
- JWT role checks via `auth.jwt() -> 'user_metadata' ->> 'role'` (avoids RLS recursion)
- Reviewers access via role check OR `assigned_lead_id` / `assigned_buddy_id` joins

## Notification Events (9 Types)
| Event | Sender → Receiver | Trigger Location |
|---|---|---|
| Worksheet submitted → reviewer | `useAutoSave.js` | ✅ |
| Revision submitted → reviewer | `useAutoSave.js` | ✅ |
| Buddy approves → joinee + manager | `WorksheetReview.jsx` | ✅ |
| Buddy requests revision → joinee | `WorksheetReview.jsx` | ✅ |
| Manager approves phase → joinee + buddy | `PhaseReview.jsx` | ✅ |
| New joinee signs up → all managers + onboarding leads | `AuthContext.jsx` | ✅ |
| Manager assigned → joinee + manager | `AdminDashboard.jsx` | ✅ |
| Buddy assigned → joinee + buddy | `AdminDashboard.jsx` | ✅ |
| Auto-promotion complete → promoted user + all managers | `useAutoPromote.js` | ✅ |

## Routing
### Auth Routes
| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/signup` | Signup | Public |
| `/auth/callback` | AuthCallback | Public |

### Main Routes
| Path | Component | Required Role |
|---|---|---|
| `/` | Dashboard | Any authenticated |
| `/phase-1` | Phase1 | Any authenticated |
| `/phase-2` | Phase2 | Any authenticated |
| `/phase-3` | Phase3 | Any authenticated |
| `/assessment` | Assessment | Any authenticated |
| `/stakeholders` | Stakeholders | Any authenticated |
| `/admin` | AdminDashboard | `academic_head`, `onboarding_lead` |
| `/buddy` | BuddyDashboard | `lead_instructor` |
| `/onboarding-lead` | OnboardingLeadDashboard | `onboarding_lead` |
| `/phase-review/:userId` | PhaseReview | `academic_head` |
| `/*` | NotFound (404) | Public |

### Dynamic Worksheet Routes
- `/phase-1/worksheet-1` through `/phase-1/worksheet-8` + `/phase-1/gate-1`
- `/phase-2/worksheet-1` through `/phase-2/worksheet-4` + `/phase-2/gate-2`
- `/phase-3/worksheet-1` through `/phase-3/worksheet-5` + `/phase-3/gate-3`

### Review Routes
| Path | Reviewer Type |
|---|---|
| `/admin/review/:userId/:worksheetId` | Manager |
| `/buddy/review/:userId/:worksheetId` | Buddy |
| `/onboarding-lead/review/:userId/:worksheetId` | Onboarding Lead |

## Worksheet Architecture
### Reviewer Assignment (`worksheetConfig.jsx`)
**`WORKSHEET_REVIEWER`** maps each worksheet ID to a reviewer type:
- **Buddy**: p1_w1, p1_w2, p1_w6, p1_w8, p2_w1, p2_w2, p3_w2, p3_w4
- **Manager**: p1_w3, p1_w7, gc1, p2_w3, gc2, p3_w1, p3_w3, p3_w5, gc3
- **Onboarding Lead**: p1_w4, p1_w5, p2_w4

### Review Flow (Buddy-First)
1. Instructor submits → `'pending_review'`
2. Buddy reviews → approves → `'buddy_approved'` (or requests revision → `'needs_revision'` → resubmit → `'revision_submitted'` → buddy re-approves → `'buddy_approved'`)
3. Manager reviews all buddy_approved worksheets in a phase → approves whole phase → all become `'approved'`
4. Notifications fire at every step

## Design System
- **Theme**: Luxury editorial — Playfair Display headings, Inter body
- **Colors**: Charcoal (#1A1A1A), warm grey (#6C6863), gold (#D4AF37), alabaster (#F9F8F6)
- **Components**: `lux-btn`, `lux-input`, `lux-card`, `lux-badge`, `lux-progress`, `lux-alert`, `lux-section`, `lux-container`
- **Animations**: `luxFadeIn` (fade + slide up), gold overlay on primary buttons
- **Paper texture**: Subtle SVG noise overlay via `.lux-noise::before`
- **Responsive**: Mobile hamburger menu (breakpoint 850px)

## Testing
- **57 unit tests** across 5 suites — all passing
- **E2E browser tests** — auth flow, dashboard, worksheets, notification bell, 404 page, mobile responsive, sign-out — all verified
- **Build**: Vite build completes in ~200ms

## Seed Data & Setup
### Scripts
- **`__seed_30_users.cjs`** — Creates 32 users with full worksheet data, assignments, and varied review states. Usage: `node __seed_30_users.cjs` (runs all phases) or `--users / --assign / --worksheets` for individual phases
- **`scripts/run_migration.cjs`** — Runs SQL migrations via Supabase Management API. Usage: `SUPABASE_PAT=<token> node scripts/run_migration.cjs`
- **`scripts/setup/`** — SQL migration files for notifications, due dates, RLS policies, schema

### Key Test Users (all password: `Test123!`)
| Email | Role | Name |
|---|---|---|
| arjun.qa@newton.edu | New Joinee | Arjun Mehta |
| sneha.qa@newton.edu | New Joinee | Sneha Patel |
| neha.qa@newton.edu | Buddy | Neha Kapoor |
| priya.qa@newton.edu | Manager | Dr. Priya Sharma |
| ravi.qa@newton.edu | Onboarding Lead | Ravi Deshmukh |

## Important Notes
- **Supabase Free Tier**: Auth signup rate-limited (~5-10 signups per hour). Use `__seed_30_users.cjs --users` in small batches OR use the Supabase Management API with a PAT
- **Migration**: Run `__migration_notifications_dates.sql` in Supabase SQL Editor to create the `notifications` table and add `due_date` column
- **GitHub Remote**: `origin` → `https://github.com/newton-priyanshu/Onboarding.git`
