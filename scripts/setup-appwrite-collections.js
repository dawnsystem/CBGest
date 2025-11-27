#!/usr/bin/env node

/**
 * Script to automatically configure Appwrite for CBGest
 *
 * This script creates/updates:
 * - Collections with attributes and permissions
 * - Database indexes for query performance
 * - Appwrite Functions (scheduled tasks)
 *
 * Usage:
 *   node scripts/setup-appwrite-collections.js
 *
 * Requirements:
 *   - Appwrite API Key with Database + Functions write permissions
 *   - Set environment variable: APPWRITE_API_KEY
 */

const { Client, Databases, Functions, Permission, Role } = require('node-appwrite');

// Configuration from config/appwrite.ts
const CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'cbgest',
  databaseId: '691f288100019843d43e',
  // Collection IDs (existing collections)
  collections: {
    invoices: 'invoices',
    accountingEntries: 'accountingEntries',
    bankTransactions: 'bankTransactions',
    suppliers: 'suppliers',
    settings: 'settings',
    notifications: 'notifications',
    uploads: 'uploads',
    apartments: 'apartments',
    recurringExpenses: 'recurring_expenses',
    aiMatchHistory: 'ai_match_history',
    reservations: 'reservations',
  }
};

// Get API key from environment variable
const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY environment variable is required');
  console.error('');
  console.error('Please set it before running this script:');
  console.error('  export APPWRITE_API_KEY="your-api-key-here"');
  console.error('');
  console.error('To get an API key:');
  console.error('  1. Go to https://cloud.appwrite.io/');
  console.error('  2. Select your project: cbgest');
  console.error('  3. Go to Settings > API Keys');
  console.error('  4. Create a new API Key with Database + Functions permissions');
  process.exit(1);
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);
const functions = new Functions(client);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Wait helper
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if collection exists
 */
async function collectionExists(collectionId) {
  try {
    await databases.getCollection(CONFIG.databaseId, collectionId);
    return true;
  } catch (error) {
    if (error.code === 404) return false;
    throw error;
  }
}

/**
 * Create a collection
 */
async function createCollection(collectionId, name) {
  try {
    console.log(`📦 Creating collection: ${name} (${collectionId})...`);

    const collection = await databases.createCollection(
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

    console.log(`✅ Collection '${name}' created successfully`);
    return collection;
  } catch (error) {
    if (error.code === 409) {
      console.log(`⚠️  Collection '${name}' already exists, skipping creation`);
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

    let result;
    switch (type) {
      case 'string':
        result = await databases.createStringAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.size,
          config.required,
          config.default,
          config.array || false
        );
        break;

      case 'integer':
        result = await databases.createIntegerAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.min,
          config.max,
          config.default,
          config.array || false
        );
        break;

      case 'float':
        result = await databases.createFloatAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.min,
          config.max,
          config.default,
          config.array || false
        );
        break;

      case 'boolean':
        result = await databases.createBooleanAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.default,
          config.array || false
        );
        break;

      case 'datetime':
        result = await databases.createDatetimeAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.required,
          config.default,
          config.array || false
        );
        break;

      case 'enum':
        result = await databases.createEnumAttribute(
          CONFIG.databaseId,
          collectionId,
          key,
          config.elements,
          config.required,
          config.default,
          config.array || false
        );
        break;

      default:
        throw new Error(`Unsupported attribute type: ${type}`);
    }

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
 * Create an index
 */
async function createIndex(collectionId, indexConfig) {
  const { key, type, attributes, orders } = indexConfig;

  try {
    console.log(`  - Creating index: ${key}...`);

    const result = await databases.createIndex(
      CONFIG.databaseId,
      collectionId,
      key,
      type,
      attributes,
      orders
    );

    console.log(`    ✓ Index '${key}' created`);
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Index '${key}' already exists, skipping`);
      return null;
    }
    throw error;
  }
}

/**
 * Check if function exists
 */
async function functionExists(functionId) {
  try {
    await functions.get(functionId);
    return true;
  } catch (error) {
    if (error.code === 404) return false;
    throw error;
  }
}

/**
 * Create a function
 */
async function createFunction(functionConfig) {
  const { id, name, runtime, execute, events, schedule, timeout, enabled } = functionConfig;

  try {
    console.log(`⚡ Creating function: ${name} (${id})...`);

    // Check if already exists
    if (await functionExists(id)) {
      console.log(`⚠️  Function '${name}' already exists, skipping creation`);
      return null;
    }

    const result = await functions.create(
      id,
      name,
      runtime || 'node-18.0',
      execute || [Role.users()],
      events || [],
      schedule || '',
      timeout || 15,
      enabled !== false
    );

    console.log(`✅ Function '${name}' created successfully`);
    console.log(`   📝 Note: You need to deploy code to this function via Appwrite Console or CLI`);
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`⚠️  Function '${name}' already exists, skipping`);
      return null;
    }
    console.error(`❌ Error creating function '${name}':`, error.message);
    return null;
  }
}

// ============================================================================
// INDEX DEFINITIONS FOR EXISTING COLLECTIONS
// ============================================================================

/**
 * Setup indexes for invoices collection (performance optimization)
 */
async function setupInvoicesIndexes() {
  console.log('\n=== Setting up INVOICES indexes ===\n');

  const collectionId = CONFIG.collections.invoices;

  // Check if collection exists
  if (!await collectionExists(collectionId)) {
    console.log(`⚠️  Collection '${collectionId}' does not exist, skipping indexes`);
    return;
  }

  console.log('📇 Creating indexes...');

  const indexes = [
    { key: 'date_desc', type: 'key', attributes: ['date'], orders: ['DESC'] },
    { key: 'status_asc', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'type_asc', type: 'key', attributes: ['type'], orders: ['ASC'] },
    { key: 'supplierId_asc', type: 'key', attributes: ['supplierId'], orders: ['ASC'] },
    { key: 'apartmentId_asc', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    // Compound index for common queries
    { key: 'type_status', type: 'key', attributes: ['type', 'status'], orders: ['ASC', 'ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Invoices indexes setup complete!\n');
}

/**
 * Setup indexes for accountingEntries collection
 */
async function setupAccountingEntriesIndexes() {
  console.log('\n=== Setting up ACCOUNTING_ENTRIES indexes ===\n');

  const collectionId = CONFIG.collections.accountingEntries;

  if (!await collectionExists(collectionId)) {
    console.log(`⚠️  Collection '${collectionId}' does not exist, skipping indexes`);
    return;
  }

  console.log('📇 Creating indexes...');

  const indexes = [
    { key: 'date_desc', type: 'key', attributes: ['date'], orders: ['DESC'] },
    { key: 'invoiceId_asc', type: 'key', attributes: ['invoiceId'], orders: ['ASC'] },
    { key: 'accountCode_asc', type: 'key', attributes: ['accountCode'], orders: ['ASC'] },
    { key: 'type_asc', type: 'key', attributes: ['type'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Accounting Entries indexes setup complete!\n');
}

/**
 * Setup indexes for bankTransactions collection
 */
async function setupBankTransactionsIndexes() {
  console.log('\n=== Setting up BANK_TRANSACTIONS indexes ===\n');

  const collectionId = CONFIG.collections.bankTransactions;

  if (!await collectionExists(collectionId)) {
    console.log(`⚠️  Collection '${collectionId}' does not exist, skipping indexes`);
    return;
  }

  console.log('📇 Creating indexes...');

  const indexes = [
    { key: 'date_desc', type: 'key', attributes: ['date'], orders: ['DESC'] },
    { key: 'status_asc', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'matchedInvoiceId_asc', type: 'key', attributes: ['matchedInvoiceId'], orders: ['ASC'] },
    // Fulltext index for concept search
    { key: 'concept_fulltext', type: 'fulltext', attributes: ['concept'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Bank Transactions indexes setup complete!\n');
}

/**
 * Setup indexes for suppliers collection
 */
async function setupSuppliersIndexes() {
  console.log('\n=== Setting up SUPPLIERS indexes ===\n');

  const collectionId = CONFIG.collections.suppliers;

  if (!await collectionExists(collectionId)) {
    console.log(`⚠️  Collection '${collectionId}' does not exist, skipping indexes`);
    return;
  }

  console.log('📇 Creating indexes...');

  const indexes = [
    { key: 'name_asc', type: 'key', attributes: ['name'], orders: ['ASC'] },
    { key: 'nif_asc', type: 'key', attributes: ['nif'], orders: ['ASC'] },
    { key: 'name_fulltext', type: 'fulltext', attributes: ['name'], orders: ['ASC'] },
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Suppliers indexes setup complete!\n');
}

// ============================================================================
// COLLECTION SETUP FUNCTIONS (NEW COLLECTIONS)
// ============================================================================

/**
 * Setup notifications collection
 */
async function setupNotificationsCollection() {
  console.log('\n=== Setting up NOTIFICATIONS collection ===\n');

  const collectionId = CONFIG.collections.notifications;

  // Create collection
  await createCollection(collectionId, 'Notifications');
  await wait(1000);

  // Create attributes
  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'type', size: 50, required: true },
    { type: 'string', key: 'title', size: 255, required: true },
    { type: 'string', key: 'message', size: 1000, required: true },
    { type: 'string', key: 'userId', size: 255, required: true },
    { type: 'string', key: 'userName', size: 255, required: true },
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    { type: 'boolean', key: 'read', required: true, default: false },
    { type: 'string', key: 'relatedId', size: 255, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await wait(500);
  }

  // Wait for attributes to be ready
  console.log('\n⏳ Waiting for attributes to be ready...');
  await wait(3000);

  // Create indexes
  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'timestamp_index', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    { key: 'userId_index', type: 'key', attributes: ['userId'], orders: ['ASC'] },
    { key: 'read_index', type: 'key', attributes: ['read'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Notifications collection setup complete!\n');
}

/**
 * Setup uploads collection
 */
async function setupUploadsCollection() {
  console.log('\n=== Setting up UPLOADS collection ===\n');

  const collectionId = CONFIG.collections.uploads;

  await createCollection(collectionId, 'Upload Queue');
  await wait(1000);

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'uploadType', size: 50, required: true },
    { type: 'string', key: 'fileName', size: 255, required: true },
    { type: 'string', key: 'mimeType', size: 100, required: true },
    { type: 'string', key: 'base64Data', size: 10000000, required: false },
    { type: 'string', key: 'status', size: 50, required: true },
    { type: 'integer', key: 'progress', required: true, min: 0, max: 100, default: 0 },
    { type: 'string', key: 'error', size: 1000, required: false },
    { type: 'integer', key: 'timestamp', required: true, min: 0, max: 9999999999999 },
    { type: 'boolean', key: 'notificationDismissed', required: false, default: false },
    { type: 'string', key: 'result', size: 10000, required: false },
    { type: 'string', key: 'bankResult', size: 50000, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await wait(500);
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await wait(3000);

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'timestamp_index', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'uploadType_index', type: 'key', attributes: ['uploadType'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Uploads collection setup complete!\n');
}

/**
 * Setup apartments collection
 */
async function setupApartmentsCollection() {
  console.log('\n=== Setting up APARTMENTS collection ===\n');

  const collectionId = CONFIG.collections.apartments;

  await createCollection(collectionId, 'Apartamentos');
  await wait(1000);

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'name', size: 255, required: true },
    { type: 'string', key: 'code', size: 50, required: false },
    { type: 'string', key: 'address', size: 500, required: false },
    { type: 'string', key: 'cadastralRef', size: 100, required: false },
    { type: 'float', key: 'surfaceArea', required: false, min: 0, max: 10000 },
    { type: 'integer', key: 'maxOccupancy', required: false, min: 1, max: 100 },
    { type: 'string', key: 'licenseNumber', size: 100, required: false },
    { type: 'string', key: 'notes', size: 2000, required: false },
    { type: 'boolean', key: 'isActive', required: true, default: true },
    { type: 'string', key: 'createdAt', size: 50, required: false },
    { type: 'string', key: 'updatedAt', size: 50, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await wait(500);
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await wait(3000);

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'name_index', type: 'key', attributes: ['name'], orders: ['ASC'] },
    { key: 'code_index', type: 'key', attributes: ['code'], orders: ['ASC'] },
    { key: 'isActive_index', type: 'key', attributes: ['isActive'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Apartments collection setup complete!\n');
}

/**
 * Setup recurring_expenses collection
 */
async function setupRecurringExpensesCollection() {
  console.log('\n=== Setting up RECURRING_EXPENSES collection ===\n');

  const collectionId = CONFIG.collections.recurringExpenses;

  await createCollection(collectionId, 'Gastos Recurrentes');
  await wait(1000);

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'name', size: 255, required: true },
    { type: 'string', key: 'description', size: 1000, required: false },
    { type: 'float', key: 'estimatedAmount', required: true, min: 0, max: 999999999 },
    { type: 'string', key: 'frequency', size: 50, required: true },
    { type: 'string', key: 'category', size: 255, required: false },
    { type: 'string', key: 'apartmentId', size: 255, required: false },
    { type: 'string', key: 'supplierId', size: 255, required: false },
    { type: 'integer', key: 'dayOfMonth', required: false, min: 1, max: 31 },
    { type: 'string', key: 'startDate', size: 50, required: false },
    { type: 'string', key: 'endDate', size: 50, required: false },
    { type: 'boolean', key: 'isDeductible', required: true, default: true },
    { type: 'boolean', key: 'isActive', required: true, default: true },
    { type: 'string', key: 'notes', size: 2000, required: false },
    { type: 'string', key: 'createdAt', size: 50, required: false },
    { type: 'string', key: 'updatedAt', size: 50, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await wait(500);
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await wait(3000);

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'name_index', type: 'key', attributes: ['name'], orders: ['ASC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { key: 'frequency_index', type: 'key', attributes: ['frequency'], orders: ['ASC'] },
    { key: 'isActive_index', type: 'key', attributes: ['isActive'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Recurring Expenses collection setup complete!\n');
}

/**
 * Setup ai_match_history collection
 */
async function setupAIMatchHistoryCollection() {
  console.log('\n=== Setting up AI_MATCH_HISTORY collection ===\n');

  const collectionId = CONFIG.collections.aiMatchHistory;

  await createCollection(collectionId, 'Historial Matches IA');
  await wait(1000);

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'bankConcept', size: 500, required: true },
    { type: 'string', key: 'normalizedConcept', size: 500, required: false },
    { type: 'float', key: 'amount', required: true, min: -999999999, max: 999999999 },
    { type: 'string', key: 'matchType', size: 50, required: true },
    { type: 'string', key: 'matchedInvoiceId', size: 255, required: false },
    { type: 'string', key: 'matchedSupplierId', size: 255, required: false },
    { type: 'string', key: 'matchedSupplierName', size: 255, required: false },
    { type: 'string', key: 'matchedCategory', size: 255, required: false },
    { type: 'string', key: 'matchedPlatform', size: 50, required: false },
    { type: 'boolean', key: 'wasAiSuggestion', required: true, default: true },
    { type: 'boolean', key: 'userConfirmed', required: true, default: false },
    { type: 'integer', key: 'usageCount', required: true, min: 0, max: 999999, default: 1 },
    { type: 'string', key: 'createdAt', size: 50, required: false },
    { type: 'string', key: 'lastUsedAt', size: 50, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await wait(500);
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await wait(3000);

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'bankConcept_index', type: 'fulltext', attributes: ['bankConcept'], orders: ['ASC'] },
    { key: 'matchType_index', type: 'key', attributes: ['matchType'], orders: ['ASC'] },
    { key: 'usageCount_index', type: 'key', attributes: ['usageCount'], orders: ['DESC'] },
    { key: 'userConfirmed_index', type: 'key', attributes: ['userConfirmed'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ AI Match History collection setup complete!\n');
}

/**
 * Setup reservations collection
 */
async function setupReservationsCollection() {
  console.log('\n=== Setting up RESERVATIONS collection ===\n');

  const collectionId = CONFIG.collections.reservations;

  await createCollection(collectionId, 'Reservas');
  await wait(1000);

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'apartmentId', size: 255, required: false },
    { type: 'string', key: 'apartmentName', size: 255, required: true },
    { type: 'string', key: 'checkIn', size: 50, required: true },
    { type: 'string', key: 'checkOut', size: 50, required: true },
    { type: 'integer', key: 'nights', required: true, min: 1, max: 365 },
    { type: 'float', key: 'pricePerNight', required: true, min: 0, max: 99999 },
    { type: 'float', key: 'totalAmount', required: true, min: 0, max: 999999 },
    { type: 'float', key: 'paidAmount', required: true, min: 0, max: 999999, default: 0 },
    { type: 'string', key: 'channel', size: 50, required: true },
    { type: 'string', key: 'reservationNumber', size: 100, required: true },
    { type: 'string', key: 'status', size: 50, required: true },
    { type: 'string', key: 'guestInitials', size: 20, required: false },
    { type: 'string', key: 'importedAt', size: 50, required: false },
    { type: 'string', key: 'notes', size: 2000, required: false },
  ];

  for (const attr of attributes) {
    await createAttribute(collectionId, attr);
    await wait(500);
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await wait(3000);

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'checkIn_index', type: 'key', attributes: ['checkIn'], orders: ['DESC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { key: 'channel_index', type: 'key', attributes: ['channel'], orders: ['ASC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'reservationNumber_index', type: 'key', attributes: ['reservationNumber'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await wait(500);
  }

  console.log('\n✅ Reservations collection setup complete!\n');
}

// ============================================================================
// APPWRITE FUNCTIONS SETUP
// ============================================================================

/**
 * Setup Appwrite Functions for scheduled tasks
 */
async function setupFunctions() {
  console.log('\n=== Setting up APPWRITE FUNCTIONS ===\n');

  const functionsToCreate = [
    {
      id: 'cleanup-uploads',
      name: 'Limpieza Cola Subidas',
      runtime: 'node-18.0',
      execute: [Role.users()],
      events: [],
      schedule: '0 3 * * *', // Daily at 3 AM
      timeout: 60,
      enabled: true,
      description: 'Elimina items completados de la cola de subidas con más de 7 días'
    },
    {
      id: 'backup-data',
      name: 'Backup Datos',
      runtime: 'node-18.0',
      execute: [Role.users()],
      events: [],
      schedule: '0 2 * * 0', // Weekly on Sunday at 2 AM
      timeout: 300,
      enabled: true,
      description: 'Exporta datos a JSON para backup'
    },
    {
      id: 'tax-reminders',
      name: 'Recordatorios Fiscales',
      runtime: 'node-18.0',
      execute: [Role.users()],
      events: [],
      schedule: '0 9 1 1,4,7,10 *', // 1st day of Jan, Apr, Jul, Oct at 9 AM
      timeout: 30,
      enabled: true,
      description: 'Envía recordatorios de declaraciones trimestrales'
    },
  ];

  console.log('⚡ Creating functions...\n');

  for (const func of functionsToCreate) {
    await createFunction(func);
    console.log(`   📄 ${func.description}`);
    console.log(`   ⏰ Schedule: ${func.schedule || 'No schedule (manual)'}`);
    console.log('');
    await wait(500);
  }

  console.log('\n✅ Functions setup complete!\n');
  console.log('📝 IMPORTANT: You need to deploy code to each function.');
  console.log('   See the "functions" directory for example code, or create via:');
  console.log('   - Appwrite Console > Functions > [Function] > Deploy');
  console.log('   - Appwrite CLI: appwrite functions createDeployment');
  console.log('');
}

// ============================================================================
// WEBHOOKS DOCUMENTATION
// ============================================================================

/**
 * Print webhooks documentation (must be created manually in console)
 */
function printWebhooksDocumentation() {
  console.log('\n=== WEBHOOKS CONFIGURATION (Manual) ===\n');
  console.log('⚠️  Webhooks must be created manually in Appwrite Console.');
  console.log('   Go to: Project Settings > Webhooks > Add Webhook\n');

  const webhooks = [
    {
      name: 'Nueva Factura',
      events: ['databases.*.collections.invoices.documents.*.create'],
      url: 'https://your-webhook-endpoint.com/new-invoice',
      description: 'Notifica cuando se crea una nueva factura'
    },
    {
      name: 'Factura Actualizada',
      events: ['databases.*.collections.invoices.documents.*.update'],
      url: 'https://your-webhook-endpoint.com/invoice-updated',
      description: 'Notifica cuando se actualiza una factura'
    },
    {
      name: 'Backup Trigger',
      events: ['databases.*.collections.*.documents.*.create', 'databases.*.collections.*.documents.*.delete'],
      url: 'https://your-webhook-endpoint.com/backup-trigger',
      description: 'Trigger para backup incremental de datos'
    },
  ];

  console.log('Recommended webhooks to configure:\n');

  webhooks.forEach((webhook, index) => {
    console.log(`${index + 1}. ${webhook.name}`);
    console.log(`   Events: ${webhook.events.join(', ')}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`   Description: ${webhook.description}`);
    console.log('');
  });

  console.log('💡 TIP: Use Appwrite Functions as webhook endpoints for server-side processing.\n');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🚀 Starting Appwrite setup for CBGest...');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);

  try {
    // ==========================================
    // PART 1: Indexes for existing collections
    // ==========================================
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PART 1: DATABASE INDEXES (Existing Collections)');
    console.log('═══════════════════════════════════════════════════════════════');

    await setupInvoicesIndexes();
    await setupAccountingEntriesIndexes();
    await setupBankTransactionsIndexes();
    await setupSuppliersIndexes();

    // ==========================================
    // PART 2: New collections
    // ==========================================
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PART 2: NEW COLLECTIONS');
    console.log('═══════════════════════════════════════════════════════════════');

    await setupNotificationsCollection();
    await setupUploadsCollection();
    await setupApartmentsCollection();
    await setupRecurringExpensesCollection();
    await setupAIMatchHistoryCollection();
    await setupReservationsCollection();

    // ==========================================
    // PART 3: Appwrite Functions
    // ==========================================
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PART 3: APPWRITE FUNCTIONS');
    console.log('═══════════════════════════════════════════════════════════════');

    await setupFunctions();

    // ==========================================
    // PART 4: Webhooks Documentation
    // ==========================================
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PART 4: WEBHOOKS (Documentation)');
    console.log('═══════════════════════════════════════════════════════════════');

    printWebhooksDocumentation();

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🎉 SETUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('✅ Indexes created for:');
    console.log('   - invoices (date, status, type, supplierId, apartmentId)');
    console.log('   - accountingEntries (date, invoiceId, accountCode, type)');
    console.log('   - bankTransactions (date, status, matchedInvoiceId, concept)');
    console.log('   - suppliers (name, nif)');
    console.log('');
    console.log('✅ Collections created/verified:');
    console.log('   - notifications');
    console.log('   - uploads');
    console.log('   - apartments');
    console.log('   - recurring_expenses');
    console.log('   - ai_match_history');
    console.log('   - reservations');
    console.log('');
    console.log('✅ Functions created (need code deployment):');
    console.log('   - cleanup-uploads (daily at 3 AM)');
    console.log('   - backup-data (weekly on Sunday at 2 AM)');
    console.log('   - tax-reminders (quarterly on 1st day at 9 AM)');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Deploy code to the functions via Appwrite Console');
    console.log('   2. Configure webhooks manually if needed');
    console.log('   3. Verify indexes in Appwrite Console > Database > Collection > Indexes');
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
