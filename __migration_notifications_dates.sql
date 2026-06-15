-- =============================================================================
-- Migration: Due Dates + Notifications + Review Flow Constraints
-- =============================================================================

-- 1. Add due_date column to worksheet_submissions
ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS due_date DATE;

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  from_user_id UUID REFERENCES auth.users(id),
  worksheet_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'submitted',
    'revision_submitted',
    'approved',
    'needs_revision',
    'due_soon',
    'overdue'
  )),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 2a. Users can read their own notifications
CREATE POLICY "Select own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- 2b. Anyone can insert notifications (triggered by app logic)
CREATE POLICY "Insert notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2c. Users can update their own notifications (mark as read)
CREATE POLICY "Update own notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 3. Index on notifications for fast unread count
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- 4. Add review_status CHECK constraint to enforce valid state transitions
--    Note: This is a soft constraint — we enforce at the app level.
--    PostgreSQL CHECK constraints don't support cross-row validation easily,
--    so we keep the existing CHECK and validate transitions in code.

-- 5. Update the existing review_status CHECK to ensure only valid values
ALTER TABLE worksheet_submissions DROP CONSTRAINT IF EXISTS worksheet_submissions_review_status_check;
ALTER TABLE worksheet_submissions ADD CONSTRAINT worksheet_submissions_review_status_check
  CHECK (review_status IN ('', 'pending_review', 'needs_revision', 'revision_submitted', 'approved'));

-- 6. Ensure 'submitted' status is lowercase consistently
--    (No ALTER needed — status is TEXT, we enforce casing in app code)

-- ✅ Migration Complete
