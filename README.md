 # VotaLive

Una aplicación web para crear y participar en votaciones rápidas desde cualquier dispositivo, pensada para entornos educativos y reuniones con pocos pasos.

## Descripción

VotaLive permite que un docente cree una votación en segundos, comparta un código con los alumnos y reciba respuestas de forma sencilla desde el celular. La plataforma está construida con Astro y se despliega sobre Cloudflare, usando D1 como base de datos.

## Funcionalidades

- Creación de votaciones con pregunta, descripción y múltiples opciones.
- Generación automática de un código único para la votación.
- Acceso para estudiantes mediante el código compartido.
- Consulta protegida de resultados con conteos, porcentajes y participación.
- Acceso presencial mediante QR rotativo y cookie temporal.
- Indicador docente del QR con cuenta regresiva y renovación automática.
- Panel docente con listado, filtros e indicadores de participación.
- Exportación CSV de resultados cerrados sin credenciales ni identidades.
- Gráfico porcentual accesible de resultados con identificación de empates.
- Indicador de conexión y reintentos controlados durante la actualización de resultados.
- Modo oscuro/claro accesible con preferencia local del navegador.
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
6. El docente consulta los resultados en `/resultados` con la clave administrativa.
7. El docente puede consultar el listado general en `/panel`.

Para habilitar el acceso presencial local, configura `QR_SECRET` junto con `ADMIN_KEY`
en `.dev.vars`. En producción, usa secretos separados mediante Wrangler. El QR
autoriza temporalmente el acceso, pero cada alumno sigue necesitando su credencial
personal para votar.

## Pruebas verificadas

Ejecuta la suite funcional con:

```bash
node --test tests/voting.test.mjs
```

La prueba automatizada cubre:

| Caso | Cobertura |
| --- | --- |
| TC01 | Creación válida y código de 12 caracteres |
| TC02 | Opciones duplicadas rechazadas con `400` |
| TC03 | Apertura controlada después de autorizar participantes |
| TC04 | Voto válido registrado con `201` |
| TC05 | Credencial repetida rechazada con `409` |
| TC06 | Voto sin cookie de presencia QR rechazado con `403` |
| TC07 | QR caducado rechazado por el endpoint de acceso con `403` |
| TC08 | Voto después del cierre rechazado y resultados definitivos |
| TC09 | CSV cerrado con BOM UTF-8 y protección contra fórmulas |

La suite también verifica autorización administrativa, conteos, participación,
ganador, exportación abierta rechazada, error controlado del servidor y firma
QR. Las capturas de pantalla, la revisión responsive a 375 px y el video de
demostración son evidencias manuales que deben preparar los integrantes sin
mostrar secretos ni credenciales reales.

## Mejoras electivas implementadas

- **E3:** `/resultados` muestra una barra proporcional por opción, porcentaje,
  cantidad de votos y el mensaje de empate cuando corresponde.
- **E5:** `/resultados` indica el estado de conexión, responde a los eventos
  `online`/`offline` y reintenta hasta tres veces con esperas de 1, 2 y 4
  segundos antes de continuar con la actualización periódica.
- **E1:** el botón `Modo oscuro` del encabezado cambia entre temas, conserva la
  preferencia en `localStorage` y permite volver al modo claro. Esta preferencia
  no contiene datos de votación ni secretos.

## Licencia
sin licencia

## Autor

Proyecto desarrollado como demo de votación digital para un entorno escolar.
