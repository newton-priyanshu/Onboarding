# Newton School Faculty Onboarding Portal — Complete Context

## Overview
React SPA (Vite) + Supabase for onboarding new faculty instructors through a 30–60–90 day program across 3 phases (17 worksheets + 3 gate controls). Instructors fill worksheets, submit them, then get reviewed/approved by their assigned Buddy, Manager, or Onboarding Lead.

## Tech Stack
- **Frontend**: React 19 + Tailwind CSS v4 + Vite 8 + react-router-dom v7
- **Icons**: lucide-react
- **Backend**: Supabase (PostgreSQL + Auth + RLS policies)
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **CLI Tooling**: CodeRabbit (pre-commit review via `cr review --agent`)

## Project Structure
```
src/
├── main.jsx                        # Entry point, renders <App/>
├── App.jsx                         # Router + providers + dynamic worksheet routes
├── index.css                       # Global design system (Luxury/Editorial + MD3 compat)
├── supabase.js                     # Supabase client init from env vars
├── worksheetConfig.jsx             # WORKSHEET_REVIEWER map + ALL_WORKSHEETS + WORKSHEET_COMPONENTS
├── worksheetComponents.jsx         # Shared UI: WorksheetHeader, Section, FieldGroup, ActionBar, SubmittedView, ApprovedView, LoadingView, ErrorAlert, BackButton
├── context/
│   ├── AuthContext.jsx              # Auth provider (user, profile, signIn, signUp, signInWithGoogle, signOut, hasRole)
│   └── ProjectInfo.js              # Static project metadata
├── hooks/
│   ├── useAutoSave.js              # Auto-save worksheets to Supabase every 1.5s + flushSave + loadWorksheetData + getOAuthName
│   └── __tests__/
│       └── useAutoSave.test.js
├── utils/
│   └── errorHandling.js            # Toast event system (onToast, dispatchToast, notifyError)
├── components/
│   ├── Navbar.jsx                   # Sticky nav with progress bar, role links, user dropdown menu
│   ├── ProtectedRoute.jsx           # Auth gate + role-based access control
│   ├── ReviewContent.jsx            # Renders submitted worksheet data for reviewers (FIELD_SECTIONS layout + tables)
│   ├── ErrorBoundary.jsx            # React error boundary with refresh/try-again
│   ├── Toast.jsx                    # Toast notification system (success/error/warning/info)
│   └── SaveIndicator.jsx           # "Saving…" / "Saved" indicator badge
├── pages/
│   ├── Login.jsx                    # Email/password + Google OAuth login
│   ├── Signup.jsx                   # Registration with role selection
│   ├── AuthCallback.jsx            # OAuth redirect handler
│   ├── Dashboard.jsx               # Home page — phase roadmap, worksheet list, progress bars
│   ├── Phase1.jsx                  # Phase 1 worksheet list (8 worksheets + GC1)
│   ├── Phase2.jsx                  # Phase 2 worksheet list (4 worksheets + GC2)
│   ├── Phase3.jsx                  # Phase 3 worksheet list (5 worksheets + GC3)
│   ├── AdminDashboard.jsx          # Admin — overview + pending review tab + assignment management
│   ├── BuddyDashboard.jsx          # Buddy/Manager — filtered review queues by reviewer type
│   ├── OnboardingLeadDashboard.jsx # Onboarding Lead — procedural worksheet review panel
│   ├── WorksheetReview.jsx         # Review page — view submitted content + approve/request revision
│   ├── GateControl1.jsx            # 30-Day milestone self-assessment + manager sign-off
│   ├── GateControl2.jsx            # 60-Day milestone self-assessment + manager sign-off
│   ├── GateControl3.jsx            # 90-Day final readiness assessment + faculty lead sign-off
│   ├── Assessment.jsx              # Final readiness assessment form (Faculty Lead only)
│   ├── Stakeholders.jsx            # Static page listing onboarding roles
│   └── worksheets/
│       ├── Phase1Worksheet1-8.jsx  # Phase 1 worksheets (p1_w1 through p1_w8)
│       ├── Phase2Worksheet1-4.jsx  # Phase 2 worksheets (p2_w1 through p2_w4)
│       └── Phase3Worksheet1-5.jsx  # Phase 3 worksheets (p3_w1 through p3_w5)
```

## Roles & Permissions
| Role | Identifier | Permissions |
|---|---|---|
| New Joinee | `new_joinee` | Fill & submit own worksheets, view own dashboard |
| Lab Instructor | `lab_instructor` | (Same as new_joinee) |
| Lead Instructor (Buddy/Mentor) | `lead_instructor` | Review assigned instructors' worksheets (buddy & manager types), access `/buddy` |
| Academic Head | `academic_head` | Full admin access (all worksheets, assignments), access `/admin` |
| Onboarding Lead | `onboarding_lead` | Full admin + procedural worksheet review, access `/admin` + `/onboarding-lead` |
| Acad Ops | `acad_ops` | (Reserved for future use) |

## Database (PostgreSQL via Supabase)
### Key Tables
- **`user_profiles`** — Extends auth.users with `full_name`, `role`, `assigned_lead_id`, `assigned_buddy_id`
- **`worksheet_submissions`** — Core table: `user_id`, `worksheet_id`, `worksheet_data` (JSONB), `status`, `review_status`, `reviewer_type`, `reviewed_by`, `review_comment`, `review_history` (JSONB array), `phase`
- **`onboarding_submissions`** — Final assessment records from Faculty Lead

### Worksheet Submission Status Machine (`review_status`)
```
'' → 'pending_review' → 'approved' (approve flow)
                       → 'needs_revision' → 'revision_submitted' → 'approved' (revision flow)
```
- `''` = In Progress / Not submitted
- `pending_review` = Submitted, awaiting reviewer action
- `needs_revision` = Reviewer requested changes
- `revision_submitted` = Instructor resubmitted after revision
- `approved` = Worksheet is complete

### RLS Policies
All tables have Row Level Security. Key patterns:
- Users read/write own data
- JWT role checks via `auth.jwt() -> 'user_metadata' ->> 'role'` (avoids RLS recursion)
- Reviewers access via role check OR `assigned_lead_id` / `assigned_buddy_id` joins

## Routing
### Auth Routes
| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/signup` | Signup | Public |
| `/auth/callback` | AuthCallback | Public (OAuth redirect) |

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
| `/admin/review/:userId/:worksheetId` | WorksheetReview | `academic_head`, `lead_instructor`, `onboarding_lead` |
| `/buddy/review/:userId/:worksheetId` | WorksheetReview | `lead_instructor`, `academic_head`, `onboarding_lead` |
| `/onboarding-lead/review/:userId/:worksheetId` | WorksheetReview | `lead_instructor`, `academic_head`, `onboarding_lead` |

### Dynamic Worksheet Routes (generated from `ALL_WORKSHEETS` config)
- `/phase-1/worksheet-1` through `/phase-1/worksheet-8` + `/phase-1/gate-1`
- `/phase-2/worksheet-1` through `/phase-2/worksheet-4` + `/phase-2/gate-2`
- `/phase-3/worksheet-1` through `/phase-3/worksheet-5` + `/phase-3/gate-3`

## Worksheet Architecture
### Config (`worksheetConfig.jsx`)
**`WORKSHEET_REVIEWER`** maps each worksheet ID to a reviewer type: `'buddy'`, `'manager'`, or `'onboarding_lead'`:
- **Buddy reviews**: p1_w1 (Team Intro), p1_w2 (Mentor Sync), p1_w6 (Observation Journal), p1_w8 (Slack Audit), p2_w1 (Doubt Resolution), p2_w2 (Lab Scorecard), p3_w2 (Cohort Profiling), p3_w4 (Pedagogical Journal)
- **Manager reviews**: p1_w3 (Teaching Philosophy), p1_w7 (Courseware Review), gc1 (Gate 1), p2_w3 (Content Ledger), gc2 (Gate 2), p3_w1 (Lecture Delivery), p3_w3 (Assessment Blueprint), p3_w5 (Course Proposal), gc3 (Gate 3)
- **Onboarding Lead reviews**: p1_w4 (Univ Governance), p1_w5 (Portal Walkthrough), p2_w4 (Portal Ops Check)

**`ALL_WORKSHEETS`** groups worksheets by phase with metadata (title, reviewer type, icon color).
**`WORKSHEET_COMPONENTS`** maps worksheet IDs to their React components for dynamic routing.

### Worksheet Component Pattern
Each worksheet follows this pattern:
1. Imports `useAutoSave(user, data, WORKSHEET_ID, phase)` for auto-save + `loadWorksheetData(user.id, WORKSHEET_ID)` to load saved data
2. Uses `data._savedReviewStatus` to check the current review status (loaded from DB's `review_status`)
3. Shows `ApprovedView` when `_savedReviewStatus === 'approved'`
4. Shows `SubmittedView` when status is 'submitted' AND NOT needs_revision
5. Shows the form when in progress, OR when revision is requested (`_savedReviewStatus === 'needs_revision'`)
6. Shows a yellow revision banner (`lux-alert lux-alert-info`) when `_savedReviewStatus === 'needs_revision'`
7. On submit: sets `status: 'submitted'`, `review_status` goes to `'pending_review'` (via useAutoSave), or `'revision_submitted'` if resubmitting

### GateControl Pattern (different from worksheets)
GateControls (GC1-3) use their own Supabase queries directly (not useAutoSave), with separate auto-save useEffect + handleSubmit. They also check `_savedReviewStatus` and show Approved/Submitted views. On resubmit after revision, they set `review_status: 'revision_submitted'`.

## Review Flow (End-to-End)
1. **Instructor fills worksheet** → auto-saved every 1.5s via `useAutoSave` → upserts `worksheet_submissions`
2. **Instructor clicks "Submit for Review"** → `handleSubmit` sets `status: 'submitted'` → `useAutoSave` sets `review_status: 'pending_review'`
3. **Reviewer sees worksheet in their queue** (AdminDashboard Pending tab / BuddyDashboard / OnboardingLeadDashboard filtered by `WORKSHEET_REVIEWER[wsId]` + `review_status`)
4. **Reviewer opens WorksheetReview** at `/admin/review/:userId/:worksheetId`
5. **Reviewer views submitted content** rendered by `ReviewContent` component (uses `FIELD_SECTIONS` layout config per worksheet)
6. **Reviewer chooses**: "Approve" → sets `review_status: 'approved'` OR "Request Revision" → sets `review_status: 'needs_revision'` (requires comment)
7. **If approved**: Instructor sees green ApprovedView, cannot edit/resubmit. `useAutoSave` preserves `'approved'` status.
8. **If revision requested**: Instructor sees the form again with revision banner, can edit and resubmit. On resubmit: sets `review_status: 'revision_submitted'`
9. **Review history** is stored as a JSONB array in `review_history` column (action, reviewer_name, comment, timestamp)

## Design System
- **Theme**: Luxury editorial — Playfair Display headings, Inter body, charcoal (#1A1A1A), warm grey (#6C6863), gold (#D4AF37), alabaster (#F9F8F6) background
- **Components**: `lux-btn`, `lux-input`, `lux-textarea`, `lux-select`, `lux-card`, `lux-badge`, `lux-line`, `lux-progress`, `lux-alert`, `lux-section`, `lux-container`
- **Animations**: `luxFadeIn` (fade + slide up), `lux-btn` hover effects (gold overlay on primary, fill on secondary)
- **MD3 Compatibility**: CSS variables map Material Design 3 classes to the luxury theme for legacy worksheet pages
- **Paper texture**: Subtle SVG noise overlay via `.lux-noise::before`
- **Responsive**: Mobile hamburger menu (breakpoint 850px), responsive containers

## Key Data Flow
```
User fills form → useAutoSave (1.5s debounce) → upsert to worksheet_submissions
                → flushSave on submit → status='submitted', review_status='pending_review'
                → Reviewer reviews via WorksheetReview → update review_status
                → Next page load: loadWorksheetData() reads saved data + review_status
                → Component renders based on status (form/SubmittedView/ApprovedView)
```

## Important Gotchas
- **GateControl status check case mismatch**: GC auto-save guards check `data.status === 'submitted'` (lowercase) but handleSubmit sets `'Submitted'` (capital S) — harmless because form is hidden after submission
- **useAutoSave preserves approved**: If `_savedReviewStatus === 'approved'`, auto-save keeps `review_status: 'approved'` instead of overwriting
- **Revision resubmit**: On resubmit, `review_status` is set to `'revision_submitted'` (not `'pending_review'`) so reviewers can distinguish initial submissions from revisions
- **No remote git remote**: Push requires manual `git push` to `origin main` at `https://github.com/newton-priyanshu/Onboarding.git`
