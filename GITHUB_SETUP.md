# 🔧 Configuración de GitHub para CI/CD

Este documento describe la configuración requerida en GitHub para que todos los workflows funcionen correctamente.

## 📋 Requisitos Previos

### 1. Habilitar Dependency Graph (REQUERIDO para Security Workflow)

El workflow de seguridad (`.github/workflows/security.yml`) utiliza la acción `dependency-review-action` que requiere que el **Dependency Graph** esté habilitado en el repositorio.

**Pasos para habilitar:**

1. Ve a la configuración de seguridad del repositorio:
   ```
   https://github.com/dawnsystem/CBGest/settings/security_analysis
   ```

2. En la sección **"Data services"**, habilita:
   - ✅ **Dependency graph** - Requerido
   - ✅ **Dependabot alerts** - Recomendado (opcional pero muy útil)
   - ✅ **Dependabot security updates** - Recomendado

3. Una vez habilitado, descomenta el job `dependency-review` en `.github/workflows/security.yml`

**Nota:** Si no tienes permisos de administrador en el repositorio, solicita al propietario (@dawnsystem) que active estas funciones.

### 2. Branch Protection Rules (RECOMENDADO)

Para garantizar la calidad del código, se recomienda configurar reglas de protección para la rama `main`:

1. Ve a:
   ```
   https://github.com/dawnsystem/CBGest/settings/branches
   ```

2. Añade una regla para `main` con:
   - ✅ **Require status checks to pass before merging**
     - Status checks requeridos:
       - `lint`
       - `test`
       - `build`
       - `status-check`
   - ✅ **Require branches to be up to date before merging**
   - ✅ **Require pull request reviews before merging**
     - Número de reviews requeridas: 1
   - ✅ **Dismiss stale pull request approvals when new commits are pushed**
   - ❌ **Do not allow force pushes**
   - ❌ **Do not allow deletions**

### 3. Secrets de GitHub (OPCIONAL)

Algunos servicios externos requieren tokens de acceso:

#### Codecov (Coverage Reports)

Si quieres subir reportes de cobertura a Codecov:

1. Crea una cuenta en [codecov.io](https://codecov.io)
2. Añade el repositorio a Codecov
3. Copia el token de Codecov
4. Ve a: `https://github.com/dawnsystem/CBGest/settings/secrets/actions`
5. Añade un nuevo secret:
   - Name: `CODECOV_TOKEN`
   - Value: [tu token de Codecov]

**Nota:** El workflow actual está configurado con `continue-on-error: true`, por lo que funcionará sin este token, simplemente no subirá los reportes.

---

## 🚦 Verificación de Configuración

Una vez completada la configuración, verifica que todo funcione:

### 1. Verificar Workflows

Ve a la pestaña "Actions" del repositorio:
```
https://github.com/dawnsystem/CBGest/actions
```

Deberías ver:
- ✅ **CI/CD Pipeline** - Ejecutándose en cada push/PR
- ✅ **Security Audit** - Ejecutándose en push/PR (y semanalmente)

### 2. Verificar Branch Protection

Intenta hacer push directo a `main` (si tienes permisos). Debería ser rechazado si la protección está configurada correctamente.

### 3. Verificar Status Checks en PRs

Crea un PR de prueba. Deberías ver:
- ⏳ Checks ejecutándose automáticamente
- ❌/✅ Estado de cada check (lint, test, build)
- 🔒 Botón de merge bloqueado hasta que todos los checks pasen

---

## 🐛 Troubleshooting

### Error: "Dependency review is not supported on this repository"

**Causa:** El Dependency Graph no está habilitado.

**Solución:** Sigue las instrucciones de la sección "1. Habilitar Dependency Graph" arriba.

### Error: "Resource not accessible by integration"

**Causa:** El workflow no tiene permisos suficientes.

**Solución:** Verifica que el workflow tenga los permisos correctos en la sección `permissions:` del archivo YAML.

### Los checks no se ejecutan en PRs

**Causa:** El workflow puede no estar configurado para ejecutarse en PRs.

**Solución:** Verifica que el workflow tenga `pull_request:` en la sección `on:`.

### Force push bloqueado en ramas `claude/**`

**Comportamiento esperado:** Las ramas de Claude Code (`claude/**`) pueden hacer push normalmente, pero `main` debe estar protegida.

---

## 📚 Referencias

- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Actions Status Checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
- [Dependency Graph](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-the-dependency-graph)
- [CodeQL Analysis](https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/about-code-scanning-with-codeql)

---

**Última actualización:** 2025-11-21
**Mantenedor:** @dawnsystem
