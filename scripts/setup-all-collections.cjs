#!/usr/bin/env node

/**
 * Script to automatically create ALL Appwrite collections for CBGest
 *
 * This script creates/updates ALL collections with all required attributes.
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/setup-all-collections.js
 */

const { Client, Databases, Permission, Role } = require('node-appwrite');

// Configuration from config/appwrite.ts
const CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'cbgest',
  databaseId: '691f288100019843d43e',
};

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
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    const indexes = await databases.listIndexes(CONFIG.databaseId, collectionId);
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
    { type: 'boolean', key: 'reconciled', required: false, default: false },
    // Lines - JSON string containing array of AccountingEntryLine for double-entry accounting
    { type: 'string', key: 'lines', size: 50000, required: false },
    // File references
    { type: 'string', key: 'fileData', size: 10000000, required: false },
    { type: 'string', key: 'fileType', size: 100, required: false },
    { type: 'string', key: 'appwriteFileId', size: 100, required: false },
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
    { key: 'nif_index', type: 'unique', attributes: ['nif'], orders: ['ASC'] },
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
 */
async function setupUploadsCollection() {
  console.log('\n=== Setting up UPLOADS collection ===\n');
  const collectionId = 'uploads';

  await createCollection(collectionId, 'Upload Queue');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'uploadType', size: 50, required: true },
    { type: 'string', key: 'fileName', size: 255, required: true },
    { type: 'string', key: 'mimeType', size: 100, required: true },
    { type: 'string', key: 'base64Data', size: 10000000, required: false },
    { type: 'string', key: 'status', size: 50, required: true },
    { type: 'integer', key: 'progress', required: false, min: 0, max: 100, default: 0 },
    { type: 'string', key: 'error', size: 1000, required: false },
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    { type: 'boolean', key: 'notificationDismissed', required: false, default: false },
    { type: 'boolean', key: 'needsMapping', required: false, default: false },
    { type: 'string', key: 'result', size: 50000, required: false },
    { type: 'string', key: 'bankResult', size: 100000, required: false },
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
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Uploads collection setup complete!\n');
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
    { type: 'string', key: 'licenseNumber', size: 100, required: false }, // Licencia turística
    { type: 'string', key: 'notes', size: 2000, required: false },
    { type: 'boolean', key: 'isActive', required: false, default: true },
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
    { type: 'string', key: 'createdAt', size: 50, required: false },
    { type: 'string', key: 'updatedAt', size: 50, required: false },
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
    { type: 'string', key: 'createdAt', size: 50, required: false },
    { type: 'string', key: 'lastUsedAt', size: 50, required: false },
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

    console.log('');
    console.log('🎉 ALL collections have been set up successfully!');
    console.log('');
    console.log('Collections configured:');
    console.log('  ✅ invoices (+ apartmentId field)');
    console.log('  ✅ entries');
    console.log('  ✅ transactions (+ platformDetected, grossAmount, aiMatchSuggestion fields)');
    console.log('  ✅ settings');
    console.log('  ✅ suppliers');
    console.log('  ✅ notifications');
    console.log('  ✅ uploads');
    console.log('  ✅ apartments (NEW)');
    console.log('  ✅ recurring_expenses (NEW)');
    console.log('  ✅ ai_match_history (NEW)');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify the collections in Appwrite Console');
    console.log('  2. Update config/appwrite.ts with new collection IDs');
    console.log('  3. Run your application - data should now be saved correctly');
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
