CREATE TABLE IF NOT EXISTS tutor_questions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  session_id TEXT NOT NULL,
  book_id TEXT,
  book_title TEXT,
  chapter_id TEXT,
  chapter_title TEXT,
  question_no INTEGER,
  question_type TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('answered', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_tutor_questions_created_at
  ON tutor_questions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutor_questions_session
  ON tutor_questions(session_id, created_at DESC);
