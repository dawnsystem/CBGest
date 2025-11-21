# 🧪 Testing Guide - CBGest

Este documento describe la estrategia de testing, convenciones y cómo ejecutar los tests del proyecto CBGest.

## 📋 Tabla de Contenidos

- [Stack de Testing](#stack-de-testing)
- [Estructura de Tests](#estructura-de-tests)
- [Ejecutar Tests](#ejecutar-tests)
- [Escribir Tests](#escribir-tests)
- [Coverage](#coverage)
- [Mocks](#mocks)
- [CI/CD](#cicd)
- [Mejores Prácticas](#mejores-prácticas)

---

## 🛠️ Stack de Testing

- **Test Runner**: [Vitest](https://vitest.dev/) - Fast, modern test runner compatible con Vite
- **Testing Library**: [@testing-library/react](https://testing-library.com/react) - Para tests de componentes
- **Coverage**: [Vitest Coverage (v8)](https://vitest.dev/guide/coverage.html) - Análisis de cobertura de código
- **Mocking**: Vitest native mocks + custom mocks para Appwrite y Gemini

---

## 📁 Estructura de Tests

```
CBGest/
├── utils/
│   ├── __tests__/
│   │   ├── validators.test.ts        # Tests de validación de NIFs
│   │   ├── crypto.test.ts            # Tests de cifrado AES-GCM
│   │   └── accountingPlan.test.ts    # Tests del plan contable
│   ├── validators.ts
│   ├── crypto.ts
│   └── accountingPlan.ts
├── services/
│   ├── __tests__/
│   │   ├── appwriteService.test.ts   # Tests del servicio de Appwrite
│   │   └── geminiService.test.ts     # Tests del servicio de IA
│   ├── appwriteService.ts
│   └── geminiService.ts
├── __mocks__/
│   ├── appwrite.ts                   # Mock del SDK de Appwrite
│   └── @google/
│       └── genai.ts                  # Mock del SDK de Google Gemini
├── vitest.config.ts                  # Configuración de Vitest
└── vitest.setup.ts                   # Setup global de tests
```

### Convención de Nombres

- Archivos de test: `*.test.ts` o `*.test.tsx`
- Directorio de tests: `__tests__/` junto al código que testean
- Archivos de mock: `__mocks__/` en la raíz del proyecto

---

## 🚀 Ejecutar Tests

### Comandos Disponibles

```bash
# Ejecutar todos los tests en modo watch
npm test

# Ejecutar tests una sola vez (CI mode)
npm run test:ci

# Ejecutar tests con UI interactiva
npm run test:ui

# Ejecutar tests con coverage
npm run test:coverage

# Ejecutar tests en modo watch
npm run test:watch
```

### Ejecutar Tests Específicos

```bash
# Solo tests de validators
npx vitest utils/__tests__/validators.test.ts

# Solo tests que coincidan con un patrón
npx vitest --grep "NIF"

# Tests de un directorio específico
npx vitest utils/
```

---

## ✍️ Escribir Tests

### Estructura Básica de un Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { myFunction } from '../myModule';

describe('myModule', () => {
  beforeEach(() => {
    // Setup que se ejecuta antes de cada test
    vi.clearAllMocks();
  });

  describe('myFunction', () => {
    it('should do something specific', () => {
      const result = myFunction('input');

      expect(result).toBe('expected output');
    });

    it('should handle edge cases', () => {
      expect(myFunction('')).toBe('');
      expect(myFunction(null)).toThrow();
    });
  });
});
```

### Tests de Utilidades (Funciones Puras)

```typescript
// utils/__tests__/validators.test.ts
import { describe, it, expect } from 'vitest';
import { isValidNIF } from '../validators';

describe('isValidNIF', () => {
  it('should validate correct DNI', () => {
    expect(isValidNIF('12345678Z')).toBe(true);
  });

  it('should reject invalid DNI', () => {
    expect(isValidNIF('12345678A')).toBe(false);
  });
});
```

### Tests de Servicios (Con Mocks)

```typescript
// services/__tests__/appwriteService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authService } from '../appwriteService';

// Mock automático del módulo
vi.mock('appwrite');

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should login user successfully', async () => {
    const user = await authService.login('test@example.com', 'password');

    expect(user).toBeDefined();
    expect(user).toHaveProperty('$id');
  });
});
```

### Tests de Componentes React

```typescript
// components/__tests__/MyComponent.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent title="Test" />);

    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

---

## 📊 Coverage

### Objetivos de Coverage

El proyecto tiene configurados los siguientes umbrales mínimos en `vitest.config.ts`:

- **Líneas**: 80%
- **Funciones**: 75%
- **Ramas**: 75%
- **Statements**: 80%

### Ver Reporte de Coverage

```bash
# Generar y ver coverage en la terminal
npm run test:coverage

# Generar reporte HTML interactivo
npm run test:coverage
# Luego abrir: coverage/index.html
```

### Archivos Excluidos del Coverage

Los siguientes archivos/directorios están excluidos del análisis de coverage:

- `node_modules/`
- `vitest.setup.ts`
- `vitest.config.ts`
- `vite.config.ts`
- `**/*.d.ts`
- `**/__mocks__/**`
- `**/dist/**`
- `index.tsx`

---

## 🎭 Mocks

### Mocks Globales

El archivo `vitest.setup.ts` configura mocks globales disponibles en todos los tests:

- `localStorage`
- `sessionStorage`
- `window.matchMedia`
- `IntersectionObserver`
- `ResizeObserver`

### Mocks de Módulos

#### Appwrite SDK

```typescript
// __mocks__/appwrite.ts
import { vi } from 'vitest';

export class Account {
  get = vi.fn().mockResolvedValue({ $id: 'user123' });
  createEmailPasswordSession = vi.fn();
  // ...
}
```

Uso en tests:

```typescript
import { Account } from 'appwrite';

vi.mock('appwrite');

// El mock se aplica automáticamente
const account = new Account(client);
await account.get(); // Usa el mock
```

#### Google Gemini AI

```typescript
// __mocks__/@google/genai.ts
export class GoogleGenAI {
  models = {
    generateContent: vi.fn().mockResolvedValue({
      text: JSON.stringify({ /* mock response */ })
    })
  };
}
```

---

## 🔄 CI/CD

### GitHub Actions

El proyecto tiene dos workflows principales:

#### 1. CI/CD Pipeline (`.github/workflows/ci.yml`)

Se ejecuta en cada push y pull request:

1. **Lint**: ESLint + Type checking
2. **Test**: Tests con coverage
3. **Build**: Build de producción
4. **Status Check**: Verifica que todo pasó correctamente

#### 2. Security Audit (`.github/workflows/security.yml`)

Se ejecuta en push, PRs y semanalmente:

1. **Dependency Audit**: `npm audit`
2. **Secret Scanning**: Busca secrets hardcodeados
3. **CodeQL Analysis**: Análisis de seguridad del código
4. **Dependency Review**: Revisa nuevas dependencias en PRs

### Branch Protection

Para configurar protección de ramas en GitHub:

1. Ve a **Settings** → **Branches**
2. Añade regla para `main`:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Status checks required: `lint`, `test`, `build`
   - ✅ Require pull request reviews before merging (1 review)

---

## ✅ Mejores Prácticas

### 1. Test de Comportamiento, No Implementación

❌ **Mal:**
```typescript
it('should call setData with correct params', () => {
  const spy = vi.spyOn(component, 'setData');
  component.handleClick();
  expect(spy).toHaveBeenCalledWith('value');
});
```

✅ **Bien:**
```typescript
it('should update display when button clicked', () => {
  render(<Component />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Updated')).toBeInTheDocument();
});
```

### 2. Tests Descriptivos

❌ **Mal:**
```typescript
it('works', () => {
  expect(isValidNIF('12345678Z')).toBe(true);
});
```

✅ **Bien:**
```typescript
it('should validate correct DNI with uppercase letter', () => {
  expect(isValidNIF('12345678Z')).toBe(true);
});
```

### 3. Arrange-Act-Assert (AAA)

```typescript
it('should calculate total with VAT', () => {
  // Arrange
  const baseAmount = 100;
  const vatRate = 21;

  // Act
  const total = calculateTotal(baseAmount, vatRate);

  // Assert
  expect(total).toBe(121);
});
```

### 4. Un Assert Por Test (Cuando Sea Posible)

❌ **Mal:**
```typescript
it('should validate NIFs', () => {
  expect(isValidNIF('12345678Z')).toBe(true);
  expect(isValidNIF('B12345678')).toBe(true);
  expect(isValidNIF('invalid')).toBe(false);
});
```

✅ **Bien:**
```typescript
describe('isValidNIF', () => {
  it('should validate DNI', () => {
    expect(isValidNIF('12345678Z')).toBe(true);
  });

  it('should validate CIF', () => {
    expect(isValidNIF('B12345678')).toBe(true);
  });

  it('should reject invalid format', () => {
    expect(isValidNIF('invalid')).toBe(false);
  });
});
```

### 5. Cleanup After Each Test

```typescript
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup(); // Limpia el DOM
  vi.clearAllMocks(); // Limpia mocks
});
```

---

## 🐛 Troubleshooting

### Tests Lentos

```bash
# Ejecutar en paralelo (por defecto)
npm test

# Ejecutar secuencialmente (para debugging)
npx vitest --no-threads
```

### Debugging Tests

```bash
# Modo debug con inspector de Node.js
node --inspect-brk ./node_modules/vitest/vitest.mjs
```

### Coverage Incorrecto

```bash
# Limpiar cache y ejecutar de nuevo
npx vitest --clearCache
npm run test:coverage
```

---

## 📚 Recursos

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/)
- [Vitest UI](https://vitest.dev/guide/ui.html)
- [Coverage Configuration](https://vitest.dev/guide/coverage.html)

---

**Última actualización**: 2025-11-21
