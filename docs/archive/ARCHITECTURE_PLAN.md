# Architecture Plan: Due Dates, Notifications, Bug Fixes & Rigorous Review Flow

---

## 1. State Machine: Worksheet Review Flow (Strict)

### Current State (loose):
```
In Progress → submitted → pending_review → approved
                                        → needs_revision → revision_submitted → pending_review
```

### Issues:
- No validation at the DB level enforcing valid transitions
- Reviewer can approve any worksheet regardless of current status
- No restrictions on re-approving already-approved worksheets

### Proposed (enforced in schema + code):

```
                  ┌──────────────────────────────┐
                  │         In Progress           │
                  └──────────┬───────────────────┘
                             │ submit()
                             ▼
                  ┌──────────────────────────────┐
                  │       pending_review          │ ← Only state where review actions are allowed
                  └──┬────────────┬──────────────┘
                     │            │
          approve()  │            │  requestRevision()
                     ▼            ▼
         ┌──────────────────┐  ┌──────────────────────┐
         │     approved     │  │    needs_revision     │
         └──────────────────┘  └──────────┬───────────┘
                                          │ resubmit()
                                          ▼
                              ┌────────────────────────┐
                              │  revision_submitted     │──→ pending_review (re-enter review)
                              └────────────────────────┘
```

**Enforcement:**
- **DB CHECK constraint**: `review_status` transitions validated at DB level
- **Backend/API guard**: Review actions validate current state
- **UI guard**: Review buttons only shown when `status === 'pending_review' || status === 'revision_submitted'`
- **No re-review of approved worksheets** (immutable after approval)

---

## 2. Due Dates System

### Schema Change: `worksheet_submissions`
```sql
ALTER TABLE worksheet_submissions ADD COLUMN due_date DATE;
ALTER TABLE worksheet_submissions ADD COLUMN due_date_reminded BOOLEAN DEFAULT false;
```

### Schema Change: `worksheet_config` (or a new table)
```sql
CREATE TABLE worksheet_due_dates (
  worksheet_id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  default_days_from_start INTEGER NOT NULL,  -- e.g. 7 for p1_w1
  gate_control BOOLEAN DEFAULT false
);
```

### Seeded Default Durations:
| Worksheet | Days from Start |
|-----------|----------------|
| p1_w1     | Day 7          |
| p1_w2     | Day 30 (weekly)|
| p1_w3     | Day 14         |
| p1_w4     | Day 14         |
| p1_w5     | Day 14         |
| p1_w6     | Day 28         |
| p1_w7     | Day 28         |
| p1_w8     | Day 28         |
| gc1       | Day 30         |
| p2_w1     | Day 45         |
| p2_w2     | Day 50         |
| p2_w3     | Day 55         |
| p2_w4     | Day 55         |
| gc2       | Day 60         |
| p3_w1     | Day 75         |
| p3_w2     | Day 75         |
| p3_w3     | Day 80         |
| p3_w4     | Day 80         |
| p3_w5     | Day 85         |
| gc3       | Day 90         |

### UI Display:
- Dashboard: Show "Due in X days" or "Overdue!" badge per worksheet
- Worksheet header: Show due date with warning indicator
- Phase pages: Color-coded due date column
- Phase pages block submission of Gate Controls until all worksheets in phase are approved

---

## 3. Notification System

### Schema: New `notifications` Table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,       -- Who receives
  from_user_id UUID REFERENCES auth.users(id),            -- Who triggered
  worksheet_id TEXT NOT NULL,                              -- Which worksheet
  type TEXT NOT NULL CHECK (type IN (
    'submitted',           -- Joinee submitted → reviewer
    'revision_submitted',  -- Joinee resubmitted → reviewer
    'approved',            -- Reviewer approved → joinee
    'needs_revision',      -- Reviewer requested changes → joinee
    'due_soon',            -- Auto: worksheet due in 2 days
    'overdue'              -- Auto: worksheet past due date
  )),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Notification Triggers:
1. **Worksheet Submitted** → Send to `reviewer_type` user(s):
   - `buddy` worksheets → Notification to the assigned buddy
   - `manager` worksheets → Notification to `academic_head` users
   - `onboarding_lead` worksheets → Notification to `onboarding_lead` users
2. **Worksheet Approved** → Send to the joinee
3. **Worksheet Needs Revision** → Send to the joinee with reviewer's comment
4. **Due Soon** → Check daily, send to joinee 2 days before due date
5. **Overdue** → Check daily, send to joinee + their reviewer

### UI Components:
- **NotificationBell** in Navbar: Bell icon with unread count
- **NotificationDropdown**: List of recent notifications (click to navigate to worksheet)
- **Mark as Read**: Click notification to mark as read + navigate

---

## 4. Phase 1 Worksheet Bug Fixes

| Worksheet | Bug | Fix |
|-----------|-----|-----|
| p1_w1 | `mentorName`, `mentorEmail` in defaultData but no UI | Remove dead state |
| p1_w1 | No `handleSubmit` was needed in the conversation section to help | N/A |
| p1_w8 | Uses `MessageCircle` but imports `MessageSquare` | Fix import to `MessageCircle` |
| p1_w6 | `reflectionDoubts`, `reflectionLabDiff` in defaultData but no UI | Remove dead state |
| Phase pages | Checks both `'submitted'` AND `'Submitted'` (case inconsistency) | Normalize to lowercase |
| ReviewContent | FIELD_SECTIONS stale for p3_w2-p3_w5 (rewritten) | Update FIELD_SECTIONS mappings |

---

## 5. Implementation Order

### Step 1: Phase 1 Bug Fixes
- Fix icon import in p1_w8
- Remove dead state fields in p1_w1, p1_w6
- Normalize status check in all phase pages
- Update ReviewContent FIELD_SECTIONS

### Step 2: Schema Changes
- Run migration: due_date column + notifications table
- Review flow CHECK constraint

### Step 3: Due Dates
- Create useDueDates hook
- Add due date display to phase pages
- Add due date indicator to worksheet headers

### Step 4: Notification System
- Create notification hooks and context
- Build NotificationBell + Dropdown
- Trigger notifications on submit/approve/revision

### Step 5: Strengthen Review Flow
- Add state machine guards to WorksheetReview
- Validate review transitions
- Handle edge cases (double-submit, already-approved)

### Step 6: Unit Tests
- Tests for notification hooks
- Tests for review flow validation
- Tests for due date calculations

---

## 6. New Files to Create

```
src/
  hooks/
    useNotifications.js     ──── Notification fetching, marking read
    useDueDates.js          ──── Due date calculations & display logic
  context/
    NotificationContext.jsx  ──── Global notification state + polling
  components/
    NotificationBell.jsx    ──── Bell icon with badge in Navbar
    NotificationDropdown.jsx─── Dropdown notification list
  __tests__/
    useNotifications.test.js
    useDueDates.test.js
```

## 7. Files to Modify

```
src/
  App.jsx                          ──── Add NotificationProvider
  components/Navbar.jsx            ──── Add NotificationBell
  components/Navbar.jsx            ──── Add Reviews link for manager/lead/buddy roles (already exists)
  hooks/useWorksheet.js            ──── Add due date handling
  hooks/useAutoSave.js             ──── Trigger notification on submit
  pages/WorksheetReview.jsx        ──── Enforce state machine, trigger notification
  pages/Phase1.jsx / Phase2.jsx / Phase3.jsx  ──── Due date display, status fixes
  pages/Dashboard.jsx              ──── Due date display
  pages/GateControl1.jsx/GC2.jsx/GC3.jsx ──── Refactor to useWorksheet hook (optional future)
  pages/worksheets/*               ──── Bug fixes
  components/ReviewContent.jsx     ──── Update FIELD_SECTIONS
  schema.sql                       ──── Add new schema
```
