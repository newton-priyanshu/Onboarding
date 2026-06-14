# TypeScript Migration Plan

## Newton School of Technology - Faculty Onboarding Portal

---

## 1. Why Migrate?

| Problem | Impact |
|---------|--------|
| `worksheet_data` is `JSONB` with no type safety | Silent errors when field names change across worksheets |
| Review history entries are plain objects | No compile-time checking on `{action, reviewer_name, comment, timestamp}` shape |
| Role strings are used without a union type | Typos like `'onbarding_lead'` pass silently |
| Worksheet IDs are magic strings | No validation that a route/component exists for a given ID |

---

## 2. Migration Strategy

**Phased approach** — do NOT convert the entire codebase at once. Each phase is independently verifiable.

```
Phase 0: Setup
    │
    ▼
Phase 1: Shared types (no runtime changes)
    │
    ▼
Phase 2: Core services (supabase, context, hooks)
    │
    ▼
Phase 3: Components (Navbar, ProtectedRoute, ReviewContent)
    │
    ▼
Phase 4: Pages (one at a time)
    │
    ▼
Phase 5: Worksheets (batch by phase)
    │
    ▼
Phase 6: Cleanup
```

---

## 3. Phase 0: Setup

### 3.1 Install Dependencies

```bash
npm install --save-dev typescript @types/react @types/react-dom
```

### 3.2 Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### 3.3 Create `src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### 3.4 Update `vite.config.js`

Add path alias support:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

## 4. Phase 1: Shared Types (`src/types/`)

### File: `src/types/supabase.ts`

```ts
// ─── User Roles ──────────────────────────────────────────
export type UserRole =
  | 'new_joinee'
  | 'lab_instructor'
  | 'lead_instructor'
  | 'academic_head'
  | 'onboarding_lead'
  | 'acad_ops';

// ─── User Profile ────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  assigned_lead_id: string | null;
  assigned_buddy_id: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Worksheet IDs (union of all known worksheets) ────────
export type WorksheetId =
  | 'p1_w1' | 'p1_w2' | 'p1_w3' | 'p1_w4' | 'p1_w5'
  | 'p1_w6' | 'p1_w7' | 'p1_w8'
  | 'p2_w1' | 'p2_w2' | 'p2_w3' | 'p2_w4'
  | 'p3_w1' | 'p3_w2' | 'p3_w3' | 'p3_w4' | 'p3_w5'
  | 'gc1' | 'gc2' | 'gc3';

// ─── Reviewer Types ──────────────────────────────────────
export type ReviewerType = 'buddy' | 'manager' | 'onboarding_lead';

// ─── Review Status (state machine) ───────────────────────
export type ReviewStatus =
  | ''
  | 'pending_review'
  | 'needs_revision'
  | 'revision_submitted'
  | 'approved';

// ─── Submission Status ───────────────────────────────────
export type SubmissionStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Reviewed';

// ─── Review History Entry ────────────────────────────────
export interface ReviewHistoryEntry {
  action: 'approved' | 'needs_revision';
  reviewer_name: string;
  reviewer_id: string;
  comment: string | null;
  timestamp: string;
}

// ─── Worksheet Submission (row) ──────────────────────────
export interface WorksheetSubmission {
  id: string;
  user_id: string;
  worksheet_id: WorksheetId;
  worksheet_data: Record<string, unknown>;
  phase: string;
  status: SubmissionStatus;
  review_status: ReviewStatus;
  reviewer_type: ReviewerType;
  reviewed_by: string | null;
  reviewer_name: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  review_history: ReviewHistoryEntry[];
  created_at: string;
  updated_at: string;
}

// ─── Assessment Levels ───────────────────────────────────
export type AssessmentLevel = 'fully_independent' | 'needs_minor_support' | 'needs_development';
export type OnboardingStatus = 'not_started' | 'phase1_complete' | 'phase2_complete' | 'phase3_complete' | 'assessed';

// ─── Onboarding Submission ───────────────────────────────
export interface OnboardingSubmission {
  id: string;
  user_id: string | null;
  new_instructor_name: string;
  email: string;
  phase1_completed: boolean;
  phase2_completed: boolean;
  phase3_completed: boolean;
  assessment_level: AssessmentLevel | null;
  overall_status: OnboardingStatus;
}
```

### File: `src/types/worksheet.ts`

```ts
import type { WorksheetId } from './supabase';

// ─── Worksheet Metadata (from worksheetConfig) ───────────
export interface WorksheetInfo {
  id: WorksheetId;
  title: string;
  reviewer: 'buddy' | 'manager' | 'onboarding_lead';
  color: string;
  isGate?: boolean;
}

export interface PhaseData {
  num: number;
  sheets: WorksheetInfo[];
}

export type AllWorksheets = Record<string, PhaseData>;
```

### Files: `src/types/worksheets/*.ts` (per-worksheet shapes)

For each worksheet, define the specific data shape. Example:

```ts
// src/types/worksheets/p1_w1.ts
export interface P1W1Data {
  employeeName: string;
  department: string;
  mentorName: string;
  mentorEmail: string;
  stakeholders: Array<{
    name: string;
    role: string;
    team: string;
    responsibility: string;
  }>;
  conversations: Array<{
    instructorName: string;
    date: string;
    takeaways: string;
  }>;
  buddyName: string;
  buddyAssignmentDate: string;
  buddyChannel: string;
  buddySyncDay: string;
  reflectionLearningFrom: string;
  status: string;
  dateSubmitted: string;
  _savedReviewStatus?: string;
}
```

---

## 5. Phase 2: Core Services

### 5.1 `src/supabase.ts` → `src/supabase.ts`

- Add `import type { SupabaseClient } from '@supabase/supabase-js'`
- Export typed client: `export const supabase: SupabaseClient`

### 5.2 `src/context/AuthContext.tsx`

- Strongly type the context value:

```ts
interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<unknown>;
  signIn: (email: string, password: string) => Promise<unknown>;
  signInWithGoogle: () => Promise<unknown>;
  signOut: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  refreshProfile: () => void;
}
```

### 5.3 `src/hooks/useAutoSave.ts`

- Type the return value: `{ saveStatus: 'idle' | 'saving' | 'saved' | 'error', flushSave: (data: Record<string, unknown>) => Promise<void> }`
- Use `WorksheetId` for the `worksheetId` parameter

---

## 6. Phase 3: Components

### 6.1 `Navbar.tsx`

- Type `progress` prop as `number`
- Use `UserRole` for role checks

### 6.2 `ProtectedRoute.tsx`

- Type `requiredRoles` as `UserRole[] | undefined`
- Type `children` as `React.ReactNode`

### 6.3 `ReviewContent.tsx`

- Type props: `{ data: Record<string, unknown>, worksheetId: WorksheetId }`
- Type `FIELD_SECTIONS` with a proper record type

---

## 7. Phase 4: Pages

Each page gets a `.tsx` extension with:

1. Typed state variables
2. Typed event handlers
3. Proper return types for async functions

Convert in order:
1. `Login.tsx` — self-contained, low risk
2. `Signup.tsx` — similar pattern
3. `AuthCallback.tsx` — simple
4. `Dashboard.tsx` — moderate complexity
5. `WorksheetReview.tsx` — review logic
6. `AdminDashboard.tsx` — complex, multiple sub-components
7. `BuddyDashboard.tsx` — moderate
8. `OnboardingLeadDashboard.tsx` — simpler
9. `Assessment.tsx` — moderate
10. `Stakeholders.tsx` — static, easy
11. `Phase1/2/3.tsx` — similar patterns
12. `GateControl1/2/3.tsx` — similar patterns

---

## 8. Phase 5: Worksheets

Batch by phase (same data shape patterns within each phase):

| Batch | Files | Pattern |
|-------|-------|---------|
| Phase 1 (1-8) | 8 worksheets | Stakeholders, syncs, observations |
| Phase 2 (1-4) | 4 worksheets | Doubt logs, scorecards, content |
| Phase 3 (1-5) | 5 worksheets | Lectures, profiles, assessments |

Each worksheet conversion:
1. Create type definition in `src/types/worksheets/`
2. Rename file to `.tsx`
3. Add type annotations to state
4. Type the `updateField` / event handlers
5. Ensure `useAutoSave` is called with correct types

---

## 9. Phase 6: Cleanup

1. Run `tsc --noEmit` to check for errors
2. Fix all `any` casts (exceptions only where genuinely needed)
3. Remove unused `eslint-disable` comments
4. Update `vite.config.js` if needed
5. Consider generating types from Supabase using `supabase gen types typescript --linked > src/types/database.ts`

---

## 10. Effort Estimate

| Phase | Files | Est. Time | Risk |
|-------|-------|-----------|------|
| 0: Setup | 3-4 config files | 30 min | Low |
| 1: Shared types | 4-6 type files | 1-2 hrs | Low |
| 2: Core services | 3 files | 1 hr | Medium |
| 3: Components | 3 files | 1 hr | Low |
| 4: Pages | 14 files | 3-4 hrs | Medium |
| 5: Worksheets | 17 files | 4-6 hrs | Medium-High |
| 6: Cleanup | All files | 1-2 hrs | Low |
| **Total** | **~44 files** | **12-17 hrs** | |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `worksheet_data` is untyped `JSONB` on Supabase side | Accept this — type safety is only at the frontend. Use `zod` for runtime validation if needed. |
| Worksheet data shapes are not documented | Extract types by reading each worksheet's `useState` initial value |
| `review_history` JOSNB array has no DB-level schema | Define `ReviewHistoryEntry` in TypeScript only |
| Team may not be familiar with TS | Pair programming on Phase 2 + 3; documentation in this plan |
| Migration creates noise in git history | Do one phase per PR/commit for clear history |

---

## 12. Quick Wins (before full migration)

These minimal changes give immediate benefit without a full migration:

1. **Rename `.jsx` to `.jsx` only where we add JSDoc types** — not TypeScript yet
2. **Add `// @ts-check` to key files** — enables VS Code type checking on plain JS
3. **Create a `.d.ts` file for workspace config** — at least get worksheet IDs autocompletion
