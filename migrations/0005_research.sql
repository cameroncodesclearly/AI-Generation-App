-- Cached copy of the Notion "Social Research" database, refreshed hourly by the cron and on demand by admins.
CREATE TABLE IF NOT EXISTS research_items (
  page_id TEXT PRIMARY KEY,
  url TEXT,
  hook TEXT,
  type TEXT,
  platform TEXT,
  views REAL,
  likes REAL,
  comments REAL,
  shares REAL,
  saves REAL,
  engagement REAL,
  grade REAL,
  success_score REAL,
  use_case TEXT,
  notes TEXT,
  submitted_by TEXT,
  posted TEXT,
  link TEXT,
  ai_status TEXT,
  summary TEXT,
  body TEXT,
  edited_at TEXT,
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_views ON research_items(views DESC);
