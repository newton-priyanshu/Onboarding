# FULL-SYSTEM CRITICAL QA & BROWSER TESTING PROMPT

> **Role:** Senior QA Engineer, Product Tester, Security Tester, and End-to-End Automation Engineer.
>
> **Subject under test:** Web-based **Employee/New Joiner Onboarding Platform** with multiple user roles,
> departments, campuses, worksheets/forms, review/approval workflows, role-based dashboards & permissions,
> different workflows per department/campus/role, backend APIs, frontend routes, a database,
> authentication/authorization, state-changing buttons, and browser-based user flows.
>
> **Objective:** Critically test the ENTIRE application as a production app going through a pre-launch QA and
> security audit — not merely verify that pages load.

---

## Automated Runners (division of labor)

The plan is executed through three layers; results are tracked in
[`docs/QA_BUG_REPORT.md`](./QA_BUG_REPORT.md):

| Layer | Runner | Covers | Status |
| ----- | ------ | ------ | ------ |
| Unit/static | `npx vitest run` | Route maps, state machine, migration contract guards | ✅ 548/548 |
| API-level E2E | `node scripts/full-flow-test.mjs` | Signup, assignment, submit, buddy/manager review, reject→resubmit round-trip, phase approvals, escalation, cross-campus, notifications | ✅ 28/28 |
| Live security/concurrency | `node scripts/qa-pass2.mjs` | §13 concurrency (C1–C4), §17 injection/XSS (I1–I5), §29 chaos (X1–X10) — against the live DB | ✅ 19/19 |
| Browser pass | `node scripts/browser-pass.mjs` (11-step, requires dev server) | Full per-role browser flow incl. rejection path, revision round-trip, phase approvals | ✅ GREEN |

Browser-level spot checks (XSS rendering, double-click idempotency, back/forward,
refresh persistence) are run ad hoc with the browser agent and logged in
`QA_BUG_REPORT.md` test log (rows 14–17).

---

## Table of Contents

1. [Understand the Application](#1-understand-the-application)
2. [Create a System Map](#2-create-a-system-map)
3. [Test Every Role](#3-test-every-role)
4. [Test Role Escalation](#4-test-role-escalation)
5. [Test Campus Isolation](#5-test-campus-isolation)
6. [Test Department Isolation](#6-test-department-isolation)
7. [Test Authentication](#7-test-authentication)
8. [Test Every Route](#8-test-every-route)
9. [Test Every Button](#9-test-every-button)
10. [Test Worksheet Lifecycle](#10-test-worksheet-lifecycle)
11. [Test Status Transitions](#11-test-status-transitions)
12. [Test Duplicate Actions](#12-test-duplicate-actions)
13. [Test Concurrency](#13-test-concurrency)
14. [Test Database Integrity](#14-test-database-integrity)
15. [Test Error Handling](#15-test-error-handling)
16. [Test Form Behavior](#16-test-form-behavior)
17. [Security Testing](#17-security-testing)
18. [Browser Testing](#18-browser-testing)
19. [Browser Refresh Testing](#19-browser-refresh-testing)
20. [Browser Back/Forward Testing](#20-browser-backforward-testing)
21. [Multi-Tab Testing](#21-multi-tab-testing)
22. [Search and Filter Testing](#22-search-and-filter-testing)
23. [Notification Testing](#23-notification-testing)
24. [Audit Trail](#24-audit-trail)
25. [Performance / Stress Checks](#25-performance--stress-checks)
26. [API Testing](#26-api-testing)
27. [Data Ownership Test](#27-data-ownership-test)
28. [Cross-Role End-to-End Test](#28-cross-role-end-to-end-test)
29. [Chaos Testing](#29-chaos-testing)
30. [UI/UX Critical Review](#30-uiux-critical-review)
31. [Test With Realistic Data](#31-test-with-realistic-data)
32. [Do Not Stop After Finding One Bug](#32-do-not-stop-after-finding-one-bug)
33. [Bug Report Format](#33-bug-report-format)
34. [Final System Health Report](#34-final-system-health-report)

---

## 1. Understand the Application

Before testing, inspect the entire codebase and understand:

### Frontend

- Application structure
- Routes
- Components
- Pages
- Forms
- Buttons
- Navigation
- Protected routes
- Role-based rendering
- State management
- API calls
- Error handling
- Loading states

### Backend

- Server structure
- Routes
- Controllers
- Services
- Middleware
- Authentication
- Authorization
- Validation
- Database queries
- Error handling
- HTTP status codes

### Database

Understand:

- Users
- Roles
- Departments
- Campuses
- Worksheets
- Submissions
- Approvals
- Relationships
- Status fields
- Ownership
- Foreign keys
- Any other entities

### Business Logic

Identify:

- Who can create?
- Who can edit?
- Who can submit?
- Who can review?
- Who can approve?
- Who can reject?
- Who can see what?
- Who can access which campus?
- Who can access which department?
- What happens after submission?
- What happens after approval?
- What happens after rejection?
- Can a rejected worksheet be edited?
- Can an approved worksheet be modified?
- Can users submit incomplete worksheets?

> **Do NOT assume the architecture is correct simply because the code looks reasonable.**

---

## 2. Create a System Map

Before testing, create an internal map of:

```text
Users
  ↓
Authentication
  ↓
Role
  ↓
Department
  ↓
Campus
  ↓
Dashboard
  ↓
Worksheet
  ↓
Submission
  ↓
Review
  ↓
Approval / Rejection
  ↓
Final State
```

Also identify every possible branch.

For example:

```text
New Joiner
    ↓
Fill Worksheet
    ↓
Save Draft
    ↓
Submit
    ↓
Reviewer
    ├── Approve
    └── Reject
             ↓
        New Joiner edits
             ↓
          Resubmit
```

**Test every branch.**

---

## 3. Test Every Role

Identify every role implemented in the application.

For EACH role:

1. Create/use a test account.
2. Login.
3. Verify the correct dashboard.
4. Verify visible navigation.
5. Verify accessible routes.
6. Verify visible buttons.
7. Verify hidden/restricted buttons.
8. Verify API permissions.
9. Verify data visibility.
10. Verify create/update/delete permissions.
11. Verify approval permissions.
12. Verify campus restrictions.
13. Verify department restrictions.

Create a permission matrix:

| Role   | View | Create | Edit | Submit | Review | Approve | Reject | Delete |
| ------ | ---- | ------ | ---- | ------ | ------ | ------- | ------ | ------ |
| Role A | ✓    | ✓      | ✓    | ✓      |        |         |        |        |
| Role B | ✓    |        | ✓    |        | ✓      | ✓       | ✓      |        |
| Role C | ✓    |        |      |        |        |         |        |        |

Fill this based on the actual application. Then **test every permission**.

---

## 4. Test Role Escalation

**This is CRITICAL.** Do NOT only test what the UI allows. Attempt to bypass permissions.

### UI bypass

If a button is hidden:

- Try accessing the route directly.
- Try navigating using the URL.
- Try browser history.
- Try opening the page in a new tab.

### API bypass

If possible, attempt requests such as:

```text
GET restricted-resource
POST restricted-resource
PUT restricted-resource
PATCH restricted-resource
DELETE restricted-resource
```

using a lower-privileged account. Verify that authorization is enforced on the **backend**.

> **A hidden button is NOT security.**

---

## 5. Test Campus Isolation

This application has multiple campuses. Create test users belonging to different campuses.

Example:

```text
User A → Campus A
User B → Campus B
Admin → Campus A
```

Verify:

- Campus A users cannot see Campus B restricted data.
- Campus B users cannot see Campus A restricted data.
- Worksheets cannot be accessed across campuses.
- IDs cannot be manipulated to access another campus.
- Approval actions cannot cross campus boundaries.
- Search/filter APIs cannot expose other campus data.

Test ID manipulation:

```text
/worksheet/101
/worksheet/102
/worksheet/103
```

If `101` belongs to Campus A and `102` belongs to Campus B, verify that an unauthorized user cannot simply change the ID.

---

## 6. Test Department Isolation

Repeat the same testing for departments.

Example:

```text
Academics
Progression
Operations
```

Verify that users cannot access restricted department data merely by:

- Changing URL parameters
- Changing IDs
- Changing query parameters
- Modifying request bodies
- Calling APIs directly

Test combinations:

```text
Role × Department × Campus
```

because bugs often appear only in combinations.

---

## 7. Test Authentication

### Login

- Correct credentials
- Incorrect password
- Incorrect username
- Empty fields
- Invalid email
- Non-existent user
- Multiple failed attempts
- Logout
- Session expiration

### Session

After logout:

- Browser back button
- Refresh
- Direct URL access
- Opening old tabs

The user must not regain authenticated access.

### Token/session

Check:

- Expired token
- Invalid token
- Missing token
- Modified token
- Wrong user token

Verify unauthorized requests return appropriate errors.

---

## 8. Test Every Route

Build a route inventory. For every route:

```text
Route
Purpose
Public/Protected
Required Role
Expected User
Expected Result
```

Test:

### Valid navigation

Every route should work.

### Invalid navigation

Test:

```text
/nonexistent
/random
/undefined
/worksheet/invalid
/worksheet/999999
```

Verify proper 404/error handling.

### Unauthorized navigation

Access protected routes without login.

### Wrong-role navigation

Access a route with a role that should not have access.

### Direct URL navigation

Do not rely only on clicking links.

---

## 9. Test Every Button

**This is mandatory.** Find every interactive element:

- Buttons
- Links
- Dropdowns
- Tabs
- Checkboxes
- Radio buttons
- Toggles
- Modals
- Submit buttons
- Approve buttons
- Reject buttons
- Edit buttons
- Delete buttons
- Save buttons
- Cancel buttons
- Back buttons
- Logout buttons
- Pagination
- Search
- Filters

For every button verify:

```text
Visible?
Clickable?
Correct action?
Correct API?
Correct data?
Correct success state?
Correct error state?
Correct permissions?
Correct loading state?
Correct disabled state?
```

> **No button should be a dead end.**

---

## 10. Test Worksheet Lifecycle

### Scenario A — Happy path

```text
New Joiner
→ Login
→ Open worksheet
→ Fill all fields
→ Save
→ Submit
→ Reviewer receives submission
→ Reviewer opens worksheet
→ Reviewer approves
→ Final status updated
```

Verify the **database state after every step**.

### Scenario B — Save draft

```text
Fill partially
→ Save
→ Logout
→ Login
→ Reopen
```

Verify the data is preserved.

### Scenario C — Validation

Test:

- Empty required fields
- Invalid formats
- Too-short values
- Too-long values
- Invalid dates
- Invalid numbers
- Invalid emails
- Special characters
- Whitespace
- Duplicate values

Verify BOTH frontend validation AND backend validation.

### Scenario D — Rejection

```text
Submit
→ Reviewer rejects
→ Rejection reason
→ New Joiner receives rejection
→ New Joiner edits
→ Resubmits
→ Reviewer reviews again
```

Verify status transitions.

### Scenario E — Approval

After approval verify:

- User cannot improperly edit it.
- Reviewer cannot accidentally approve twice.
- Duplicate submissions cannot occur.
- Status remains consistent after refresh.
- Other users see the correct state.

---

## 11. Test Status Transitions

Identify every status:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
REJECTED
RESUBMITTED
APPROVED
```

Build a state machine.

Test valid transitions:

```text
DRAFT → SUBMITTED
SUBMITTED → UNDER_REVIEW
UNDER_REVIEW → APPROVED
UNDER_REVIEW → REJECTED
REJECTED → RESUBMITTED
```

Then test INVALID transitions:

```text
APPROVED → DRAFT
APPROVED → SUBMITTED
DRAFT → APPROVED
REJECTED → APPROVED
```

These should not be possible unless explicitly supported.

---

## 12. Test Duplicate Actions

Rapidly click:

```text
Submit
Approve
Reject
Save
Delete
```

multiple times. Test:

- Double click
- Triple click
- Refresh during request
- Back/forward during request
- Multiple browser tabs

Verify duplicate database operations do not happen.

---

## 13. Test Concurrency

Open the same worksheet in two browser tabs/users.

Example:

```text
Reviewer A → opens worksheet
Reviewer B → opens same worksheet
```

Then:

```text
Reviewer A → approves
Reviewer B → rejects
```

Test what happens. Also test:

```text
User edits
Reviewer approves simultaneously
```

Look for race conditions and inconsistent states.

---

## 14. Test Database Integrity

For every major operation verify:

```text
Frontend state
↓
API response
↓
Database state
↓
Frontend after refresh
```

They must all agree. Look for:

- Orphan records
- Duplicate records
- Incorrect foreign keys
- Missing relationships
- Incorrect status
- Incorrect user ownership
- Incorrect campus
- Incorrect department
- Partial updates

---

## 15. Test Error Handling

Intentionally cause failures:

- Disconnect network
- API returns 400 / 401 / 403 / 404 / 409 / 500
- Database unavailable
- Invalid request
- Timeout

Verify:

- No application crash
- User receives understandable message
- Loading indicator stops
- Buttons recover
- Data is not silently lost
- UI does not show false success

---

## 16. Test Form Behavior

For every form test:

### Empty

Submit without filling anything.

### Partial

Fill only some fields.

### Invalid

Use incorrect formats.

### Boundary

Test:

```text
0 characters
1 character
minimum length
maximum length
maximum + 1
very large numbers
very long text
```

### Special characters

Test:

```text
< > " ' & / \ {} [] () ; :
```

Also test malicious-looking input. Verify the application handles it safely.

---

## 17. Security Testing

Perform basic application security testing. Check for:

- Broken access control
- IDOR
- Privilege escalation
- Authentication bypass
- Authorization bypass
- XSS
- SQL injection
- Command injection
- Unsafe redirects
- Sensitive information exposure
- Improper error messages
- Token/session leakage

> **Do NOT perform destructive attacks.** Use safe test payloads and test data.
> **Never assume frontend restrictions are security controls. Verify backend authorization.**

---

## 18. Browser Testing

Test the application through an actual browser.

### Chrome

- Desktop
- Incognito

### Different viewport sizes

```text
Desktop
Laptop
Tablet
Mobile
```

Check:

- Layout
- Overflow
- Navigation
- Forms
- Modals
- Tables
- Buttons
- Text
- Scrolling
- Responsive behavior

---

## 19. Browser Refresh Testing

Refresh at every important state:

```text
Dashboard → Refresh
Worksheet → Refresh
Draft → Refresh
Submitted → Refresh
Rejected → Refresh
Approved → Refresh
```

Verify state remains correct.

---

## 20. Browser Back/Forward Testing

Test:

```text
Login
→ Dashboard
→ Worksheet
→ Submit
→ Back
→ Forward
```

Also test browser back after:

- Logout
- Approval
- Rejection
- Submission

Verify users cannot return to invalid states or perform unauthorized actions.

---

## 21. Multi-Tab Testing

Test:

```text
Tab 1 → User dashboard
Tab 2 → Same worksheet
Tab 3 → Another route
```

Perform actions from different tabs. Check for stale data and inconsistent UI.

---

## 22. Search and Filter Testing

If search/filter exists, test:

- Exact match
- Partial match
- Case sensitivity
- Empty search
- Special characters
- No results
- Large result sets
- Multiple filters
- Clearing filters
- Pagination + filters

Verify frontend and backend filtering are consistent.

---

## 23. Notification Testing

If notifications exist, test:

- Submission notification
- Approval notification
- Rejection notification
- Resubmission notification
- Duplicate notification prevention
- Correct recipient
- Correct status
- Read/unread state

Verify users do not receive notifications intended for another role/campus/department.

---

## 24. Audit Trail

If the system has audit/history functionality, verify:

```text
Who performed the action?
What action?
When?
On which record?
Previous state?
New state?
```

Test: Create, Edit, Submit, Approve, Reject, Resubmit, Delete.

---

## 25. Performance / Stress Checks

Do lightweight performance testing. Check:

- Initial page load
- Dashboard load
- Worksheet load
- Large datasets
- Search
- Filtering
- Submission
- Approval

Look for:

- Extremely slow APIs
- Excessive API calls
- Repeated API calls
- Infinite loading
- UI freezing
- Memory leaks
- N+1 database queries if identifiable

---

## 26. API Testing

Do not depend only on browser testing. Inspect every API endpoint.

For each endpoint document:

```text
METHOD
URL
AUTH REQUIRED
ROLE REQUIRED
INPUT
EXPECTED RESPONSE
ERROR RESPONSES
DATABASE EFFECT
```

Test: `200 201 400 401 403 404 409 500` where applicable.

Verify API responses match actual application behavior.

---

## 27. Data Ownership Test

**This is extremely important.** For every resource ask: *"Who owns this data?"*

Then verify another user cannot modify it simply by changing:

```json
{ "userId": 123 }
```

or:

```text
?id=123
```

or:

```text
/worksheet/123
```

Test ownership at the **backend**.

---

## 28. Cross-Role End-to-End Test

Run complete real-world scenarios:

### Scenario 1 — Approve happy path

```text
New Joiner → completes worksheet → submits → Reviewer sees it → Reviewer approves → New Joiner sees approved status
```

### Scenario 2 — Reject → edit → resubmit

```text
New Joiner → submits → Reviewer rejects → New Joiner edits → resubmits → Reviewer approves
```

### Scenario 3 — Campus isolation

```text
Campus A New Joiner → submits → Campus B Reviewer attempts access → must be blocked
```

### Scenario 4 — Privilege escalation

```text
Low privilege user → attempts admin route → blocked
```

### Scenario 5 — Auth

```text
Logged-out user → attempts protected URL → redirected/blocked
```

---

## 29. Chaos Testing

Try to break the application deliberately:

- Refresh during submission
- Double-click buttons
- Open stale pages
- Use old URLs
- Modify IDs
- Manipulate query parameters
- Submit empty requests
- Send unexpected values
- Logout during an operation
- Open multiple tabs
- Use expired sessions
- Switch users
- Change campus-related parameters
- Change department-related parameters

> The objective is: **find the weird thing the developer didn't think would happen.**

---

## 30. UI/UX Critical Review

Check:

- Is every action understandable?
- Are destructive actions confirmed?
- Are loading states visible?
- Are success messages clear?
- Are errors useful?
- Are disabled buttons understandable?
- Are forms easy to complete?
- Are required fields obvious?
- Are status labels understandable?
- Can users tell what happens next?

Also check accessibility basics:

- Keyboard navigation
- Focus states
- Form labels
- Button semantics
- Readability
- Contrast
- Screen-size behavior

---

## 31. Test With Realistic Data

Create realistic test users:

```text
User 1 — Role: New Joiner,  Campus: Bangalore,  Department: Engineering
User 2 — Role: Reviewer,     Campus: Bangalore,  Department: Engineering
User 3 — Role: Reviewer,     Campus: Hyderabad,  Department: Engineering
User 4 — Role: Admin,        Campus: Bangalore,  Department: HR
```

Also test:

- Multiple new joiners
- Multiple reviewers
- Multiple departments
- Multiple campuses
- Empty datasets
- Large datasets

### QA Credentials (BUG-4 convention)

> **Every test account uses the same password: `Test123!`**

Run `node scripts/qa-credentials.mjs` for the full email/password matrix
(single source of truth). Fixed accounts (`superadmin@newtonschool.co`,
`campus.head@newtonschool.co`, `progression.head@newtonschool.co`,
`ops.head@newtonschool.co`, `manager@newton.edu`) and on-demand suffixed
accounts (`create-test-users.mjs`, `create-10-role-users.mjs`,
`create-buddy-users.mjs`) all use `Test123!`. If an account 400s with
"Invalid login credentials", reset it with the service role key before
assuming the app is broken.

---

## 32. Do Not Stop After Finding One Bug

If you find a bug:

1. Record it.
2. Continue testing.
3. Check whether the same bug exists elsewhere.
4. Check whether it affects other roles.
5. Check whether it affects other campuses.
6. Check whether it affects other departments.
7. Check whether it affects API + UI.
8. Continue the full test plan.

> **Finding one bug does NOT mean testing is complete.**

---

## 33. Bug Report Format

Every bug must be reported using:

```text
BUG ID:
Title:

Severity:
Critical / High / Medium / Low

Priority:
P0 / P1 / P2 / P3

Module:

Role:

Campus:

Department:

Environment:

Preconditions:

Steps to Reproduce:
1.
2.
3.
4.

Expected Result:

Actual Result:

API involved:

Database impact:

Security impact:

Screenshot / Evidence:

Suggested Fix:

Regression Areas:
```

---

## 34. Final System Health Report

At the end, generate a complete report.

### A. Executive Summary

Give an overall health rating:

```text
Production Ready
Conditionally Ready
Needs Major Fixes
Not Production Ready
```

Explain why.

### B. Test Coverage

Report:

```text
Total routes tested:
Total buttons tested:
Total roles tested:
Total APIs tested:
Total workflows tested:
Total forms tested:
Total approval flows tested:
Total browser scenarios tested:
```

### C. Bugs

Group them: CRITICAL / HIGH / MEDIUM / LOW.

### D. Security Findings

Clearly identify:

```text
Authentication issues
Authorization issues
Role escalation
Campus isolation
Department isolation
IDOR
Input validation
XSS
Injection
Session issues
Data exposure
```

### E. Broken Flows

List complete workflows that fail. Example:

```text
New Joiner → Submit → Reviewer → Approve
FAILED
Reason: Reviewer cannot access submitted worksheet.
```

### F. Working Flows

List workflows that passed completely.

### G. Architecture Issues

Identify structural problems such as:

- Missing backend authorization
- Business logic in frontend only
- Duplicate API logic
- Poor separation of concerns
- Inconsistent error handling
- Incorrect state management
- Weak validation
- Database integrity issues
- Race conditions
- Missing transaction handling

### H. Recommended Fix Order

Give a prioritized list:

```text
1. Fix immediately
2. Fix before production
3. Fix before next release
4. Nice to have
```

---

## MOST IMPORTANT TESTING RULE

Do NOT tell me *"Everything looks good."* unless you have actually tested the complete flow.

Do NOT assume *"The button is hidden, therefore the user cannot perform the action."* — **test the backend.**

Do NOT assume *"The route is protected."* — **try accessing it directly.**

Do NOT assume *"Campus filtering works."* — **try accessing another campus's record.**

Do NOT assume *"Approval works."* — test:

```text
Submit → Review → Reject → Edit → Resubmit → Approve → Refresh → Logout → Login → Verify final state
```

Your goal is not to prove that the application works. Your goal is to **try to prove that it does NOT work**. Be skeptical.

Think like:

```text
QA Engineer + Developer + Security Tester + Attacker + New Joiner + Reviewer + Admin + Confused User
```

Only declare the system healthy after it survives all of these perspectives.

---

## FINAL OUTPUT

At the end provide:

1. **Overall Health Score** — `__/100`
2. **Production Readiness** — `READY / CONDITIONALLY READY / NOT READY`
3. **Critical Bugs** — `__`
4. **High Bugs** — `__`
5. **Medium Bugs** — `__`
6. **Low Bugs** — `__`
7. **Security Issues** — `__`
8. **Broken Workflows** — `__`
9. **Failed Routes** — `__`
10. **Failed Buttons/Actions** — `__`
11. **Failed APIs** — `__`
12. **Top 10 Fixes** — ranked by impact
13. **Full Bug Report** — reproducible evidence for every issue
14. **Final Verdict** — a brutally honest assessment of whether this onboarding platform is actually ready for real users.
