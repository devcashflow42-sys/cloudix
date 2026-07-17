-- ==============================================================
--  Feed: guardados, encuestas y reportes
-- ==============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll JSONB;

CREATE TABLE IF NOT EXISTS post_saves (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_saves_user ON post_saves (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_votes (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id  TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON poll_votes (post_id);

CREATE TABLE IF NOT EXISTS post_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, reporter_id)
);
