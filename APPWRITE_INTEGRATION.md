# 🔌 Guía de Integración de Appwrite en CBGest

Esta guía te muestra cómo integrar el backend de Appwrite en la aplicación existente.

---

## 📦 Archivos Creados

La integración de Appwrite ha añadido estos archivos:

```
├── services/
│   └── appwriteService.ts        ← Service layer completo (Auth, DB, Storage)
├── context/
│   └── AuthContext.tsx            ← Context para autenticación
├── components/
│   ├── AuthModal.tsx              ← Modal de Login/Register
│   └── AppwriteConfig.tsx         ← UI de configuración
├── types.ts                       ← Tipos actualizados (AppwriteConfig, AppUser)
├── package.json                   ← Appwrite SDK añadido
├── .env.local                     ← Variables de entorno (opcional)
├── APPWRITE_SETUP.md              ← Guía completa de setup
└── APPWRITE_INTEGRATION.md        ← Este archivo
```

---

## 🎯 Integración en 3 Pasos

### PASO 1: Instalar Dependencias

```bash
npm install
```

Esto instalará `appwrite@^16.0.2` añadido en package.json.

### PASO 2: Configurar Appwrite (Opcional desde UI)

Tienes 2 opciones para configurar Appwrite:

#### Opción A: Desde la interfaz (Recomendado)

1. Abre CBGest
2. Ve a **Configuración → Datos y Conexiones**
3. Verás una nueva tarjeta "Appwrite Cloud Backend"
4. Haz clic y rellena los campos
5. Consulta `APPWRITE_SETUP.md` para obtener los IDs

#### Opción B: Desde .env.local (Avanzado)

Descomenta y rellena las variables en `.env.local`:

```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=tu_project_id
...
```

### PASO 3: Integrar en App.tsx

Necesitas añadir el `AuthProvider` y conectar los servicios.

---

## 💻 Código de Integración

### 1. Actualizar App.tsx

Añade estas importaciones al inicio de `App.tsx`:

```typescript
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import appwriteService from './services/appwriteService';
import { AppwriteConfig } from './types';
```

### 2. Inicializar Appwrite cuando esté configurado

Dentro del componente `App`, añade un efecto para inicializar:

```typescript
const App: React.FC = () => {
  // ... estados existentes ...

  const [showAuthModal, setShowAuthModal] = useState(false);
  const isAppwriteMode = settings.dataConfig?.type === 'APPWRITE';

  // Initialize Appwrite when config is available
  useEffect(() => {
    if (isAppwriteMode && settings.dataConfig?.appwrite) {
      try {
        appwriteService.initialize(settings.dataConfig.appwrite);
        console.log('✅ Appwrite initialized');
      } catch (error) {
        console.error('Failed to initialize Appwrite:', error);
      }
    }
  }, [isAppwriteMode, settings.dataConfig?.appwrite]);

  // ... resto del código ...
```

### 3. Envolver con AuthProvider

En el `return` de `App`, envuelve todo con `AuthProvider`:

```typescript
return (
  <AuthProvider enabled={isAppwriteMode}>
    <UploadQueueProvider>
      <HashRouter>
        {/* ... componentes existentes ... */}

        {/* Añadir AuthModal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </HashRouter>
    </UploadQueueProvider>
  </AuthProvider>
);
```

### 4. Añadir opción en Settings

En `Settings.tsx`, importa el componente:

```typescript
import { AppwriteConfig } from './AppwriteConfig';
```

Y añade un nuevo caso en el tab DATA:

```typescript
{activeTab === 'DATA' && (
  <div className="space-y-8">
    {/* ... opciones existentes ... */}

    {/* Nueva sección de Appwrite */}
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <AppwriteConfig
        config={settings.dataConfig?.appwrite}
        onSave={(config) => {
          onUpdateSettings({
            ...settings,
            dataConfig: {
              ...settings.dataConfig,
              type: 'APPWRITE',
              appwrite: config,
              autoBackup: true
            }
          });
        }}
        onTest={async () => {
          try {
            appwriteService.initialize(settings.dataConfig!.appwrite!);
            const user = await appwriteService.auth.getCurrentUser();
            return true;
          } catch {
            return false;
          }
        }}
      />
    </div>
  </div>
)}
```

### 5. Adaptar funciones de persistencia

Modifica las funciones `handleAddInvoice`, `handleAddEntry`, etc. para usar Appwrite cuando esté activo:

```typescript
const handleAddInvoice = async (invoice: Invoice) => {
  if (isAppwriteMode) {
    try {
      // Upload file to Appwrite Storage if exists
      let fileId;
      if (invoice.file) {
        fileId = await appwriteService.storage.uploadFile(invoice.file, invoice.id);
      }

      // Save to Appwrite Database
      await appwriteService.database.createInvoice({
        ...invoice,
        fileId
      });

      // Update local state
      setInvoices(prev => [invoice, ...prev]);
    } catch (error) {
      console.error('Error saving to Appwrite:', error);
      alert('Error al guardar en Appwrite');
    }
  } else {
    // Local mode (código existente)
    setInvoices(prev => [invoice, ...prev]);
  }

  // Auto-generate accounting entry
  if (invoice.status === 'PROCESSED' || invoice.status === 'PAID') {
    createEntryFromInvoice(invoice);
  }
};
```

### 6. Cargar datos desde Appwrite al iniciar

Añade un efecto para cargar datos cuando Appwrite esté activo:

```typescript
useEffect(() => {
  const loadAppwriteData = async () => {
    if (!isAppwriteMode) return;

    try {
      // Load all data from Appwrite
      const [invoicesData, entriesData, transactionsData, settingsData] = await Promise.all([
        appwriteService.database.getInvoices(),
        appwriteService.database.getEntries(),
        appwriteService.database.getTransactions(),
        appwriteService.database.getSettings()
      ]);

      setInvoices(invoicesData);
      setAccountingEntries(entriesData);
      setBankTransactions(transactionsData);

      if (settingsData) {
        setSettings(settingsData);
      }

      console.log('✅ Data loaded from Appwrite');
    } catch (error) {
      console.error('Error loading from Appwrite:', error);
    }
  };

  loadAppwriteData();
}, [isAppwriteMode]);
```

---

## 🔄 Realtime Sync (Bonus)

Para sincronización en tiempo real, añade suscripciones:

```typescript
useEffect(() => {
  if (!isAppwriteMode) return;

  // Subscribe to invoices changes
  const unsubscribeInvoices = appwriteService.realtime.subscribeToInvoices((payload) => {
    console.log('Realtime update:', payload);
    // Reload invoices
    appwriteService.database.getInvoices().then(setInvoices);
  });

  // Cleanup on unmount
  return () => {
    if (typeof unsubscribeInvoices === 'function') {
      unsubscribeInvoices();
    }
  };
}, [isAppwriteMode]);
```

---

## 🎨 UI Updates

### Indicador en Header

Actualiza `Header.tsx` para mostrar el modo actual:

```typescript
interface HeaderProps {
  isLocalFileMode?: boolean;
  isAppwriteMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isLocalFileMode, isAppwriteMode }) => {
  const { user, logout } = useAuth();

  return (
    <header className="...">
      {/* ... */}

      {isAppwriteMode && (
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full border border-purple-100">
            <Cloud className="w-4 h-4" />
            <span className="text-xs font-bold tracking-wide">APPWRITE MODE</span>
          </div>

          {user && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">{user.name}</span>
              <button
                onClick={logout}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      )}

      {/* ... resto del header ... */}
    </header>
  );
};
```

---

## ✅ Checklist de Integración

Marca cada paso cuando lo completes:

- [ ] `npm install` ejecutado
- [ ] Appwrite configurado (Cloud o self-hosted)
- [ ] Database y Collections creadas
- [ ] Storage Bucket creado
- [ ] IDs copiados y guardados
- [ ] `AuthProvider` añadido a App.tsx
- [ ] `appwriteService.initialize()` llamado
- [ ] `handleAddInvoice` adaptado para Appwrite
- [ ] `handleAddEntry` adaptado para Appwrite
- [ ] `handleAddBankTransactions` adaptado para Appwrite
- [ ] Carga inicial de datos implementada
- [ ] UI de Settings actualizada
- [ ] Header actualizado con indicador
- [ ] Realtime sync añadido (opcional)
- [ ] Tests realizados

---

## 🧪 Testeo

1. **Test básico:**
   ```
   - Activa Appwrite en Settings
   - Inicia sesión / Regístrate
   - Crea una factura
   - Verifica en Appwrite Dashboard que aparece
   ```

2. **Test de sincronización:**
   ```
   - Abre dos pestañas
   - Crea factura en una
   - Verifica que aparece en la otra (con realtime)
   ```

3. **Test de persistencia:**
   ```
   - Crea datos
   - Cierra el navegador
   - Vuelve a abrir
   - Verifica que los datos persisten
   ```

---

## 🐛 Troubleshooting

### Error: "Appwrite not initialized"

- Verifica que `initializeAppwrite()` se llama antes de usar los servicios
- Comprueba que `settings.dataConfig?.appwrite` tiene todos los campos

### Error: "Unauthorized"

- Asegúrate de estar logueado
- Verifica los permisos de las collections en Appwrite Dashboard

### Los datos no se sincronizan

- Verifica la configuración de Realtime en Appwrite
- Comprueba la consola del navegador por errores

### Los archivos no se suben

- Verifica el Bucket ID
- Comprueba los permisos del bucket
- Revisa el tamaño del archivo (máx 10MB por defecto)

---

## 📊 Comparación Final

| Feature | Local | FileSystem | Appwrite |
|---|---|---|---|
| Multi-dispositivo | ❌ | ❌ | ✅ |
| Colaboración | ❌ | ❌ | ✅ |
| Autenticación | ❌ | ❌ | ✅ |
| Backup automático | ❌ | ❌ | ✅ |
| Realtime sync | ❌ | ❌ | ✅ |
| Requiere internet | ❌ | ❌ | ✅ |
| Setup | ✅ Simple | ✅ Simple | ⚠️ Medio |

---

## 🎓 Próximos Pasos

Una vez integrado:

1. **Explora Functions:**
   - Auto-envío de recordatorios fiscales
   - Procesamiento de PDFs en servidor
   - Notificaciones por email

2. **Configura Webhooks:**
   - Integración con otras apps
   - Automatizaciones

3. **Añade más auth providers:**
   - Google OAuth
   - GitHub OAuth

4. **Implementa roles:**
   - Admin vs User
   - Permisos granulares

---

¡Disfruta de CBGest con Appwrite! 🚀

Para soporte, consulta:
- `APPWRITE_SETUP.md` - Setup completo
- `PLAN_DE_MEJORAS.md` - Roadmap
- https://appwrite.io/docs - Docs oficiales
