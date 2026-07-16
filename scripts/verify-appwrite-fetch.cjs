#!/usr/bin/env node

/**
 * Script to verify Appwrite setup using direct fetch calls
 */

const { getAppwriteConfig } = require('./load-appwrite-config.cjs');

const CONFIG = getAppwriteConfig();

const API_KEY = process.env.APPWRITE_API_KEY;

if (!API_KEY) {
  console.error('APPWRITE_API_KEY is required');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': CONFIG.projectId,
  'X-Appwrite-Key': API_KEY,
};

// Expected collections and their attributes/indexes
const EXPECTED_COLLECTIONS = {
  invoices: {
    name: 'Invoices',
    attributes: ['number', 'date', 'issuerName', 'issuerNif', 'issuerAddress', 'issuerCity',
                 'issuerPostalCode', 'issuerCountry', 'supplierId', 'baseAmount', 'vatRate',
                 'vatAmount', 'totalAmount', 'type', 'status', 'category', 'history',
                 'fileData', 'fileType', 'appwriteFileId'],
    indexes: ['date_index', 'status_index', 'type_index'],
  },
  entries: {
    name: 'Accounting Entries',
    attributes: ['date', 'concept', 'accountCode', 'accountName', 'debit', 'credit',
                 'invoiceId', 'reconciled', 'fileData', 'fileType', 'appwriteFileId'],
    indexes: ['date_index', 'reconciled_index', 'invoiceId_index'],
  },
  transactions: {
    name: 'Bank Transactions',
    attributes: ['date', 'valueDate', 'concept', 'amount', 'balance', 'reconciledWithEntryId', 'status'],
    indexes: ['date_index', 'status_index'],
  },
  settings: {
    name: 'App Settings',
    attributes: ['cbName', 'nif', 'fiscalRegime', 'vatObligation', 'partners'],
    indexes: [],
  },
  suppliers: {
    name: 'Suppliers',
    attributes: ['name', 'nif', 'nifType', 'address', 'city', 'postalCode',
                 'email', 'phone', 'category', 'notes', 'createdAt', 'updatedAt'],
    indexes: ['name_index', 'nif_index'],
  },
  notifications: {
    name: 'Notifications',
    attributes: ['type', 'title', 'message', 'userId', 'userName', 'timestamp', 'read', 'relatedId'],
    indexes: ['timestamp_index', 'userId_index', 'read_index'],
  },
  uploads: {
    name: 'Upload Queue',
    attributes: ['uploadType', 'fileName', 'mimeType', 'base64Data', 'status', 'progress',
                 'error', 'timestamp', 'notificationDismissed', 'needsMapping', 'result', 'bankResult'],
    indexes: ['timestamp_index', 'status_index'],
  },
};

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries) throw error;
      const delay = Math.pow(2, i + 1) * 1000;
      console.log(`  Retry in ${delay/1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

let totalChecks = 0;
let passedChecks = 0;

function logCheck(passed, message) {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`  ✅ ${message}`);
  } else {
    console.log(`  ❌ ${message}`);
  }
}

function logWarning(message) {
  console.log(`  ⚠️  ${message}`);
}

async function main() {
  console.log('🔍 CBGest - Appwrite Setup Verification');
  console.log('═══════════════════════════════════════');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project:  ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);
  console.log(`📁 Bucket:   ${CONFIG.storageBucketId}`);

  // 1. Verify Database
  console.log('\n📊 Verifying Database...');
  try {
    const dbRes = await fetchWithRetry(
      `${CONFIG.endpoint}/databases/${CONFIG.databaseId}`,
      { headers }
    );
    const dbData = await dbRes.json();
    if (dbRes.ok) {
      logCheck(true, `Database "${dbData.name}" exists`);
    } else {
      logCheck(false, `Database error: ${dbData.message}`);
      console.log('\n❌ Cannot continue without database');
      process.exit(1);
    }
  } catch (error) {
    logCheck(false, `Network error: ${error.message}`);
    console.log('\n❌ Cannot connect to Appwrite');
    process.exit(1);
  }

  // 2. Verify Storage Bucket
  console.log('\n🗄️  Verifying Storage Bucket...');
  try {
    const bucketRes = await fetchWithRetry(
      `${CONFIG.endpoint}/storage/buckets/${CONFIG.storageBucketId}`,
      { headers }
    );
    const bucketData = await bucketRes.json();
    if (bucketRes.ok) {
      logCheck(true, `Storage bucket "${bucketData.name}" exists`);
      console.log(`     Max file size: ${(bucketData.maximumFileSize / 1024 / 1024).toFixed(2)} MB`);
    } else {
      logCheck(false, `Bucket error: ${bucketData.message}`);
    }
  } catch (error) {
    logCheck(false, `Bucket network error: ${error.message}`);
  }

  // 3. Verify Collections
  for (const [collectionId, expected] of Object.entries(EXPECTED_COLLECTIONS)) {
    console.log(`\n📦 Verifying: ${expected.name} (${collectionId})`);

    // Check collection exists
    try {
      const collRes = await fetchWithRetry(
        `${CONFIG.endpoint}/databases/${CONFIG.databaseId}/collections/${collectionId}`,
        { headers }
      );
      const collData = await collRes.json();

      if (!collRes.ok) {
        logCheck(false, `Collection not found`);
        continue;
      }
      logCheck(true, `Collection exists`);

      // Check attributes
      const attrRes = await fetchWithRetry(
        `${CONFIG.endpoint}/databases/${CONFIG.databaseId}/collections/${collectionId}/attributes`,
        { headers }
      );
      const attrData = await attrRes.json();

      if (attrRes.ok) {
        const existingAttrs = attrData.attributes.map(a => a.key);
        const missingAttrs = expected.attributes.filter(a => !existingAttrs.includes(a));
        const processingAttrs = attrData.attributes.filter(a => a.status === 'processing').map(a => a.key);

        if (missingAttrs.length === 0) {
          logCheck(true, `All ${expected.attributes.length} attributes present`);
        } else {
          logCheck(false, `Missing attributes: ${missingAttrs.join(', ')}`);
        }

        if (processingAttrs.length > 0) {
          logWarning(`Processing: ${processingAttrs.join(', ')}`);
        }
      }

      // Check indexes
      if (expected.indexes.length > 0) {
        const idxRes = await fetchWithRetry(
          `${CONFIG.endpoint}/databases/${CONFIG.databaseId}/collections/${collectionId}/indexes`,
          { headers }
        );
        const idxData = await idxRes.json();

        if (idxRes.ok) {
          const existingIdx = idxData.indexes.map(i => i.key);
          const idxStatuses = {};
          idxData.indexes.forEach(i => idxStatuses[i.key] = i.status);

          const missingIdx = expected.indexes.filter(i => !existingIdx.includes(i));
          const failedIdx = expected.indexes.filter(i => idxStatuses[i] === 'failed');
          const processingIdx = expected.indexes.filter(i => idxStatuses[i] === 'processing');

          if (missingIdx.length === 0 && failedIdx.length === 0) {
            logCheck(true, `All ${expected.indexes.length} indexes available`);
          } else {
            if (missingIdx.length > 0) {
              logCheck(false, `Missing indexes: ${missingIdx.join(', ')}`);
            }
            if (failedIdx.length > 0) {
              logCheck(false, `Failed indexes: ${failedIdx.join(', ')}`);
            }
          }

          if (processingIdx.length > 0) {
            logWarning(`Processing indexes: ${processingIdx.join(', ')}`);
          }
        }
      } else {
        console.log('     (No indexes expected)');
      }
    } catch (error) {
      logCheck(false, `Error: ${error.message}`);
    }
  }

  // Summary
  console.log('\n');
  console.log('═══════════════════════════════════════');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════');
  const issues = totalChecks - passedChecks;
  console.log(`Total checks: ${totalChecks}`);
  console.log(`Passed:       ${passedChecks}`);
  console.log(`Issues:       ${issues}`);
  console.log('');

  if (issues === 0) {
    console.log('🎉 All verifications passed! Appwrite is correctly configured.');
    process.exit(0);
  } else {
    console.log(`⚠️  Found ${issues} issue(s).`);
    console.log('   Run: node scripts/setup-all-collections.cjs');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});
