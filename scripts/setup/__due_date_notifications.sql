-- =============================================================================
-- Migration: Automated Due Date Notifications (due_soon / overdue)
--
-- Prerequisites:
--   1. The `notifications` table must exist (run __migration_notifications_dates.sql first)
--   2. The `pg_cron` extension must be enabled:
--      CREATE EXTENSION IF NOT EXISTS pg_cron;
--      (Or enable via Supabase Dashboard → Database → Extensions → pg_cron)
-- =============================================================================

-- ─── 1. Create the notification function ─────────────────────────────────────
-- This function checks all worksheet_submissions for approaching/past due dates
-- and inserts due_soon / overdue notifications where missing.
-- It is idempotent — it will not create duplicate notifications.

CREATE OR REPLACE FUNCTION check_due_date_notifications()
RETURNS TABLE (
  action TEXT,
  user_id UUID,
  worksheet_id TEXT,
  due_date DATE
) LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  ws_record RECORD;
  existing_count INT;
BEGIN
  -- Loop over all worksheet_submissions that have a due_date set
  -- and have not yet been fully approved (still active)
  FOR ws_record IN
    SELECT ws.user_id, ws.worksheet_id, ws.due_date, ws.review_status
    FROM worksheet_submissions ws
    WHERE ws.due_date IS NOT NULL
      AND ws.review_status NOT IN ('approved', 'buddy_approved')
  LOOP
    -- ── Check for OVERDUE ──
    IF ws_record.due_date < CURRENT_DATE THEN
      -- Avoid duplicates: only insert if no 'overdue' notification exists
      -- for this user+worksheet from the last 7 days
      SELECT COUNT(*) INTO existing_count
      FROM notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'overdue'
        AND n.created_at >= CURRENT_DATE - INTERVAL '7 days';

      IF existing_count = 0 THEN
        INSERT INTO notifications (user_id, from_user_id, worksheet_id, type, message)
        VALUES (
          ws_record.user_id,
          NULL,
          ws_record.worksheet_id,
          'overdue',
          format(
            'Your worksheet (%s) is overdue! It was due on %s. Please submit it as soon as possible.',
            ws_record.worksheet_id,
            to_char(ws_record.due_date, 'Mon DD, YYYY')
          )
        );
        action := 'overdue';
        user_id := ws_record.user_id;
        worksheet_id := ws_record.worksheet_id;
        due_date := ws_record.due_date;
        RETURN NEXT;
      END IF;
    END IF;

    -- ── Check for DUE SOON (within next 3 days) ──
    IF ws_record.due_date >= CURRENT_DATE
       AND ws_record.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN
      -- Avoid duplicates: only insert if no 'due_soon' notification exists
      -- for this user+worksheet from the last 24 hours
      SELECT COUNT(*) INTO existing_count
      FROM notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'due_soon'
        AND n.created_at >= CURRENT_DATE;

      IF existing_count = 0 THEN
        INSERT INTO notifications (user_id, from_user_id, worksheet_id, type, message)
        VALUES (
          ws_record.user_id,
          NULL,
          ws_record.worksheet_id,
          'due_soon',
          format(
            'Your worksheet (%s) is due on %s (%s day(s) remaining).',
            ws_record.worksheet_id,
            to_char(ws_record.due_date, 'Mon DD, YYYY'),
            GREATEST(0, (ws_record.due_date - CURRENT_DATE)::int)
          )
        );
        action := 'due_soon';
        user_id := ws_record.user_id;
        worksheet_id := ws_record.worksheet_id;
        due_date := ws_record.due_date;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  -- If no notifications were created, return a summary row
  IF NOT FOUND THEN
    action := 'no_action_needed';
    user_id := NULL;
    worksheet_id := NULL;
    due_date := NULL;
    RETURN NEXT;
  END IF;
END;
$$;

-- ─── 2. Schedule with pg_cron ───────────────────────────────────────────────
-- Run daily at 8:00 AM IST (2:30 AM UTC) so users see fresh notifications
-- when they start their day.
--
-- Uncomment and run after enabling pg_cron:
--
-- SELECT cron.schedule(
--   'check-due-date-notifications',   -- job name
--   '30 2 * * *',                     -- every day at 2:30 UTC (8:00 AM IST)
--   $$SELECT check_due_date_notifications()$$
-- );
--
-- To verify the job was created:
--   SELECT * FROM cron.job;
--
-- To manually test the function:
--   SELECT * FROM check_due_date_notifications();
--
-- To remove the scheduled job:
--   SELECT cron.unschedule('check-due-date-notifications');
--
-- =============================================================================
-- ✅ Migration Complete — Don't forget to enable pg_cron and schedule the job!
-- =============================================================================
