-- ==============================================================
--  Grupos y Comunidades: icono + chat de grupo
-- ==============================================================

ALTER TABLE groups      ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS icon_url TEXT;

CREATE TABLE IF NOT EXISTS group_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_messages ON group_messages (group_id, created_at DESC);
