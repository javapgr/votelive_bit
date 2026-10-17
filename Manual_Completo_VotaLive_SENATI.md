SENATI  |  MANUAL DE LABORATORIO  |  VOTALIVE

VotaLive

**MANUAL COMPLETO DE IMPLEMENTACIÓN Y RETOS PRÁCTICOS**

Formación: SENATI | Proyecto académico: sistema de votaciones presenciales en tiempo casi real

Tecnologías: Astro, TypeScript, JavaScript, Cloudflare Workers, D1 (SQLite), Web Crypto y QR dinámico

Versión didáctica • Octubre de 2026

# Propósito

Construir por etapas una aplicación web en la que un docente crea votaciones, registra opciones, habilita participantes presentes mediante credenciales, proyecta un QR que caduca, recibe votos únicos y consulta resultados y reportes. Al finalizar, el estudiante implementa mejoras individuales y documenta sus pruebas.

**Alcance y seguridad**

Proyecto de enseñanza. El QR puede retransmitirse y una credencial puede compartirse; por tanto, no demuestra presencia física por sí solo. Para elecciones institucionales se requiere autenticación y controles reforzados. Nunca incorporar contraseñas ni tokens de producción en repositorios o capturas.

# Resultados de aprendizaje

Explicar la arquitectura frontend–API–base de datos en el entorno serverless de Cloudflare.

Construir rutas Astro y endpoints HTTP con validación y respuestas JSON.

Diseñar relaciones SQL, migraciones e integridad de votos únicos.

Aplicar autenticación administrativa elemental, credenciales aleatorias y QR firmado.

Calcular y visualizar resultados y descargar CSV.

Diseñar, implementar y defender mejoras mediante evidencias reproducibles.

# Hoja de ruta

| Fase | Desarrollo | Producto verificable |
| --- | --- | --- |
| 1 | Crear y ejecutar Astro | Página inicial navegable |
| 2 | Interfaces docente y alumno | Formularios y rutas responsive |
| 3 | D1 y API de votaciones | Creación y lectura persistente |
| 4 | Votos y resultados | Cierre, conteos y ganador |
| 5 | Acceso presencial | QR firmado + cookie temporal |
| 6 | Panel y exportación | Listado y reporte CSV |

# Antes de comenzar: requisitos y reglas

Equipo con Node.js LTS, npm, Visual Studio Code, navegador y conexión a internet.

Cuenta de Cloudflare con permisos para Workers y D1.

Terminal PowerShell o equivalente.

Código fuente del proyecto de las fases 1–6 y base D1 propia para el laboratorio.

No reutilizar una misma contraseña entre equipos; excluir .dev.vars con .gitignore.

Trabajar localmente hasta aprobar las pruebas; producción y local usan bases distintas.

# Arquitectura de referencia

Navegador /docente y /votar

           | HTTP GET, POST y PATCH

Astro (rutas .astro y API .ts) en Workers

           | env.DB.prepare(...).bind(...)

Cloudflare D1: polls, options, participants, votes

           | resultados JSON

Navegador /resultados, /proyeccion (consulta cada 2 segundos)

Nota sobre tiempo real: el ejercicio implementa polling (consultas cada aproximadamente dos segundos); no usa WebSockets. Una aplicación de alta escala podría integrar Durable Objects/WebSockets después.

# FASE 1. Creación de proyecto y arranque

Objetivo: generar un proyecto Astro desplegable en Cloudflare Workers y comprender archivos, comandos y rutas.

Abrir una terminal y verificar node -v y npm -v.

Crear el proyecto con el asistente oficial.

Seleccionar Astro y TypeScript, conservar la configuración de Cloudflare.

Abrir el proyecto en VS Code y arrancar el servidor.

Comprobar la página de bienvenida y el acceso desde localhost.

node -v

npm -v

npm create cloudflare@latest -- votalive --framework=astro

cd votalive

code .

npm run dev

Archivos importantes: src/pages/index.astro es la página principal; astro.config.mjs configura Astro y el adaptador; wrangler.jsonc contiene la definición del Worker y de los bindings. En el desarrollo local la URL habitual es http://localhost:4321.

Prueba: modificar temporalmente el encabezado de index.astro, recargar la página y explicar el efecto de hot reload.

# FASE 2. Diseño de interfaces

Objetivo: construir las rutas /, /docente, /alumno y /votar con un layout reutilizable.

| Ruta | Contenido | Acción |
| --- | --- | --- |
| / | Inicio | Navegar a docente o alumno |
| /docente | Crear encuesta | Título, descripción, candidatos |
| /alumno | Ingreso | Código y guía de QR |
| /votar | Formulario de voto | Candidatos y credencial |

Estructura de referencia: src/layouts/MainLayout.astro, src/styles/global.css y src/pages/{index,docente,alumno,votar}.astro. El layout importa estilos y presenta un menú común.

---

import "../styles/global.css";

const { title } = Astro.props;

---

<html lang="es"><head><meta charset="UTF-8" />

<meta name="viewport" content="width=device-width, initial-scale=1" />

<title>{title} | VotaLive</title></head><body>

<header><a href="/">VotaLive</a> <a href="/docente">Docente</a>

<a href="/alumno">Alumno</a></header><main><slot /></main>

</body></html>

En el formulario del docente se emplea querySelector, addEventListener, createElement y fetch. Se exige un título y al menos dos opciones. En la fase 2 se puede prototipar con localStorage, pero la fase 3 elimina este almacenamiento y utiliza D1.

const options = Array.from(document.querySelectorAll<HTMLInputElement>(".candidate"))

  .map(el => el.value.trim());

if (options.length < 2 || options.some(o => !o)) {

  alert("Registra como mínimo dos candidatos");

  return;

}

Prueba: crear tres campos de candidatos, navegar entre rutas y comprobar el diseño en un ancho de 375 px. No habilitar emisión real de votos todavía.

# FASE 3. Cloudflare D1 y persistencia

Objetivo: reemplazar localStorage por SQL y exponer endpoints para crear y consultar elecciones.

npx wrangler login

npx wrangler d1 create votalive-db

En wrangler.jsonc, integra (sin eliminar el resto de la configuración) el binding D1. El nombre debe coincidir con el utilizado en la API. Sustituye UUID_REAL por el valor de Cloudflare.

"d1_databases": [{

  "binding": "DB",

  "database_name": "votalive-db",

  "database_id": "UUID_REAL"

}]

El error «env.DB undefined» ocurre cuando el nombre del binding no coincide. Verificación recomendada: typeof env.DB?.prepare debe ser "function".

## 3.1. Esquema SQL (migración inicial)

CREATE TABLE polls (

 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,

 question TEXT NOT NULL, description TEXT DEFAULT '',

 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),

 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT);

CREATE TABLE options (

 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, name TEXT NOT NULL,

 position INTEGER NOT NULL DEFAULT 0,

 FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,

 UNIQUE(poll_id,id), UNIQUE(poll_id,position));

CREATE TABLE participants (

 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, credential_hash TEXT NOT NULL,

 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

 FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,

 UNIQUE(poll_id,credential_hash), UNIQUE(poll_id,id));

CREATE TABLE votes (

 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, option_id TEXT NOT NULL,

 participant_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

 FOREIGN KEY(poll_id,option_id) REFERENCES options(poll_id,id),

 FOREIGN KEY(poll_id,participant_id) REFERENCES participants(poll_id,id),

 UNIQUE(poll_id,participant_id));

CREATE INDEX idx_options_poll ON options(poll_id);

CREATE INDEX idx_votes_poll ON votes(poll_id);

npx wrangler d1 migrations create votalive-db initial_schema

# Copiar el SQL anterior al archivo generado en migrations/

npx wrangler d1 migrations apply votalive-db --local

npx wrangler d1 execute votalive-db --local --command "SELECT name FROM sqlite_master WHERE type='table';"

Para producción usar --remote. Antes de aplicar migraciones remotas, respaldar datos importantes y revisar cambios.

## 3.2. Clave administrativa y entorno

# Archivo .dev.vars (NO incluir en Git):

ADMIN_KEY=CLAVE_LARGA_GENERADA_LOCALMENTE

QR_SECRET=OTRA_CLAVE_LARGA_ALEATORIA

# .gitignore debe incluir: .dev.vars

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

La variable ADMIN_KEY se envía por cabecera x-admin-key desde el formulario docente y se compara en el Worker. Es solo un control académico de acceso; en producción corresponde usar autenticación por usuario, sesiones y limitación de solicitudes.

## 3.3. Crear y consultar votaciones

POST /api/polls

Body: {"question":"¿Quién será delegado?","description":"Grupo A",

       "options":["María","Juan","Ana"]}

Cabecera: x-admin-key: [CLAVE_DOCENTE]

Respuesta (201): {"code":"CODIGO_DE_12_CARACTERES","status":"draft"}

GET /api/polls/CODIGO_DE_12_CARACTERES

Respuesta: {"code":"...","question":"...","status":"draft",

            "options":[{"id":"UUID","name":"María","position":0}]}

Implementación: src/pages/api/polls/index.ts procesa POST; src/pages/api/polls/[code].ts procesa GET; usar env de cloudflare:workers, sentencias preparadas con bind y DB.batch para insertar la elección y opciones en un único lote transaccional.

import { env } from "cloudflare:workers";

const row = await env.DB.prepare(

  "SELECT id, question, status FROM polls WHERE code = ?"

).bind(code).first();

Validaciones mínimas: 5–200 caracteres en título, 2–20 opciones, nombres únicos, 1–100 caracteres por opción; manejar JSON inválido, 401, 404, 409 y 500 sin exponer datos internos.

# FASE 4. Administración, voto único y resultados

Objetivo: habilitar una elección, emitir credenciales individuales, registrar votos y calcular porcentajes con consultas agregadas.

# 4.1. Ciclo de estados

draft  --(docente abre)--> open --(docente cierra)--> closed

Una votación cerrada no se reabre en el flujo básico. PATCH /api/polls/[code]/status recibe {"status":"open"} o {"status":"closed"} con cabecera x-admin-key; la actualización debe condicionar el estado previo para evitar cambios inválidos.

## 4.2. Credenciales

POST /api/polls/[code]/credentials recibe {"count":30} y solo está disponible en borrador y para docente autorizado. Generar valores de 24 bytes aleatorios con crypto.getRandomValues. Guardar en participants únicamente una huella SHA-256 del valor; entregar las credenciales originales una única vez de forma individual.

const bytes = new Uint8Array(24);

crypto.getRandomValues(bytes);

const credential = Array.from(bytes)

 .map(b => b.toString(16).padStart(2,"0")).join("");

const hash = await crypto.subtle.digest(

 "SHA-256", new TextEncoder().encode(credential));

## 4.3. Emisión segura del voto

POST /api/polls/[code]/vote recibe optionId y credential. Debe comprobar que la encuesta está abierta, que el candidato pertenece a la encuesta, que la credencial corresponde a la encuesta y que no existe un voto anterior. La restricción UNIQUE en votes es la barrera final contra votos duplicados.

INSERT OR IGNORE INTO votes(id,poll_id,option_id,participant_id)

SELECT ?, p.id, o.id, pt.id

FROM polls p

JOIN options o ON o.poll_id=p.id

JOIN participants pt ON pt.poll_id=p.id

WHERE p.code=? AND p.status='open'

  AND o.id=? AND pt.credential_hash=?;

Comprobar result.meta.changes === 1. Si vale 0, responder con conflicto 409 sin revelar si la credencial existe o fue utilizada.

## 4.4. Resultados y porcentajes

SELECT o.id,o.name,COUNT(v.id) AS votes

FROM options o LEFT JOIN votes v

 ON v.option_id=o.id AND v.poll_id=o.poll_id

WHERE o.poll_id=?

GROUP BY o.id,o.name,o.position ORDER BY o.position;

Fórmula: porcentaje = 100 × votos_candidato / votos_totales; si el total es cero, mostrar 0 %. El endpoint GET /api/polls/[code]/results también calcula número de autorizados y ganadores después del cierre. Si dos opciones comparten el mayor conteo positivo, mostrar empate. El frontend hace fetch cada 2000 ms (polling).

const interval = setInterval(refreshResults, 2000);

// Detener el intervalo si la votación está cerrada.

// Evitar dos peticiones simultáneas mediante una bandera loading.

Seguridad didáctica: si los resultados parciales son sensibles, no deben publicarse a cualquiera con el código; restringir el endpoint al docente o mostrar solo al finalizar.

# FASE 5. QR rotativo y acceso presencial

Objetivo: impedir que conocer solo la URL /votar sea suficiente para registrar el voto. La solución no prueba identidad ni ubicación física: el QR puede compartirse en su periodo de validez.

## 5.1. Paquetes y secretos

npm install qrcode

npm install -D @types/qrcode

npx wrangler secret put QR_SECRET

Mantener ADMIN_KEY y QR_SECRET distintos. QR_SECRET nunca debe ir al código del navegador.

## 5.2. Token HMAC y ventana temporal

El servidor calcula slot = floor(Date.now() / 30000) y firma "qr:CODIGO:SLOT" con HMAC-SHA256. GET /api/polls/[code]/qr exige x-admin-key y retorna un enlace HTTPS /acceso?code=...&slot=...&sig=... y su caducidad. POST /api/polls/[code]/enter comprueba firma, fecha y estado abierto.

const slot = Math.floor(Date.now() / 30000);

const payload = `qr:${code}:${slot}`;

const key = await crypto.subtle.importKey(

  "raw", new TextEncoder().encode(secret),

  {name:"HMAC",hash:"SHA-256"}, false,["sign","verify"]);

const signature = await crypto.subtle.sign(

  "HMAC", key, new TextEncoder().encode(payload));

Tras validar, el servidor entrega una cookie firmada HttpOnly, Secure en HTTPS, SameSite=Lax, con vigencia de 10 minutos y ámbito restringido a la API de esa encuesta. La ruta vote.ts debe rechazar POST si no hay cookie válida. La cookie complementa, no sustituye, la credencial individual.

## 5.3. Vistas de participación y proyección

/acceso.astro interpreta los parámetros del QR, llama a enter y redirige a /votar; /proyeccion.astro muestra QR renovado, estado, votos y barras de resultados. No debe mostrar la clave de administración al público. El QR usa la URL de producción, nunca localhost cuando se escanea desde teléfonos externos.

Ejercicio crítico: probar el enlace expirado, el acceso directo sin cookie, la reutilización de credencial y el cierre de encuesta mientras una sesión aún está vigente.

# FASE 6. Panel de docente, estadísticas y CSV

Objetivo: consultar todas las votaciones, visualizar indicadores y descargar el acta de una elección finalizada.

## 6.1. Listado administrativo

GET /api/admin/polls con cabecera x-admin-key. Su respuesta incluye code, question, status, created_at, total_votes y authorized. El panel /panel permite ingresar clave, cargar datos, abrir resultados y acceder a proyección.

SELECT p.code,p.question,p.status,p.created_at,

 (SELECT COUNT(*) FROM votes v WHERE v.poll_id=p.id) AS total_votes,

 (SELECT COUNT(*) FROM participants pt WHERE pt.poll_id=p.id) AS authorized

FROM polls p ORDER BY p.created_at DESC,p.id DESC LIMIT 100;

## 6.2. Reporte CSV

GET /api/polls/[code]/export requiere la clave docente y estado closed. El CSV incluye pregunta, código, candidato, cantidad, porcentaje y total; no incluye credenciales ni identidades. Debe utilizar UTF-8 con BOM, comillas escapadas y mitigación de inyección de fórmulas para celdas que inicien con =, +, - o @.

const csvCell = (x: unknown) => {

 let s = String(x ?? "");

 if (/^\s*[=+\-@\t\r\n]/.test(s)) s = "'" + s;

 return `"${s.replaceAll('"', '""')}"`;

};

## 6.3. Rutas finales

| Vista | Objetivo |
| --- | --- |
| / | Inicio |
| /docente | Crear y administrar votación |
| /panel | Listado general |
| /alumno | Instrucciones de acceso |
| /acceso | Canje del QR |
| /votar | Votar con credencial |
| /proyeccion | QR y resultados proyectados |
| /resultados | Conteo y ganador |

# Publicación en Workers

Confirmar que wrangler.jsonc contiene binding DB y el UUID correcto.

Ejecutar migraciones remotas únicamente después de comprobarlas localmente.

Definir en Cloudflare ADMIN_KEY y QR_SECRET como secrets.

Ejecutar compilación y despliegue.

Abrir la URL workers.dev publicada y realizar un circuito de votación de prueba.

npx wrangler whoami

npx wrangler d1 migrations list votalive-db --remote

npx wrangler d1 migrations apply votalive-db --remote

npx wrangler secret put ADMIN_KEY

npx wrangler secret put QR_SECRET

npm run build

npx wrangler deploy

Nota: cada operación secret put permite introducir el valor sin imprimirlo. El entorno remoto es independiente del local y no hereda .dev.vars. Nunca pegar contraseñas reales en la evidencia del trabajo.

# Diagnóstico de fallos frecuentes

| Síntoma | Verificación / corrección |
| --- | --- |
| env.DB undefined | El binding de wrangler debe llamarse DB; revisar adaptador y reiniciar. |
| HTTP 500 en POST | Leer mensaje del servidor, comprobar tablas y env.DB; no deducir la causa solo del navegador. |
| no such table | Aplicar migraciones en el entorno correcto (--local o --remote). |
| 401 al crear | Configurar ADMIN_KEY en ese entorno y enviar x-admin-key. |
| 403 al votar | QR vencido, cookie de presencia ausente o firma inválida. |
| 409 al votar | Votación cerrada, datos inválidos o credencial ya utilizada. |
| QR abre localhost | Publicar Worker y generar QR usando la URL pública. |
| Resultados no cambian | Revisar GET results, código de votación y consulta periódica. |

# PRÁCTICA CALIFICADA SENATI — RETOS DEL ESTUDIANTE

Situación: el equipo recibe VotaLive desarrollado hasta la fase 6. Su encargo consiste en mejorar la experiencia, seguridad y calidad del sistema mediante funcionalidades medibles. El código entregado por el docente es punto de partida; las nuevas implementaciones deben ser propias.

Modalidad sugerida: equipos de 2 a 3 integrantes. Tiempo: 2 sesiones de laboratorio de 4 horas y trabajo autónomo. Producto: repositorio, demo funcional, evidencia de pruebas y breve informe técnico.

# Actividades obligatorias (16 puntos)

| ID / valor | Tarea | Criterio de aceptación |
| --- | --- | --- |
| R1 / 2 | Buscador y filtros del panel | Filtra por título, código y estado sin romper el listado; comunica resultados vacíos. |
| R2 / 2 | Validaciones de creación | Impide duplicados, campos vacíos y exceso de opciones; muestra errores junto al campo. |
| R3 / 2 | Indicador de QR | Cuenta regresiva visible y señal de QR vencido; sin mostrar enlaces viejos. |
| R4 / 2 | Indicadores de participación | Presenta total, autorizados, pendientes y porcentaje; maneja divisiones por cero. |
| R5 / 2 | Confirmación de cierre | Solicita confirmación, bloquea doble clic e informa cierre exitoso o error. |
| R6 / 2 | Exportación mejorada | Agrega fecha, identificación de la elección y resumen de ganador o empate, sin datos personales. |
| R7 / 2 | Manejo de errores | Estados de carga, recuperación de red y mensajes útiles sin exponer secretos. |
| R8 / 2 | Pruebas automáticas o reproducibles | Documenta al menos 8 casos, incluyendo duplicados, QR expirado y voto cerrado. |

# Desafíos electivos (4 puntos: elegir dos de 2 puntos)

| Opción | Mejora |
| --- | --- |
| E1 | Modo oscuro accesible y persistencia de preferencia en el navegador. |
| E2 | Panel con paginación o carga por páginas y ordenamiento. |
| E3 | Gráfico visual de resultados con comparación porcentual y tratamiento de empates. |
| E4 | Acta PDF de una elección cerrada con fecha y resultados, sin identidades. |
| E5 | Indicador de conexión y reintento controlado cuando falla la red. |

# Rúbrica de 20 puntos

| Dimensión | Puntos | Evidencia |
| --- | --- | --- |
| 8 retos obligatorios | 16 | Funcionalidad demostrable según cada criterio de aceptación |
| 2 desafíos electivos | 4 | Código, prueba y demostración de dos opciones |

Regla de evaluación: por cada reto de 2 puntos, otorgar 2 si cumple todos los criterios, 1 si funciona parcialmente y 0 si no funciona o no hay evidencia. La presentación oral verifica autoría y comprensión; errores críticos de seguridad pueden motivar observaciones y correcciones.

# Entregables

Repositorio Git con README, instrucciones de instalación y lista de cambios hechos por el equipo.

Archivo PDF breve (máximo 6 páginas) con portada, objetivo, arquitectura, pruebas y conclusiones.

Capturas de pantalla de cada mejora y de los casos de error; no incluir ADMIN_KEY, QR_SECRET ni credenciales reales.

Video o demostración en vivo (5–8 minutos) donde se cree una votación, ingresen alumnos, se vote, cierre y exporte.

Registro de tareas por integrante y referencias utilizadas.

# Plantilla mínima para registrar pruebas

| Caso | Pasos | Resultado esperado |
| --- | --- | --- |
| TC01 | Crear encuesta con dos candidatos | 201 y código generado |
| TC02 | Enviar candidato repetido | 400 y mensaje de validación |
| TC03 | Abrir votación en borrador | Estado open |
| TC04 | Votar con credencial autorizada | 201 y conteo +1 |
| TC05 | Usar misma credencial de nuevo | 409 sin conteo adicional |
| TC06 | Votar sin sesión de QR | 403 |
| TC07 | Canjear un QR caducado | 403 |
| TC08 | Cerrar y luego intentar votar | Rechazo; resultados definitivos |
| TC09 | Exportar elección cerrada | Descarga CSV legible |

# Preguntas para sustentación

¿Por qué usamos Cloudflare D1 en lugar de localStorage para una votación multiusuario?

¿Cuál es la diferencia entre un código de encuesta, un QR temporal y una credencial personal?

¿Qué garantiza UNIQUE(poll_id, participant_id) y qué no garantiza?

¿Por qué el QR rotativo no prueba por sí solo que alguien está en el aula?

¿Qué ocurre si dos solicitudes intentan votar simultáneamente con la misma credencial?

¿Cómo evitarías que resultados parciales influyan en otras personas antes del cierre?

¿Qué problemas resolvería WebSockets frente a polling y cuál sería su costo técnico?

¿Cuáles controles adicionales aplicarías antes de una elección institucional?

# Checklist de entrega del alumno

Proyecto compila y corre en local.

Se puede crear y consultar una votación desde diferentes dispositivos en producción.

Se generan credenciales distintas y la repetición no suma votos.

El QR expirado no autoriza el acceso.

El cierre impide nuevos votos y define ganador/empate.

El CSV se descarga correctamente con caracteres acentuados.

Los retos obligatorios y dos electivos están demostrados.

Se adjuntan evidencias sin revelar claves ni datos de acceso.

# Referencias técnicas oficiales

Astro: https://docs.astro.build/

Cloudflare Workers + Astro: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/

Cloudflare D1: https://developers.cloudflare.com/d1/

Wrangler: https://developers.cloudflare.com/workers/wrangler/

Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

FIN DEL MANUAL • El docente deberá verificar localmente las versiones de Astro y Wrangler antes de compartir el proyecto base con el aula.

Material didáctico para alumnos de SENATI • Astro + Cloudflare Workers + D1  •  Página