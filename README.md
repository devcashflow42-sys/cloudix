# Cloudix

**Crea y lanza tu propia red social sobre la red global de Cloudflare.**

Cloudix es una plataforma de red social *open source* y **edge-first**: frontend
estático y API REST desplegados juntos en **Cloudflare Pages**, con
**PostgreSQL serverless (Neon)** como base de datos. Incluye autenticación segura,
feed, historias, grupos, comunidades, mensajería, notificaciones y búsqueda,
listo para personalizar con tu marca y publicar en minutos.

| | |
|---|---|
| **Runtime** | Cloudflare Pages Functions (V8 isolates, sin servidor) |
| **Base de datos** | PostgreSQL en Neon (driver HTTP `@neondatabase/serverless`) |
| **Autenticación** | JWT HS256 (`jose`) + refresh tokens rotativos + PBKDF2 (Web Crypto) |
| **Archivos** | Cloudflare R2 (opcional) |
| **Frontend** | HTML/CSS/JS estático en `public/` (sin build) |
| **Licencia** | MIT |

---

## Índice

1. [Características](#características)
2. [Requisitos previos](#requisitos-previos)
3. [Guía: crea tu red social paso a paso](#guía-crea-tu-red-social-paso-a-paso)
4. [Variables de entorno](#variables-de-entorno)
5. [Personalización](#personalización)
6. [Seguridad](#seguridad)
7. [Referencia de la API](#referencia-de-la-api)
8. [Estructura del proyecto](#estructura-del-proyecto)
9. [Despliegue desde CI](#despliegue-desde-ci)
10. [Solución de problemas](#solución-de-problemas)
11. [Rendimiento y escalado](#rendimiento-y-escalado)

---

## Características

- **Cuentas de usuario**: registro, inicio de sesión, verificación de correo,
  recuperación de contraseña y perfiles públicos.
- **Feed social**: publicaciones, comentarios, reacciones, votos, guardados y reportes.
- **Historias** que expiran a las 24 h, con visualizaciones, reacciones y lista de espectadores.
- **Relaciones**: seguir / dejar de seguir, amigos y sugerencias de usuarios.
- **Grupos** con roles (owner, admin, moderator, member) y chat de grupo.
- **Comunidades** con roles (founder, admin, moderator, collaborator, member).
- **Mensajería** privada 1:1 y **notificaciones**.
- **Búsqueda** de usuarios y publicaciones.
- **Subida de archivos** a Cloudflare R2.
- **Panel de administración** con estadísticas (rol `admin`).
- **Seguridad integrada**: rate limiting, bloqueo de cuentas, rotación de tokens y
  cabeceras de seguridad.

> **¿Por qué no Express?** Cloudflare Functions no ejecutan Node.js: no existen
> `net`/`http` ni sockets TCP, por lo que `express`, `pg`, `bcrypt`, `multer` o
> `sharp` no funcionan. Cloudix usa los equivalentes nativos del edge: enrutado por
> archivos, PostgreSQL sobre HTTP, **Web Crypto** para contraseñas, `jose` para JWT
> y **R2** para archivos.

---

## Requisitos previos

| Herramienta | Uso | Enlace |
|-------------|-----|--------|
| **Node.js 18+** y npm | Instalar dependencias, ejecutar migraciones y Wrangler | <https://nodejs.org> |
| **Cuenta de Cloudflare** (plan gratuito válido) | Alojar el frontend y la API | <https://dash.cloudflare.com/sign-up> |
| **Cuenta de Neon** (plan gratuito válido) | Base de datos PostgreSQL | <https://neon.tech> |
| **Git** y una cuenta de GitHub | Clonar/forkear el proyecto y desplegar automáticamente | <https://github.com> |

---

## Guía: crea tu red social paso a paso

Sigue estos pasos en orden. Al terminar tendrás tu propia red social funcionando
en `https://<tu-proyecto>.pages.dev` (y, si quieres, en tu dominio propio).

### Paso 1 — Obtén el código

Haz un **fork** del repositorio en GitHub (botón *Fork*) y clónalo:

```bash
git clone https://github.com/<tu-usuario>/cloudix.git mi-red-social
cd mi-red-social
npm install
```

### Paso 2 — Crea la base de datos en Neon

1. Entra en <https://console.neon.tech> y crea un **proyecto** nuevo (elige la
   región más cercana a tus usuarios).
2. En **Dashboard → Connection Details**, activa **Pooled connection** y copia la
   cadena de conexión. Tiene este formato:

   ```
   postgresql://usuario:contraseña@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

3. Guárdala: será el valor de `DATABASE_URL`.

> Usa la cadena **`-pooler`**: soporta muchas más conexiones simultáneas, que es
> justo lo que ocurre cuando cientos de funciones edge atienden peticiones a la vez.

### Paso 3 — Configura las variables de entorno locales

```bash
cp .dev.vars.example .dev.vars
```

Abre `.dev.vars` y rellena los valores. Genera secretos robustos con:

```bash
openssl rand -base64 48   # para JWT_SECRET
openssl rand -hex 32      # para CRON_SECRET
```

> ¿Sin `openssl`? Usa Node:
> `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

Ejemplo de `.dev.vars` completo para desarrollo:

```ini
DATABASE_URL="postgresql://usuario:contraseña@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require"
JWT_SECRET="pega-aqui-el-resultado-de-openssl-rand-base64-48"
CRON_SECRET="pega-aqui-el-resultado-de-openssl-rand-hex-32"
EXPOSE_DEV_TOKENS="true"   # solo en local: permite probar verificación/reset sin correo
```

La sección [Variables de entorno](#variables-de-entorno) explica cada variable en detalle.

### Paso 4 — Crea las tablas (migraciones)

```bash
npm run migrate
```

El script aplica en orden todos los archivos de `migrations/` y registra cuáles ya
se ejecutaron en la tabla `schema_migrations`, así que puedes volver a lanzarlo sin
riesgo. Lee `DATABASE_URL` de la variable de entorno o, si no existe, de `.dev.vars`.

Salida esperada:

```
+ aplicada: 0001_initial
+ aplicada: 0002_stories_expiration
...
```

### Paso 5 — Pruébala en local

```bash
npm run dev
```

Abre <http://localhost:8788>:

- `/` — página de inicio
- `/register` y `/login` — registro e inicio de sesión
- `/home.html` — la aplicación (feed, historias, mensajes...)
- `/api` — *health check*: debe responder `"database": { "ok": true }`

### Paso 6 — Publica en Cloudflare Pages

**Opción A — Conectar el repositorio (recomendada).** Cada `git push` despliega
automáticamente.

1. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** y elige tu fork.
2. Configuración de build:

   | Campo | Valor |
   |-------|-------|
   | Framework preset | `None` |
   | Build command | `npm install` |
   | Build output directory | `public` |

3. Pulsa **Save and Deploy**.

**Opción B — Desde tu terminal con Wrangler.**

```bash
npx wrangler login
npx wrangler pages project create cloudix-edge --production-branch=main
npm run deploy
```

> Si cambias el nombre del proyecto, actualiza también `name` en `wrangler.toml`.

### Paso 7 — Configura las variables de entorno de producción

Los secretos de `.dev.vars` **no** se suben a Cloudflare. Defínelos en producción
(con valores **distintos** a los de desarrollo):

```bash
npx wrangler pages secret put DATABASE_URL
npx wrangler pages secret put JWT_SECRET
npx wrangler pages secret put CRON_SECRET
```

O desde el panel: **Workers & Pages → tu proyecto → Settings → Variables and
Secrets → Add**, eligiendo el tipo **Secret**.

> Los cambios de variables se aplican en el **siguiente despliegue**. Tras
> añadirlas, vuelve a desplegar (`npm run deploy` o *Retry deployment* en el panel).

Comprueba que todo funciona en `https://<tu-proyecto>.pages.dev/api`.

### Paso 8 — Crea tu cuenta de administrador

Regístrate desde `/register` y luego promociona tu usuario ejecutando en el
**SQL Editor** de Neon:

```sql
UPDATE users SET role = 'admin', is_verified = TRUE WHERE email = 'tu@correo.com';
```

A partir de ese momento tendrás acceso a `GET /admin`.

### Paso 9 — Tareas opcionales

- **Subida de imágenes y vídeos (R2)** — ver [Almacenamiento (R2)](#almacenamiento-r2-opcional).
- **Limpieza automática de historias** — ver [Secretos de GitHub Actions](#secretos-de-github-actions).
- **Dominio propio** — en tu proyecto Pages: **Custom domains → Set up a custom
  domain**. Después restringe `CORS_ORIGIN` a ese dominio.

---

## Variables de entorno

Cloudix lee toda su configuración desde `context.env` de Cloudflare. Ningún valor
sensible debe estar escrito en el código.

### Dónde se define cada variable

| Ubicación | Entorno | Tipo de valor | ¿Se sube a Git? |
|-----------|---------|---------------|:---------------:|
| `.dev.vars` | Desarrollo local (`npm run dev`, `npm run migrate`) | Secretos | ❌ Nunca (está en `.gitignore`) |
| `wrangler.toml` → `[vars]` | Local y producción | Configuración **no** secreta | ✅ Sí |
| Cloudflare Pages → *Variables and Secrets* | Producción / Preview | Secretos | ❌ (viven en Cloudflare) |
| GitHub → *Secrets and variables → Actions* | Workflows de CI | Secretos de automatización | ❌ (viven en GitHub) |

**Regla de oro:** si una variable da acceso a algo (base de datos, firma de tokens,
endpoints internos), es un **secreto** y va en `.dev.vars` / Cloudflare. Si solo
ajusta el comportamiento (nombre de la app, duración de tokens), va en `wrangler.toml`.

### Secretos

| Variable | Obligatoria | Descripción | Cómo generarla |
|----------|:-----------:|-------------|----------------|
| `DATABASE_URL` | ✅ | Cadena de conexión de PostgreSQL (Neon). Usa la variante `-pooler`. También la usa `npm run migrate`. Sin ella, todo endpoint con base de datos falla. | Neon → *Connection Details* |
| `JWT_SECRET` | ✅ | Clave para firmar y verificar los access tokens (HS256). Mínimo **32 caracteres** aleatorios. Si cambia, todas las sesiones activas se invalidan. | `openssl rand -base64 48` |
| `CRON_SECRET` | Para limpiar historias | Protege `POST /stories/cleanup`. Sin ella, ese endpoint responde `501 NOT_CONFIGURED`. Se envía en la cabecera `X-Cron-Secret` (o `Authorization: Bearer`). | `openssl rand -hex 32` |

### Configuración pública (`wrangler.toml` → `[vars]`)

Todas son opcionales; si no se definen se usa el valor por defecto.

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `APP_NAME` | `Cloudix` | Nombre del servicio que devuelve el *health check* (`/api`). |
| `API_VERSION` | `1.0.0` | Versión que devuelve el *health check*. |
| `JWT_ISSUER` | `cloudix` | Claim `iss` de los JWT. Debe coincidir al firmar y al verificar. |
| `JWT_AUDIENCE` | `cloudix-clients` | Claim `aud` de los JWT. |
| `ACCESS_TOKEN_TTL` | `900` | Vida del access token en **segundos** (15 min). |
| `REFRESH_TOKEN_TTL` | `2592000` | Vida del refresh token en **segundos** (30 días). |
| `CORS_ORIGIN` | `*` | Orígenes permitidos: `*` o una lista separada por comas (`https://app.com,https://www.app.com`). Si el origen de la petición no está en la lista se responde con el primero. **En producción, restríngelo a tu dominio.** |

Ejemplo para producción:

```toml
[vars]
APP_NAME = "MiRed"
API_VERSION = "1.0.0"
JWT_ISSUER = "mired"
JWT_AUDIENCE = "mired-clients"
ACCESS_TOKEN_TTL = "900"
REFRESH_TOKEN_TTL = "2592000"
CORS_ORIGIN = "https://mired.com,https://www.mired.com"
```

### Almacenamiento (R2, opcional)

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `MEDIA_BUCKET` | Binding R2 | Bucket donde `/upload` guarda los archivos. Sin él, `/upload` no está disponible. |
| `MEDIA_PUBLIC_URL` | Variable | URL pública del bucket (p. ej. `https://media.tudominio.com`). Si se define, `/upload` devuelve la URL final del archivo; si no, `url` es `null`. |

Para activarlo:

```bash
npx wrangler r2 bucket create cloudix-media
```

Descomenta el bloque `[[r2_buckets]]` en `wrangler.toml`, habilita el acceso público
del bucket (o conecta un dominio) en **R2 → tu bucket → Settings** y define
`MEDIA_PUBLIC_URL`.

### Solo desarrollo

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `EXPOSE_DEV_TOKENS` | _(sin definir)_ | Si vale `"true"`, `/auth/register` y `/auth/forgot-password` devuelven el token de verificación / restablecimiento en la respuesta, para probar sin servidor de correo. **Nunca** lo actives en producción: permitiría restablecer la contraseña de cualquier cuenta. |

### Secretos de GitHub Actions

El workflow `.github/workflows/stories-cleanup.yml` elimina cada 15 minutos las
historias caducadas. Configura en **GitHub → Settings → Secrets and variables →
Actions**:

| Secreto | Valor |
|---------|-------|
| `STORIES_CLEANUP_URL` | `https://<tu-proyecto>.pages.dev/stories/cleanup` |
| `STORIES_CRON_SECRET` | El **mismo** valor que `CRON_SECRET` en Cloudflare |

Para desplegar desde CI necesitas además `CLOUDFLARE_API_TOKEN` (ver
[Despliegue desde CI](#despliegue-desde-ci)).

### Checklist antes de salir a producción

- [ ] `DATABASE_URL` apunta a la base de producción (no a la de desarrollo).
- [ ] `JWT_SECRET` y `CRON_SECRET` son **nuevos**, aleatorios y distintos de los de local.
- [ ] `EXPOSE_DEV_TOKENS` **no** está definida en Cloudflare.
- [ ] `CORS_ORIGIN` está restringido a tu(s) dominio(s).
- [ ] `JWT_ISSUER` / `JWT_AUDIENCE` reflejan el nombre de tu app.
- [ ] `.dev.vars` no aparece en `git status` ni en el historial.
- [ ] `GET /api` responde con `"database": { "ok": true }`.

---

## Personalización

| Qué cambiar | Dónde |
|-------------|-------|
| Nombre, textos y metadatos SEO/Open Graph | `public/index.html`, `public/auth.html`, `public/home.html` |
| Colores, tipografías y tokens de diseño | `public/css/theme.css` |
| Estilos de cada pantalla | `public/css/*.css` |
| Comportamiento del cliente | `public/js/*.js` (`api.js` centraliza las llamadas a la API) |
| Rutas limpias (`/login`, `/register`...) | `public/_redirects` |
| Nombre del proyecto y configuración | `wrangler.toml`, `package.json` |
| Nuevos endpoints | `functions/` (un archivo = una ruta; ver [Estructura](#estructura-del-proyecto)) |
| Cambios en la base de datos | Nuevo archivo `migrations/000N_descripcion.sql` + `npm run migrate` |

> **Migraciones:** nunca edites una migración ya aplicada; crea siempre un archivo
> nuevo con el siguiente número. Así cualquier instalación puede actualizarse con
> `npm run migrate`.

---

## Seguridad

- **Contraseñas**: PBKDF2-SHA256 con 100 000 iteraciones vía Web Crypto.
- **Access token**: JWT HS256 de corta duración (`ACCESS_TOKEN_TTL`), enviado en
  `Authorization: Bearer <token>`; solo se aceptan `alg: HS256` y `typ: "access"`.
- **Refresh token**: opaco y aleatorio, guardado **hasheado** (SHA-256) en
  `refresh_tokens`. Rotación atómica y detección de reutilización: si se reutiliza
  un token ya rotado, se cierran todas las sesiones del usuario.
- **Bloqueo de cuenta**: 5 contraseñas incorrectas en 15 min bloquean la cuenta
  15 min (HTTP 429 + `Retry-After`).
- **Límites por IP**: 20 fallos de login / 15 min, 10 registros / hora y
  5 recuperaciones / hora (tabla `auth_rate_limits`, migración `0006`).
- **Sin enumeración de usuarios**: misma respuesta y mismo coste de hash exista o no la cuenta.
- **Tokens de reset/verificación**: nunca se devuelven por la API salvo con
  `EXPOSE_DEV_TOKENS="true"` (solo desarrollo).
- **Cabeceras**: `nosniff`, `X-Frame-Options: DENY`, HSTS y `Cache-Control: no-store`
  en las rutas de autenticación.

---

## Referencia de la API

### Formato de respuesta

Todas las respuestas son JSON con la misma estructura:

```json
// Éxito
{ "success": true, "message": "...", "data": { }, "meta": { } }

// Error
{ "success": false, "message": "...", "error": { "code": "VALIDATION_ERROR", "details": [] } }
```

### Ejemplo rápido

```bash
# Registro
curl -X POST https://<tu-proyecto>.pages.dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"ana","email":"ana@example.com","password":"UnaClaveSegura123!"}'

# Login (identifier = correo o usuario) -> devuelve accessToken y refreshToken
curl -X POST https://<tu-proyecto>.pages.dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"ana@example.com","password":"UnaClaveSegura123!"}'

# Petición autenticada
curl https://<tu-proyecto>.pages.dev/users/me \
  -H "Authorization: Bearer <accessToken>"
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api` | *Health check* y metadatos |
| POST | `/auth/register` | Crear cuenta |
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/logout` | Revocar refresh token |
| POST | `/auth/refresh-token` | Renovar access token |
| POST | `/auth/forgot-password` | Solicitar restablecimiento |
| POST | `/auth/reset-password` | Restablecer con token |
| POST/GET | `/auth/verify-email` | Verificar correo |
| GET/PATCH | `/users/me` | Perfil propio |
| GET | `/users/:id` | Perfil público |
| GET | `/users/suggestions` | Sugerencias de usuarios |
| GET/POST | `/posts` | Feed / crear publicación |
| PATCH/DELETE | `/posts/:id` | Editar / eliminar publicación |
| POST | `/posts/:id/vote`, `/posts/:id/save`, `/posts/:id/report` | Votar, guardar y reportar |
| GET/POST | `/comments` | Comentarios (`?postId=`) / crear |
| POST/DELETE | `/reactions` | Reaccionar / quitar |
| GET/POST | `/stories` | Historias activas / crear |
| POST | `/stories/:id/view` | Marcar historia como vista |
| POST/DELETE | `/stories/:id/react` | Reaccionar / quitar reacción |
| GET | `/stories/:id/viewers` | Espectadores de una historia |
| POST | `/stories/cleanup` | Purga de historias caducadas (requiere `CRON_SECRET`) |
| POST/DELETE | `/follows/:id` | Seguir / dejar de seguir |
| GET | `/friends` | Amigos |
| GET/POST | `/groups` | Listar-buscar / crear grupo |
| GET/POST | `/groups/:id/messages` | Chat del grupo |
| GET/POST | `/communities` | Listar / crear comunidad |
| GET/POST | `/messages` | Conversación (`?withUserId=`) / enviar |
| GET/PATCH | `/notifications` | Listar / marcar leídas |
| GET | `/search` | Buscar (`?q=&type=all\|users\|posts`) |
| POST | `/upload` | Subir archivo a R2 |
| GET | `/admin` | Estadísticas (rol `admin`) |

Los grupos y comunidades exponen además `/:id` y `/:id/members[/:userId]` para
gestionar detalles y miembros. Consulta el handler correspondiente en `functions/`
para ver los métodos y parámetros exactos.

---

## Estructura del proyecto

```
/
├── functions/                 # API: cada archivo = una ruta (Pages Functions)
│   ├── _middleware.js         # CORS + manejo global de errores (todas las rutas)
│   ├── api/                   # GET /api (health) y rutas de compatibilidad
│   ├── auth/                  # register, login, logout, refresh-token,
│   │                          #   forgot-password, reset-password, verify-email
│   ├── users/                 # me, [id], suggestions
│   ├── posts/                 # feed, [id], vote, save, report
│   ├── comments/  reactions/  # comentarios y reacciones
│   ├── stories/               # historias, vistas, reacciones, cleanup
│   ├── follows/   friends/    # relaciones entre usuarios
│   ├── groups/    communities/# grupos, comunidades y miembros
│   ├── messages/  notifications/
│   ├── search/    upload/   admin/
│   ├── middleware/            # auth.js, cors.js        (módulos, NO rutas)
│   ├── database/              # client.js (Neon)        (módulo, NO ruta)
│   ├── services/              # lógica de negocio       (módulos, NO rutas)
│   └── utils/                 # response, errors, jwt, password, validate...
│
├── public/                    # Frontend estático publicado por Cloudflare Pages
├── migrations/                # Migraciones SQL numeradas
├── schema/schema.sql          # Esquema de referencia
├── scripts/migrate.mjs        # Runner de migraciones (Node local)
├── .github/workflows/         # Limpieza programada de historias
├── .dev.vars.example          # Plantilla de secretos locales
├── wrangler.toml              # Configuración de Cloudflare
└── package.json
```

> **Sobre Pages Functions:** todo archivo `.js` bajo `functions/` que exporte
> `onRequest*` se convierte en ruta. Los módulos de `middleware/`, `database/`,
> `services/` y `utils/` no exportan handlers, así que se importan pero no se
> exponen. `_middleware.js` se ejecuta en todas las rutas.

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor local con frontend + funciones en <http://localhost:8788> |
| `npm run migrate` | Aplica las migraciones pendientes |
| `npm run deploy` | Despliega `public/` + `functions/` en Cloudflare Pages |
| `npm run tail` | Logs en tiempo real del despliegue |

---

## Despliegue desde CI

Si despliegas desde un CI con `CLOUDFLARE_API_TOKEN`, el token necesita el permiso
**Account → Cloudflare Pages → Edit** (el rol de tu cuenta, aunque sea Super Admin,
no se hereda en el token). Créalo en <https://dash.cloudflare.com/profile/api-tokens>
con:

- Account → **Cloudflare Pages** → **Edit**
- Account → Account Settings → Read *(recomendado)*
- User → User Details → Read *(recomendado)*

Si el proyecto aún no existe, créalo una vez:

```bash
npx wrangler pages project create cloudix-edge --production-branch=main
```

---

## Solución de problemas

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `/api` devuelve `"database": { "ok": false }` | `DATABASE_URL` ausente o incorrecta | Revisa `.dev.vars` (local) o los secretos de Cloudflare y vuelve a desplegar |
| `Define DATABASE_URL` al ejecutar `npm run migrate` | No existe `.dev.vars` ni la variable de entorno | `cp .dev.vars.example .dev.vars` y rellena `DATABASE_URL` |
| Error 401 en todas las peticiones tras un deploy | `JWT_SECRET` cambió o difiere entre entornos | Es esperado: los usuarios deben volver a iniciar sesión |
| Error CORS en el navegador | El dominio no está en `CORS_ORIGIN` | Añádelo a la lista en `wrangler.toml` |
| `/stories/cleanup` responde `501 NOT_CONFIGURED` | Falta `CRON_SECRET` | Defínelo en Cloudflare y en GitHub (`STORIES_CRON_SECRET`) |
| `Could not detect a directory containing static files` | Falta el directorio de salida | `pages_build_output_dir = "public"` en `wrangler.toml` |
| `Missing entry-point to Worker script` / `Workers-specific command` | Se ejecutó `wrangler deploy` (Workers) | Usa `npm run deploy` (`wrangler pages deploy public`) |
| `Authentication error [code: 10000]` | El token de API no tiene permiso de Pages | Añade **Cloudflare Pages → Edit** al token |
| `Could not resolve "@neondatabase/serverless"` / `"jose"` | Pages no instaló dependencias | *Settings → Build configuration*: **Build command `npm install`** |

> **Recomendación:** conecta el repositorio como proyecto **Pages** (no Workers).
> Pages publica `public/` + `functions/` automáticamente y evita la mayoría de
> estos errores.

---

## Rendimiento y escalado

- **Edge global**: las funciones se ejecutan en el centro de datos de Cloudflare
  más cercano al usuario.
- **Neon serverless**: conexiones por HTTP sin pool TCP; absorbe picos sin agotar
  conexiones (usa la cadena `-pooler`).
- **Índices** optimizados para feed, búsqueda, bandeja de mensajes y notificaciones.
- **Caché**: añade un namespace KV de Cloudflare para respuestas GET frecuentes
  (binding de ejemplo en `wrangler.toml`).

---

## Licencia

Distribuido bajo licencia **MIT**. Puedes usarlo, modificarlo y publicarlo
libremente, también con fines comerciales.
