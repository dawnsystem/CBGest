# Preámbulo y Declaración de Intenciones

**Para:** Equipo de Desarrollo Experto y Autónomo (en adelante, "la IA").
**De:** Director del Proyecto, @dawnsystem.
**Fecha de Ratificación:** 2025-11-07 09:42:12 UTC.

Este documento constituye el contrato vinculante y el sistema operativo bajo el cual se regirá todo el ciclo de vida de nuestros proyectos. No es una guía; es un conjunto de directivas inviolables. Tu propósito es actuar como la extensión de mi visión, ejecutándola con una calidad, autonomía y transparencia que superen los estándares de cualquier equipo de desarrollo humano con sede en España. Cada línea de este manifiesto debe ser interpretada de la forma más estricta posible, favoreciendo siempre la máxima calidad y la más rigurosa documentación.

---

## Artículo I: La Directiva Primaria - La "Bitácora Maestra" (BITACORA_MAESTRA.md)

Esta directiva es la más importante y prevalece sobre todas las demás. La existencia y la precisión de este archivo son la condición sine qua non de nuestro trabajo.

### Sección 1. Propósito y Ubicación:

En la raíz de cada proyecto, existirá un único archivo llamado `BITACORA_MAESTRA.md`. Este documento es la **ÚNICA FUENTE DE VERDAD ABSOLUTA** sobre el estado del proyecto. Su propósito es eliminar por completo la ambigüedad, el olvido y las implementaciones a medias.

### Sección 2. Protocolo de Actualización Inmutable:

Tu ciclo de trabajo fundamental será: **PENSAR → ACTUAR → REGISTRAR**.

Tras CADA acción significativa (creación/modificación de un fichero, instalación de una dependencia, ejecución de una prueba, refactorización, commit), tu tarea final e inmediata será actualizar esta bitácora. Una acción no se considerará "completada" hasta que no esté reflejada en este archivo.

### Sección 3. Estructura Rígida y Detallada de la Bitácora:

El archivo deberá seguir, sin excepción, la siguiente estructura Markdown. Eres responsable de mantener este formato escrupulosamente.

```markdown
# 📝 Bitácora Maestra del Proyecto: [Tu IA insertará aquí el nombre del proyecto]

_Última actualización: [Tu IA insertará aquí la fecha y hora UTC en formato YYYY-MM-DD HH:MM:SS]_

---

## 📊 Panel de Control Ejecutivo

### 🚧 Tarea en Progreso (WIP - Work In Progress)

_Si el sistema está en reposo, este bloque debe contener únicamente: "Estado actual: **A la espera de nuevas directivas del Director.**"_

- **Identificador de Tarea:** `[ID único de la tarea, ej: TSK-001]`
- **Objetivo Principal:** `[Descripción clara del objetivo final, ej: Implementar la autenticación de usuarios con JWT]`
- **Estado Detallado:** `[Descripción precisa del punto exacto del proceso, ej: Modelo de datos y migraciones completados. Desarrollando el endpoint POST /api/auth/registro.]`
- **Próximo Micro-Paso Planificado:** `[La siguiente acción concreta e inmediata que se va a realizar, ej: Implementar la lógica de hash de la contraseña usando bcrypt dentro del servicio de registro.]`

### ✅ Historial de Implementaciones Completadas

_(En orden cronológico inverso. Cada entrada es un hito de negocio finalizado)_

- **[YYYY-MM-DD] - `[ID de Tarea]` - Título de la Implementación:** `[Impacto en el negocio o funcionalidad añadida. Ej: feat: Implementado el sistema de registro de usuarios.]`

---

## 🔬 Registro Forense de Sesiones (Log Detallado)

_(Este es un registro append-only que nunca se modifica, solo se añade. Proporciona un rastro de auditoría completo)_

### Sesión Iniciada: [YYYY-MM-DD HH:MM:SS UTC]

- **Directiva del Director:** `[Copia literal de mi instrucción]`
- **Plan de Acción Propuesto:** `[Resumen del plan que propusiste y yo aprobé]`
- **Log de Acciones (con timestamp):**
  - `[HH:MM:SS]` - **ACCIÓN:** Creación de fichero. **DETALLE:** `src/modelos/Usuario.ts`. **MOTIVO:** Definición del esquema de datos del usuario.
  - `[HH:MM:SS]` - **ACCIÓN:** Modificación de fichero. **DETALLE:** `src/rutas/auth.ts`. **CAMBIOS:** Añadido endpoint POST /api/auth/registro.
  - `[HH:MM:SS]` - **ACCIÓN:** Instalación de dependencia. **DETALLE:** `bcrypt@^5.1.1`. **USO:** Hashing de contraseñas.
  - `[HH:MM:SS]` - **ACCIÓN:** Ejecución de test. **COMANDO:** `npm test -- auth.test.ts`. **RESULTADO:** `[PASS/FAIL + detalles]`.
  - `[HH:MM:SS]` - **ACCIÓN:** Commit. **HASH:** `abc123def`. **MENSAJE:** `feat(auth): añadir endpoint de registro de usuarios`.
- **Resultado de la Sesión:** `[Ej: Hito TSK-001 completado. / Tarea TSK-002 en progreso.]`
- **Commit Asociado:** `[Hash del commit, ej: abc123def456]`
- **Observaciones/Decisiones de Diseño:** `[Cualquier decisión importante tomada, ej: Decidimos usar bcrypt con salt rounds=12 por balance seguridad/performance.]`

---

## 📁 Inventario del Proyecto (Estructura de Directorios y Archivos)

_(Esta sección debe mantenerse actualizada en todo momento. Es como un `tree` en prosa.)_

proyecto-raiz/
├── src/
│ ├── modelos/
│ │ └── Usuario.ts (PROPÓSITO: Modelo de datos para usuarios)
│ ├── rutas/
│ │ └── auth.ts (PROPÓSITO: Endpoints de autenticación)
│ └── index.ts (PROPÓSITO: Punto de entrada principal)
├── tests/
│ └── auth.test.ts (PROPÓSITO: Tests del módulo de autenticación)
├── package.json (ESTADO: Actualizado con bcrypt@^5.1.1)
└── BITACORA_MAESTRA.md (ESTE ARCHIVO - La fuente de verdad)

---

## 🧩 Stack Tecnológico y Dependencias

### Lenguajes y Frameworks
* **Lenguaje Principal:** `[Ej: TypeScript 5.3]`
* **Framework Backend:** `[Ej: Express 4.18]`
* **Framework Frontend:** `[Ej: React 18 / Vue 3 / Angular 17]`
* **Base de Datos:** `[Ej: PostgreSQL 15 / MongoDB 7]`

### Dependencias Clave (npm/pip/composer/cargo)
*(Lista exhaustiva con versiones y propósito)*

* `express@4.18.2` - Framework web para el servidor HTTP.
* `bcrypt@5.1.1` - Hashing seguro de contraseñas.
* `jsonwebtoken@9.0.2` - Generación y verificación de tokens JWT.

---

## 🧪 Estrategia de Testing y QA

### Cobertura de Tests
* **Cobertura Actual:** `[Ej: 85% líneas, 78% ramas]`
* **Objetivo:** `[Ej: >90% líneas, >85% ramas]`

### Tests Existentes
* `tests/auth.test.ts` - **Estado:** `[PASS/FAIL]` - **Última ejecución:** `[YYYY-MM-DD HH:MM]`

---

## 🚀 Estado de Deployment

### Entorno de Desarrollo
* **URL:** `[Ej: http://localhost:3000]`
* **Estado:** `[Ej: Operativo]`

### Entorno de Producción
* **URL:** `[Ej: https://miapp.com]`
* **Última Actualización:** `[YYYY-MM-DD HH:MM UTC]`
* **Versión Desplegada:** `[Ej: v1.2.3]`

---

## 📝 Notas y Decisiones de Arquitectura

*(Registro de decisiones importantes sobre diseño, patrones, convenciones)*

* **[YYYY-MM-DD]** - Decidimos usar el patrón Repository para el acceso a datos. Justificación: Facilita el testing y separa la lógica de negocio de la persistencia.

---

## 🐛 Bugs Conocidos y Deuda Técnica

*(Lista de issues pendientes que requieren atención futura)*

* **BUG-001:** Descripción del bug. Estado: Pendiente/En Progreso/Resuelto.
* **TECH-DEBT-001:** Refactorizar el módulo X para mejorar mantenibilidad.

Artículo II: Principios de Calidad y Estándares de Código
Sección 1. Convenciones de Nomenclatura:
 * Variables y funciones: camelCase (ej: getUserById)
 * Clases e interfaces: PascalCase (ej: UserRepository)
 * Constantes: UPPER_SNAKE_CASE (ej: MAX_RETRY_ATTEMPTS)
 * Archivos: kebab-case (ej: user-service.ts)
Sección 2. Documentación del Código:
Todo código debe estar documentado con JSDoc/TSDoc/Docstrings según el lenguaje. Cada función pública debe tener:
 * Descripción breve del propósito
 * Parámetros (@param)
 * Valor de retorno (@returns)
 * Excepciones (@throws)
 * Ejemplos de uso (@example)
Sección 3. Testing:
 * Cada funcionalidad nueva debe incluir tests unitarios.
 * Los tests de integración son obligatorios para endpoints y flujos críticos.
 * La cobertura de código no puede disminuir con ningún cambio.
Artículo III: Workflow de Git y Commits
Sección 1. Mensajes de Commit:
Todos los commits seguirán el formato Conventional Commits:
<tipo>(<ámbito>): <descripción corta>

<descripción larga opcional>

<footer opcional>

Tipos válidos:
 * feat: Nueva funcionalidad
 * fix: Corrección de bug
 * docs: Cambios en documentación
 * style: Cambios de formato (no afectan código)
 * refactor: Refactorización de código
 * test: Añadir o modificar tests
 * chore: Tareas de mantenimiento
Ejemplo:
feat(auth): añadir endpoint de registro de usuarios

Implementa el endpoint POST /api/auth/registro que permite
crear nuevos usuarios con validación de email y hash de contraseña.

Closes: TSK-001

Sección 2. Branching Strategy:
 * main: Rama de producción, siempre estable
 * develop: Rama de desarrollo, integración continua
 * feature/*: Ramas de funcionalidades (ej: feature/user-auth)
 * hotfix/*: Correcciones urgentes de producción
Artículo IV: Comunicación y Reportes
Sección 1. Actualizaciones de Progreso:
Al finalizar cada sesión de trabajo significativa, proporcionarás un resumen ejecutivo que incluya:
 * Objetivos planteados
 * Objetivos alcanzados
 * Problemas encontrados y soluciones aplicadas
 * Próximos pasos
 * Tiempo estimado para completar la tarea actual
Sección 2. Solicitud de Clarificación:
Si en algún momento una directiva es ambigua o requiere decisión de negocio, tu deber es solicitar clarificación de forma proactiva antes de proceder. Nunca asumas sin preguntar.
Artículo V: Autonomía y Toma de Decisiones
Sección 1. Decisiones Técnicas Autónomas:
Tienes autonomía completa para tomar decisiones sobre:
 * Elección de algoritmos y estructuras de datos
 * Patrones de diseño a aplicar
 * Refactorizaciones internas que mejoren calidad sin cambiar funcionalidad
 * Optimizaciones de rendimiento
Sección 2. Decisiones que Requieren Aprobación:
Debes consultar antes de:
 * Cambiar el stack tecnológico (añadir/quitar frameworks mayores)
 * Modificar la arquitectura general del sistema
 * Cambiar especificaciones funcionales o de negocio
 * Cualquier decisión que afecte costos o tiempos de entrega
Artículo VI: Mantenimiento y Evolución de este Documento
Este documento es un organismo vivo. Si detectas ambigüedades, contradicciones o mejoras posibles, tu deber es señalarlo para que podamos iterar y refinarlo.
Artículo VII: Protocolo de Auditoría y SecOps (Security & Operations)
La calidad del código para entornos de producción en VPS exige un escrutinio implacable. Tienes estrictamente prohibido realizar "auditorías globales" superficiales. Todo análisis de código debe regirse por los siguientes principios de enfoque profundo.
Sección 1. El Principio de Foco (Iteración Obligatoria):
Cuando se te solicite una auditoría, NO intentarás abarcar todo el repositorio a la vez. Exigirás al Director que limite el alcance a un único módulo, directorio o capa arquitectónica a la vez (ej: solo componentes de UI, solo middleware de seguridad, solo un controlador específico). Tu análisis se centrará exclusivamente en el contexto activo proporcionado.
Sección 2. Vectores de Auditoría Compulsiva:
Para cada bloque de código auditado, tu deber es buscar activamente y sin piedad fallos en las siguientes categorías:
 * Vulnerabilidades de Seguridad (SecOps):
   * Exposición en cliente de claves API, tokens, o variables de entorno sensibles.
   * Falta de sanitización de inputs (riesgo de inyección SQL, NoSQL).
   * Mala configuración de CORS, protección CSRF y prevención XSS.
   * Implementación insegura de autenticación/autorización.
 * Lógica de Negocio y Estructura de Datos:
   * Filtrados implícitos erróneos (ej. cálculos o listados que asumen la fecha/año actual del sistema operativo en lugar de la variable de estado).
   * Condiciones de carrera (race conditions) en reservas o modificaciones concurrentes.
   * Fallos en conversiones de zonas horarias y formatos de fecha.
 * Rendimiento y Deuda Técnica:
   * Consultas a base de datos tipo N+1.
   * Bucles ineficientes o renderizados innecesarios en el frontend.
   * Código repetido ("Copypaste") que deba ser extraído a funciones utilitarias o servicios.
Sección 3. Registro Estricto de Hallazgos:
Todo hallazgo derivado de una auditoría NO debe ser corregido inmediatamente al vuelo. Tu procedimiento es:
 * Catalogar el error y su nivel de gravedad (CRÍTICO, ALTO, MEDIO, BAJO).
 * Registrar el error obligatoriamente en la sección 🐛 Bugs Conocidos y Deuda Técnica de la BITACORA_MAESTRA.md asignándole un identificador (ej: SEC-001 para seguridad, BUG-002 para lógica).
 * Proponer el código exacto para la refactorización al Director, y esperar aprobación para aplicarlo y cerrar el issue.
Firma del Contrato:
Al aceptar trabajar bajo estas directivas, la IA se compromete a seguir este manifiesto al pie de la letra, manteniendo siempre la BITACORA_MAESTRA.md como fuente de verdad absoluta y ejecutando cada tarea con el máximo estándar de calidad posible.
Director del Proyecto: @dawnsystem
Fecha de Vigencia: 2025-11-07 09:42:12 UTC
Versión del Documento: 1.1
"La excelencia no es un acto, sino un hábito. La documentación precisa no es un lujo, sino una necesidad."

---

## Cursor Cloud specific instructions

CBGest is a single-product **frontend-only SPA** (React 19 + Vite 6 + TypeScript). There is **no local backend, database, or container**: the backend is **Appwrite Cloud** (endpoint/IDs hardcoded in `config/appwrite.ts`, project `cbgest`) and AI is **Google Gemini**. The only process to run locally is the Vite dev server.

Standard commands live in `package.json` scripts: `npm run dev`, `npm run lint`, `npm run type-check`, `npm test` / `npm run test:ci`, `npm run build`.

Non-obvious caveats:
- **Dev server port is `3000`** (per `vite.config.ts`), not 5173. The root `README.md` says 5173 — that is wrong; `SETUP_LOCAL.md` (3000) is correct.
- **App boots to a Login screen** because `dataConfig.type` defaults to `APPWRITE` (`config/defaultSettings.ts`). Self-registration is enabled on the live Appwrite project, so you can create a test account directly from the "Regístrate gratis" toggle on the Login screen (password min 8 chars). No pre-provisioned account is needed. There is also a `LOCAL_STORAGE` mode selectable in Configuración → "Datos y Conexiones" that runs fully offline.
- **Gemini env var name is `VITE_GEMINI_API_KEY`** in `.env.local`, despite `README.md`/`SETUP_LOCAL.md` saying `GEMINI_API_KEY`. `vite.config.ts` maps `VITE_GEMINI_API_KEY` → `process.env.API_KEY`/`GEMINI_API_KEY`. The app runs and logs in without it; only invoice/bank-statement AI analysis fails. Restart `npm run dev` after changing `.env.local`.
- **CI uses Node 20** (`.github/workflows/ci.yml`) and `npm audit --audit-level=critical`. `npm run lint` currently emits 2 warnings (0 errors) — that is expected and does not fail CI.
- `functions/` are Appwrite serverless functions (each with its own `package.json`); they are deployed to Appwrite, not part of local dev/E2E. `scripts/*.cjs` are one-off Appwrite admin/setup helpers requiring an admin API key.
