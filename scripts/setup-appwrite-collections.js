#!/usr/bin/env node

/**
 * Script to automatically create Appwrite collections for CBGest
 *
 * This script creates all required collections with attributes, indexes, and permissions.
 *
 * Usage:
 *   node scripts/setup-appwrite-collections.js
 *
 * Requirements:
 *   - Appwrite API Key with Database write permissions
 *   - Set environment variable: APPWRITE_API_KEY
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
  console.error('');
  console.error('To get an API key:');
  console.error('  1. Go to https://cloud.appwrite.io/');
  console.error('  2. Select your project: cbgest');
  console.error('  3. Go to Settings > API Keys');
  console.error('  4. Create a new API Key with Database permissions');
  process.exit(1);
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId)
  .setKey(API_KEY);

const databases = new Databases(client);

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
 * Setup notifications collection
 */
async function setupNotificationsCollection() {
  console.log('\n=== Setting up NOTIFICATIONS collection ===\n');

  const collectionId = 'notifications';

  // Create collection
  await createCollection(collectionId, 'Notifications');

  // Wait a bit for collection to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

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
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Wait for attributes to be ready
  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Create indexes
  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'timestamp_index', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    { key: 'userId_index', type: 'key', attributes: ['userId'], orders: ['ASC'] },
    { key: 'read_index', type: 'key', attributes: ['read'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Notifications collection setup complete!\n');
}

/**
 * Setup uploads collection
 */
async function setupUploadsCollection() {
  console.log('\n=== Setting up UPLOADS collection ===\n');

  const collectionId = 'uploads';

  await createCollection(collectionId, 'Upload Queue');
  await new Promise(resolve => setTimeout(resolve, 1000));

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
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'timestamp_index', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
    { key: 'status_index', type: 'key', attributes: ['status'], orders: ['ASC'] },
    { key: 'uploadType_index', type: 'key', attributes: ['uploadType'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Uploads collection setup complete!\n');
}

/**
 * Setup apartments collection
 */
async function setupApartmentsCollection() {
  console.log('\n=== Setting up APARTMENTS collection ===\n');

  const collectionId = 'apartments';

  await createCollection(collectionId, 'Apartamentos');
  await new Promise(resolve => setTimeout(resolve, 1000));

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
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'name_index', type: 'key', attributes: ['name'], orders: ['ASC'] },
    { key: 'code_index', type: 'key', attributes: ['code'], orders: ['ASC'] },
    { key: 'isActive_index', type: 'key', attributes: ['isActive'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Apartments collection setup complete!\n');
}

/**
 * Setup recurring_expenses collection
 */
async function setupRecurringExpensesCollection() {
  console.log('\n=== Setting up RECURRING_EXPENSES collection ===\n');

  const collectionId = 'recurring_expenses';

  await createCollection(collectionId, 'Gastos Recurrentes');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    { type: 'string', key: 'name', size: 255, required: true },
    { type: 'string', key: 'description', size: 1000, required: false },
    { type: 'float', key: 'estimatedAmount', required: true, min: 0, max: 999999999 },
    { type: 'string', key: 'frequency', size: 50, required: true }, // MONTHLY, BIMONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL
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
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n⏳ Waiting for attributes to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📇 Creating indexes...');

  const indexes = [
    { key: 'name_index', type: 'key', attributes: ['name'], orders: ['ASC'] },
    { key: 'apartmentId_index', type: 'key', attributes: ['apartmentId'], orders: ['ASC'] },
    { key: 'frequency_index', type: 'key', attributes: ['frequency'], orders: ['ASC'] },
    { key: 'isActive_index', type: 'key', attributes: ['isActive'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Recurring Expenses collection setup complete!\n');
}

/**
 * Setup ai_match_history collection
 */
async function setupAIMatchHistoryCollection() {
  console.log('\n=== Setting up AI_MATCH_HISTORY collection ===\n');

  const collectionId = 'ai_match_history';

  await createCollection(collectionId, 'Historial Matches IA');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    // Bank transaction info
    { type: 'string', key: 'bankConcept', size: 500, required: true },
    { type: 'string', key: 'normalizedConcept', size: 500, required: false },
    { type: 'float', key: 'amount', required: true, min: -999999999, max: 999999999 },
    // Match result
    { type: 'string', key: 'matchType', size: 50, required: true }, // INVOICE, SUPPLIER, RECURRING, PLATFORM
    { type: 'string', key: 'matchedInvoiceId', size: 255, required: false },
    { type: 'string', key: 'matchedSupplierId', size: 255, required: false },
    { type: 'string', key: 'matchedSupplierName', size: 255, required: false },
    { type: 'string', key: 'matchedCategory', size: 255, required: false },
    { type: 'string', key: 'matchedPlatform', size: 50, required: false },
    // Feedback
    { type: 'boolean', key: 'wasAiSuggestion', required: true, default: true },
    { type: 'boolean', key: 'userConfirmed', required: true, default: false },
    { type: 'integer', key: 'usageCount', required: true, min: 0, max: 999999, default: 1 },
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
    { key: 'bankConcept_index', type: 'fulltext', attributes: ['bankConcept'], orders: ['ASC'] },
    { key: 'matchType_index', type: 'key', attributes: ['matchType'], orders: ['ASC'] },
    { key: 'usageCount_index', type: 'key', attributes: ['usageCount'], orders: ['DESC'] },
    { key: 'userConfirmed_index', type: 'key', attributes: ['userConfirmed'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ AI Match History collection setup complete!\n');
}

/**
 * Setup reservations collection
 */
async function setupReservationsCollection() {
  console.log('\n=== Setting up RESERVATIONS collection ===\n');

  const collectionId = 'reservations';

  await createCollection(collectionId, 'Reservas');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📋 Creating attributes...');

  const attributes = [
    { type: 'string', key: 'id', size: 255, required: true },
    // Core booking data
    { type: 'string', key: 'apartmentId', size: 255, required: false },
    { type: 'string', key: 'apartmentName', size: 255, required: true },
    { type: 'string', key: 'checkIn', size: 50, required: true }, // ISO date
    { type: 'string', key: 'checkOut', size: 50, required: true }, // ISO date
    { type: 'integer', key: 'nights', required: true, min: 1, max: 365 },
    // Financial data
    { type: 'float', key: 'pricePerNight', required: true, min: 0, max: 99999 },
    { type: 'float', key: 'totalAmount', required: true, min: 0, max: 999999 },
    { type: 'float', key: 'paidAmount', required: true, min: 0, max: 999999, default: 0 },
    // Booking reference
    { type: 'string', key: 'channel', size: 50, required: true }, // Booking, Airbnb, Direct, Agoda, Vrbo, Other
    { type: 'string', key: 'reservationNumber', size: 100, required: true },
    { type: 'string', key: 'status', size: 50, required: true }, // New, Confirmed, Paid, PaidCC, Cancelled, Completed
    // Minimal guest info (GDPR compliant)
    { type: 'string', key: 'guestInitials', size: 20, required: false },
    // Metadata
    { type: 'string', key: 'importedAt', size: 50, required: false },
    { type: 'string', key: 'notes', size: 2000, required: false },
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
    { key: 'reservationNumber_index', type: 'key', attributes: ['reservationNumber'], orders: ['ASC'] }
  ];

  for (const index of indexes) {
    await createIndex(collectionId, index);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Reservations collection setup complete!\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Appwrite collections setup...');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);

  try {
    // Original collections
    await setupNotificationsCollection();
    await setupUploadsCollection();

    // NEW collections for CBGest improvements
    await setupApartmentsCollection();
    await setupRecurringExpensesCollection();
    await setupAIMatchHistoryCollection();
    await setupReservationsCollection();

    console.log('');
    console.log('🎉 All collections have been set up successfully!');
    console.log('');
    console.log('Collections created:');
    console.log('  - notifications');
    console.log('  - uploads');
    console.log('  - apartments');
    console.log('  - recurring_expenses');
    console.log('  - ai_match_history');
    console.log('  - reservations');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify the collections in Appwrite Console');
    console.log('  2. Run your application - the 404 errors should be gone');
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
