-- ==============================================================
--  Historias: vistas + reacciones (estilo Instagram)
--  Una fila por (historia, espectador). reaction NULL = solo vista.
-- ==============================================================

CREATE TABLE IF NOT EXISTS story_views (
    story_id   UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction   VARCHAR(10) CHECK (reaction IN ('like','love')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story    ON story_views (story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_reaction ON story_views (story_id) WHERE reaction IS NOT NULL;
