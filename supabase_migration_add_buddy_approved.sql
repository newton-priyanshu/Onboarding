-- =============================================================================
-- Migration: Add buddy_approved to worksheet_submissions.review_status
-- 
-- The new review flow adds an intermediate "buddy_approved" state:
--   pending_review → buddy_approved → approved (phase-level)
--
-- Run in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/fuoqoryqndtdooujslee/sql/new
-- =============================================================================

-- Step 1: Drop the old CHECK constraint that doesn't include buddy_approved
ALTER TABLE worksheet_submissions
  DROP CONSTRAINT IF EXISTS worksheet_submissions_review_status_check;

-- Step 2: Re-create it with buddy_approved included
ALTER TABLE worksheet_submissions
  ADD CONSTRAINT worksheet_submissions_review_status_check
  CHECK (review_status IN (
    '',
    'pending_review',
    'buddy_approved',       -- NEW: buddy has approved, awaiting manager
    'needs_revision',
    'revision_submitted',
    'approved'
  ));

-- Step 3: Verify the constraint was added correctly
SELECT
  table_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'worksheet_submissions'
  AND constraint_name = 'worksheet_submissions_review_status_check';

-- =============================================================================
-- Optional: If you need to update RLS policies for the new flow
-- =============================================================================

-- The existing RLS policies already allow:
--   lead_instructor (buddy) → can update submissions → approve to buddy_approved
--   academic_head (manager) → can update submissions → approve phase (approved)
--   onboarding_lead → read-only (no update access)

-- If you need onboarding_lead to remain read-only (cannot update),
-- the existing policies are already correct:
--   "Reviewers update submissions" policy only includes 
--   lead_instructor and academic_head (NOT onboarding_lead)

-- =============================================================================
-- ✅ Migration complete
-- =============================================================================
