
# 📝 Bitácora Maestra del Proyecto: CBGest - Contabilidad para Comunidades de Bienes
*Última actualización: 2026-07-07 21:02:52 UTC*

---

## 📊 Panel de Control Ejecutivo

### 🚧 Tarea en Progreso (WIP)

- **Identificador de Tarea:** `AUDIT-PLAN-001`
- **Objetivo Principal:** `Mapear la arquitectura actual y dividir la auditoría en sprints de foco estrecho según el Artículo VII.`
- **Estado Detallado:** `Escaneo arquitectónico completado sobre la raíz del proyecto, dependencias y módulos principales. Checklist estratégico preparado en bitácora; pendiente aprobación del Director para ejecutar AUDIT-001.`
- **Próximo Micro-Paso Planificado:** `Esperar visto bueno del Director y lanzar el sprint AUDIT-001 sobre seguridad, entorno y superficie de integración externa.`

## 📋 Plan Estratégico de Auditoría

- [ ] **AUDIT-001: Seguridad, entorno y superficie de integración externa** — Alcance exacto: `/home/runner/work/CBGest/CBGest/package.json`, `/home/runner/work/CBGest/CBGest/App.tsx`, `/home/runner/work/CBGest/CBGest/config/appwrite.ts`, `/home/runner/work/CBGest/CBGest/lib/appwrite/client.ts`, `/home/runner/work/CBGest/CBGest/lib/appwrite/index.ts`, `/home/runner/work/CBGest/CBGest/services/authService.ts`, `/home/runner/work/CBGest/CBGest/services/geminiService.ts`.
- [ ] **AUDIT-002: Capa Appwrite, persistencia protegida y control de tasa** — Alcance exacto: `/home/runner/work/CBGest/CBGest/lib/appwrite/cache.ts`, `/home/runner/work/CBGest/CBGest/lib/appwrite/offlineQueue.ts`, `/home/runner/work/CBGest/CBGest/lib/appwrite/protectedDatabase.ts`, `/home/runner/work/CBGest/CBGest/lib/appwrite/rateLimiter.ts`, `/home/runner/work/CBGest/CBGest/services/appwriteService.ts`.
- [ ] **AUDIT-003: Contextos globales y orquestación de estado de sesión/datos** — Alcance exacto: `/home/runner/work/CBGest/CBGest/context/AuthContext.tsx`, `/home/runner/work/CBGest/CBGest/context/NotificationContext.tsx`, `/home/runner/work/CBGest/CBGest/context/UploadQueueContext.tsx`, `/home/runner/work/CBGest/CBGest/hooks/useAppwriteData.ts`, `/home/runner/work/CBGest/CBGest/hooks/useDataHandlers.ts`, `/home/runner/work/CBGest/CBGest/hooks/useInvoices.ts`, `/home/runner/work/CBGest/CBGest/hooks/useSuppliers.ts`.
- [ ] **AUDIT-004: Núcleo contable, validación y libros** — Alcance exacto: `/home/runner/work/CBGest/CBGest/components/AccountLedger.tsx`, `/home/runner/work/CBGest/CBGest/components/AccountSelector.tsx`, `/home/runner/work/CBGest/CBGest/components/AccountingBooks.tsx`, `/home/runner/work/CBGest/CBGest/components/TrialBalance.tsx`, `/home/runner/work/CBGest/CBGest/components/TaxModels.tsx`, `/home/runner/work/CBGest/CBGest/utils/accountingPlan.ts`, `/home/runner/work/CBGest/CBGest/utils/validators.ts`, `/home/runner/work/CBGest/CBGest/utils/defaults.ts`.
- [ ] **AUDIT-005: Reservas, apartamentos, rentabilidad y fechas** — Alcance exacto: `/home/runner/work/CBGest/CBGest/components/ReservationManager.tsx`, `/home/runner/work/CBGest/CBGest/components/ApartmentManager.tsx`, `/home/runner/work/CBGest/CBGest/components/ApartmentSelector.tsx`, `/home/runner/work/CBGest/CBGest/components/Dashboard.tsx`, `/home/runner/work/CBGest/CBGest/components/ProfitabilityByApartment.tsx`, `/home/runner/work/CBGest/CBGest/components/ExpensesByApartment.tsx`, `/home/runner/work/CBGest/CBGest/components/ExpenseProjections.tsx`, `/home/runner/work/CBGest/CBGest/components/TouristTaxPanel.tsx`.
- [ ] **AUDIT-006: Ingesta documental, adjuntos y pipeline IA** — Alcance exacto: `/home/runner/work/CBGest/CBGest/components/InvoiceUploader.tsx`, `/home/runner/work/CBGest/CBGest/components/GlobalUploadWidget.tsx`, `/home/runner/work/CBGest/CBGest/components/DocumentViewer.tsx`, `/home/runner/work/CBGest/CBGest/components/XlsxColumnMapper.tsx`, `/home/runner/work/CBGest/CBGest/services/xlsxMappingService.ts`, `/home/runner/work/CBGest/CBGest/utils/fileHelpers.ts`, `/home/runner/work/CBGest/CBGest/utils/pdfLoader.ts`, `/home/runner/work/CBGest/CBGest/utils/aiMatching.ts`, `/home/runner/work/CBGest/CBGest/utils/crypto.ts`, `/home/runner/work/CBGest/CBGest/types/gemini.ts`.
- [ ] **AUDIT-007: Tesorería, conciliación, proveedores y recurrencia** — Alcance exacto: `/home/runner/work/CBGest/CBGest/components/BankReconciliation.tsx`, `/home/runner/work/CBGest/CBGest/components/Suppliers.tsx`, `/home/runner/work/CBGest/CBGest/components/RecurringExpenseManager.tsx`, `/home/runner/work/CBGest/CBGest/components/PartnerTaxForm.tsx`, `/home/runner/work/CBGest/CBGest/hooks/useBankTransactions.ts`, `/home/runner/work/CBGest/CBGest/services/pdfService.ts`.
- [ ] **AUDIT-008: Shell UI, navegación, autenticación visible y feedback al usuario** — Alcance exacto: `/home/runner/work/CBGest/CBGest/components/Header.tsx`, `/home/runner/work/CBGest/CBGest/components/Sidebar.tsx`, `/home/runner/work/CBGest/CBGest/components/MobileNavigation.tsx`, `/home/runner/work/CBGest/CBGest/components/SearchResults.tsx`, `/home/runner/work/CBGest/CBGest/components/ConnectionStatus.tsx`, `/home/runner/work/CBGest/CBGest/components/Login.tsx`, `/home/runner/work/CBGest/CBGest/components/AuthModal.tsx`, `/home/runner/work/CBGest/CBGest/components/Toast.tsx`, `/home/runner/work/CBGest/CBGest/components/ChartWrapper.tsx`.
- [ ] **AUDIT-009: Observabilidad, mensajes de error y utilidades transversales** — Alcance exacto: `/home/runner/work/CBGest/CBGest/services/logger.ts`, `/home/runner/work/CBGest/CBGest/lib/logger.ts`, `/home/runner/work/CBGest/CBGest/lib/errorMessages.ts`, `/home/runner/work/CBGest/CBGest/hooks/index.ts`, `/home/runner/work/CBGest/CBGest/utils/stateStorage.ts`.
- [ ] **AUDIT-010: Automatizaciones Appwrite/cron y funciones auxiliares** — Alcance exacto: `/home/runner/work/CBGest/CBGest/functions/auto-reconcile/README.md`, `/home/runner/work/CBGest/CBGest/functions/backup-data/README.md`, `/home/runner/work/CBGest/CBGest/functions/calculate-profitability/README.md`, `/home/runner/work/CBGest/CBGest/functions/cleanup-uploads/README.md`, `/home/runner/work/CBGest/CBGest/functions/detect-recurring/README.md`, `/home/runner/work/CBGest/CBGest/functions/maintenance/README.md`, `/home/runner/work/CBGest/CBGest/functions/prepare-modelo-184/README.md`, `/home/runner/work/CBGest/CBGest/functions/weekly-summary/README.md`.
- [ ] **AUDIT-011: CI/CD, scripts operativos y cadena de suministro** — Alcance exacto: `/home/runner/work/CBGest/CBGest/.github/workflows/ci.yml`, `/home/runner/work/CBGest/CBGest/.github/workflows/security.yml`, `/home/runner/work/CBGest/CBGest/scripts/README.md`, `/home/runner/work/CBGest/CBGest/scripts/add-missing-attributes.cjs`, `/home/runner/work/CBGest/CBGest/scripts/migrate-uploads-collection.cjs`, `/home/runner/work/CBGest/CBGest/scripts/setup-all-collections.cjs`, `/home/runner/work/CBGest/CBGest/scripts/setup-appwrite-collections.js`, `/home/runner/work/CBGest/CBGest/scripts/verify-appwrite-fetch.cjs`, `/home/runner/work/CBGest/CBGest/scripts/verify-appwrite-setup.cjs`, `/home/runner/work/CBGest/CBGest/scripts/verify-appwrite.sh`, `/home/runner/work/CBGest/CBGest/package-lock.json`.

### ✅ Historial de Implementaciones Completadas
*   **[2026-07-06] - `TSK-042` - Consolidación Integral Fase 2:** Hardening de auth, sistema Toast, sanitización de logs, cobertura a 152 tests.
*   **[2026-07-06] - `TSK-041` - Toast Migration:** Sustitución de `alert()` y `window.confirm()` por `useToast()`/`showConfirm()` en componentes críticos y verificación de tipado satisfactoria.
*   **[2026-07-06] - `TSK-040` - Consolidación Integral Fase 1:** Endurecimiento de CI/CD, búsqueda global operativa, acción real de borrador PDF en dashboard, utilidades compartidas de estado y ampliación de cobertura a 139 tests.
*   **[2025-11-21] - `FIX-038` - CI/CD Pipeline Corrections:** Corrección de workflows de GitHub Actions, mocks completos de APIs del navegador para tests, fix crítico de sintaxis en AuthModal.tsx, documentación de configuración GitHub.
*   **[2025-11-21] - `TSK-037` - Testing & CI/CD Infrastructure:** Sistema completo de testing unitario con Vitest, workflows de GitHub Actions para CI/CD y seguridad, ESLint configurado, 102 tests implementados con >80% coverage.
*   **[2025-11-19] - `TSK-036` - Data Integrity:** NIF Cleaning & Strict Validation + Accounting Logic Fix.
*   **[2025-11-19] - `TSK-035` - Ledger UX:** Autocomplete de cuentas y visor de adjuntos en asientos.
*   **[2025-11-19] - `FIX-034` - Appwrite Singleton:** Preservación de sesión entre reconfiguraciones.
*   **[2025-11-19] - `FIX-033` - Rate Limit Handling:** Detección de error 429.
*   **[2025-11-19] - `FIX-032` - Login Strategy:** Estrategia "Check-First" para evitar conflictos de sesión.
*   **[2025-11-19] - `FIX-031` - UI Resilience:** Protección contra crashes por `undefined.map`.
*   **[2025-11-19] - `TSK-030` - Critical Bug Fixes:** Resolución de "Cannot read properties of undefined" y "Route not found".
*   **[2025-11-19] - `FIX-029` - Data Guardrails:** Corrección de crashes por arrays indefinidos.
*   **[2025-11-19] - `FIX-028` - Config Migration:** Saneamiento de configuración heredada.
*   **[2025-11-19] - `FIX-027` - Auth Resilience:** Manejo de sesiones zombis.
*   **[2025-11-19] - `FIX-026` - Core Stability:** Manejo robusto de errores Appwrite.
*   **[2025-11-19] - `TSK-025` - Quality Assurance:** Auditoría completa.
*   **[2025-11-18] - `TSK-024` - Full Stack Integration:** Auth, Functions, Realtime.
*   **[2025-11-18] - `TSK-023` - Appwrite Database:** Arquitectura de colecciones.
*   **[2025-11-18] - `TSK-021` - IRPF Widget:** Simulador fiscal.
*   **[2025-11-18] - `TSK-020` - Real-Time Dashboard:** Datos reales.
*   **[2025-11-18] - `TSK-019` - Smart Accounting:** Plan Contable.
*   **[2025-11-18] - `TSK-018` - Data Integrity:** Serialización de adjuntos.
*   **[2025-11-18] - `TSK-017` - UX Data Source:** Mejoras visuales.
*   **[2025-11-18] - `FIX-016` - File System Safety:** Manejo errores iframe.
*   **[2025-11-18] - `TSK-015` - Local File Mode:** Cifrado AES-GCM.
*   **[2025-11-18] - `TSK-014` - Persistencia:** LocalStorage.

---

## 🔬 Registro Forense de Sesiones
### Sesión: [2026-07-07 21:02:52 UTC]
*   **Directiva del Director:** "[Directiva Ejecutiva: Planificación de Auditoría - Fase 1] ... AÚN NO BUSQUES NI CORRIJAS ERRORES. Tu única tarea en esta interacción es mapear la arquitectura del código y crear el plan de batalla..."
*   **Plan de Acción:** Escaneo rápido de arquitectura, dependencias y manifiesto; división táctica en módulos aislados; registro del checklist en la bitácora; espera de aprobación para ejecutar AUDIT-001.
*   **Log de Acciones:**
    - `[21:02:52]` - **AUDIT:** Escaneo arquitectónico de la raíz del proyecto, `package.json`, `agents.md` y directorios principales (`components/`, `services/`, `lib/`, `context/`, `hooks/`, `utils/`, `config/`, `functions/`, `.github/workflows/`, `scripts/`).
    - `[21:02:52]` - **DOC:** Añadida la sección `## 📋 Plan Estratégico de Auditoría` en `BITACORA_MAESTRA.md` con 11 sprints de auditoría y alcance exacto por archivo/carpeta.
*   **Resultado:** AUDIT-PLAN-001 preparado. Pendiente visto bueno del Director para arrancar `AUDIT-001`.
*   **Commit Asociado:** `HEAD`
*   **Observaciones/Decisiones de Diseño:** Se aplica estrictamente el Principio de Foco del Artículo VII; ningún sprint mezcla capas no relacionadas y en esta fase no se han buscado ni corregido hallazgos.

### Sesión: [2026-07-06 16:57:00 UTC]
*   **Directiva del Director:** Implementar plan de consolidación integral — arreglar todas las partes pendientes del proyecto.
*   **Plan de Acción:** 4 fases: A) Auth crítico, B) UX/alert→toast, C) Calidad/seguridad, D) Documentación.
*   **Log de Acciones:**
    - `[16:57:00]` - **AUDIT:** Baseline ejecutada (0 errores lint, type-check OK, 142/142 tests, build OK).
    - `[17:00:00]` - **FIX:** `services/authService.ts`. `handleUnauthorizedError()` ya no expira sesión por errores transitorios (solo 401 confirmado). `getCurrentUser()` propaga errores de red. Emails eliminados de logs.
    - `[17:02:00]` - **FIX:** `lib/appwrite/protectedDatabase.ts`. Añadida invalidación de caché en `updateNotification()` y `updateUploadItem()`.
    - `[17:03:00]` - **MOD:** `context/AuthContext.tsx`. Sustituidos 18 `console.log/warn/error` por `authLogger` estructurado.
    - `[17:04:00]` - **FIX:** `lib/logger.ts`. `MIN_LOG_LEVEL` ahora es producción-aware (WARN en prod, DEBUG en dev).
    - `[17:06:00]` - **CREATE:** `components/Toast.tsx`. Sistema completo de notificaciones toast (showToast + showConfirm).
    - `[17:08:00]` - **MOD:** 11 componentes + App.tsx. Eliminados 22 `alert()` y 10 `window.confirm()`, reemplazados por Toast.
    - `[17:10:00]` - **FIX:** `utils/validators.ts`, `utils/crypto.ts`, `utils/aiMatching.ts`. Corregidos warnings ESLint (unused vars, prefer-const).
    - `[17:12:00]` - **CREATE:** `components/__tests__/Toast.test.tsx` (8 tests). Ampliados tests de `authService.test.ts` (+2 tests).
    - `[17:13:00]` - **TEST:** `npm run type-check && npm run test:ci && npm run build`. **RESULTADO:** 152/152 tests PASS, type-check OK, build OK.
    - `[17:15:00]` - **DOC:** Actualizada BITACORA_MAESTRA.md con resumen completo.
*   **Resultado:** TSK-042 completada. Proyecto en estado sólido.
*   **Commit Asociado:** `HEAD`
*   **Observaciones/Decisiones de Diseño:** Se priorizan correcciones de bugs reales (auth, caché) sobre cosmética. El sistema Toast se diseña como lightweight inline — no requiere librerías externas. Los 505 warnings de ESLint existentes son mayoritariamente `@typescript-eslint/no-explicit-any` — se mantiene deuda para fase posterior.

### Sesión: [2026-07-06 17:08:00 UTC]
*   **Directiva del Director:** Reemplazar todos los `alert()` y `window.confirm()` indicados por `showToast()` y `showConfirm()` en los ficheros especificados, sin alterar otra lógica.
*   **Plan de Acción:** Verificar baseline de tipos, localizar cada llamada objetivo, inyectar `useToast` en cada componente, adaptar handlers asíncronos para confirmaciones y revalidar con `npm run type-check`.
*   **Log de Acciones:**
    - `[17:08:00]` - **TEST:** `npm run type-check`. **RESULTADO:** PASS sobre baseline antes de cambios.
    - `[17:12:00]` - **MOD:** `components/Suppliers.tsx`, `components/Settings.tsx`, `components/InvoiceUploader.tsx`, `components/AccountingBooks.tsx`, `components/ApartmentManager.tsx`. **CAMBIOS:** Importado `useToast`, añadidos hooks y migrados `alert()/confirm()` a toasts y confirmaciones asíncronas.
    - `[17:15:00]` - **MOD:** `components/RecurringExpenseManager.tsx`, `components/TaxModels.tsx`, `components/AppwriteConfig.tsx`, `components/Dashboard.tsx`, `components/ReservationManager.tsx`, `App.tsx`. **CAMBIOS:** Sustitución completa restante de mensajes bloqueantes y adaptación de callbacks `async` donde era necesario.
    - `[17:17:00]` - **TEST:** `npm run type-check`. **RESULTADO:** PASS.
*   **Resultado:** TSK-041 completada.
*   **Commit Asociado:** `HEAD`
*   **Observaciones/Decisiones de Diseño:** Se preservaron literalmente todos los mensajes existentes y solo se ajustaron imports, hooks y asincronía mínima para soportar `showConfirm()`.

### Sesión: [2026-07-06 15:39:00 UTC]
*   **Directiva del Director:** Implementar la fase de consolidación seria del proyecto siguiendo el plan de baseline, CI/CD, arquitectura, tipado, testing, UX, observabilidad y documentación.
*   **Plan de Acción:** Ejecutar baseline real, corregir inconsistencias visibles, extraer utilidades compartidas, reforzar workflows y cerrar validación completa.
*   **Log de Acciones:**
    - `[15:39:00]` - **TEST:** `npm run lint && npm run type-check && npm run test:ci && npm run build`. **RESULTADO:** Baseline detectó cobertura insuficiente y deuda de warnings existente.
    - `[15:43:00]` - **CREATE:** `config/defaultSettings.ts`, `utils/stateStorage.ts`. **MOTIVO:** Centralizar defaults y carga persistida para reducir acoplamiento en `App.tsx` y hooks.
    - `[15:46:00]` - **MOD:** `App.tsx`, `hooks/useAppwriteData.ts`. **CAMBIOS:** Reutilización de utilidades compartidas para configuración y estado local.
    - `[15:48:00]` - **CREATE/MOD:** `components/SearchResults.tsx`, `components/Header.tsx`, `components/Dashboard.tsx`. **CAMBIOS:** Búsqueda global funcional y descarga real de borrador PDF para partícipes.
    - `[15:50:00]` - **MOD:** `services/authService.ts`, `lib/appwrite/client.ts`. **CAMBIOS:** Sustitución parcial de `console.log` por logger estructurado.
    - `[15:52:00]` - **MOD:** `.github/workflows/ci.yml`, `.github/workflows/security.yml`. **CAMBIOS:** Checks de CI/CD y seguridad más estrictos y coherentes.
    - `[15:55:00]` - **CREATE:** `services/__tests__/authService.test.ts`, `services/__tests__/pdfService.test.ts`, `utils/__tests__/stateStorage.test.ts`. **MOTIVO:** Aumentar cobertura útil en flujos críticos.
    - `[15:56:00]` - **MOD:** `vitest.config.ts`, `TESTING.md`. **CAMBIOS:** Alineación de umbrales de cobertura y ampliación de suite hasta superar los mínimos verificados.
    - `[15:57:00]` - **TEST:** `npm run type-check`, `npm run test:ci`, `npm run build`. **RESULTADO:** 139 tests PASS, build PASS, type-check PASS.
*   **Resultado:** TSK-040 completada.
*   **Commit Asociado:** `HEAD`
*   **Observaciones/Decisiones de Diseño:** Se mantiene deuda histórica de warnings de ESLint fuera del alcance de esta fase; el refuerzo aplicado prioriza estabilidad verificable, cobertura real y cierre de UX visible.

### Sesión Actual: [2025-11-19 05:30:00 UTC]
*   **Directiva del Director:** Arreglar validación NIF (visual y bloqueo), mejorar limpieza IA y asegurar creación de asientos.
*   **Log de Acciones:**
    - `[05:30:00]` - **MOD:** `services/geminiService.ts`. Prompt engineering para limpieza de strings (regex replacement instruction).
    - `[05:35:00]` - **MOD:** `components/InvoiceUploader.tsx`. Añadido estado `forceAccept`. Bloqueo condicional del botón "Contabilizar". Feedback visual rojo.
    - `[05:40:00]` - **MOD:** `App.tsx`. Refactorización de `createEntryFromInvoice` para robustez en parsing de categorías y paso de adjuntos.

---

## 🧪 Estrategia de Testing y QA

### Stack Tecnológico de Testing
*   **Test Runner:** Vitest 4.0.12 - Framework de testing compatible con Vite
*   **Testing Library:** @testing-library/react 16.3.0 - Testing de componentes React
*   **Coverage:** @vitest/coverage-v8 - Análisis de cobertura de código
*   **Linting:** ESLint 9.39.1 + TypeScript ESLint 8.47.0

### Cobertura de Tests
*   **Estado Actual:** ✅ 152 tests pasando
*   **Cobertura:**
    - Líneas: ~45% (objetivo: 40%)
    - Funciones: ~31% (objetivo: 25%)
    - Ramas: ~31% (objetivo: 30%)
    - Statements: ~43% (objetivo: 40%)

### Tests Implementados
*   **Utilities (utils/__tests__/):**
    - `validators.test.ts` - 22 tests de validación de NIFs (DNI, NIE, CIF)
    - `crypto.test.ts` - 16 tests de cifrado/descifrado AES-GCM
    - `accountingPlan.test.ts` - 24 tests del Plan General Contable

*   **Services (services/__tests__/):**
    - `appwriteService.test.ts` - 12 tests del servicio de Appwrite (auth, DB)
    - `authService.test.ts` - cobertura directa del servicio de autenticación y callbacks
    - `geminiService.test.ts` - 28 tests del servicio de IA (análisis facturas y extractos bancarios)
    - `pdfService.test.ts` - validación de cálculo fiscal y generación/descarga de PDFs
*   **State & Storage (utils/__tests__/):**
    - `stateStorage.test.ts` - merge profundo y recuperación segura desde LocalStorage

*   **Mocks (__mocks__/):**
    - `appwrite.ts` - Mock completo del SDK de Appwrite
    - `@google/genai.ts` - Mock del SDK de Google Gemini

### CI/CD con GitHub Actions

#### Workflow Principal (.github/workflows/ci.yml)
*   **Trigger:** Push y PR a main, develop y ramas claude/**
*   **Jobs:**
    1. **Lint:** ESLint + Type checking (TypeScript)
    2. **Test:** Ejecución de tests con coverage
    3. **Build:** Build de producción
    4. **Status Check:** Verificación de que todos los jobs pasaron

#### Workflow de Seguridad (.github/workflows/security.yml)
*   **Trigger:** Push, PRs y semanal (lunes 9:00 UTC)
*   **Jobs:**
    1. **Dependency Audit:** npm audit (nivel moderate)
    2. **Secret Scanning:** Detección de secrets hardcodeados
    3. **CodeQL Analysis:** Análisis estático de seguridad
    4. **Dependency Review:** Revisión de nuevas dependencias en PRs

### Scripts de Testing Disponibles
*   `npm test` - Ejecutar tests en modo watch
*   `npm run test:ci` - Ejecutar tests con coverage (para CI)
*   `npm run test:ui` - UI interactiva de Vitest
*   `npm run test:coverage` - Generar reporte de coverage
*   `npm run lint` - Ejecutar ESLint
*   `npm run lint:fix` - Auto-fix de errores de ESLint
*   `npm run type-check` - Verificación de tipos TypeScript

### Protección de Ramas
*   **Rama main:** 
    - ✅ Requiere status checks (lint, test, build)
    - ✅ Requiere reviews de PRs
    - ✅ Requiere rama actualizada antes de merge
    - ✅ No permite force push

### Próximas Mejoras en Testing
*   [ ] Tests de integración para componentes React críticos
*   [ ] Tests E2E con Playwright
*   [ ] Pre-commit hooks con Husky
*   [ ] Cobertura de tests >90%

### Documentación
*   **TESTING.md** - Guía completa de testing con ejemplos y mejores prácticas

### Sesión: [2025-11-21 10:10:00 UTC]
*   **Directiva del Director:** Corrección integral del pipeline CI/CD - resolver lógica de workflows, añadir mocks de APIs del navegador, corregir sintaxis JSX.
*   **Plan de Acción:** Ejecutar plan de 3 fases (Workflows → Código TS/React → Verificación).
*   **Log de Acciones:**
    - `[10:00:00]` - **MOD:** `.github/workflows/ci.yml`. Añadido logging detallado al status-check job con estado de cada job individual.
    - `[10:02:00]` - **MOD:** `.github/workflows/security.yml`. Comentado job dependency-review (requiere Dependency Graph), añadida documentación de configuración.
    - `[10:05:00]` - **FIX:** `components/AuthModal.tsx:2`. Corregido error crítico de sintaxis en import de lucide-react (`<parameter name=` → `import {`).
    - `[10:10:00]` - **MOD:** `vitest.setup.ts`. Añadidos mocks completos de APIs del navegador:
        * File, FileReader, Blob APIs
        * atob, btoa (base64 encoding)
        * TextEncoder, TextDecoder
        * setInterval, clearInterval fallbacks
        * Variable de entorno API_KEY para geminiService.ts
    - `[10:15:00]` - **CREATE:** `GITHUB_SETUP.md`. Documentación completa de configuración de GitHub (Dependency Graph, Branch Protection, Codecov, Troubleshooting).
    - `[10:20:00]` - **TEST:** Verificación local - 102/102 tests passing. Mocks funcionando correctamente, no más errores "X is not defined".
*   **Resultado:** FIX-038 completado. Pipeline CI/CD corregido, tests pasando sin errores de variables globales.
*   **Commit Asociado:** `5efa08c` - fix(ci): correct workflow logic and add browser API mocks for tests
*   **Observaciones:** Errores TypeScript pre-existentes en App.tsx, Login.tsx, appwriteService.ts (conversiones de tipos) no bloquean CI/CD. Fuera del alcance de este fix. Dependency Graph debe ser habilitado manualmente en GitHub settings.

---

## 📋 Backlog Consolidado (Fuente Única de Pendientes)

### 🔴 Pendientes que requieren acceso manual al servidor
- [ ] Verificar permisos de colección `suppliers` en Appwrite Console (Panel → Database → Collection → Settings → Permissions)
- [ ] Configurar Dependency Graph en GitHub (Settings → Code security → Enable)

### 🟡 Mejoras funcionales (cuando se necesiten)
- [ ] Generación real de PDFs fiscales (Modelo 303, 184, certificados IRPF)
- [ ] Exportación del Libro Diario a Excel
- [ ] Soporte para extractos de más bancos (Santander, CaixaBank)
- [ ] Gráfico de tesorería acumulada

### 🟢 Calidad técnica (no urgente)
- [ ] Reducir warnings ESLint restantes (~500, mayoría `no-explicit-any`)
- [ ] Tests de integración para componentes React críticos
- [ ] Code splitting para chunks >500KB
- [ ] Pre-commit hooks con Husky

### ⚪ Descartados / No aplicables para uso privado
- ~~Multi-usuario / Multi-tenant~~ (uso privado en VPS)
- ~~i18n / Multi-idioma~~ (solo español)
- ~~Notificaciones push PWA~~ (acceso directo al VPS)
- ~~Integración APIs Booking/Airbnb~~ (se usa NoBeds CSV)
