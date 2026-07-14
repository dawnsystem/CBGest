#!/usr/bin/env node

/**
 * Script to verify Appwrite setup for CBGest
 *
 * This script checks, for EVERY collection actually used by the app
 * (kept in sync with `config/appwrite.ts`, `types.ts` and `services/appwrite/*`):
 * - Database exists
 * - Storage bucket exists
 * - All collections exist
 * - All attributes are present (and flags ones still "processing")
 * - All indexes are available (and flags "failed"/"processing" ones)
 * - Indexes that MUST NOT be `unique` are not (e.g. suppliers.nif, since the
 *   same NIF is legitimately duplicated across fiscal years)
 *
 * This is the authoritative list of expected attributes — it MUST be kept in
 * sync with `scripts/setup-all-collections.cjs` (the script that creates them)
 * and with the fields actually read/written by `services/appwrite/*.ts`.
 *
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/verify-appwrite-setup.cjs
 */

const { Client, Databases, Storage, Query } = require('node-appwrite');

// Configuration from config/appwrite.ts
const CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'cbgest',
  databaseId: '691f288100019843d43e',
  storageBucketId: '691f31c9000fc8c83ab1',
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
const storage = new Storage(client);

// ============================================================================
// EXPECTED SCHEMA DEFINITIONS
// ============================================================================

const EXPECTED_COLLECTIONS = {
  invoices: {
    name: 'Invoices',
    attributes: [
      { key: 'number', type: 'string' },
      { key: 'date', type: 'string' },
      { key: 'issuerName', type: 'string' },
      { key: 'issuerNif', type: 'string' },
      { key: 'issuerAddress', type: 'string' },
      { key: 'issuerCity', type: 'string' },
      { key: 'issuerPostalCode', type: 'string' },
      { key: 'issuerCountry', type: 'string' },
      { key: 'supplierId', type: 'string' },
      { key: 'baseAmount', type: 'double' },
      { key: 'vatRate', type: 'double' },
      { key: 'vatAmount', type: 'double' },
      { key: 'totalAmount', type: 'double' },
      { key: 'type', type: 'string' }, // enum: EXPENSE | INCOME
      { key: 'status', type: 'string' }, // enum: PENDING | PROCESSED | PAID
      { key: 'category', type: 'string' },
      { key: 'history', type: 'string' },
      { key: 'fileData', type: 'string' },
      { key: 'fileType', type: 'string' },
      { key: 'appwriteFileId', type: 'string' },
      { key: 'apartmentId', type: 'string' },
      { key: 'fiscalYearId', type: 'string' },
    ],
    indexes: ['date_index', 'status_index', 'type_index', 'apartmentId_index', 'fiscalYearId_index'],
  },
  entries: {
    name: 'Accounting Entries',
    attributes: [
      { key: 'date', type: 'string' },
      { key: 'concept', type: 'string' },
      { key: 'accountCode', type: 'string' },
      { key: 'accountName', type: 'string' },
      { key: 'debit', type: 'double' },
      { key: 'credit', type: 'double' },
      { key: 'invoiceId', type: 'string' },
      { key: 'transactionId', type: 'string' },
      { key: 'reconciled', type: 'boolean' },
      { key: 'number', type: 'integer' },
      { key: 'lines', type: 'string' },
      { key: 'fileData', type: 'string' },
      { key: 'fileType', type: 'string' },
      { key: 'appwriteFileId', type: 'string' },
      { key: 'createdBy', type: 'string' },
      { key: 'createdByName', type: 'string' },
      { key: 'supplierId', type: 'string' },
      { key: 'apartmentId', type: 'string' },
      { key: 'isDraft', type: 'boolean' },
      { key: 'fiscalYearId', type: 'string' },
    ],
    indexes: ['date_index', 'reconciled_index', 'invoiceId_index', 'supplierId_index', 'apartmentId_index', 'fiscalYearId_index'],
  },
  transactions: {
    name: 'Bank Transactions',
    attributes: [
      { key: 'date', type: 'string' },
      { key: 'valueDate', type: 'string' },
      { key: 'concept', type: 'string' },
      { key: 'amount', type: 'double' },
      { key: 'balance', type: 'double' },
      { key: 'reconciledWithEntryId', type: 'string' },
      { key: 'status', type: 'string' }, // enum: PENDING | MATCHED
      { key: 'platformDetected', type: 'string' },
      { key: 'grossAmount', type: 'double' },
      { key: 'aiMatchSuggestion', type: 'string' },
      { key: 'reconciledWithInvoiceId', type: 'string' },
      { key: 'createdBy', type: 'string' },
      { key: 'createdByName', type: 'string' },
      { key: 'fiscalYearId', type: 'string' },
    ],
    indexes: ['date_index', 'status_index', 'platformDetected_index', 'fiscalYearId_index'],
  },
  settings: {
    name: 'App Settings',
    attributes: [
      { key: 'cbName', type: 'string' },
      { key: 'nif', type: 'string' },
      { key: 'fiscalRegime', type: 'string' }, // enum: GENERAL | ALQUILER_EXENTO
      { key: 'vatObligation', type: 'boolean' },
      { key: 'partners', type: 'string' },
      { key: 'touristTaxConfig', type: 'string' },
    ],
    indexes: [],
  },
  suppliers: {
    name: 'Suppliers',
    attributes: [
      { key: 'name', type: 'string' },
      { key: 'nif', type: 'string' },
      { key: 'nifType', type: 'string' }, // enum
      { key: 'address', type: 'string' },
      { key: 'city', type: 'string' },
      { key: 'postalCode', type: 'string' },
      { key: 'email', type: 'string' },
      { key: 'phone', type: 'string' },
      { key: 'category', type: 'string' },
      { key: 'notes', type: 'string' },
      { key: 'fiscalYearId', type: 'string' },
    ],
    indexes: ['name_index', 'nif_index', 'fiscalYearId_index'],
    // `nif` is intentionally duplicated across fiscal years by
    // copyMasterDataToFiscalYear(), so nif_index must stay a plain `key` index.
    // If it is `unique`, master-data copy to a new fiscal year silently fails
    // (409 is swallowed by the caller as "already copied").
    forbiddenUniqueIndexes: ['nif_index'],
  },
  notifications: {
    name: 'Notifications',
    attributes: [
      { key: 'type', type: 'string' },
      { key: 'title', type: 'string' },
      { key: 'message', type: 'string' },
      { key: 'userId', type: 'string' },
      { key: 'userName', type: 'string' },
      { key: 'timestamp', type: 'integer' },
      { key: 'read', type: 'boolean' },
      { key: 'relatedId', type: 'string' },
    ],
    indexes: ['timestamp_index', 'userId_index', 'read_index'],
  },
  uploads: {
    name: 'Upload Queue',
    attributes: [
      { key: 'uploadType', type: 'string' },
      { key: 'fileName', type: 'string' },
      { key: 'mimeType', type: 'string' },
      { key: 'fileSize', type: 'integer' },
      { key: 'storageFileId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'progress', type: 'integer' },
      { key: 'error', type: 'string' },
      { key: 'timestamp', type: 'integer' },
      { key: 'notificationDismissed', type: 'boolean' },
      { key: 'needsMapping', type: 'boolean' },
      { key: 'result', type: 'string' },
      { key: 'bankResult', type: 'string' },
    ],
    indexes: ['timestamp_index', 'status_index', 'storageFileId_index'],
  },
  apartments: {
    name: 'Apartments',
    attributes: [
      { key: 'name', type: 'string' },
      { key: 'code', type: 'string' },
      { key: 'address', type: 'string' },
      { key: 'cadastralRef', type: 'string' },
      { key: 'surfaceArea', type: 'double' },
      { key: 'maxOccupancy', type: 'integer' },
      { key: 'licenseNumber', type: 'string' },
      { key: 'apartmentType', type: 'string' }, // enum: TOURIST | RESIDENTIAL
      { key: 'notes', type: 'string' },
      { key: 'isActive', type: 'boolean' },
      { key: 'fiscalYearId', type: 'string' },
    ],
    indexes: ['name_index', 'isActive_index', 'fiscalYearId_index'],
  },
  recurring_expenses: {
    name: 'Recurring Expenses',
    attributes: [
      { key: 'name', type: 'string' },
      { key: 'description', type: 'string' },
      { key: 'estimatedAmount', type: 'double' },
      { key: 'frequency', type: 'string' }, // enum: MONTHLY | BIMONTHLY | QUARTERLY | SEMIANNUAL | ANNUAL
      { key: 'category', type: 'string' },
      { key: 'apartmentId', type: 'string' },
      { key: 'supplierId', type: 'string' },
      { key: 'dayOfMonth', type: 'integer' },
      { key: 'startDate', type: 'string' },
      { key: 'endDate', type: 'string' },
      { key: 'isDeductible', type: 'boolean' },
      { key: 'isActive', type: 'boolean' },
      { key: 'notes', type: 'string' },
    ],
    indexes: ['frequency_index', 'apartmentId_index', 'isActive_index'],
  },
  ai_match_history: {
    name: 'AI Match History',
    attributes: [
      { key: 'bankConcept', type: 'string' },
      { key: 'normalizedConcept', type: 'string' },
      { key: 'amount', type: 'double' },
      { key: 'matchType', type: 'string' }, // enum: INVOICE | SUPPLIER | CATEGORY | PLATFORM
      { key: 'matchedInvoiceId', type: 'string' },
      { key: 'matchedSupplierId', type: 'string' },
      { key: 'matchedSupplierName', type: 'string' },
      { key: 'matchedCategory', type: 'string' },
      { key: 'matchedPlatform', type: 'string' },
      { key: 'wasAiSuggestion', type: 'boolean' },
      { key: 'userConfirmed', type: 'boolean' },
      { key: 'usageCount', type: 'integer' },
      { key: 'lastUsedAt', type: 'string' },
    ],
    indexes: ['matchType_index', 'usageCount_index'],
  },
  reservations: {
    name: 'Reservations',
    attributes: [
      { key: 'apartmentId', type: 'string' },
      { key: 'apartmentName', type: 'string' },
      { key: 'checkIn', type: 'string' },
      { key: 'checkOut', type: 'string' },
      { key: 'nights', type: 'integer' },
      { key: 'pricePerNight', type: 'double' },
      { key: 'totalAmount', type: 'double' },
      { key: 'paidAmount', type: 'double' },
      { key: 'channel', type: 'string' }, // enum
      { key: 'reservationNumber', type: 'string' },
      { key: 'status', type: 'string' }, // enum
      { key: 'guestInitials', type: 'string' },
      { key: 'guestName', type: 'string' },
      { key: 'guestEmail', type: 'string' },
      { key: 'numberOfGuests', type: 'integer' },
      { key: 'numberOfChildren', type: 'integer' },
      { key: 'touristTaxAmount', type: 'double' },
      { key: 'touristTaxCollected', type: 'boolean' },
      { key: 'touristTaxCollectedDate', type: 'string' },
      { key: 'touristTaxNightsCounted', type: 'integer' },
      { key: 'depositAmount', type: 'double' },
      { key: 'depositCollected', type: 'boolean' },
      { key: 'depositCollectedDate', type: 'string' },
      { key: 'depositReturned', type: 'boolean' },
      { key: 'depositReturnedDate', type: 'string' },
      { key: 'depositRetainedAmount', type: 'double' },
      { key: 'importedAt', type: 'string' },
      { key: 'notes', type: 'string' },
      { key: 'fiscalYearId', type: 'string' },
    ],
    indexes: [
      'checkIn_index', 'apartmentId_index', 'channel_index', 'status_index',
      'touristTaxCollected_index', 'guestName_index', 'fiscalYearId_index',
    ],
  },
  fiscal_years: {
    name: 'Fiscal Years',
    attributes: [
      { key: 'year', type: 'integer' },
      { key: 'status', type: 'string' }, // enum: OPEN | CLOSED
      { key: 'openedAt', type: 'string' },
      { key: 'closedAt', type: 'string' },
      { key: 'notes', type: 'string' },
      { key: 'touristTaxPeriods', type: 'string' },
    ],
    indexes: ['year_index', 'status_index'],
  },
};

// ============================================================================
// VERIFICATION FUNCTIONS
// ============================================================================

let totalIssues = 0;
let totalChecks = 0;

function logCheck(passed, message) {
  totalChecks++;
  if (passed) {
    console.log(`  ✅ ${message}`);
  } else {
    totalIssues++;
    console.log(`  ❌ ${message}`);
  }
}

function logWarning(message) {
  console.log(`  ⚠️  ${message}`);
}

async function verifyDatabase() {
  console.log('\n📊 Verifying Database...');
  try {
    const db = await databases.get(CONFIG.databaseId);
    logCheck(true, `Database "${db.name}" exists (ID: ${db.$id})`);
    return true;
  } catch (error) {
    if (error.code === 404) {
      logCheck(false, `Database not found (ID: ${CONFIG.databaseId})`);
    } else {
      logCheck(false, `Error accessing database: ${error.message}`);
    }
    return false;
  }
}

async function verifyStorageBucket() {
  console.log('\n🗄️  Verifying Storage Bucket...');
  try {
    const bucket = await storage.getBucket(CONFIG.storageBucketId);
    logCheck(true, `Storage bucket "${bucket.name}" exists (ID: ${bucket.$id})`);
    console.log(`     Enabled: ${bucket.enabled}`);
    console.log(`     Max file size: ${(bucket.maximumFileSize / 1024 / 1024).toFixed(2)} MB`);
    return true;
  } catch (error) {
    if (error.code === 404) {
      logCheck(false, `Storage bucket not found (ID: ${CONFIG.storageBucketId})`);
    } else {
      logCheck(false, `Error accessing storage bucket: ${error.message}`);
    }
    return false;
  }
}

async function verifyCollection(collectionId, expected) {
  console.log(`\n📦 Verifying collection: ${expected.name} (${collectionId})...`);

  // Check collection exists
  let collection;
  try {
    collection = await databases.getCollection(CONFIG.databaseId, collectionId);
    logCheck(true, `Collection exists`);
  } catch (error) {
    if (error.code === 404) {
      logCheck(false, `Collection not found`);
    } else {
      logCheck(false, `Error accessing collection: ${error.message}`);
    }
    return false;
  }

  // Check attributes
  console.log('  📋 Checking attributes...');
  // NOTE: listAttributes/listIndexes paginate like any other list endpoint
  // (default limit 25) — without Query.limit() collections with more than 25
  // attributes/indexes (e.g. `reservations`) would silently report the
  // remaining ones as "missing".
  let attributes;
  try {
    attributes = await databases.listAttributes(CONFIG.databaseId, collectionId, [Query.limit(100)]);
  } catch (error) {
    logCheck(false, `Error listing attributes: ${error.message}`);
    return false;
  }

  const existingAttrs = new Map();
  for (const attr of attributes.attributes) {
    existingAttrs.set(attr.key, attr);
  }

  const missingAttrs = [];
  const processingAttrs = [];

  for (const expectedAttr of expected.attributes) {
    const attr = existingAttrs.get(expectedAttr.key);
    if (!attr) {
      missingAttrs.push(expectedAttr.key);
    } else if (attr.status === 'processing') {
      processingAttrs.push(expectedAttr.key);
    }
  }

  if (missingAttrs.length === 0) {
    logCheck(true, `All ${expected.attributes.length} attributes present`);
  } else {
    logCheck(false, `Missing ${missingAttrs.length} attributes: ${missingAttrs.join(', ')}`);
  }

  if (processingAttrs.length > 0) {
    logWarning(`${processingAttrs.length} attributes still processing: ${processingAttrs.join(', ')}`);
  }

  // Check indexes
  console.log('  📇 Checking indexes...');
  let indexes = { indexes: [] };
  if (expected.indexes.length === 0) {
    console.log('     (No indexes expected for this collection)');
  } else {
    try {
      indexes = await databases.listIndexes(CONFIG.databaseId, collectionId, [Query.limit(100)]);
    } catch (error) {
      logCheck(false, `Error listing indexes: ${error.message}`);
      return false;
    }

    const existingIndexes = new Map();
    for (const idx of indexes.indexes) {
      existingIndexes.set(idx.key, idx);
    }

    const missingIndexes = [];
    const failedIndexes = [];
    const processingIndexes = [];

    for (const expectedIndex of expected.indexes) {
      const idx = existingIndexes.get(expectedIndex);
      if (!idx) {
        missingIndexes.push(expectedIndex);
      } else if (idx.status === 'failed') {
        failedIndexes.push(expectedIndex);
      } else if (idx.status === 'processing') {
        processingIndexes.push(expectedIndex);
      }
    }

    if (missingIndexes.length === 0 && failedIndexes.length === 0) {
      logCheck(true, `All ${expected.indexes.length} indexes available`);
    } else {
      if (missingIndexes.length > 0) {
        logCheck(false, `Missing ${missingIndexes.length} indexes: ${missingIndexes.join(', ')}`);
      }
      if (failedIndexes.length > 0) {
        logCheck(false, `${failedIndexes.length} failed indexes: ${failedIndexes.join(', ')}`);
      }
    }

    if (processingIndexes.length > 0) {
      logWarning(`${processingIndexes.length} indexes still processing: ${processingIndexes.join(', ')}`);
    }
  }

  // Check indexes that must NOT be unique (e.g. suppliers.nif_index)
  if (expected.forbiddenUniqueIndexes && expected.forbiddenUniqueIndexes.length > 0) {
    const existingIndexes = new Map();
    for (const idx of indexes.indexes) {
      existingIndexes.set(idx.key, idx);
    }
    for (const indexKey of expected.forbiddenUniqueIndexes) {
      const idx = existingIndexes.get(indexKey);
      if (idx && idx.type === 'unique') {
        logCheck(
          false,
          `Index '${indexKey}' is UNIQUE — this breaks copying master data across fiscal years. ` +
          `Delete it in the Appwrite Console and recreate it as a plain 'key' index.`
        );
      } else if (idx) {
        logCheck(true, `Index '${indexKey}' is not unique (correct)`);
      }
    }
  }

  return true;
}

async function main() {
  console.log('🔍 CBGest - Appwrite Setup Verification');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project:  ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);
  console.log(`📁 Bucket:   ${CONFIG.storageBucketId}`);

  // Verify database
  const dbOk = await verifyDatabase();
  if (!dbOk) {
    console.log('\n❌ Database verification failed. Cannot continue.');
    process.exit(1);
  }

  // Verify storage bucket
  await verifyStorageBucket();

  // Verify all collections
  for (const [collectionId, expected] of Object.entries(EXPECTED_COLLECTIONS)) {
    await verifyCollection(collectionId, expected);
  }

  // Summary
  console.log('\n');
  console.log('═══════════════════════════════════════');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log(`Total checks: ${totalChecks}`);
  console.log(`Passed:       ${totalChecks - totalIssues}`);
  console.log(`Issues:       ${totalIssues}`);
  console.log('');

  if (totalIssues === 0) {
    console.log('🎉 All verifications passed! Appwrite is correctly configured.');
    console.log('');
    process.exit(0);
  } else {
    console.log(`⚠️  Found ${totalIssues} issue(s). Run the setup script to fix missing collections/attributes/indexes:`);
    console.log('   node scripts/setup-all-collections.cjs');
    console.log('');
    console.log('   Note: a `unique` index that must be a plain `key` index (see above) cannot be');
    console.log('   fixed by re-running the setup script — it must be deleted and recreated manually.');
    console.log('');
    process.exit(1);
  }
}

// Run verification
main().catch(error => {
  console.error('');
  console.error('❌ Unexpected error:', error.message);
  console.error('');
  process.exit(1);
});
