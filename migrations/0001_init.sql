-- Creative Creators Studio schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'member',            -- 'admin' | 'member'
  status TEXT NOT NULL DEFAULT 'active',          -- 'active' | 'disabled'
  credit_limit INTEGER NOT NULL DEFAULT 2000,     -- credits per period
  credits_used INTEGER NOT NULL DEFAULT 0,        -- reserved + settled credits this period
  period_start TEXT NOT NULL DEFAULT (strftime('%Y-%m-01', 'now')),
  period_reset TEXT NOT NULL DEFAULT 'monthly',   -- 'monthly' | 'never'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                             -- sha256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,                              -- 'image' | 'video' | 'text'
  model TEXT NOT NULL,
  template TEXT NOT NULL,                          -- prompt template with {{variables}}
  negative TEXT,
  variables_json TEXT NOT NULL DEFAULT '[]',       -- [{key,label,type,default,options,required}]
  params_json TEXT NOT NULL DEFAULT '{}',          -- model params (aspect_ratio, duration, resolution, max_tokens...)
  reference_keys_json TEXT NOT NULL DEFAULT '[]',  -- R2 keys of reference images baked into the preset
  cover_key TEXT,                                  -- R2 key for cover art
  category TEXT NOT NULL DEFAULT 'General',
  visibility TEXT NOT NULL DEFAULT 'team',         -- 'team' | 'private'
  created_by TEXT REFERENCES users(id),
  runs INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                              -- 'image' | 'video' | 'text'
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  input_keys_json TEXT NOT NULL DEFAULT '[]',      -- R2 keys of reference images / frames
  preset_id TEXT REFERENCES presets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',           -- queued | running | done | failed
  provider_job_id TEXT,
  estimate_credits INTEGER NOT NULL DEFAULT 0,
  actual_credits INTEGER,
  cost_usd REAL,
  outputs_json TEXT NOT NULL DEFAULT '[]',         -- [{key, mime}]
  text_output TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
  source_url TEXT,
  file_key TEXT,
  filename TEXT,
  note TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',           -- queued | running | done | failed
  transcript TEXT,
  summary TEXT,
  visual TEXT,
  extras_json TEXT NOT NULL DEFAULT '{}',          -- hooks, on-screen text, caption ideas, metadata
  estimate_credits INTEGER NOT NULL DEFAULT 0,
  actual_credits INTEGER,
  cost_usd REAL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_batch ON analyses(batch_id);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,                          -- + consumes credits, - refunds
  reason TEXT NOT NULL,                            -- reserve | settle | refund | adjust | reset
  ref_type TEXT,                                   -- generation | analysis | admin
  ref_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS model_settings (
  model_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  kind TEXT,                                       -- image | video | text | analyze
  price_override_json TEXT,                        -- optional manual pricing {per_image, per_second, prompt, completion}
  featured INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
