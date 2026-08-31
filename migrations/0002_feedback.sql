CREATE TABLE IF NOT EXISTS feedback_submissions (
  submission_id TEXT PRIMARY KEY,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 2 AND 1200),
  source TEXT NOT NULL CHECK (source IN ('about', 'invite')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_created_at
ON feedback_submissions (created_at);
