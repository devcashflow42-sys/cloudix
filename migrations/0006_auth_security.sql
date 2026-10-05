-- ==============================================================
--  Seguridad de autenticación: limitación de intentos (rate limit)
--  y bloqueo temporal de cuentas tras fallos de login.
-- ==============================================================

-- Contadores por ventana fija. `key` identifica el sujeto, p. ej.:
--   login:ip:<ip>        intentos fallidos desde una IP
--   login:acct:<ident>   intentos fallidos contra una cuenta
--   forgot:ip:<ip>       solicitudes de recuperación desde una IP
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key          VARCHAR(320) PRIMARY KEY,
    count        INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window ON auth_rate_limits (window_start);
