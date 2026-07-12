# Nubifly API

API REST profesional, segura y escalable construida con **Node.js**, **Express** y **PostgreSQL**, siguiendo arquitectura por capas.

Incluye:

- Autenticación por **JWT** (access + refresh con rotación).
- Registro, login, verificación de correo, recuperación y cambio de contraseña.
- Sistema de **roles y permisos** (`admin`, `moderator`, `premium`, `user`).
- Gestión completa de **archivos multimedia** (imágenes, videos, audios, documentos, podcasts, otros) con extracción automática de metadatos, miniaturas y filtros avanzados.
- **Auto-migraciones** al iniciar y **seed** automático de roles, admin inicial y categorías.
- **CRUD** con paginación, ordenamiento, búsqueda, filtros y estadísticas.
- **Auditoría** completa de acciones sensibles.
- **Soft delete**, restauración y borrado definitivo.
- **Caché en memoria** por prefijo.
- Protecciones: **helmet**, **CORS**, **rate limiting**, sanitización XSS, HPP, whitelist MIME, blacklist de extensiones peligrosas, bloqueo de cuenta por intentos fallidos.
- **Swagger/OpenAPI 3** en `/docs` y colección **Postman** exportable.

---

## Requisitos

- Node.js **18+**
- PostgreSQL **13+** (o servicio compatible: Neon, Supabase, Render, RDS, etc.)
- Opcional para procesar audio/video: `ffmpeg` en el PATH del sistema (Sharp para imágenes viene como binario).

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.example .env
# Edita .env y ajusta credenciales, secretos JWT, etc.

# 3. (Opcional) Ejecutar migraciones y seed manualmente
npm run db:init
```

## Ejecución

```bash
# Modo desarrollo con nodemon (auto-reload y logs coloreados)
npm run dev

# Modo producción
npm start
```

La API queda disponible en `http://localhost:3000` con:

- **API base:** `http://localhost:3000/api/v1`
- **Documentación Swagger:** `http://localhost:3000/docs`
- **Archivos subidos:** `http://localhost:3000/files/...`
- **Health check:** `http://localhost:3000/api/v1/system/health`

En el primer arranque en modo dev se aplican migraciones y se ejecuta el seed, que crea:

- Los 4 roles del sistema.
- 6 categorías por defecto.
- Un usuario admin con las credenciales de `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (`admin@nubifly.local` / `Admin1234!` por defecto).

**Cambia esa contraseña lo antes posible.**

---

## Estructura del proyecto

```
src/
├── app.js                    # Construcción de la app Express
├── server.js                 # Bootstrap y ciclo de vida
├── config/                   # env, roles, swagger
├── database/                 # pool, schema.sql, migrate, seed
├── controllers/              # Manejadores HTTP (thin)
├── services/                 # Lógica de negocio
├── repositories/             # Acceso a la BD
├── models/                   # DTOs y mappers
├── middleware/               # auth, errors, upload, rate limit, sanitize, validate
├── routes/                   # Rutas + JSDoc OpenAPI
├── validators/               # express-validator chains
├── utils/                    # logger, jwt, password, cache, fileMeta, apiResponse, ...
├── storage/                  # Archivos subidos (por tipo)
├── logs/                     # Logs con rotación diaria
└── docs/                     # Colección Postman, ejemplos
```

---

## Endpoints principales

Todos los endpoints están montados bajo `/api/v1`.

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST   | `/auth/register`            | Registro |
| POST   | `/auth/login`               | Login (email o username) |
| POST   | `/auth/refresh`             | Renovar tokens (rotación) |
| POST   | `/auth/logout`              | Cerrar sesión (revoca refresh) |
| POST   | `/auth/logout-all`          | Cerrar todas las sesiones |
| POST   | `/auth/forgot-password`     | Solicitar reset |
| POST   | `/auth/reset-password`      | Aplicar reset con token |
| POST   | `/auth/change-password`     | Cambio autenticado |
| POST   | `/auth/verify-email`        | Verificar email |
| POST   | `/auth/resend-verification` | Reenviar verificación |
| GET    | `/auth/me`                  | Datos de la sesión |

### Usuarios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/users/profile`         | Mi perfil |
| PUT    | `/users/profile`         | Actualizar mi perfil |
| DELETE | `/users/account`         | Eliminar mi cuenta (soft delete) |
| GET    | `/users`                 | Listar (moderador/admin) |
| GET    | `/users/stats`           | Estadísticas de usuarios |
| GET    | `/users/:id`             | Ver por ID |
| PATCH  | `/users/:id/roles`       | Cambiar roles (admin) |
| PATCH  | `/users/:id/status`      | Activar / desactivar |

### Multimedia
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/media`                   | Listar con filtros |
| GET    | `/media/stats`             | Estadísticas |
| POST   | `/media/upload`            | Subir archivo (multipart) |
| GET    | `/media/:id`               | Detalle |
| PUT    | `/media/:id`               | Actualizar metadatos |
| DELETE | `/media/:id`               | Soft delete |
| POST   | `/media/:id/restore`       | Restaurar (mod) |
| DELETE | `/media/:id/hard-delete`   | Borrado definitivo (admin) |
| POST   | `/media/:id/download`      | Contador de descargas |

### Categorías y tags
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/PUT/DELETE | `/categories` | Gestión de categorías |
| GET/POST/DELETE     | `/tags`       | Gestión de tags |

### Sistema
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/system/health` | Salud + BD |
| GET    | `/system/stats`  | Estadísticas globales |
| GET    | `/system/audit`  | Registros de auditoría (admin) |

---

## Ejemplos con curl

### Registro
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "david",
    "email": "david@example.com",
    "password": "SuperSeguro123",
    "firstName": "David"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"david@example.com","password":"SuperSeguro123"}'
```

### Subida multimedia
```bash
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@./mi_video.mp4" \
  -F "title=Mi primer video" \
  -F "description=Descripción" \
  -F "language=es" \
  -F "kind=video" \
  -F "tags[]=tutorial" \
  -F "tags[]=nubifly"
```

### Listar multimedia con filtros
```bash
curl "http://localhost:3000/api/v1/media?page=1&limit=20&kind=video&sort=created_at:desc&search=nubifly"
```

---

## Formato de respuesta uniforme

Éxito:
```json
{
  "success": true,
  "message": "Operación realizada correctamente.",
  "data": { /* ... */ },
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 } }
}
```

Error:
```json
{
  "success": false,
  "message": "Los datos enviados no son válidos.",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": { "errors": [{ "field": "email", "message": "El correo no es válido." }] }
  }
}
```

---

## Notas de producción

1. **Genera secretos JWT fuertes** (`JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`) de al menos 64 caracteres. El servidor rechaza el arranque en producción si detecta valores por defecto.
2. **Configura `CORS_ORIGIN` con orígenes concretos** (no `*`).
3. **Usa un proxy inverso** (nginx, Caddy, Cloudflare) con HTTPS forzado. `trust proxy = 1` ya viene configurado.
4. **Guarda logs** en un volumen persistente; la rotación diaria mantiene 14 días por defecto.
5. **Storage:** los archivos se guardan en disco. Para producción a escala considera montar `src/storage/` en un volumen compartido o mover el módulo a S3/R2/Backblaze (el modelo `MediaFile.js` ya devuelve URLs absolutas — cámbialas ahí).
6. **ffmpeg opcional:** si el binario no está en el sistema, la extracción de duración/thumbnail de video simplemente se salta (queda `null`) pero **la subida no falla**.
7. **Backups de la BD:** haz snapshots regulares. El esquema es idempotente, pero los datos no.
8. **Deshabilitar seed** en producción: `SEED_ON_BOOT=false` (por defecto solo se ejecuta en dev).
9. **Cache en memoria:** si escalas a más de un pod/instancia, sustituye `src/utils/cache.js` por Redis manteniendo la misma interfaz.
10. **Rate limits:** ajusta `RATE_LIMIT_*` en `.env` según tu tráfico.

---

## Documentación interactiva

- **Swagger UI**: `http://localhost:3000/docs`
- **Spec JSON**: `http://localhost:3000/docs.json`
- **Postman**: `src/docs/postman-collection.json` (importable directamente)

---

## Licencia

MIT
