-- Add missing review columns to worksheet_submissions
ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS reviewer_name TEXT;
ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS review_history JSONB DEFAULT '[]'::jsonb;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'worksheet_submissions' 
  AND column_name IN ('reviewer_name', 'review_history', 'reviewed_by', 'review_comment', 'reviewed_at')
ORDER BY column_name;
