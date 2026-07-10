# Review Flow — State Machine

## Complete State Diagram

```
                    ┌──────────────────┐
                    │  NOT STARTED /    │
                    │   IN PROGRESS     │
                    │  (review_status:  │
                    │    '' / null)     │
                    └────────┬─────────┘
                             │
                     Joinee submits
                             │
                             ▼
                    ┌──────────────────┐
                    │  PENDING REVIEW   │◄────────────────────┐
                    │  (pending_review) │                     │
                    └────────┬─────────┘                     │
                             │                               │
                    ┌────────┴────────┐                      │
                    │                 │                       │
            Buddy approves     Buddy requests revision
                    │                 │                       │
                    ▼                 ▼                       │
          ┌──────────────────┐  ┌──────────────────┐         │
          │  BUDDY APPROVED  │  │ NEEDS REVISION   │─────────┘
          │ (buddy_approved) │  │ (needs_revision)  │
          └────────┬─────────┘  └──────────────────┘
                   │                    │
                   │            Joinee resubmits
                   │                    │
                   │                    ▼
                   │           ┌──────────────────┐
                   │           │ REVISION         │
                   │           │ SUBMITTED        │────────┐
                   │           │(revision_submitted)       │
                   │           └──────────────────┘        │
                   │                    │                  │
                   │            ┌───────┘                  │
                   │            │  Buddy re-reviews        │
                   │            │  (back to pending_review)│
                   │            └──────────────────────────┘
                   │
                   │   ┌──────────────────────────────────────┐
                   │   │   PHASE LEVEL: ALL buddy_approved +  │
                   │   │   no pending worksheets in phase     │
                   └───┤                                      │
                       │  → Phase is "Ready for Manager"      │
                       └──────────────────┬───────────────────┘
                                          │
                                  Manager approves phase
                                          │
                                          ▼
                    ┌──────────────────────────────┐
                    │      APPROVED (Phase-Level)   │
                    │        (approved)             │
                    │  All phase worksheets marked   │
                    │     as fully approved          │
                    └──────────────┬────────────────┘
                                   │
                          Check all 3 phases
                                   │
                          ┌────────┴────────┐
                          │                 │
                  Not all approved   ALL 3 PHASES done
                          │                 │
                          │                 ▼
                          │     ┌──────────────────────┐
                          │     │   AUTO-PROMOTE:      │
                          └────►│  new_joinee →        │
                                │  lead_instructor     │
                                └──────────────────────┘
```

## Notification Flow

```
  Joinee submits  ──────────────────────►  Buddy notified
                                               │
                                    Buddy approves worksheet
                                               │
                    ┌──────────────────────────┼──────────────┐
                    │                          │              │
                    ▼                          ▼              ▼
              Joinee notified           Manager notified   All managers
          "Buddy approved"         "Phase progress update"  notified

  Manager approves phase
          │
          ├─────────────────────►  Joinee notified "Fully approved"
          ├─────────────────────►  Buddies notified "Phase complete"
          │
          ▼
  CheckAndPromote()
          │
          ├── Not all phases done → No action
          └── All 3 phases done  → Joinee promoted to lead_instructor
                                   + Notification sent
```

## Key Logic Rules

### Who can do what?

| Action | Buddy | Manager | Onboarding Lead |
|--------|-------|---------|-----------------|
| View worksheet | ✅ | ✅ | ✅ (read-only) |
| Approve → `buddy_approved` | ✅ | ❌ (phase-level only) | ❌ |
| Request revision | ✅ | ✅ | ❌ |
| Approve phase (`approved`) | ❌ | ✅ | ❌ |
| Assign buddy to joinee | ❌ | ✅ | ✅ |
| Monitor progress | ✅ (own) | ✅ (all) | ✅ (all) |

### State Transition Rules

| From | To | Triggered By | Condition |
|------|----|--------------|-----------|
| `''` / `in_progress` | `pending_review` | Joinee submits | Worksheet data valid |
| `pending_review` | `buddy_approved` | Buddy approves | Must be `pending_review` |
| `pending_review` | `needs_revision` | Buddy requests revision | Comment required |
| `needs_revision` | `revision_submitted` | Joinee resubmits | Worksheet data updated |
| `revision_submitted` | `buddy_approved` | Buddy re-approves | After reviewing changes |
| `revision_submitted` | `needs_revision` | Buddy re-requests | Further changes needed |
| `buddy_approved` | `approved` | Manager approves phase | All phase worksheets buddy_approved |
| All 3 phases `approved` | — | Auto-promote | 20/20 worksheets approved |

### Display States for Joinees

| Status | Joinee Sees |
|--------|-------------|
| Not started (`''`) | Worksheet form (blank) |
| In progress | Worksheet form (with saved data) |
| `pending_review` | "Submitted" view |
| `buddy_approved` | "Buddy Approved" (purple) — awaiting manager |
| `needs_revision` | Worksheet form + revision feedback banner |
| `revision_submitted` | "Submitted" view (revision mode) |
| `approved` | "Approved" view (gold/success) |
