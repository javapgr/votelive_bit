# Instrucciones para Copilot — VotaLive

Proyecto: sistema de votaciones presenciales (SENATI). Stack: **Astro + TypeScript + Cloudflare Workers + D1 (SQLite)**. Tiempo casi real por **polling cada 2000 ms** (sin WebSockets).

## Reglas generales

- Responde en español, corto y directo.
- Haz solo lo que se pide. No refactorices ni agregues dependencias sin que lo pidan.
- No digas "listo" sin verificar. Ejecuta el comando (build, migración, curl, prueba) y muestra la salida real.
- Al reportar un fix usa este formato: **problema → causa → fix (archivo:línea) → salida real de verificación → estado**.
- Si algo no se pudo verificar, dilo claro. No inventes resultados.

## Estructura

```
src/layouts/MainLayout.astro
src/styles/global.css
src/pages/{index,docente,alumno,votar,acceso,proyeccion,panel,resultados}.astro
src/pages/api/polls/index.ts            # POST crear
src/pages/api/polls/[code].ts           # GET consultar
src/pages/api/polls/[code]/status.ts    # PATCH open/closed
src/pages/api/polls/[code]/credentials.ts
src/pages/api/polls/[code]/vote.ts
src/pages/api/polls/[code]/results.ts
src/pages/api/polls/[code]/qr.ts
src/pages/api/polls/[code]/enter.ts
src/pages/api/polls/[code]/export.ts
src/pages/api/admin/polls.ts
migrations/
wrangler.jsonc
.dev.vars                               # NUNCA en Git
```

## Backend / API

- Acceso a D1: `import { env } from "cloudflare:workers"` y `env.DB.prepare(...).bind(...)`.
- **Siempre** sentencias preparadas con `bind`. Prohibido concatenar strings en SQL.
- Para insertar varias filas relacionadas usa `DB.batch` (un solo lote transaccional).
- El binding D1 se llama `DB` y debe coincidir con `wrangler.jsonc`.
- Todas las respuestas son JSON. Maneja JSON inválido.
- Códigos HTTP: `201` creado, `400` validación, `401` sin clave admin, `403` QR/cookie inválidos, `404` no existe, `409` conflicto (voto duplicado, cerrada), `500` error interno.
- Errores 500: mensaje genérico al cliente, detalle solo en logs. Nunca exponer secretos ni datos internos.

## Validaciones mínimas (crear votación)

- Título: 5–200 caracteres.
- Opciones: entre 2 y 20, nombres únicos, 1–100 caracteres cada una.
- Rechazar campos vacíos y duplicados.

## Base de datos

- Tablas: `polls`, `options`, `participants`, `votes`.
- Estados de `polls.status`: `draft` → `open` → `closed`. Una cerrada **no se reabre**.
- El cambio de estado debe condicionar el estado previo en el `UPDATE`.
- `UNIQUE(poll_id, participant_id)` en `votes` es la barrera final contra votos duplicados. No la quites.
- Cambios de esquema solo con migraciones (`wrangler d1 migrations create/apply`). Probar primero con `--local`, después `--remote`.
- Local y producción son bases distintas.

## Credenciales y votos

- Credencial = 24 bytes con `crypto.getRandomValues`, en hex.
- En BD se guarda solo el **hash SHA-256**. La credencial original se entrega una única vez.
- Solo se generan credenciales en estado `draft` y con clave admin.
- Voto: verificar encuesta `open`, opción de esa encuesta, credencial de esa encuesta y que no haya voto previo. Usar `INSERT OR IGNORE ... SELECT` y revisar `result.meta.changes === 1`.
- Si `changes === 0` responder `409` sin revelar si la credencial existe o ya se usó.

## QR y acceso presencial

- `slot = Math.floor(Date.now() / 30000)`. Payload: `qr:CODIGO:SLOT`, firmado con **HMAC-SHA256** usando `QR_SECRET`.
- `GET .../qr` exige `x-admin-key`. `POST .../enter` valida firma, vigencia y estado `open`.
- Tras validar, cookie firmada: `HttpOnly`, `Secure` (HTTPS), `SameSite=Lax`, 10 min, restringida a la API de esa encuesta.
- `vote.ts` rechaza el POST si no hay cookie válida. La cookie **complementa** la credencial, no la reemplaza.
- El QR usa la URL pública de producción, nunca `localhost`.
- Recordar: el QR **no prueba presencia física**. No afirmar lo contrario en código ni docs.

## Seguridad y secretos

- `ADMIN_KEY` y `QR_SECRET` son distintos, largos y aleatorios.
- Local: `.dev.vars` (en `.gitignore`). Producción: `npx wrangler secret put`.
- Nunca poner secretos en código del navegador, commits, capturas ni logs.
- `ADMIN_KEY` viaja por la cabecera `x-admin-key`. Es control académico, no auth de producción.
- Resultados parciales sensibles: restringir al docente o mostrar solo al cerrar.

## Resultados

- Conteo con `LEFT JOIN` de `options` a `votes`, agrupado y ordenado por `position`.
- Porcentaje = `100 * votos / total`. Si total = 0, mostrar 0 %.
- Empate: si hay dos o más opciones con el mayor conteo positivo, mostrar empate.
- Frontend: `setInterval` de 2000 ms, con bandera `loading` para evitar peticiones simultáneas y detener el intervalo cuando la votación está cerrada.

## CSV

- Solo para votaciones `closed`, con clave admin.
- UTF-8 con BOM, comillas escapadas.
- Mitigar inyección de fórmulas: si la celda empieza con `=`, `+`, `-` o `@` (o tab/CR/LF), anteponer `'`.
- Sin credenciales ni identidades.

## Frontend

- Layout reutilizable `MainLayout.astro`, `lang="es"`, viewport responsive. Probar a 375 px.
- JS del navegador: `querySelector`, `addEventListener`, `createElement`, `fetch`. No usar `localStorage` para datos de votación (solo preferencias, como modo oscuro).
- Mostrar errores junto al campo y estados de carga.

## Despliegue

1. `wrangler.jsonc` con binding `DB` y UUID real.
2. `npx wrangler d1 migrations apply votalive-db --remote` (solo tras probar en local).
3. `npx wrangler secret put ADMIN_KEY` y `QR_SECRET`.
4. `npm run build` y `npx wrangler deploy`.
5. Probar un circuito completo en la URL publicada.

## Comandos útiles

```bash
npm run dev                                   # http://localhost:4321
npx wrangler d1 migrations apply votalive-db --local
npx wrangler d1 execute votalive-db --local --command "SELECT name FROM sqlite_master WHERE type='table';"
npm run build
```

## Diagnóstico rápido

| Síntoma | Revisar |
| --- | --- |
| `env.DB undefined` | Nombre del binding `DB`, adaptador, reiniciar dev |
| 500 en POST | Log del servidor, tablas existentes, `env.DB` |
| `no such table` | Migraciones en el entorno correcto (`--local`/`--remote`) |
| 401 al crear | `ADMIN_KEY` en ese entorno + cabecera `x-admin-key` |
| 403 al votar | QR vencido, cookie ausente o firma inválida |
| 409 al votar | Cerrada, datos inválidos o credencial ya usada |
| QR abre localhost | Generar con URL pública |
| Resultados no cambian | `GET results`, código de votación, polling |

## Pruebas mínimas (casos que deben pasar)

| Caso | Esperado |
| --- | --- |
| Crear con 2 candidatos | 201 + código |
| Candidato repetido | 400 |
| Abrir votación en borrador | `open` |
| Votar con credencial válida | 201, conteo +1 |
| Misma credencial otra vez | 409, sin conteo extra |
| Votar sin cookie de QR | 403 |
| Canjear QR caducado | 403 |
| Cerrar y votar | Rechazo |
| Exportar cerrada | CSV legible con acentos |

## No hacer

- No concatenar SQL.
- No guardar credenciales en texto plano.
- No subir `.dev.vars`.
- No reabrir votaciones cerradas.
- No exponer `QR_SECRET` ni `ADMIN_KEY` al cliente.
- No dar un fix por bueno sin salida real de verificación.
