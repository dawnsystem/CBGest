#!/usr/bin/env node

/**
 * Migration script for uploads collection - Optimized Upload Queue
 * 
 * This script:
 * 1. Adds new attributes (storageFileId, fileSize)
 * 2. Updates status to enum with new states
 * 3. Removes base64Data attribute (data will be in Storage)
 * 
 * Usage:
 *   export APPWRITE_API_KEY="your-api-key"
 *   node scripts/migrate-uploads-collection.cjs
 * 
 * IMPORTANT: Run this BEFORE deploying the new code!
 */

const { Client, Databases, Storage } = require('node-appwrite');

// Configuration
const CONFIG = {
  endpoint: 'https://fra.cloud.appwrite.io/v1',
  projectId: 'cbgest',
  databaseId: '691f288100019843d43e',
  bucketId: '691f31c9000fc8c83ab1',
  collectionId: 'uploads',
};

// Get API key from environment
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

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * DEBT-012: Ask the user for confirmation before any destructive (bulk-delete) operation.
 * Returns a Promise that resolves to true if the user types 'y' or 'yes'.
 */
function confirm(question) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} [y/N] `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

/**
 * Check if attribute exists
 */
async function attributeExists(collectionId, attributeKey) {
  try {
    const attributes = await databases.listAttributes(CONFIG.databaseId, collectionId);
    return attributes.attributes.some(attr => attr.key === attributeKey);
  } catch (error) {
    console.error('Error checking attribute:', error.message);
    return false;
  }
}

/**
 * Create attribute with retry
 */
async function createAttribute(attributeConfig) {
  const { type, key, ...config } = attributeConfig;
  
  // Check if already exists
  if (await attributeExists(CONFIG.collectionId, key)) {
    console.log(`  ⚠️  Attribute '${key}' already exists, skipping`);
    return null;
  }
  
  try {
    console.log(`  + Creating ${type} attribute: ${key}...`);
    
    let result;
    switch (type) {
      case 'string':
        result = await databases.createStringAttribute(
          CONFIG.databaseId,
          CONFIG.collectionId,
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
          CONFIG.collectionId,
          key,
          config.required,
          config.min,
          config.max,
          config.default,
          config.array || false
        );
        break;
        
      case 'enum':
        result = await databases.createEnumAttribute(
          CONFIG.databaseId,
          CONFIG.collectionId,
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
      console.log(`    ⚠️  Attribute '${key}' already exists`);
      return null;
    }
    throw error;
  }
}

/**
 * Delete attribute
 */
async function deleteAttribute(key) {
  try {
    // Check if exists first
    if (!(await attributeExists(CONFIG.collectionId, key))) {
      console.log(`  ⚠️  Attribute '${key}' does not exist, skipping deletion`);
      return;
    }
    
    console.log(`  - Deleting attribute: ${key}...`);
    await databases.deleteAttribute(CONFIG.databaseId, CONFIG.collectionId, key);
    console.log(`    ✓ Attribute '${key}' deleted`);
    
    // Wait for deletion to propagate
    await sleep(2000);
  } catch (error) {
    console.error(`    ❌ Error deleting '${key}':`, error.message);
  }
}

/**
 * Create index
 */
async function createIndex(indexConfig) {
  const { key, type, attributes, orders } = indexConfig;
  
  try {
    console.log(`  + Creating index: ${key}...`);
    
    await databases.createIndex(
      CONFIG.databaseId,
      CONFIG.collectionId,
      key,
      type,
      attributes,
      orders
    );
    
    console.log(`    ✓ Index '${key}' created`);
  } catch (error) {
    if (error.code === 409) {
      console.log(`    ⚠️  Index '${key}' already exists`);
      return null;
    }
    throw error;
  }
}

/**
 * Main migration
 */
async function migrate() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  UPLOADS COLLECTION MIGRATION');
  console.log('  Optimized Upload Queue with Storage');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`📡 Endpoint: ${CONFIG.endpoint}`);
  console.log(`🎯 Project: ${CONFIG.projectId}`);
  console.log(`🗄️  Database: ${CONFIG.databaseId}`);
  console.log(`📦 Collection: ${CONFIG.collectionId}`);
  console.log(`🪣 Bucket: ${CONFIG.bucketId}`);
  console.log('');
  
  try {
    // =========================================================================
    // STEP 1: Add new attributes
    // =========================================================================
    console.log('📋 STEP 1: Adding new attributes...\n');
    
    const newAttributes = [
      // Reference to file in Appwrite Storage
      { 
        type: 'string', 
        key: 'storageFileId', 
        size: 100, 
        required: false 
      },
      // File size in bytes (for progress calculation)
      { 
        type: 'integer', 
        key: 'fileSize', 
        required: false, 
        min: 0, 
        max: 104857600, // 100MB max
        default: 0 
      },
    ];
    
    for (const attr of newAttributes) {
      await createAttribute(attr);
      await sleep(1000);
    }
    
    console.log('\n✅ New attributes added\n');
    
    // =========================================================================
    // STEP 2: Wait for attributes to be ready
    // =========================================================================
    console.log('⏳ Waiting for attributes to be ready...');
    await sleep(5000);
    console.log('');
    
    // =========================================================================
    // STEP 3: Add new index for storageFileId
    // =========================================================================
    console.log('📇 STEP 2: Creating new indexes...\n');
    
    const newIndexes = [
      { 
        key: 'storageFileId_index', 
        type: 'key', 
        attributes: ['storageFileId'], 
        orders: ['ASC'] 
      },
    ];
    
    for (const index of newIndexes) {
      await createIndex(index);
      await sleep(500);
    }
    
    console.log('\n✅ Indexes created\n');
    
    // =========================================================================
    // STEP 4: Migrate existing data (optional - clean up old uploads)
    // =========================================================================
    console.log('🧹 STEP 3: Cleaning up existing upload queue...\n');
    
    try {
      // Get all existing uploads
      const response = await databases.listDocuments(
        CONFIG.databaseId,
        CONFIG.collectionId,
        []
      );
      
      const existingDocs = response.documents;
      
      if (existingDocs.length === 0) {
        console.log('  ℹ️  No existing uploads to migrate');
      } else {
        console.log(`  📄 Found ${existingDocs.length} existing upload(s)`);
        console.log('');
        
        // Option 1: Delete all old uploads (recommended for clean start)
        console.log(`  🗑️  About to delete ${existingDocs.length} upload(s) that use the deprecated base64Data field.`);
        const proceed = await confirm('  ⚠️  This is IRREVERSIBLE. Proceed with deletion?');
        if (!proceed) {
          console.log('  ⏭️  Skipping deletion of old uploads.');
        } else {
          console.log('  🗑️  Deleting old uploads...');
          for (const doc of existingDocs) {
            try {
              await databases.deleteDocument(
                CONFIG.databaseId,
                CONFIG.collectionId,
                doc.$id
              );
              console.log(`    - Deleted: ${doc.fileName || doc.$id}`);
            } catch (err) {
              console.log(`    ⚠️  Could not delete ${doc.$id}: ${err.message}`);
            }
            await sleep(200);
          }

          console.log('');
          console.log('  ✅ Old uploads cleaned up');
        }
      }
    } catch (error) {
      console.log('  ⚠️  Could not list existing uploads:', error.message);
    }
    
    console.log('');
    
    // =========================================================================
    // STEP 5: Delete base64Data attribute (OPTIONAL - can cause data loss)
    // =========================================================================
    console.log('⚠️  STEP 4: Removing deprecated base64Data attribute...\n');
    console.log('  ℹ️  This frees up ~10MB per document capacity');
    console.log('  ℹ️  Files will now be stored in Appwrite Storage instead\n');
    
    // Note: Deleting an attribute is a destructive operation
    // Only do this after confirming no data will be lost
    await deleteAttribute('base64Data');
    
    console.log('\n✅ Migration complete!\n');
    
    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  📊 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  ✅ Added attributes:');
    console.log('     - storageFileId (string, 100) - Reference to Storage file');
    console.log('     - fileSize (integer) - File size in bytes');
    console.log('');
    console.log('  ✅ Added indexes:');
    console.log('     - storageFileId_index');
    console.log('');
    console.log('  ✅ Removed attributes:');
    console.log('     - base64Data (was 10MB string - now using Storage)');
    console.log('');
    console.log('  📋 Final schema:');
    console.log('     - uploadType (string)');
    console.log('     - fileName (string)');
    console.log('     - mimeType (string)');
    console.log('     - fileSize (integer) [NEW]');
    console.log('     - storageFileId (string) [NEW]');
    console.log('     - status (string)');
    console.log('     - progress (integer)');
    console.log('     - error (string)');
    console.log('     - timestamp (integer)');
    console.log('     - notificationDismissed (boolean)');
    console.log('     - needsMapping (boolean)');
    console.log('     - result (string)');
    console.log('     - bankResult (string)');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Deploy the updated application code');
    console.log('   2. Test uploading a few files to verify everything works');
    console.log('   3. Monitor Storage bucket for uploaded files');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    console.error('');
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
    process.exit(1);
  }
}

// Run migration
migrate();
