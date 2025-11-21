
# 📝 Bitácora Maestra del Proyecto: CBGest - Contabilidad para Comunidades de Bienes
*Última actualización: 2025-11-21 09:30:00 UTC*

---

## 📊 Panel de Control Ejecutivo

### 🚧 Tarea en Progreso (WIP)
Estado actual: **A la espera de nuevas directivas del Director.**

### ✅ Historial de Implementaciones Completadas
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
*   **Estado Actual:** ✅ 102 tests pasando
*   **Cobertura:**
    - Líneas: >80% (objetivo: 80%)
    - Funciones: >75% (objetivo: 75%)
    - Ramas: >75% (objetivo: 75%)
    - Statements: >80% (objetivo: 80%)

### Tests Implementados
*   **Utilities (utils/__tests__/):**
    - `validators.test.ts` - 22 tests de validación de NIFs (DNI, NIE, CIF)
    - `crypto.test.ts` - 16 tests de cifrado/descifrado AES-GCM
    - `accountingPlan.test.ts` - 24 tests del Plan General Contable

*   **Services (services/__tests__/):**
    - `appwriteService.test.ts` - 12 tests del servicio de Appwrite (auth, DB)
    - `geminiService.test.ts` - 28 tests del servicio de IA (análisis facturas y extractos bancarios)

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
