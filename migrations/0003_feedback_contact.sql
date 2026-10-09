ALTER TABLE feedback_submissions
ADD COLUMN contact TEXT CHECK (contact IS NULL OR length(contact) BETWEEN 1 AND 120);
