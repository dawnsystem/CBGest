import { Client, Databases, Storage, Query, ID } from 'node-appwrite';

/**
 * Backup Data Function
 * Exports all collections to JSON and stores in Appwrite Storage
 * Schedule: 0 2 * * 0 (Sundays at 2 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const storage = new Storage(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';
  const backupBucketId = process.env.BACKUP_BUCKET_ID || 'backups';

  const collections = [
    'invoices',
    'entries',
    'transactions',
    'suppliers',
    'apartments',
    'recurring_expenses',
    'reservations',
    'settings',
    'notifications',
    'ai_match_history',
    'fiscal_years'
  ];

  const backup = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    collections: {}
  };

  try {
    log('Starting backup...');

    for (const collectionId of collections) {
      try {
        log(`Backing up ${collectionId}...`);

        const allDocs = [];
        let offset = 0;
        const limit = 100;

        // Paginate through all documents
        while (true) {
          const response = await databases.listDocuments(
            databaseId,
            collectionId,
            [Query.limit(limit), Query.offset(offset)]
          );

          allDocs.push(...response.documents);

          if (response.documents.length < limit) break;
          offset += limit;
        }

        backup.collections[collectionId] = {
          count: allDocs.length,
          documents: allDocs
        };

        log(`  ${collectionId}: ${allDocs.length} documents`);
      } catch (e) {
        error(`Failed to backup ${collectionId}: ${e.message}`);
        backup.collections[collectionId] = {
          count: 0,
          error: e.message,
          documents: []
        };
      }
    }

    // Create backup file
    const backupJson = JSON.stringify(backup, null, 2);
    const backupBlob = new Blob([backupJson], { type: 'application/json' });
    const fileName = `backup-${new Date().toISOString().split('T')[0]}.json`;

    // Try to upload to storage (if bucket exists)
    try {
      const file = await storage.createFile(
        backupBucketId,
        ID.unique(),
        new File([backupBlob], fileName, { type: 'application/json' })
      );
      log(`Backup saved to storage: ${file.$id}`);
    } catch (storageError) {
      // If bucket doesn't exist, just log the backup stats
      log(`Storage upload skipped (bucket may not exist): ${storageError.message}`);
      log('Backup completed in memory only. Create a "backups" bucket to persist.');
    }

    const totalDocs = Object.values(backup.collections)
      .reduce((sum, c) => sum + c.count, 0);

    log(`Backup complete: ${totalDocs} total documents across ${collections.length} collections`);

    return res.json({
      success: true,
      timestamp: backup.timestamp,
      totalDocuments: totalDocs,
      collections: Object.fromEntries(
        Object.entries(backup.collections).map(([k, v]) => [k, v.count])
      )
    });
  } catch (e) {
    error(`Backup failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
