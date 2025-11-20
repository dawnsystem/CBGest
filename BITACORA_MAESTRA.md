
# 📝 Bitácora Maestra del Proyecto: GestCB - Contabilidad para Comunidades de Bienes
*Última actualización: 2025-11-19 05:30:00 UTC*

---

## 📊 Panel de Control Ejecutivo

### 🚧 Tarea en Progreso (WIP)
*   **Identificador de Tarea:** TSK-036
*   **Objetivo Principal:** Validación estricta de NIF, normalización de datos por IA y corrección de generación de asientos.
*   **Estado Detallado:** 
    - Actualizado prompt de Gemini para limpiar NIFs (eliminar guiones, espacios).
    - Implementado bloqueo de UI en InvoiceUploader para NIFs inválidos con opción de override manual.
    - Reforzada la función `createEntryFromInvoice` para asegurar la creación del asiento y la persistencia del adjunto.
*   **Próximo Micro-Paso Planificado:** Pruebas de integración de flujo completo.

### ✅ Historial de Implementaciones Completadas
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
