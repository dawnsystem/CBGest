import { Client, Databases, Query } from 'node-appwrite';

/**
 * Cleanup Uploads Function
 * Deletes completed/error upload items older than 7 days
 * Schedule: 0 3 * * * (Daily at 3 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';
  const uploadsCollection = 'uploads';

  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // Find old completed/error uploads
    const oldUploads = await databases.listDocuments(
      databaseId,
      uploadsCollection,
      [
        Query.or([
          Query.equal('status', 'completed'),
          Query.equal('status', 'error')
        ]),
        Query.lessThan('timestamp', sevenDaysAgo),
        Query.limit(100)
      ]
    );

    log(`Found ${oldUploads.documents.length} old uploads to clean up`);

    let deleted = 0;
    for (const doc of oldUploads.documents) {
      try {
        await databases.deleteDocument(databaseId, uploadsCollection, doc.$id);
        deleted++;
      } catch (e) {
        error(`Failed to delete upload ${doc.$id}: ${e.message}`);
      }
    }

    log(`Successfully deleted ${deleted} old uploads`);

    return res.json({
      success: true,
      found: oldUploads.documents.length,
      deleted,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    error(`Cleanup failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
