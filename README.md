# Cloudix — Backend de red social sobre Cloudflare

Backend **edge-first** para una red social, construido con **Cloudflare Pages Functions**
y **PostgreSQL (Neon serverless)**. Autenticación JWT, arquitectura modular, respuestas
JSON uniformes y manejo global de errores. Diseñado para ejecutarse en el runtime edge
de Cloudflare (V8 isolates), no en Node.

> **¿Por qué no Express?** Cloudflare Workers/Functions no ejecutan Node.js: no hay
> `net`/`http` ni sockets TCP crudos, así que `express`, `pg`, `bcrypt`, `multer` o
> `sharp` no funcionan. Aquí se usan los equivalentes edge: enrutado por archivos de
> Pages Functions, `@neondatabase/serverless` (PostgreSQL por HTTP), **Web Crypto**
> para hashing de contraseñas, `jose` para JWT y **R2** para archivos.

---

## Estructura

```
/
├── functions/                 # Cada archivo = una ruta (Cloudflare Pages Functions)
│   ├── _middleware.js         # CORS + manejo global de errores (todas las rutas)
│   ├── index.js               # GET /  (health + metadatos)
│   ├── auth/                  # register, login, logout, refresh-token,
│   │                          #   forgot-password, reset-password, verify-email
│   ├── users/                 # me.js (GET/PATCH), [id].js (perfil público)
│   ├── posts/                 # index.js (feed + crear)
│   ├── comments/              # index.js (listar por post + crear)
│   ├── reactions/             # index.js (reaccionar / quitar)
│   ├── stories/               # index.js (activas + crear, expiran 24h)
│   ├── follows/               # [id].js (seguir / dejar de seguir)
│   ├── groups/                # index.js (listar/buscar + crear)
│   ├── communities/           # index.js (listar + crear)
│   ├── messages/              # index.js (conversación 1:1 + enviar)
│   ├── notifications/         # index.js (listar + marcar leídas)
│   ├── search/                # index.js (usuarios + posts)
│   ├── upload/                # index.js (subida a R2)
│   ├── admin/                 # index.js (estadísticas, rol admin)
│   ├── middleware/            # auth.js, cors.js  (módulos, NO rutas)
│   ├── database/              # client.js (Neon serverless)
│   ├── services/              # authService.js  (lógica reutilizable)
│   └── utils/                 # response, errors, jwt, password, validate, slug
│
├── schema/schema.sql          # Esquema de referencia
├── migrations/0001_initial.sql
├── scripts/migrate.mjs        # Runner de migraciones (local, usa pg)
├── public/                    # Salida estática que publica Cloudflare Pages
├── wrangler.toml
└── package.json
```

> **Nota sobre Pages Functions:** todo archivo `.js` bajo `functions/` que exporte
> `onRequest*` se convierte en ruta. Los módulos de `middleware/`, `database/`,
> `services/` y `utils/` **no** exportan handlers, así que se importan pero no se
> exponen como endpoints. `_middleware.js` es especial: se ejecuta en todas las rutas.

---

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar la base de datos (Neon) y secretos

Crea un archivo `.dev.vars` (copiado de `.dev.vars.example`) para desarrollo local:

```
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
JWT_SECRET="una-clave-larga-y-aleatoria-de-32-o-mas-caracteres"
```

### 3. Aplicar migraciones

```bash
npm run migrate
```

### 4. Desarrollo local (emula el edge + funciones)

```bash
npm run dev
# http://localhost:8788
```

### 5. Desplegar en Cloudflare Pages

```bash
npm run deploy
```

En producción define los secretos con:

```bash
wrangler pages secret put DATABASE_URL
wrangler pages secret put JWT_SECRET
```

### Deploy desde CI (API token)

Si despliegas desde un CI con `CLOUDFLARE_API_TOKEN`, el token debe tener el
permiso **Account → Cloudflare Pages → Edit** (el rol de la cuenta, aunque sea
Super Admin, NO equivale a los permisos del token). Un error
`Authentication error [code: 10000]` en `/pages/projects/...` significa que
falta ese permiso. Crea/edita el token en
<https://dash.cloudflare.com/profile/api-tokens> con:

- Account → **Cloudflare Pages** → **Edit**
- Account → Account Settings → Read *(recomendado)*
- User → User Details → Read *(recomendado)*

Si el proyecto Pages aún no existe, créalo una vez:

```bash
npx wrangler pages project create cloudix-edge --production-branch=main
```

### Troubleshooting del deploy

| Error | Causa | Solución |
|-------|-------|----------|
| `Could not detect a directory containing static files` | Falta el directorio de salida estático | `pages_build_output_dir = "public"` en `wrangler.toml` y usar `wrangler pages deploy` |
| `It looks like you've run a Workers-specific command in a Pages project` / `Missing entry-point to Worker script` | Se ejecutó `wrangler deploy` (Workers) en un proyecto Pages | Usa **`npx wrangler pages deploy public`** (o `npm run deploy`), nunca `wrangler deploy` |
| `Authentication error [code: 10000]` en `/pages/projects/...` | El `CLOUDFLARE_API_TOKEN` no tiene permiso de Pages | Añade **Cloudflare Pages → Edit** al token (el rol de la cuenta no basta) |

> **Recomendación:** conecta el repo como proyecto **Pages** (no Workers). Un
> proyecto Pages publica `public/` + `functions/` automáticamente y no ejecuta
> ningún `wrangler deploy`, así que ninguno de los dos primeros errores puede ocurrir.

---

## Autenticación

- **Access token**: JWT HS256 de corta duración (`ACCESS_TOKEN_TTL`, 15 min por defecto).
  Se envía en `Authorization: Bearer <token>`.
- **Refresh token**: opaco, aleatorio, se guarda **hasheado** (SHA-256) en
  `refresh_tokens`. Rota en cada `/auth/refresh-token`.
- **Contraseñas**: PBKDF2-SHA256 (100k iteraciones) vía Web Crypto.

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Crear cuenta |
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/logout` | Revocar refresh token |
| POST | `/auth/refresh-token` | Renovar access token |
| POST | `/auth/forgot-password` | Solicitar restablecimiento |
| POST | `/auth/reset-password` | Restablecer con token |
| POST/GET | `/auth/verify-email` | Verificar correo |
| GET/PATCH | `/users/me` | Perfil propio |
| GET | `/users/:id` | Perfil público |
| GET/POST | `/posts` | Feed / crear publicación |
| GET/POST | `/comments` | Comentarios (`?postId=`) / crear |
| POST/DELETE | `/reactions` | Reaccionar / quitar |
| GET/POST | `/stories` | Historias activas / crear |
| POST/DELETE | `/follows/:id` | Seguir / dejar de seguir |
| GET/POST | `/groups` | Listar-buscar / crear |
| GET/POST | `/communities` | Listar / crear |
| GET/POST | `/messages` | Conversación (`?withUserId=`) / enviar |
| GET/PATCH | `/notifications` | Listar / marcar leídas |
| GET | `/search` | Buscar (`?q=&type=all\|users\|posts`) |
| POST | `/upload` | Subir archivo a R2 |
| GET | `/admin` | Estadísticas (rol `admin`) |

Los módulos de `posts`, `comments`, `reactions`, `stories`, `follows`, `groups`,
`communities`, `messages`, `notifications`, `search`, `upload` y `admin` incluyen un
endpoint de ejemplo completo y funcional; se amplían siguiendo exactamente el mismo
patrón (servicio + handler + validación).

### Formato de respuesta

```json
// Éxito
{ "success": true, "message": "...", "data": { }, "meta": { } }
// Error
{ "success": false, "message": "...", "error": { "code": "VALIDATION_ERROR", "details": [] } }
```

---

## Almacenamiento de archivos (R2)

`/upload` usa un bucket R2. Para activarlo:

```bash
wrangler r2 bucket create cloudix-media
```

Descomenta el binding `MEDIA_BUCKET` en `wrangler.toml` y define `MEDIA_PUBLIC_URL`
(dominio público del bucket) para que la respuesta incluya la URL final.

---

## Rendimiento y escalado

- **Edge global**: las funciones corren cerca del usuario en la red de Cloudflare.
- **Neon serverless**: conexiones por HTTP, sin pool TCP; escala a picos sin agotar
  conexiones. Usa la **cadena `-pooler`** de Neon para alta concurrencia.
- **Índices**: definidos para feed, búsqueda, bandeja de mensajes y notificaciones.
- Añade **KV/Cache** de Cloudflare para respuestas GET calientes (binding de ejemplo
  en `wrangler.toml`).

## Licencia

MIT
