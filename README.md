# SIG-EPE Frontend

![Next.js](https://img.shields.io/badge/Next.js-15.3-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?logo=tailwindcss)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)

Frontend del **Sistema de Información de Gestión** de [Enseña Perú](https://www.ensenaperu.org/). Aplicación web construida con Next.js 15 (App Router) que provee la interfaz de usuario para la gestión presupuestal, administración de usuarios y flujos de aprobación internos de la organización.

Se comunica con el backend [`sig-epe-backend`](../sig-epe-backend) mediante una API REST protegida con JWT.

---

## Tabla de contenidos

- [Requisitos previos](#requisitos-previos)
- [Instalación y setup](#instalación-y-setup)
- [Variables de entorno](#variables-de-entorno)
- [Desarrollo local](#desarrollo-local)
- [Docker](#docker)
- [Usuarios de prueba](#usuarios-de-prueba)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Flujo de autenticación](#flujo-de-autenticación)
- [Scripts disponibles](#scripts-disponibles)
- [Stack tecnológico](#stack-tecnológico)
- [Notas de desarrollo](#notas-de-desarrollo)

---

## Requisitos previos

| Herramienta             | Versión mínima | Notas                                                   |
| ----------------------- | -------------- | ------------------------------------------------------- |
| **Node.js**             | 20+            | Recomendado 22 LTS (el Dockerfile usa `node:22-alpine`) |
| **npm**                 | 10+            | Incluido con Node.js 20+                                |
| **sig-epe-backend**     | —              | Debe estar corriendo en `http://localhost:3001`         |
| **Docker** _(opcional)_ | 24+            | Solo si se quiere levantar con contenedores             |

---

## Instalación y setup

```bash
# 1. Clonar el repositorio
git clone <url-del-repo> sig-epe-frontend
cd sig-epe-frontend

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con los valores correspondientes (ver sección siguiente)

# 4. Asegurarse de que el backend esté corriendo
# (ver README del backend para instrucciones)

# 5. Levantar en modo desarrollo
npm run dev
```

La aplicación estará disponible en **http://localhost:3000**.

---

## Variables de entorno

Copiar `.env.example` a `.env.local` y configurar:

| Variable               | Tipo        | Requerida | Default                 | Descripción                                                                                                                                     |
| ---------------------- | ----------- | --------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`  | Pública     | Sí        | `http://localhost:3001` | URL base de la API del backend. Se expone al browser (`NEXT_PUBLIC_*`).                                                                         |
| `NEXT_PUBLIC_APP_NAME` | Pública     | No        | `SIG-EPE`               | Nombre de la aplicación mostrado en la UI.                                                                                                      |
| `JWT_ACCESS_SECRET`    | Server-only | Sí        | —                       | Secret compartido con el backend para verificar access tokens JWT en el middleware (Edge Runtime). **Debe coincidir con el valor del backend.** |

> **Importante:** Las variables `NEXT_PUBLIC_*` se incrustan en el bundle del cliente en tiempo de build. Si se cambian, se requiere reconstruir la aplicación.

---

## Desarrollo local

```bash
# Levantar con Turbopack (hot reload rápido)
npm run dev
```

Esto ejecuta `next dev --turbopack` y levanta el servidor en **http://localhost:3000**.

### Prerrequisito

El backend `sig-epe-backend` debe estar corriendo en la URL configurada en `NEXT_PUBLIC_API_URL` (por defecto `http://localhost:3001`).

---

## Docker

El proyecto incluye un Dockerfile multi-stage optimizado para producción con el output `standalone` de Next.js.

### Construir la imagen

```bash
docker build -t sig-epe-frontend .
```

Para inyectar la URL del backend en tiempo de build:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.ejemplo.com \
  -t sig-epe-frontend .
```

### Ejecutar el contenedor

```bash
docker run -p 3000:3000 \
  -e JWT_ACCESS_SECRET=tu-secret-jwt \
  sig-epe-frontend
```

### Build args disponibles

| Arg                    | Default                 | Descripción                         |
| ---------------------- | ----------------------- | ----------------------------------- |
| `NEXT_PUBLIC_API_URL`  | `http://localhost:3001` | URL de la API (incrustada en build) |
| `NEXT_PUBLIC_APP_NAME` | `SIG-EPE`               | Nombre de la app                    |

> **Nota:** El contenedor corre con un usuario no-root (`nextjs:nodejs`) por seguridad, expone el puerto `3000` y usa `node server.js` (standalone output).

---

## Usuarios de prueba

Credenciales disponibles en el entorno de desarrollo (requiere que el backend tenga los seeds cargados). El campo de login acepta **email o DNI** como `identifier`.

### Cuentas de prueba

| Identifier                        | Contraseña               | Rol               | Notas                                             |
| --------------------------------- | ------------------------ | ----------------- | ------------------------------------------------- |
| `admin@sigepe.local`              | `SigEpe2026!`            | `ADMIN_SISTEMA`   | Admin principal, onboarding completo              |
| `carlos.huaman@ensenaperudev.org` | `DevPass2026!`           | `GIOF_GESTOR`     | Onboarding completo                               |
| `ana.torres@ensenaperudev.org`    | `DevPass2026!`           | `SOLICITANTE_EPE` | `onboarding_completed: false`                     |
| DNI: `12345678`                   | _(sin contraseña local)_ | `SOLICITANTE_EPE` | Sin email, sin password — simula primer login EPE |

> **DNI `12345678` (María García Quispe):** simula el primer login de un empleado EPE. No tiene contraseña local; usa las credenciales del sistema EPE real.

> **No usar estas credenciales en producción.** Son exclusivamente para desarrollo y testing.

---

## Estructura del proyecto

```
src/
├── app/                        # App Router (Next.js 15)
│   ├── (auth)/                 # Grupo de rutas — layout de autenticación
│   │   ├── login/page.tsx      #   /login — formulario de inicio de sesión
│   │   └── onboarding/page.tsx #   /onboarding — completar perfil (primer login)
│   ├── (app)/                  # Grupo de rutas — layout principal con sidebar
│   │   ├── dashboard/page.tsx  #   /dashboard — panel principal
│   │   └── admin/
│   │       └── users/page.tsx  #   /admin/users — gestión de usuarios (ADMIN_SISTEMA)
│   ├── layout.tsx              # Root layout (providers, fonts, Toaster)
│   ├── page.tsx                # / — redirige a /dashboard
│   ├── error.tsx               # Error boundary global
│   ├── not-found.tsx           # Página 404
│   └── globals.css             # Estilos globales + tema Tailwind
│
├── components/
│   ├── auth/                   # Componentes de autenticación
│   │   ├── login-form.tsx      #   Formulario de login (react-hook-form + zod)
│   │   └── onboarding-form.tsx #   Formulario de onboarding
│   ├── layout/                 # Componentes de layout
│   │   ├── app-sidebar.tsx     #   Sidebar con menú basado en rol
│   │   ├── dashboard-shell.tsx #   Shell del dashboard (sidebar + contenido)
│   │   └── nav-user.tsx        #   Dropdown de usuario en sidebar
│   └── ui/                     # Componentes shadcn/ui (auto-generados)
│       ├── button.tsx
│       ├── card.tsx
│       ├── form.tsx
│       ├── input.tsx
│       ├── table.tsx
│       └── ...                 # avatar, badge, dropdown-menu, label,
│                               # separator, sidebar, skeleton, sonner, tooltip
│
├── lib/
│   ├── api-client.ts           # Cliente HTTP con auth automática + refresh de tokens
│   ├── constants.ts            # Rutas, roles, menú por rol, constantes
│   └── utils.ts                # Utilidades (cn() para class merging)
│
├── stores/
│   └── auth-store.ts           # Estado de autenticación (Zustand 5)
│
├── types/
│   ├── auth.ts                 # Tipos de autenticación (AuthUser, TokenPayload, etc.)
│   └── api.ts                  # Tipos de respuesta de la API (ApiResponse, ApiError, etc.)
│
└── middleware.ts                # Middleware Edge Runtime — verificación JWT con jose
```

---

## Flujo de autenticación

```
┌─────────┐     POST /auth/login      ┌───────────┐
│  Login   │ ───────────────────────►  │  Backend  │
│  Form    │ ◄──────────────────────── │  API      │
└────┬─────┘  { accessToken, user }    └───────────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│  1. accessToken → Zustand store (memoria, no storage) │
│  2. accessToken → cookie httpOnly (set por backend)   │
│  3. user → Zustand store                              │
└────┬─────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│  Middleware (Edge Runtime)                             │
│  ─────────────────────────────                        │
│  • Lee access_token de la cookie                      │
│  • Verifica JWT con jose (compatible con Edge)        │
│  • scope: "onboarding" → fuerza /onboarding           │
│  • scope: "full" → acceso completo                    │
│  • Token inválido/expirado → redirect a /login        │
└────┬─────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│  API Client (api-client.ts)                           │
│  ─────────────────────────                            │
│  • Inyecta Authorization: Bearer <token> en cada req  │
│  • Si recibe 401 → intenta refresh con cookie httpOnly│
│  • Si refresh falla → clearAuth() + redirect /login   │
│  • Deduplicación de refresh concurrentes              │
└──────────────────────────────────────────────────────┘
```

### Rutas públicas (sin autenticación)

- `/login`
- `/_next/*` (assets estáticos)
- `/favicon.ico`
- `/api/health`

### Rutas protegidas

Todas las demás rutas requieren un JWT válido. El menú lateral se genera dinámicamente según el rol del usuario (`ROLE_MENU_MAP` en `constants.ts`).

---

## Scripts disponibles

| Script       | Comando              | Descripción                                                                    |
| ------------ | -------------------- | ------------------------------------------------------------------------------ |
| `dev`        | `npm run dev`        | Levanta el servidor de desarrollo con **Turbopack** en `http://localhost:3000` |
| `build`      | `npm run build`      | Genera el build de producción (output `standalone`)                            |
| `start`      | `npm run start`      | Inicia el servidor de producción (requiere build previo)                       |
| `lint`       | `npm run lint`       | Ejecuta ESLint con la configuración de Next.js                                 |
| `type-check` | `npm run type-check` | Verifica tipos con `tsc --noEmit` (sin emitir archivos)                        |

---

## Stack tecnológico

| Tecnología                                      | Versión | Propósito                                             |
| ----------------------------------------------- | ------- | ----------------------------------------------------- |
| [Next.js](https://nextjs.org/)                  | 15.3    | Framework React con App Router, SSR y middleware Edge |
| [React](https://react.dev/)                     | 19.1    | Biblioteca de UI                                      |
| [TypeScript](https://www.typescriptlang.org/)   | 5.8     | Tipado estático estricto                              |
| [Tailwind CSS](https://tailwindcss.com/)        | 4.1     | Utilidades CSS                                        |
| [shadcn/ui](https://ui.shadcn.com/)             | —       | Componentes UI (Radix UI + Tailwind)                  |
| [Zustand](https://zustand.docs.pmnd.rs/)        | 5.0     | Estado global (autenticación)                         |
| [jose](https://github.com/panva/jose)           | 6.0     | Verificación JWT compatible con Edge Runtime          |
| [React Hook Form](https://react-hook-form.com/) | 7.56    | Manejo de formularios                                 |
| [Zod](https://zod.dev/)                         | 3.24    | Validación de schemas                                 |
| [Lucide React](https://lucide.dev/)             | 0.487   | Iconos                                                |
| [Sonner](https://sonner.emilkowal.dev/)         | 2.0     | Notificaciones toast                                  |

---

## Notas de desarrollo

### Edge Runtime y JWT

El middleware de Next.js corre en el **Edge Runtime**, que no soporta APIs de Node.js como `crypto`. Por eso se usa **jose** en lugar de `jsonwebtoken` para verificar tokens JWT. La variable `JWT_ACCESS_SECRET` es server-only y nunca se expone al cliente.

### Zustand 5 — Estado de autenticación

El `accessToken` se almacena **solo en memoria** (Zustand store), no en `localStorage`. Esto mitiga ataques XSS. La persistencia de la sesión se maneja via cookie `httpOnly` del backend + refresh automático en el API client.

### shadcn/ui

Los componentes en `src/components/ui/` están generados con `shadcn/ui` y personalizados con el tema del proyecto. No se editan manualmente a menos que sea necesario.

### Typed Routes

La configuración de Next.js tiene `typedRoutes: true`, lo que habilita verificación de tipos para las rutas de `<Link>` y `router.push()`.

### Turbopack

El script `dev` usa `--turbopack` para hot reload significativamente más rápido durante el desarrollo.

### Roles del sistema (5)

| Código              | Etiqueta                  |
| ------------------- | ------------------------- |
| `SOLICITANTE_EPE`   | Solicitante EPE           |
| `PATROCINADOR`      | Patrocinador              |
| `GIOF_GESTOR`       | GIOF Gestor               |
| `AUDITOR_DIRECCION` | Auditor / Dirección       |
| `ADMIN_SISTEMA`     | Administrador del Sistema |

---

## Licencia

Proyecto privado de [Enseña Perú](https://www.ensenaperu.org/). Todos los derechos reservados.
