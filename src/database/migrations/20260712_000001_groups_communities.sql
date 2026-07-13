-- ==============================================================
--  Nubifly API - Módulo de Grupos y Comunidades
--  Migración idempotente (CREATE IF NOT EXISTS / DROP-CREATE triggers).
--  Depende de: users, set_updated_at() (schema.sql).
-- ==============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================
-- COMMUNITIES
--   Una comunidad agrupa varios grupos organizados por temas.
-- ==============================================================
CREATE TABLE IF NOT EXISTS communities (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    founder_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name           VARCHAR(150) NOT NULL,
    slug           VARCHAR(180) NOT NULL,
    description    TEXT,
    icon_url       TEXT,
    banner_url     TEXT,

    privacy        VARCHAR(20) NOT NULL DEFAULT 'public'
                     CHECK (privacy IN ('public','private','invite_only')),
    rules          TEXT,
    tags           TEXT[] NOT NULL DEFAULT '{}',
    categories     TEXT[] NOT NULL DEFAULT '{}',

    members_count  BIGINT NOT NULL DEFAULT 0,
    groups_count   BIGINT NOT NULL DEFAULT 0,

    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,

    deleted_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communities_founder    ON communities (founder_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities_slug       ON communities (slug)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities_privacy    ON communities (privacy)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities_created_at ON communities (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communities_deleted_at ON communities (deleted_at);
CREATE INDEX IF NOT EXISTS idx_communities_search
    ON communities USING GIN (to_tsvector('simple', COALESCE(name,'') || ' ' || COALESCE(description,'')));

DROP TRIGGER IF EXISTS trg_communities_updated_at ON communities;
CREATE TRIGGER trg_communities_updated_at BEFORE UPDATE ON communities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- COMMUNITY_MEMBERS
--   Roles: founder, admin, moderator, collaborator, member.
-- ==============================================================
CREATE TABLE IF NOT EXISTS community_members (
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(20) NOT NULL DEFAULT 'member'
                   CHECK (role IN ('founder','admin','moderator','collaborator','member')),
    status       VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','banned')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members (user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_role ON community_members (community_id, role);

-- ==============================================================
-- COMMUNITY_INVITATIONS
-- ==============================================================
CREATE TABLE IF NOT EXISTS community_invitations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    inviter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','rejected','cancelled')),
    responded_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (community_id, invitee_id, status)
);

CREATE INDEX IF NOT EXISTS idx_community_invitations_invitee ON community_invitations (invitee_id, status);

-- ==============================================================
-- GROUPS
--   Un grupo puede pertenecer opcionalmente a una comunidad.
--   Privacidad: public, private, invite_only.
-- ==============================================================
CREATE TABLE IF NOT EXISTS groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id    UUID REFERENCES communities(id) ON DELETE SET NULL,

    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(180) NOT NULL,
    description     TEXT,
    photo_url       TEXT,
    banner_url      TEXT,

    privacy         VARCHAR(20) NOT NULL DEFAULT 'public'
                      CHECK (privacy IN ('public','private','invite_only')),
    topic           VARCHAR(120),
    rules           TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',

    -- Configuración de permisos internos del grupo
    who_can_post    VARCHAR(20) NOT NULL DEFAULT 'members'
                      CHECK (who_can_post IN ('members','moderators','admins')),
    who_can_comment VARCHAR(20) NOT NULL DEFAULT 'members'
                      CHECK (who_can_comment IN ('members','moderators','admins')),
    who_can_invite  VARCHAR(20) NOT NULL DEFAULT 'members'
                      CHECK (who_can_invite IN ('members','moderators','admins')),
    who_can_approve VARCHAR(20) NOT NULL DEFAULT 'moderators'
                      CHECK (who_can_approve IN ('moderators','admins')),

    members_count   BIGINT NOT NULL DEFAULT 0,
    posts_count     BIGINT NOT NULL DEFAULT 0,

    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_owner      ON groups (owner_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_community  ON groups (community_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_privacy    ON groups (privacy)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_slug       ON groups (slug)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_groups_deleted_at ON groups (deleted_at);
CREATE INDEX IF NOT EXISTS idx_groups_search
    ON groups USING GIN (to_tsvector('simple', COALESCE(name,'') || ' ' || COALESCE(description,'')));

DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;
CREATE TRIGGER trg_groups_updated_at BEFORE UPDATE ON groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- GROUP_MEMBERS
--   Roles: owner, admin, moderator, member.
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      VARCHAR(20) NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner','admin','moderator','member')),
    status    VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','banned')),
    banned_at TIMESTAMPTZ,
    banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user   ON group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_role   ON group_members (group_id, role);
CREATE INDEX IF NOT EXISTS idx_group_members_status ON group_members (group_id, status);

-- ==============================================================
-- GROUP_JOIN_REQUESTS
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_join_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message      TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
    decided_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, user_id, status)
);

CREATE INDEX IF NOT EXISTS idx_group_join_requests_group  ON group_join_requests (group_id, status);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_user   ON group_join_requests (user_id, status);

-- ==============================================================
-- GROUP_INVITATIONS
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_invitations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    inviter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','rejected','cancelled')),
    responded_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, invitee_id, status)
);

CREATE INDEX IF NOT EXISTS idx_group_invitations_invitee ON group_invitations (invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invitations_group   ON group_invitations (group_id, status);

-- ==============================================================
-- GROUP_POSTS
--   Tipos: text, image, video, music, audio, document, poll, event, link.
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    type            VARCHAR(20) NOT NULL DEFAULT 'text'
                      CHECK (type IN ('text','image','video','music','audio','document','poll','event','link')),
    body            TEXT,
    attachments     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ url, mimeType, kind, size }]
    link_url        TEXT,
    poll            JSONB,                                 -- { question, options: [{ id, text, votes }], multiple }
    event           JSONB,                                 -- { title, startsAt, endsAt, location }

    status          VARCHAR(20) NOT NULL DEFAULT 'published'
                      CHECK (status IN ('pending','published','removed','flagged')),

    likes_count     BIGINT NOT NULL DEFAULT 0,
    reactions_count BIGINT NOT NULL DEFAULT 0,
    comments_count  BIGINT NOT NULL DEFAULT 0,
    shares_count    BIGINT NOT NULL DEFAULT 0,
    saves_count     BIGINT NOT NULL DEFAULT 0,

    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_posts_group      ON group_posts (group_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_posts_author     ON group_posts (author_id)                 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_posts_type       ON group_posts (type)                      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_posts_status     ON group_posts (status)                    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_group_posts_updated_at ON group_posts;
CREATE TRIGGER trg_group_posts_updated_at BEFORE UPDATE ON group_posts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- GROUP_POST_REACTIONS  (incluye "Me gusta" como reaction = 'like')
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_post_reactions (
    post_id    UUID NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction   VARCHAR(20) NOT NULL DEFAULT 'like'
                 CHECK (reaction IN ('like','love','haha','wow','sad','angry')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_post_reactions_post ON group_post_reactions (post_id, reaction);

-- ==============================================================
-- GROUP_POST_COMMENTS
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_post_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  UUID REFERENCES group_post_comments(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_post_comments_post ON group_post_comments (post_id, created_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_group_post_comments_updated_at ON group_post_comments;
CREATE TRIGGER trg_group_post_comments_updated_at BEFORE UPDATE ON group_post_comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==============================================================
-- GROUP_POST_SAVES  (guardados / marcadores)
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_post_saves (
    post_id    UUID NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_post_saves_user ON group_post_saves (user_id);

-- ==============================================================
-- GROUP_POST_REPORTS  (reportes de contenido)
-- ==============================================================
CREATE TABLE IF NOT EXISTS group_post_reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id      UUID NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE,
    reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason       VARCHAR(60) NOT NULL,
    details      TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','reviewed','dismissed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_group_post_reports_post   ON group_post_reports (post_id, status);

-- ==============================================================
-- MODERATION_LOGS  (historial de acciones de moderación)
-- ==============================================================
CREATE TABLE IF NOT EXISTS moderation_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope          VARCHAR(20) NOT NULL CHECK (scope IN ('group','community')),
    scope_id       UUID NOT NULL,
    actor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action         VARCHAR(60) NOT NULL,
    resource_type  VARCHAR(40),
    resource_id    UUID,
    details        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_scope  ON moderation_logs (scope, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_action ON moderation_logs (action);

-- ==============================================================
-- NOTIFICATIONS
-- ==============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    type         VARCHAR(60) NOT NULL,
    entity_type  VARCHAR(40),
    entity_id    UUID,
    data         JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications (recipient_id) WHERE read_at IS NULL;
