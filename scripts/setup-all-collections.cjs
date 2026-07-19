#!/usr/bin/env node

/**
 * Script to automatically create ALL Appwrite collections for CBGest
 *
 * This script creates/updates ALL collections with all required attributes.
 * Incluye `fiscalYearId` (size 36) + índice en colecciones transaccionales/maestras.
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/setup-all-collections.cjs
 *
 * Si solo falta fiscalYearId en un proyecto ya existente:
 *   node scripts/add-fiscal-year-id-attributes.cjs
 */

const { Client, Databases, Permission, Role, Query } = require('node-appwrite');
const { getAppwriteConfig } = require('./load-appwrite-config.cjs');

// Configuration from env (.env / .env.local) — SEC-008
const CONFIG = getAppwriteConfig();

// Get API key from environment variable
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY environment variable is required');
  console.error('');
  console.error('Please set it before running this script:');
  console.error('  export APPWRITE_API_KEY="your-api-key-here"');
  process.exit(1);
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

/**
 * Atributo de enlace a ejercicio contable.
 * size=36: IDs de documento Appwrite (máx. 36). Alineado con Cloud CBGest.
 */
const FISCAL_YEAR_ID_ATTRIBUTE = {
  type: 'string',
  key: 'fiscalYearId',
  size: 36,
  required: false,
};

const FISCAL_YEAR_ID_INDEX = {
  key: 'fiscalYearId_index',
  type: 'key',
  attributes: ['fiscalYearId'],
  orders: ['ASC'],
};

/** Colecciones que DEBEN tener fiscalYearId (+ índice). */
const FISCAL_YEAR_SCOPED_COLLECTIONS = [
  'invoices',
  'entries',
  'transactions',
  'suppliers',
  'apartments',
  'reservations',
  'recurring_expenses',
];

/** Atributos e índices de deduplicación de facturas (FEAT-DEDUP-001). */
const INVOICE_DEDUP_ATTRIBUTES = [
  { type: 'string', key: 'fileHash', size: 64, required: false },
  { type: 'string', key: 'contentFingerprint', size: 128, required: false },
];

const INVOICE_DEDUP_INDEXES = [
  { key: 'fileHash_index', type: 'key', attributes: ['fileHash'], orders: ['ASC'] },
  { key: 'contentFingerprint_index', type: 'key', attributes: ['contentFingerprint'], orders: ['ASC'] },
];

const UPLOADS_DEDUP_ATTRIBUTES = [
  { type: 'string', key: 'fileHash', size: 64, required: false },
  { type: 'string', key: 'duplicateMatch', size: 2000, required: false },
  { type: 'boolean', key: 'forceProcess', required: false, default: false },
  { type: 'string', key: 'aiProviderUsed', size: 32, required: false },
];

/** Preferencia multi-IA en `settings` (FEAT-AI-FAILOVER-001). */
const SETTINGS_AI_CONFIG_ATTRIBUTE = {
  type: 'string',
  key: 'aiConfig',
  size: 500,
  required: false,
};

/** Campos fiscales CB / Modelo 184 en `settings` (FEAT-M184-001). */
const SETTINGS_FISCAL_ATTRIBUTES = [
  { type: 'string', key: 'address', size: 500, required: false },
  { type: 'string', key: 'streetNumber', size: 20, required: false },
  { type: 'string', key: 'postalCode', size: 20, required: false },
  { type: 'string', key: 'city', size: 200, required: false },
  { type: 'string', key: 'province', size: 100, required: false },
  { type: 'string', key: 'phone', size: 50, required: false },
  { type: 'string', key: 'contactPerson', size: 200, required: false },
  { type: 'string', key: 'representativeNif', size: 50, required: false },
  { type: 'string', key: 'representativeName', size: 200, required: false },
];

/** Gasto deducible en facturas (Modelo 184 / IRPF). */
const INVOICE_IS_DEDUCTIBLE_ATTRIBUTE = {
  type: 'boolean',
  key: 'isDeductible',
  required: false,
  default: true,
};

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lista atributos con paginación (default Appwrite = 25; reservations tiene 29+).
 * @param {string} collectionId
 * @returns {Promise<Array<{ key: string, status?: string }>>}
 */
async function listAllAttributes(collectionId) {
  const byKey = new Map();
  let offset = 0;
  const pageSize = 100;

  for (;;) {
    const page = await databases.listAttributes(
      CONFIG.databaseId,
      collectionId,
      [Query.limit(pageSize), Query.offset(offset)]
    );
    for (const attr of page.attributes || []) {
      byKey.set(attr.key, attr);
    }
    offset += (page.attributes || []).length;
    if (!page.attributes?.length || offset >= (page.total || 0) || byKey.size >= (page.total || 0)) {
      break;
    }
  }

  return [...byKey.values()];
}

/**
 * Espera a que un atributo esté `available` (necesario antes de crear su índice).
 * @param {string} collectionId
 * @param {string} key
 * @param {number} maxWaitMs
 * @returns {Promise<boolean>}
 */
async function waitForAttributeAvailable(collectionId, key, maxWaitMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const attrs = await listAllAttributes(collectionId);
    const found = attrs.find((a) => a.key === key);
    if (found?.status === 'available') return true;
    if (found?.status === 'failed') {
      throw new Error(`Atributo ${collectionId}.${key} en estado failed: ${found.error || ''}`);
    }
    await sleep(2000);
  }
  return false;
}

/**
 * Retry with exponential backoff for transient errors
 */
async function withRetry(operation, maxRetries = 4) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on 409 (already exists) - this is expected
      if (error.code === 409) {
        throw error;
      }

      // Retry on 500 (server error) or network errors
      const isRetryable = error.code === 500 || error.code >= 502 || error.message?.includes('ECONNRESET');

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s
        console.log(`    ⚠️  Server error, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }
  throw lastError;
}

/**
 * Create a collection
 */
async function createCollection(collectionId, name) {
  try {
    console.log(`📦 Creating collection: ${name} (${collectionId})...`);

    const collection = await withRetry(async () => {
      return await databases.createCollection(
        CONFIG.databaseId,
        collectionId,
        name,
        [
          Permission.create(Role.users()),
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ],
        true // Document-level security enabled
      );
    });

    console.log(`✅ Collection '${name}' created successfully`);
    return collection;
  } catch (error) {
    if (error.code === 409) {
      console.log(`⚠️  Collection '${name}' already exists`);
      return null;
    }
    throw error;
  }
}

/**
 * Create an attribute with retry logic
 */
async function createAttribute(collectionId, attributeConfig) {
  const { type, key, ...config } = attributeConfig;

  try {
    console.log(`  - Creating ${type} attribute: ${key}...`);

    const result = await withRetry(async () => {
      switch (type) {
        case 'string':
          return await databases.createStringAttribute(
            CONFIG.databaseId,
            collectionId,
            key,
            config.size,
            config.required,
            config.default,
            config.array || false
          );

        case 'integer':
          return await databases.createIntegerAttribute(
            CONFIG.databaseId,
            collectionId,
            key,
            config.required,
            config.min,
            config.max,
            config.default,
            config.array || false
          );

        case 'float':
          return await databases.createFloatAttribute(
            CONFIG.databaseId,
            collectionId,
            key,
            config.required,
            config.min,
            config.max,
            config.default,
            config.array || false
          );

        case 'boolean':
          return await databases.createBooleanAttribute(
            CONFIG.databaseId,
            collectionId,
            key,
            config.required,
            config.default,
            config.array || false
          );

        case 'enum':
          return await databases.createEnumAttribute(
            CONFIG.databaseId,
            collectionId,
            key,
            config.elements,
            config.required,
            config.default,
            config.array || false
          );

        default:
          throw new Error(`Unsupported attribute type: ${type}`);
      }
    });

    console.log(`    ✓ Attribute '${key}' created`);
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Attribute '${key}' already exists, skipping`);
      return null;
    }
    throw error;
  }
}

/**
 * Check if an index already exists and its status
 * Returns: { exists: boolean, status: string | null }
 */
async function getIndexStatus(collectionId, indexKey) {
  try {
    // Query.limit(100): listIndexes paginates like any list endpoint (default
    // limit 25); collections can have more indexes than that as they grow.
    const indexes = await databases.listIndexes(CONFIG.databaseId, collectionId, [Query.limit(100)]);
    const existingIndex = indexes.indexes.find(idx => idx.key === indexKey);
    if (existingIndex) {
      return { exists: true, status: existingIndex.status, index: existingIndex };
    }
    return { exists: false, status: null, index: null };
  } catch (error) {
    // If we can't list indexes, assume it doesn't exist
    return { exists: false, status: null, index: null };
  }
}

/**
 * Delete an index
 */
async function deleteIndex(collectionId, indexKey) {
  try {
    await databases.deleteIndex(CONFIG.databaseId, collectionId, indexKey);
    console.log(`    🗑️  Deleted failed index '${indexKey}'`);
    return true;
  } catch (error) {
    console.log(`    ⚠️  Could not delete index '${indexKey}': ${error.message}`);
    return false;
  }
}

/**
 * Create an index
 */
async function createIndex(collectionId, indexConfig) {
  const { key, type, attributes, orders } = indexConfig;

  try {
    // First check if index already exists and its status
    const indexStatus = await getIndexStatus(collectionId, key);

    if (indexStatus.exists) {
      console.log(`  - Index: ${key}...`);

      // If index is in 'available' status, skip
      if (indexStatus.status === 'available') {
        console.log(`    ⚠️  Index '${key}' already exists, skipping`);
        return null;
      }

      // If index is in 'failed' status, delete it and recreate
      if (indexStatus.status === 'failed') {
        console.log(`    ⚠️  Index '${key}' is in failed state, deleting and recreating...`);
        await deleteIndex(collectionId, key);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // If index is in 'processing' status, wait and check again
      if (indexStatus.status === 'processing') {
        console.log(`    ⏳ Index '${key}' is still processing, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        const newStatus = await getIndexStatus(collectionId, key);
        if (newStatus.exists && newStatus.status === 'available') {
          console.log(`    ⚠️  Index '${key}' now available, skipping`);
          return null;
        }
      }
    } else {
      console.log(`  - Creating index: ${key}...`);
    }

    const result = await withRetry(async () => {
      return await databases.createIndex(
        CONFIG.databaseId,
        collectionId,
        key,
        type,
        attributes,
        orders
      );
    });

    console.log(`    ✓ Index '${key}' created`);
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Index '${key}' already exists, skipping`);
      return null;
    }
    // Handle index length error - this means the attribute size is too large
    if (error.code === 400 && error.message && error.message.includes('Index length')) {
      console.log(`    ❌ Index '${key}' cannot be created: attribute size exceeds index limit (767 bytes)`);
      console.log(`       Consider reducing the size of indexed attributes to <= 191 characters`);
      return null;
    }
    throw error;
  }
}

// ============================================================================
// COLLECTION DEFINITIONS
// ============================================================================

/**
 * INVOICES Collection
 */
async function setupInvoicesCollection() {
  console.log('\n=== Setting up INVOICES collection ===\n');
  const collectionId = 'invoices';

  await createCollection(collectionId, 'Invoices');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    // Core fields
    { type: 'string', key: 'number', size: 100, required: false },
    { type: 'string', key: 'date', size: 20, required: true },
    { type: 'string', key: 'issuerName', size: 500, required: true },
    { type: 'string', key: 'issuerNif', size: 50, required: false },
    { type: 'string', key: 'issuerAddress', size: 500, required: false },
    { type: 'string', key: 'issuerCity', size: 200, required: false },
    { type: 'string', key: 'issuerPostalCode', size: 20, required: false },
    { type: 'string', key: 'issuerCountry', size: 100, required: false },
    { type: 'string', key: 'supplierId', size: 100, required: false },

    // Amounts
    { type: 'float', key: 'baseAmount', required: true, min: -999999999, max: 999999999 },
    { type: 'float', key: 'vatRate', required: false, min: 0, max: 100, default: 0 },
    { type: 'float', key: 'vatAmount', required: false, min: -999999999, max: 999999999, default: 0 },
    { type: 'float', key: 'totalAmount', required: true, min: -999999999, max: 999999999 },

    // Type and status
    { type: 'enum', key: 'type', elements: ['EXPENSE', 'INCOME'], required: true },
    { type: 'enum', key: 'status', elements: ['PENDING', 'PROCESSED', 'PAID'], required: true },
    { type: 'string', key: 'category', size: 500, required: false },

    // History - stored as JSON string
    { type: 'string', key: 'history', size: 50000, required: false },

    // File references
    { type: 'string', key: 'fileData', size: 10000000, required: false },
    { type: 'string', key: 'fileType', size: 100, required: false },
    { type: 'string', key: 'appwriteFileId', size: 100, required: false },

    // Apartment tracking (NEW - for per-property expense tracking)
    { type: 'string', key: 'apartmentId', size: 100, required: false },

    // Ejercicio contable (links this invoice to a FiscalYear document)
    { ...FISCAL_YEAR_ID_ATTRIBUTE },

    // Deduplicación
    { type: 'string', key: 'fileHash', size: 64, required: false },
    { type: 'string', key: 'contentFingerprint', size: 128, required: false },

    // Modelo 184 / IRPF
    { ...INVOICE_IS_DEDUCTIBLE_ATTRIBUTE },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'date_index', type: 'key', attributes: ['date'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'type_index', type: 'key', attributes: ['type'], orders: ['ASC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
    { key: 'fileHash_index', type: 'key', attributes: ['fileHash'], orders: ['ASC'] },
    { key: 'contentFingerprint_index', type: 'key', attributes: ['contentFingerprint'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Invoices collection setup complete!\n');
}

/**
 * ENTRIES (Accounting Entries) Collection
 */
async function setupEntriesCollection() {
  console.log('\n=== Setting up ENTRIES collection ===\n');
  const collectionId = 'entries';

  await createCollection(collectionId, 'Accounting Entries');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'date', size: 20, required: true },
    { type: 'string', key: 'concept', size: 1000, required: true },
    { type: 'string', key: 'accountCode', size: 50, required: true },
    { type: 'string', key: 'accountName', size: 500, required: false },
    { type: 'float', key: 'debit', required: true, min: 0, max: 999999999 },
    { type: 'float', key: 'credit', required: true, min: 0, max: 999999999 },
    { type: 'string', key: 'invoiceId', size: 100, required: false },
    // Link to bank transaction (for entries created from bank movements)
    { type: 'string', key: 'transactionId', size: 100, required: false },
    { type: 'boolean', key: 'reconciled', required: false, default: false },
    // Sequential entry number
    { type: 'integer', key: 'number', required: false, min: 1, max: 999999999 },
    // Lines - JSON string containing array of AccountingEntryLine for double-entry accounting
    { type: 'string', key: 'lines', size: 50000, required: false },
    // File references
    { type: 'string', key: 'fileData', size: 10000000, required: false },
    { type: 'string', key: 'fileType', size: 100, required: false },
    { type: 'string', key: 'appwriteFileId', size: 100, required: false },
    // Audit fields
    { type: 'string', key: 'createdBy', size: 100, required: false },
    { type: 'string', key: 'createdByName', size: 255, required: false },
    // Links copied from the originating invoice (for filtering and reporting)
    { type: 'string', key: 'supplierId', size: 100, required: false },
    { type: 'string', key: 'apartmentId', size: 100, required: false },
    // Draft flag: entry saved without validating that debit === credit ("Guardar borrador")
    { type: 'boolean', key: 'isDraft', required: false, default: false },
    // Ejercicio contable (NEW - links this entry to a FiscalYear document)
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'date_index', type: 'key', attributes: ['date'], orders: ['DESC'] },
    { key: 'reconciled_index', type: 'key', attributes: ['reconciled'], orders: ['ASC'] },
    { key: 'invoiceId_index', type: 'key', attributes: ['invoiceId'], orders: ['ASC'] },
    { key: 'supplierId_index', type: 'key', attributes: ['supplierId'], orders: ['ASC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Entries collection setup complete!\n');
}

/**
 * TRANSACTIONS (Bank Transactions) Collection
 */
async function setupTransactionsCollection() {
  console.log('\n=== Setting up TRANSACTIONS collection ===\n');
  const collectionId = 'transactions';

  await createCollection(collectionId, 'Bank Transactions');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'date', size: 20, required: true },
    { type: 'string', key: 'valueDate', size: 20, required: false },
    { type: 'string', key: 'concept', size: 1000, required: true },
    { type: 'float', key: 'amount', required: true, min: -999999999, max: 999999999 },
    { type: 'float', key: 'balance', required: false, min: -999999999, max: 999999999 },
    { type: 'string', key: 'reconciledWithEntryId', size: 100, required: false },
    { type: 'enum', key: 'status', elements: ['PENDING', 'MATCHED'], required: true },

    // Platform detection (NEW - for Airbnb, Booking, etc.)
    { type: 'string', key: 'platformDetected', size: 50, required: false },
    { type: 'float', key: 'grossAmount', required: false, min: -999999999, max: 999999999 },

    // AI matching suggestions (NEW - for intelligent reconciliation)
    { type: 'string', key: 'aiMatchSuggestion', size: 5000, required: false },
    { type: 'string', key: 'reconciledWithInvoiceId', size: 100, required: false },

    // Dedup fingerprints (SHA-256 hex)
    { type: 'string', key: 'contentFingerprint', size: 64, required: false },
    { type: 'string', key: 'importBatchId', size: 36, required: false },
    
    // Audit fields
    { type: 'string', key: 'createdBy', size: 100, required: false },
    { type: 'string', key: 'createdByName', size: 255, required: false },

    // Ejercicio contable (NEW - links this transaction to a FiscalYear document)
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'date_index', type: 'key', attributes: ['date'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'platformDetected_index', type: 'key', attributes: ['platformDetected'], orders: ['ASC'] },
    { key: 'contentFingerprint_index', type: 'key', attributes: ['contentFingerprint'], orders: ['ASC'] },
    { key: 'importBatchId_index', type: 'key', attributes: ['importBatchId'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Transactions collection setup complete!\n');
}

/**
 * SETTINGS Collection
 */
async function setupSettingsCollection() {
  console.log('\n=== Setting up SETTINGS collection ===\n');
  const collectionId = 'settings';

  await createCollection(collectionId, 'App Settings');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'cbName', size: 500, required: false },
    { type: 'string', key: 'nif', size: 50, required: false },
    { type: 'enum', key: 'fiscalRegime', elements: ['GENERAL', 'ALQUILER_EXENTO'], required: false },
    { type: 'boolean', key: 'vatObligation', required: false, default: false },
    // Partners stored as JSON string (array of objects not supported)
    { type: 'string', key: 'partners', size: 50000, required: false },
    // Tourist tax config stored as JSON string
    { type: 'string', key: 'touristTaxConfig', size: 1000, required: false },
    // Multi-IA preference (preferredProvider + failoverEnabled) as JSON string
    SETTINGS_AI_CONFIG_ATTRIBUTE,
    // Domicilio fiscal CB y representante — Modelo 184
    ...SETTINGS_FISCAL_ATTRIBUTES,
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Settings collection setup complete!\n');
}

/**
 * SUPPLIERS Collection
 */
async function setupSuppliersCollection() {
  console.log('\n=== Setting up SUPPLIERS collection ===\n');
  const collectionId = 'suppliers';

  await createCollection(collectionId, 'Suppliers');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'name', size: 500, required: true },
    { type: 'string', key: 'nif', size: 50, required: true },
    { type: 'enum', key: 'nifType', elements: ['NIF', 'CIF', 'NIE', 'DNI', 'PASAPORTE'], required: false },
    { type: 'string', key: 'address', size: 500, required: false },
    { type: 'string', key: 'city', size: 200, required: false },
    { type: 'string', key: 'postalCode', size: 20, required: false },
    { type: 'string', key: 'email', size: 255, required: false },
    { type: 'string', key: 'phone', size: 50, required: false },
    { type: 'string', key: 'category', size: 200, required: false },
    { type: 'string', key: 'notes', size: 2000, required: false },
    // Ejercicio contable (NEW - se copia de un ejercicio al siguiente)
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
    // NOTA: id, createdAt, updatedAt son gestionados automáticamente por Appwrite ($id, $createdAt, $updatedAt)
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'name_index', type: 'key', attributes: ['name'], orders: ['ASC'] },
    // NOTE: intentionally a plain `key` index, NOT `unique`. Suppliers are duplicated
    // (same `nif`, different document) into every new fiscal year by
    // copyMasterDataToFiscalYear(), so the same NIF legitimately appears in multiple
    // documents. A unique index here would make that copy fail with a 409 on every
    // supplier after the first fiscal year — and that 409 is currently swallowed by
    // the caller as "already copied", so the failure would be silent.
    { key: 'nif_index', type: 'key', attributes: ['nif'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Suppliers collection setup complete!\n');
}

/**
 * NOTIFICATIONS Collection
 */
async function setupNotificationsCollection() {
  console.log('\n=== Setting up NOTIFICATIONS collection ===\n');
  const collectionId = 'notifications';

  await createCollection(collectionId, 'Notifications');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'type', size: 50, required: true },
    { type: 'string', key: 'title', size: 255, required: true },
    { type: 'string', key: 'message', size: 1000, required: true },
    { type: 'string', key: 'userId', size: 255, required: true },
    { type: 'string', key: 'userName', size: 255, required: true },
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    { type: 'boolean', key: 'read', required: false, default: false },
    { type: 'string', key: 'relatedId', size: 255, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'timestamp_index', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    { key: 'userId_index', type: 'key', attributes: ['userId'], orders: ['ASC'] },
    { key: 'read_index', type: 'key', attributes: ['read'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Notifications collection setup complete!\n');
}

/**
 * UPLOADS Collection
 * 
 * OPTIMIZED: Uses Appwrite Storage instead of base64 in document
 * - storageFileId: Reference to file in Storage bucket
 * - fileSize: For progress calculation
 * - NO base64Data: Files stored in Storage (691f31c9000fc8c83ab1)
 * 
 * Status flow: PENDING_UPLOAD → UPLOADING → QUEUED → ANALYZING → COMPLETED/ERROR
 */
async function setupUploadsCollection() {
  console.log('\n=== Setting up UPLOADS collection (OPTIMIZED) ===\n');
  const collectionId = 'uploads';

  await createCollection(collectionId, 'Upload Queue');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    // File metadata
    { type: 'string', key: 'uploadType', size: 50, required: true },
    { type: 'string', key: 'fileName', size: 255, required: true },
    { type: 'string', key: 'mimeType', size: 100, required: true },
    { type: 'integer', key: 'fileSize', required: false, min: 0, max: 104857600, default: 0 }, // 100MB max
    
    // Storage reference (replaces base64Data)
    { type: 'string', key: 'storageFileId', size: 100, required: false },
    
    // Status: PENDING_UPLOAD | UPLOADING | QUEUED | ANALYZING | COMPLETED | ERROR
    { type: 'string', key: 'status', size: 50, required: true },
    { type: 'integer', key: 'progress', required: false, min: 0, max: 100, default: 0 },
    { type: 'string', key: 'error', size: 1000, required: false },
    
    // Timestamps
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    
    // UI state
    { type: 'boolean', key: 'notificationDismissed', required: false, default: false },
    { type: 'boolean', key: 'needsMapping', required: false, default: false },
    { type: 'boolean', key: 'isDuplicate', required: false, default: false },

    // Dedup: exact file hash + fiscal year scope
    { type: 'string', key: 'fileSha256', size: 64, required: false },
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
    
    // Results (JSON strings)
    { type: 'string', key: 'result', size: 50000, required: false },
    { type: 'string', key: 'bankResult', size: 100000, required: false },

    // Deduplicación
    { type: 'string', key: 'fileHash', size: 64, required: false },
    { type: 'string', key: 'duplicateMatch', size: 2000, required: false },
    { type: 'boolean', key: 'forceProcess', required: false, default: false },
    // Proveedor IA que completó el análisis (FEAT-AI-FAILOVER-001)
    { type: 'string', key: 'aiProviderUsed', size: 32, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'timestamp_index', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'storageFileId_index', type: 'key', attributes: ['storageFileId'], orders: ['ASC'] },
    { key: 'fileSha256_index', type: 'key', attributes: ['fileSha256'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Uploads collection setup complete!\n');
  console.log('   📦 Files stored in Storage bucket: 691f31c9000fc8c83ab1');
  console.log('   📄 Documents only contain metadata + storageFileId reference\n');
}

/**
 * APARTMENTS Collection (NEW - for per-property tracking)
 */
async function setupApartmentsCollection() {
  console.log('\n=== Setting up APARTMENTS collection ===\n');
  const collectionId = 'apartments';

  await createCollection(collectionId, 'Apartments');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'name', size: 200, required: true },
    { type: 'string', key: 'code', size: 20, required: false }, // e.g., "APT-01", "1A"
    { type: 'string', key: 'address', size: 500, required: false },
    { type: 'string', key: 'cadastralRef', size: 50, required: false }, // Referencia catastral
    { type: 'float', key: 'surfaceArea', required: false, min: 0, max: 99999 }, // m²
    { type: 'integer', key: 'maxOccupancy', required: false, min: 1, max: 50 },
    { type: 'string', key: 'licenseNumber', size: 100, required: false }, // Licencia turística (HUT)
    { type: 'enum', key: 'apartmentType', elements: ['TOURIST', 'RESIDENTIAL'], required: false, default: 'TOURIST' }, // Tipo de apartamento
    { type: 'string', key: 'notes', size: 2000, required: false },
    { type: 'boolean', key: 'isActive', required: false, default: true },
    // Ejercicio contable (NEW - se copia de un ejercicio al siguiente)
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
    // NOTA: id, createdAt, updatedAt son gestionados automáticamente por Appwrite ($id, $createdAt, $updatedAt)
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'name_index', type: 'key', attributes: ['name'], orders: ['ASC'] },
    { key: 'isActive_index', type: 'key', attributes: ['isActive'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Apartments collection setup complete!\n');
}

/**
 * RECURRING_EXPENSES Collection (NEW - for expense projections)
 */
async function setupRecurringExpensesCollection() {
  console.log('\n=== Setting up RECURRING_EXPENSES collection ===\n');
  const collectionId = 'recurring_expenses';

  await createCollection(collectionId, 'Recurring Expenses');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'name', size: 200, required: true }, // e.g., "Electricidad", "Comunidad"
    { type: 'string', key: 'description', size: 1000, required: false },
    { type: 'float', key: 'estimatedAmount', required: true, min: 0, max: 999999999 },
    { type: 'enum', key: 'frequency', elements: ['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], required: true },
    { type: 'string', key: 'category', size: 200, required: false }, // PGC code or custom category
    { type: 'string', key: 'apartmentId', size: 100, required: false }, // null = common expense
    { type: 'string', key: 'supplierId', size: 100, required: false },
    { type: 'integer', key: 'dayOfMonth', required: false, min: 1, max: 31 }, // Expected day
    { type: 'string', key: 'startDate', size: 20, required: false }, // When this expense starts
    { type: 'string', key: 'endDate', size: 20, required: false }, // Optional end date
    { type: 'boolean', key: 'isDeductible', required: false, default: true },
    { type: 'boolean', key: 'isActive', required: false, default: true },
    { type: 'string', key: 'notes', size: 2000, required: false },
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
    // NOTA: id, createdAt, updatedAt son gestionados automáticamente por Appwrite ($id, $createdAt, $updatedAt)
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'frequency_index', type: 'key', attributes: ['frequency'], orders: ['ASC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { key: 'isActive_index', type: 'key', attributes: ['isActive'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Recurring Expenses collection setup complete!\n');
}

/**
 * AI_MATCH_HISTORY Collection (NEW - for AI learning from user matches)
 */
async function setupAiMatchHistoryCollection() {
  console.log('\n=== Setting up AI_MATCH_HISTORY collection ===\n');
  const collectionId = 'ai_match_history';

  await createCollection(collectionId, 'AI Match History');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    // Bank transaction info (patterns to learn)
    { type: 'string', key: 'bankConcept', size: 500, required: true }, // Original bank concept
    { type: 'string', key: 'normalizedConcept', size: 500, required: false }, // Cleaned/normalized
    { type: 'float', key: 'amount', required: true, min: -999999999, max: 999999999 },

    // What it was matched to
    { type: 'enum', key: 'matchType', elements: ['INVOICE', 'SUPPLIER', 'CATEGORY', 'PLATFORM'], required: true },
    { type: 'string', key: 'matchedInvoiceId', size: 100, required: false },
    { type: 'string', key: 'matchedSupplierId', size: 100, required: false },
    { type: 'string', key: 'matchedSupplierName', size: 500, required: false },
    { type: 'string', key: 'matchedCategory', size: 200, required: false },
    { type: 'string', key: 'matchedPlatform', size: 50, required: false }, // Airbnb, Booking, etc.

    // Confidence and feedback
    { type: 'boolean', key: 'wasAiSuggestion', required: false, default: false },
    { type: 'boolean', key: 'userConfirmed', required: false, default: true },
    { type: 'integer', key: 'usageCount', required: false, min: 0, max: 999999, default: 1 }, // How many times this pattern matched

    // Metadata
    { type: 'string', key: 'lastUsedAt', size: 50, required: false }, // Cuándo se usó este match por última vez
    // NOTA: id, createdAt, updatedAt son gestionados automáticamente por Appwrite ($id, $createdAt, $updatedAt)
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'matchType_index', type: 'key', attributes: ['matchType'], orders: ['ASC'] },
    { key: 'usageCount_index', type: 'key', attributes: ['usageCount'], orders: ['DESC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ AI Match History collection setup complete!\n');
}

/**
 * RESERVATIONS Collection (NEW - for tourist tax and deposit tracking)
 */
async function setupReservationsCollection() {
  console.log('\n=== Setting up RESERVATIONS collection ===\n');
  const collectionId = 'reservations';

  await createCollection(collectionId, 'Reservations');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    // Core booking data
    { type: 'string', key: 'apartmentId', size: 100, required: false },
    { type: 'string', key: 'apartmentName', size: 200, required: true },
    { type: 'string', key: 'checkIn', size: 20, required: true },
    { type: 'string', key: 'checkOut', size: 20, required: true },
    { type: 'integer', key: 'nights', required: true, min: 1, max: 365 },

    // Financial data
    { type: 'float', key: 'pricePerNight', required: true, min: 0, max: 99999 },
    { type: 'float', key: 'totalAmount', required: true, min: 0, max: 999999 },
    { type: 'float', key: 'paidAmount', required: false, min: 0, max: 999999, default: 0 },

    // Booking reference
    { type: 'enum', key: 'channel', elements: ['Booking', 'Airbnb', 'Direct', 'Agoda', 'Vrbo', 'Other'], required: true },
    { type: 'string', key: 'reservationNumber', size: 100, required: true },
    { type: 'enum', key: 'status', elements: ['New', 'Confirmed', 'Paid', 'PaidCC', 'Cancelled', 'Completed'], required: true },

    // Guest info
    { type: 'string', key: 'guestInitials', size: 20, required: false },
    { type: 'string', key: 'guestName', size: 200, required: false }, // For consecutive stay detection
    { type: 'string', key: 'guestEmail', size: 200, required: false }, // For consecutive stay detection
    { type: 'integer', key: 'numberOfGuests', required: false, min: 1, max: 50, default: 1 }, // Adults for tourist tax
    { type: 'integer', key: 'numberOfChildren', required: false, min: 0, max: 50, default: 0 }, // Children - no tax

    // Tourist Tax (IEET)
    { type: 'float', key: 'touristTaxAmount', required: false, min: 0, max: 9999, default: 0 },
    { type: 'boolean', key: 'touristTaxCollected', required: false, default: false },
    { type: 'string', key: 'touristTaxCollectedDate', size: 20, required: false },
    { type: 'integer', key: 'touristTaxNightsCounted', required: false, min: 0, max: 365, default: 0 },

    // Deposit/Fianza
    { type: 'float', key: 'depositAmount', required: false, min: 0, max: 99999, default: 0 },
    { type: 'boolean', key: 'depositCollected', required: false, default: false },
    { type: 'string', key: 'depositCollectedDate', size: 20, required: false },
    { type: 'boolean', key: 'depositReturned', required: false, default: false },
    { type: 'string', key: 'depositReturnedDate', size: 20, required: false },
    { type: 'float', key: 'depositRetainedAmount', required: false, min: 0, max: 99999, default: 0 },

    // Metadata
    { type: 'string', key: 'importedAt', size: 50, required: false },
    { type: 'string', key: 'notes', size: 2000, required: false },

    // Ejercicio contable (NEW - links this reservation to a FiscalYear document)
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'checkIn_index', type: 'key', attributes: ['checkIn'], orders: ['DESC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { key: 'channel_index', type: 'key', attributes: ['channel'], orders: ['ASC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'touristTaxCollected_index', type: 'key', attributes: ['touristTaxCollected'], orders: ['ASC'] },
    { key: 'guestName_index', type: 'key', attributes: ['guestName'], orders: ['ASC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Reservations collection setup complete!\n');
}

/**
 * FISCAL_YEARS Collection (NEW - Ejercicios Contables)
 *
 * Previously only documented as a manual step in APPWRITE_SETUP.md (Fase 1).
 * `fiscalYearId` (a string reference to a document in this collection) is used
 * extensively by fiscalYearService.ts and by invoices/entries/transactions/
 * reservations/suppliers/apartments to scope data per accounting year.
 */
async function setupFiscalYearsCollection() {
  console.log('\n=== Setting up FISCAL_YEARS collection ===\n');
  const collectionId = 'fiscal_years';

  await createCollection(collectionId, 'Fiscal Years');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'integer', key: 'year', required: true, min: 2000, max: 2200 },
    // NOTE: Appwrite rejects a `default` value on a `required` attribute
    // ("Cannot set default value for required attribute"). The app always
    // sets `status` explicitly when creating a FiscalYear (it's a required
    // field on the `FiscalYear` TS type), so no default is needed here.
    { type: 'enum', key: 'status', elements: ['OPEN', 'CLOSED'], required: true },
    { type: 'string', key: 'openedAt', size: 30, required: false },
    { type: 'string', key: 'closedAt', size: 30, required: false },
    { type: 'string', key: 'notes', size: 500, required: false },
    // Tourist tax rate periods for this fiscal year, stored as JSON string
    // (mirrors `partners`/`touristTaxConfig` on the settings collection)
    { type: 'string', key: 'touristTaxPeriods', size: 20000, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'year_index', type: 'unique', attributes: ['year'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Fiscal Years collection setup complete!\n');
}

/**
 * BANK_STATEMENT_IMPORTS — registro de extractos para deduplicación rápida.
 */
async function setupBankStatementImportsCollection() {
  console.log('\n=== Setting up BANK_STATEMENT_IMPORTS collection ===\n');
  const collectionId = 'bank_statement_imports';

  await createCollection(collectionId, 'Bank Statement Imports');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'fileSha256', size: 64, required: false },
    { type: 'string', key: 'contentFingerprint', size: 64, required: true },
    { type: 'string', key: 'fileName', size: 255, required: false },
    { type: 'integer', key: 'transactionCount', required: true, min: 0, max: 999999 },
    { type: 'string', key: 'importedAt', size: 40, required: true },
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'fileSha256_index', type: 'key', attributes: ['fileSha256'], orders: ['ASC'] },
    { key: 'contentFingerprint_index', type: 'key', attributes: ['contentFingerprint'], orders: ['ASC'] },
    { key: 'importedAt_index', type: 'key', attributes: ['importedAt'], orders: ['DESC'] },
    { ...FISCAL_YEAR_ID_INDEX },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Bank Statement Imports collection setup complete!\n');
}

/**
 * TAX_REPORTS — borradores Modelo 184 persistidos.
 */
async function setupTaxReportsCollection() {
  console.log('\n=== Setting up TAX_REPORTS collection ===\n');
  const collectionId = 'tax_reports';

  await createCollection(collectionId, 'Tax Reports');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { ...FISCAL_YEAR_ID_ATTRIBUTE },
    { type: 'integer', key: 'year', required: true, min: 2000, max: 2100 },
    { type: 'string', key: 'status', size: 20, required: true },
    { type: 'string', key: 'draft', size: 65535, required: true },
    { type: 'string', key: 'exportedAt', size: 40, required: false },
    { type: 'string', key: 'fileHash', size: 128, required: false },
    { type: 'string', key: 'presentationReference', size: 64, required: false },
    { type: 'string', key: 'createdAt', size: 40, required: false },
    { type: 'string', key: 'updatedAt', size: 40, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'fiscalYearId_index', type: 'key', attributes: ['fiscalYearId'], orders: ['ASC'] },
    { key: 'year_index', type: 'key', attributes: ['year'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Tax Reports collection setup complete!\n');
}

/**
 * Pase defensivo: garantiza fiscalYearId + índice en colecciones ya existentes.
 * Evita el fallo real visto en Cloud (recurring_expenses sin atributo mientras
 * el resto sí lo tenía), que rompía filtros y «Migrar datos sin ejercicio».
 */
async function ensureFiscalYearIdSchema() {
  console.log('\n=== Ensuring fiscalYearId on scoped collections ===\n');

  for (const collectionId of FISCAL_YEAR_SCOPED_COLLECTIONS) {
    console.log(`📦 ${collectionId}`);
    try {
      const attrs = await listAllAttributes(collectionId);
      const existing = attrs.find((a) => a.key === 'fiscalYearId');

      if (!existing) {
        await createAttribute(collectionId, { ...FISCAL_YEAR_ID_ATTRIBUTE });
        const ready = await waitForAttributeAvailable(collectionId, 'fiscalYearId');
        if (!ready) {
          console.warn(`  ⚠️  fiscalYearId creado pero aún no available en ${collectionId}`);
        }
      } else if (existing.status === 'available') {
        console.log(`  ✓ fiscalYearId already available`);
      } else if (existing.status === 'processing') {
        console.log(`  ⏳ fiscalYearId processing…`);
        await waitForAttributeAvailable(collectionId, 'fiscalYearId');
      } else {
        console.warn(`  ⚠️  fiscalYearId status=${existing.status} error=${existing.error || ''}`);
      }

      await createIndex(collectionId, { ...FISCAL_YEAR_ID_INDEX });
    } catch (error) {
      if (error.code === 404) {
        console.warn(`  ⚠️  Colección ${collectionId} no existe aún (se crea en el setup principal)`);
        continue;
      }
      throw error;
    }
  }

  console.log('\n✅ fiscalYearId schema ensure complete!\n');
}

/**
 * Pase defensivo: garantiza atributos/índices de deduplicación en instalaciones parciales.
 */
async function ensureInvoiceDedupSchema() {
  console.log('\n=== Ensuring invoice dedup schema (FEAT-DEDUP-001) ===\n');

  const ensureAttributes = async (collectionId, attributes) => {
    console.log(`📦 ${collectionId}`);
    try {
      const existingAttrs = await listAllAttributes(collectionId);
      for (const attrConfig of attributes) {
        const existing = existingAttrs.find((a) => a.key === attrConfig.key);
        if (!existing) {
          await createAttribute(collectionId, attrConfig);
          const ready = await waitForAttributeAvailable(collectionId, attrConfig.key);
          if (!ready) {
            console.warn(`  ⚠️  ${attrConfig.key} creado pero aún no available en ${collectionId}`);
          }
        } else if (existing.status === 'available') {
          console.log(`  ✓ ${attrConfig.key} already available`);
        } else if (existing.status === 'processing') {
          console.log(`  ⏳ ${attrConfig.key} processing…`);
          await waitForAttributeAvailable(collectionId, attrConfig.key);
        } else {
          console.warn(`  ⚠️  ${attrConfig.key} status=${existing.status} error=${existing.error || ''}`);
        }
      }
    } catch (error) {
      if (error.code === 404) {
        console.warn(`  ⚠️  Colección ${collectionId} no existe aún (se crea en el setup principal)`);
        return;
      }
      throw error;
    }
  };

  await ensureAttributes('invoices', INVOICE_DEDUP_ATTRIBUTES);
  for (const index of INVOICE_DEDUP_INDEXES) {
    await createIndex('invoices', index);
    await sleep(500);
  }

  await ensureAttributes('uploads', UPLOADS_DEDUP_ATTRIBUTES);

  console.log('\n✅ Invoice dedup schema ensure complete!\n');
}

/**
 * Pase defensivo: campos fiscales Modelo 184 en settings (instalaciones parciales).
 */
async function ensureSettingsFiscalSchema() {
  console.log('\n=== Ensuring settings fiscal schema (FEAT-M184-001) ===\n');

  const collectionId = 'settings';
  try {
    const existingAttrs = await listAllAttributes(collectionId);
    for (const attrConfig of SETTINGS_FISCAL_ATTRIBUTES) {
      const existing = existingAttrs.find((a) => a.key === attrConfig.key);
      if (!existing) {
        await createAttribute(collectionId, attrConfig);
        const ready = await waitForAttributeAvailable(collectionId, attrConfig.key);
        if (!ready) {
          console.warn(`  ⚠️  ${attrConfig.key} creado pero aún no available en ${collectionId}`);
        }
      } else if (existing.status === 'available') {
        console.log(`  ✓ ${attrConfig.key} already available`);
      } else if (existing.status === 'processing') {
        console.log(`  ⏳ ${attrConfig.key} processing…`);
        await waitForAttributeAvailable(collectionId, attrConfig.key);
      } else {
        console.warn(`  ⚠️  ${attrConfig.key} status=${existing.status} error=${existing.error || ''}`);
      }
      await sleep(300);
    }
  } catch (error) {
    if (error.code === 404) {
      console.warn(`  ⚠️  Colección ${collectionId} no existe aún (se crea en el setup principal)`);
      return;
    }
    throw error;
  }

  console.log('\n✅ Settings fiscal schema ensure complete!\n');
}

/**
 * Pase defensivo: aiConfig en settings (FEAT-AI-FAILOVER-001).
 */
async function ensureSettingsAiConfigSchema() {
  console.log('\n=== Ensuring settings.aiConfig schema (FEAT-AI-FAILOVER-001) ===\n');

  const collectionId = 'settings';
  try {
    const existingAttrs = await listAllAttributes(collectionId);
    const attrConfig = SETTINGS_AI_CONFIG_ATTRIBUTE;
    const existing = existingAttrs.find((a) => a.key === attrConfig.key);
    if (!existing) {
      await createAttribute(collectionId, attrConfig);
      const ready = await waitForAttributeAvailable(collectionId, attrConfig.key);
      if (!ready) {
        console.warn(`  ⚠️  ${attrConfig.key} creado pero aún no available en ${collectionId}`);
      }
    } else if (existing.status === 'available') {
      console.log(`  ✓ ${attrConfig.key} already available`);
    } else if (existing.status === 'processing') {
      console.log(`  ⏳ ${attrConfig.key} processing…`);
      await waitForAttributeAvailable(collectionId, attrConfig.key);
    } else {
      console.warn(`  ⚠️  ${attrConfig.key} status=${existing.status} error=${existing.error || ''}`);
    }
  } catch (error) {
    if (error.code === 404) {
      console.warn(`  ⚠️  Colección ${collectionId} no existe aún (se crea en el setup principal)`);
      return;
    }
    throw error;
  }

  console.log('\n✅ Settings aiConfig schema ensure complete!\n');
}

/**
 * Pase defensivo: isDeductible en facturas.
 */
async function ensureInvoiceIsDeductibleSchema() {
  console.log('\n=== Ensuring invoice isDeductible schema (FEAT-M184-001) ===\n');

  const collectionId = 'invoices';
  try {
    const existingAttrs = await listAllAttributes(collectionId);
    const existing = existingAttrs.find((a) => a.key === INVOICE_IS_DEDUCTIBLE_ATTRIBUTE.key);
    if (!existing) {
      await createAttribute(collectionId, { ...INVOICE_IS_DEDUCTIBLE_ATTRIBUTE });
      const ready = await waitForAttributeAvailable(collectionId, INVOICE_IS_DEDUCTIBLE_ATTRIBUTE.key);
      if (!ready) {
        console.warn(`  ⚠️  isDeductible creado pero aún no available en ${collectionId}`);
      }
    } else if (existing.status === 'available') {
      console.log('  ✓ isDeductible already available');
    } else if (existing.status === 'processing') {
      console.log('  ⏳ isDeductible processing…');
      await waitForAttributeAvailable(collectionId, INVOICE_IS_DEDUCTIBLE_ATTRIBUTE.key);
    } else {
      console.warn(`  ⚠️  isDeductible status=${existing.status} error=${existing.error || ''}`);
    }
  } catch (error) {
    if (error.code === 404) {
      console.warn(`  ⚠️  Colección ${collectionId} no existe aún (se crea en el setup principal)`);
      return;
    }
    throw error;
  }

  console.log('\n✅ Invoice isDeductible schema ensure complete!\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting COMPLETE Appwrite collections setup...');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);

  try {
    // Setup all collections (existing)
    await setupInvoicesCollection();
    await setupEntriesCollection();
    await setupTransactionsCollection();
    await setupSettingsCollection();
    await setupSuppliersCollection();
    await setupNotificationsCollection();
    await setupUploadsCollection();

    // Setup NEW collections (added for CBGest improvements)
    await setupApartmentsCollection();
    await setupRecurringExpensesCollection();
    await setupAiMatchHistoryCollection();
    await setupReservationsCollection();
    await setupFiscalYearsCollection();
    await setupBankStatementImportsCollection();
    await setupTaxReportsCollection();

    // Defensive pass: attribute may be missing on older Cloud installs
    await ensureFiscalYearIdSchema();
    await ensureInvoiceDedupSchema();
    await ensureSettingsFiscalSchema();
    await ensureSettingsAiConfigSchema();
    await ensureInvoiceIsDeductibleSchema();

    console.log('');
    console.log('🎉 ALL collections have been set up successfully!');
    console.log('');
    console.log('Collections configured:');
    console.log('  ✅ invoices (+ apartmentId, fiscalYearId, isDeductible, fileHash, contentFingerprint + indexes)');
    console.log('  ✅ entries (+ isDraft, fiscalYearId size=36 + index)');
    console.log('  ✅ transactions (+ contentFingerprint, importBatchId, fiscalYearId)');
    console.log('  ✅ settings (+ touristTaxConfig, aiConfig, domicilio fiscal CB, representante)');
    console.log('  ✅ suppliers (+ fiscalYearId size=36 + index)');
    console.log('  ✅ notifications');
    console.log('  ✅ uploads (+ fileSha256/isDuplicate/fiscalYearId + fileHash/duplicateMatch/forceProcess)');
    console.log('  ✅ apartments (+ apartmentType TOURIST/RESIDENTIAL, + fiscalYearId)');
    console.log('  ✅ recurring_expenses (+ fiscalYearId size=36 + index)');
    console.log('  ✅ ai_match_history');
    console.log('  ✅ reservations (+ tourist tax and deposit fields, + fiscalYearId)');
    console.log('  ✅ fiscal_years (year, status, openedAt, closedAt, notes, touristTaxPeriods)');
    console.log('  ✅ bank_statement_imports (fileSha256, contentFingerprint, fiscalYearId)');
    console.log('  ✅ tax_reports (draft Modelo 184, fiscalYearId, status)');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify: node scripts/verify-appwrite-setup.cjs');
    console.log('  2. If migrating legacy docs: node scripts/add-fiscal-year-id-attributes.cjs (idempotent)');
    console.log('  3. Dedup facturas (idempotent): node scripts/add-invoice-dedup-attributes.cjs');
    console.log('  4. Dedup extractos (idempotent): node scripts/add-bank-statement-dedup-schema.cjs');
    console.log('  5. Run the app — ejercicios filtran por fiscalYearId');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error during setup:', error.message);
    console.error('');
    if (error.response) {
      console.error('Response:', error.response);
    }
    process.exit(1);
  }
}

// Run the script
main();
