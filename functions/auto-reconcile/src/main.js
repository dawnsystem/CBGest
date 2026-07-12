import { Client, Databases, Query } from 'node-appwrite';

const EXPENSE = 'EXPENSE';
const PENDING = 'PENDING';
const PAID = 'PAID';
const MATCHED = 'MATCHED';

const parseTransactionPayload = (payload) => {
  if (!payload) return null;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload;
};

/**
 * Auto-Reconcile Function
 * Automatically matches bank transactions with invoices
 * Trigger: Event on transactions.documents.*.create
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  try {
    // Get the new transaction from the event
    const transaction = parseTransactionPayload(req.body);

    if (!transaction || !transaction.$id) {
      log('No transaction data in event, skipping');
      return res.json({ success: true, skipped: true });
    }

    log(`Processing transaction: ${transaction.$id}`);
    log(`  Amount: ${transaction.amount}`);
    log(`  Concept: ${transaction.concept}`);

    // Skip if already matched
    if (transaction.reconciledWithInvoiceId || transaction.status === MATCHED) {
      log('Transaction already matched, skipping');
      return res.json({ success: true, alreadyMatched: true });
    }

    const rawAmount = Number(transaction.amount);
    if (!Number.isFinite(rawAmount)) {
      log('Transaction has invalid amount, skipping');
      return res.json({ success: true, skipped: true, reason: 'invalid-amount' });
    }

    // Defensive guard: only expense payments are currently supported here.
    if (rawAmount >= 0) {
      log('Positive transaction detected, auto-reconcile only supports expense payments');
      return res.json({ success: true, skipped: true, reason: 'unsupported-direction' });
    }

    const amount = Math.abs(rawAmount);

    // Strategy 1: Exact amount match with pending invoices
    log('Searching for matching invoices...');
    const invoiceQueries = [
      Query.equal('type', EXPENSE),
      Query.equal('status', PENDING),
      Query.greaterThanEqual('totalAmount', amount - 0.01),
      Query.lessThanEqual('totalAmount', amount + 0.01),
      Query.limit(10)
    ];

    if (transaction.fiscalYearId) {
      invoiceQueries.push(Query.equal('fiscalYearId', transaction.fiscalYearId));
    }

    const invoices = await databases.listDocuments(
      databaseId,
      'invoices',
      invoiceQueries
    );

    if (invoices.documents.length === 1) {
      // Single exact match - auto-reconcile
      const matchedInvoice = invoices.documents[0];
      log(`Found exact match: Invoice ${matchedInvoice.$id}`);

      // Update transaction
      await databases.updateDocument(
        databaseId,
        'transactions',
        transaction.$id,
        {
          reconciledWithInvoiceId: matchedInvoice.$id,
          status: MATCHED
        }
      );

      // Update invoice
      await databases.updateDocument(
        databaseId,
        'invoices',
        matchedInvoice.$id,
        {
          status: PAID
        }
      );

      log(`Auto-reconciled transaction ${transaction.$id} with invoice ${matchedInvoice.$id}`);

      return res.json({
        success: true,
        matched: true,
        transactionId: transaction.$id,
        invoiceId: matchedInvoice.$id,
        method: 'exact-amount'
      });
    }

    // Strategy 2: Check AI match history for concept patterns
    const normalizedConcept = transaction.concept
      ?.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    if (normalizedConcept) {
      const matchHistory = await databases.listDocuments(
        databaseId,
        'ai_match_history',
        [
          Query.equal('userConfirmed', true),
          Query.orderDesc('usageCount'),
          Query.limit(50)
        ]
      );

      // Find similar concept in history
      for (const history of matchHistory.documents) {
        const historyConcept = history.normalizedConcept || history.bankConcept?.toLowerCase();
        if (historyConcept && normalizedConcept.includes(historyConcept.substring(0, 10))) {
          log(`Found pattern match from history: ${history.matchedSupplierName || history.matchedCategory}`);

          const suggestion = {
            matchedSupplierId: history.matchedSupplierId || null,
            matchedSupplierName: history.matchedSupplierName || null,
            matchedCategory: history.matchedCategory || null,
            matchedPlatform: history.matchedPlatform || null,
            confidence: 'medium',
            method: 'auto-pattern'
          };

          await databases.updateDocument(
            databaseId,
            'transactions',
            transaction.$id,
            {
              aiMatchSuggestion: JSON.stringify(suggestion)
            }
          );

          return res.json({
            success: true,
            matched: false,
            suggested: true,
            transactionId: transaction.$id,
            suggestion
          });
        }
      }
    }

    log('No automatic match found');
    return res.json({
      success: true,
      matched: false,
      transactionId: transaction.$id
    });

  } catch (e) {
    error(`Auto-reconcile failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
