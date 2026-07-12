-- ==============================================================
--  Nubifly API - Esquema PostgreSQL
--  Idempotente: se puede ejecutar múltiples veces sin efectos colaterales.
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------
-- Función utilitaria para actualizar automáticamente updated_at
-- --------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================
-- ROLES
-- ==============================================================
CREATE TABLE IF NOT EXISTS roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(50)  NOT NULL UNIQUE,
    description  TEXT,
    level        INT NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- USERS
-- ==============================================================
CREATE TABLE IF NOT EXISTS users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username          VARCHAR(50)  NOT NULL UNIQUE,
    email             VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    first_name        VARCHAR(100),
    last_name         VARCHAR(100),
    avatar_url        TEXT,
    bio               TEXT,
    phone             VARCHAR(30),
    language          VARCHAR(10) DEFAULT 'es',
    email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at     TIMESTAMPTZ,
    last_login_ip     VARCHAR(45),
    failed_attempts   INT NOT NULL DEFAULT 0,
    locked_until      TIMESTAMPTZ,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON users (LOWER(email))       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username    ON users (LOWER(username))    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_active      ON users (is_active)          WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at  ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at  ON users (deleted_at);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- USER_ROLES (relación N:M)
-- ==============================================================
CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role_id);

-- ==============================================================
-- REFRESH_TOKENS
-- ==============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(128) NOT NULL UNIQUE,
    user_agent   TEXT,
    ip_address   VARCHAR(45),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    replaced_by  UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user     ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires  ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_valid    ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- ==============================================================
-- PASSWORD_RESETS
-- ==============================================================
CREATE TABLE IF NOT EXISTS password_resets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user     ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires  ON password_resets (expires_at);

-- ==============================================================
-- EMAIL_VERIFICATIONS
-- ==============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user     ON email_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires  ON email_verifications (expires_at);

-- ==============================================================
-- MEDIA_CATEGORIES
-- ==============================================================
CREATE TABLE IF NOT EXISTS media_categories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(100) NOT NULL UNIQUE,
    slug         VARCHAR(120) NOT NULL UNIQUE,
    description  TEXT,
    parent_id    UUID REFERENCES media_categories(id) ON DELETE SET NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_categories_parent ON media_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_media_categories_slug   ON media_categories (slug);

DROP TRIGGER IF EXISTS trg_media_categories_updated_at ON media_categories;
CREATE TRIGGER trg_media_categories_updated_at BEFORE UPDATE ON media_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- MEDIA_TAGS
-- ==============================================================
CREATE TABLE IF NOT EXISTS media_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(60) NOT NULL UNIQUE,
    slug        VARCHAR(80) NOT NULL UNIQUE,
    usage_count INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_tags_slug  ON media_tags (slug);
CREATE INDEX IF NOT EXISTS idx_media_tags_usage ON media_tags (usage_count DESC);

-- ==============================================================
-- MEDIA_FILES
-- ==============================================================
CREATE TABLE IF NOT EXISTS media_files (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id      UUID REFERENCES media_categories(id) ON DELETE SET NULL,

    title            VARCHAR(255) NOT NULL,
    description      TEXT,
    language         VARCHAR(10) DEFAULT 'es',
    author           VARCHAR(150),

    kind             VARCHAR(20) NOT NULL CHECK (kind IN ('image','video','audio','document','podcast','other')),
    mime_type        VARCHAR(150) NOT NULL,
    format           VARCHAR(30),
    size_bytes       BIGINT NOT NULL,
    duration_seconds NUMERIC(12,3),
    quality          VARCHAR(20),
    width            INT,
    height           INT,

    storage_path     TEXT NOT NULL,
    file_url         TEXT NOT NULL,
    thumbnail_url    TEXT,
    cover_url        TEXT,
    banner_url       TEXT,

    status           VARCHAR(20) NOT NULL DEFAULT 'published'
                        CHECK (status IN ('draft','published','archived','flagged')),
    is_public        BOOLEAN NOT NULL DEFAULT TRUE,
    views_count      BIGINT NOT NULL DEFAULT 0,
    downloads_count  BIGINT NOT NULL DEFAULT 0,

    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,

    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_owner       ON media_files (owner_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_category    ON media_files (category_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_kind        ON media_files (kind)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_status      ON media_files (status)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_created_at  ON media_files (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_public      ON media_files (is_public)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_deleted_at  ON media_files (deleted_at);
CREATE INDEX IF NOT EXISTS idx_media_metadata    ON media_files USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_media_title_trgm  ON media_files USING GIN (to_tsvector('simple', COALESCE(title,'') || ' ' || COALESCE(description,'')));

DROP TRIGGER IF EXISTS trg_media_files_updated_at ON media_files;
CREATE TRIGGER trg_media_files_updated_at BEFORE UPDATE ON media_files
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- MEDIA_FILE_TAGS (relación N:M)
-- ==============================================================
CREATE TABLE IF NOT EXISTS media_file_tags (
    media_file_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    tag_id        UUID NOT NULL REFERENCES media_tags(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (media_file_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_media_file_tags_tag ON media_file_tags (tag_id);

-- ==============================================================
-- AUDIT_LOGS
-- ==============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    action         VARCHAR(80) NOT NULL,
    resource_type  VARCHAR(80),
    resource_id    VARCHAR(120),
    ip_address     VARCHAR(45),
    user_agent     TEXT,
    request_method VARCHAR(10),
    request_path   TEXT,
    status_code    INT,
    details        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_logs (resource_type, resource_id);

-- ==============================================================
-- Registro de migraciones
-- ==============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    id         SERIAL PRIMARY KEY,
    version    VARCHAR(100) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
