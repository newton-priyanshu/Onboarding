# Newton School of Technology - Faculty Onboarding Portal: Deep System Audit

This document provides an exhaustive architectural and functional breakdown of the Faculty Onboarding Portal codebase.

---

## 1. Executive Summary
* **Purpose:** Streamlines faculty onboarding (Lab Instructors).
* **Architecture:** React SPA (Vite) + Supabase (Auth/Postgres/RLS).
* **Key Design Pattern:** Declarative security (RLS) + Frontend-driven state management with Auto-Save.

---

## 2. Granular API/Database Mapping (Supabase SDK)

| Source File | Table | Operation | Triggering UI Event |
| :--- | :--- | :--- | :--- |
| `AuthContext.jsx` | `user_profiles` | INSERT | New user signup/OAuth. |
| `useAutoSave.js` | `worksheet_submissions`| UPSERT | Auto-save timer (2s). |
| `Assessment.jsx` | `onboarding_submissions`| INSERT/UPDATE| Assessment form submit. |
| `GateControl*.jsx` | `worksheet_submissions`| UPSERT | Gate form submission. |
| `WorksheetReview.jsx`| `worksheet_submissions`| SELECT/UPDATE| Reviewer actions. |
| `AdminDashboard.jsx` | `user_profiles` | SELECT/UPDATE| Mentor assignment. |

---

## 3. RLS Policy Mapping to UI Behavior

| Policy Name | Table | UI Behavior Enabled |
| :--- | :--- | :--- |
| "Read worksheet access" | `worksheet_submissions`| Mentors see assigned instructors' data. |
| "Users can update own worksheets"| `worksheet_submissions`| Instructor saves their own work. |
| "Reviewers can update worksheets"| `worksheet_submissions`| Mentors update status/feedback. |

---

## 4. Architectural Patterns & Quality Review

### Patterns
*   **Auto-Save Hook (`useAutoSave.js`):** Centralizes all DB persistence for worksheet forms.
*   **Declarative Logic:** Business rules (permission to review, role assignment restrictions) reside in SQL triggers and RLS, not application code.

### Risks
*   **Hardcoded Configuration:** Worksheet IDs (e.g., `WORKSHEET_ID = 'p1_w1'`) are hardcoded in component files, making bulk changes difficult.
*   **Scalability:** As the number of worksheets grows, the current route-per-worksheet approach in `App.jsx` will become unmanageable.
*   **Error Handling:** Reliance on `console.error` in `AuthContext` and other services is insufficient for production-grade error reporting.

---

## 5. Developer Onboarding: Deep Dive

1.  **Understand RLS:** All authorization is in `supabase_schema.sql`. If a feature is broken, check the Policy first.
2.  **Worksheet Pattern:** All worksheets share a pattern (`useState` -> `useAutoSave` -> `loadWorksheetData`).
3.  **Assignments:** Mentor/Buddy assignments are managed in `user_profiles` and drive read access via RLS.
