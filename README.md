# VotaLive

Una aplicación web para crear y participar en votaciones rápidas desde cualquier dispositivo, pensada para entornos educativos y reuniones con pocos pasos.

## Descripción

VotaLive permite que un docente cree una votación en segundos, comparta un código con los alumnos y reciba respuestas de forma sencilla desde el celular. La plataforma está construida con Astro y se despliega sobre Cloudflare, usando D1 como base de datos.

## Funcionalidades

- Creación de votaciones con pregunta, descripción y múltiples opciones.
- Generación automática de un código único para la votación.
- Acceso para estudiantes mediante el código compartido.
- Validación y protección básica de la creación de encuestas.
- Arquitectura ligera y moderna pensada para despliegue en la nube.

## Stack tecnológico

- Astro
- TypeScript
- Cloudflare Workers
- Cloudflare D1
- Wrangler

## Estructura del proyecto

```text
votalive-master/
├── migrations/
│   └── 0001_initial_schema.sql
├── public/
├── src/
│   ├── assets/
│   ├── layouts/
│   ├── pages/
│   │   ├── API/
│   │   │   ├── [codex].ts
│   │   │   └── polls/
│   │   │       └── index.ts
│   │   ├── alumno.astro
│   │   ├── docente.astro
│   │   ├── index.astro
│   │   └── votar.astro
│   └── styles/
├── AGENTS.md
├── astro.config.mjs
├── package.json
├── README.md
├── tsconfig.json
├── worker-configuration.d.ts
├── wrangler.jsonc
└── package-lock.json
```

## Requisitos

- Node.js 22 o superior
- npm
- Cuenta de Cloudflare con Wrangler configurado

## Instalación

1. Clona el repositorio:

```bash
git clone https://github.com/tu-usuario/votalive.git
cd votalive
```

2. Instala las dependencias:

```bash
npm install
```

3. Configura la base de datos y las variables de entorno necesarias para Cloudflare.

## Ejecución local

```bash
npm run dev
```

La aplicación quedará disponible en el puerto por defecto de Astro.

## Construcción para producción

```bash
npm run build
```

## Despliegue

Este proyecto está preparado para desplegarse con Cloudflare:

```bash
npm run deploy
```

También puedes usar Wrangler directamente si necesitas más control sobre la publicación.

## Variables y seguridad

La creación de votaciones tiene una protección provisional basada en una clave administrativa (`ADMIN_KEY`).

Asegúrate de configurarla correctamente en tu entorno de Cloudflare antes de usar el panel docente.

## Base de datos

La estructura inicial de la base de datos se encuentra en:

- [migrations/0001_initial_schema.sql](migrations/0001_initial_schema.sql)

## Uso básico

1. Abre la página principal.
2. Ingresa al panel docente.
3. Crea una nueva votación.
4. Comparte el código generado con los participantes.
5. Los alumnos ingresan el código y votan desde su dispositivo.

## Licencia
sin licencia

## Autor

Proyecto desarrollado como demo de votación digital para un entorno escolar.
