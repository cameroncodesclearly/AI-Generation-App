ALTER TABLE generations ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE INDEX IF NOT EXISTS idx_generations_fav ON generations(user_id, favorite);
