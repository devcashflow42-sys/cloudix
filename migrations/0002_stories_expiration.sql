-- ==============================================================
--  Historias/Estados — corrección de índices y soporte de expiración
-- ==============================================================

-- El índice anterior usaba un predicado con NOW() (no IMMUTABLE), lo que
-- provoca error en PostgreSQL. Se elimina si existe y se crean índices válidos.
DROP INDEX IF EXISTS idx_stories_active;

CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_author  ON stories (author_id, created_at DESC);
