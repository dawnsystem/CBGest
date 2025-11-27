import { Client, Databases, Query, ID } from 'node-appwrite';

/**
 * Detect Recurring Expenses Function
 * Analyzes bank transactions to detect recurring expense patterns
 * Schedule: 0 2 1 * * (1st of each month at 2 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  try {
    log('Analyzing transactions for recurring patterns...');

    // Get last 6 months of transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const transactions = await databases.listDocuments(
      databaseId,
      'bankTransactions',
      [
        Query.greaterThan('date', sixMonthsAgo.toISOString().split('T')[0]),
        Query.lessThan('amount', 0), // Only expenses
        Query.orderAsc('date'),
        Query.limit(1000)
      ]
    );

    log(`Analyzing ${transactions.documents.length} transactions`);

    // Group by similar concept/amount
    const patterns = new Map();

    for (const tx of transactions.documents) {
      // Normalize concept for grouping
      const normalizedConcept = tx.concept
        ?.toLowerCase()
        .replace(/[0-9]/g, '') // Remove numbers
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 30);

      const amount = Math.abs(parseFloat(tx.amount));
      const key = `${normalizedConcept}_${Math.round(amount)}`;

      if (!patterns.has(key)) {
        patterns.set(key, {
          concept: tx.concept,
          normalizedConcept,
          baseAmount: amount,
          occurrences: [],
          supplierId: tx.matchedSupplierId || tx.suggestedSupplierId
        });
      }

      patterns.get(key).occurrences.push({
        date: tx.date,
        amount: amount
      });
    }

    // Find patterns with 3+ occurrences (potential recurring)
    const recurringPatterns = [];

    for (const [key, pattern] of patterns) {
      if (pattern.occurrences.length >= 3) {
        // Calculate average interval between occurrences
        const dates = pattern.occurrences.map(o => new Date(o.date)).sort((a, b) => a - b);
        const intervals = [];

        for (let i = 1; i < dates.length; i++) {
          const daysDiff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
          intervals.push(daysDiff);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const avgAmount = pattern.occurrences.reduce((a, b) => a + b.amount, 0) / pattern.occurrences.length;

        // Determine frequency
        let frequency = 'irregular';
        if (avgInterval >= 25 && avgInterval <= 35) frequency = 'monthly';
        else if (avgInterval >= 80 && avgInterval <= 100) frequency = 'quarterly';
        else if (avgInterval >= 350 && avgInterval <= 380) frequency = 'yearly';
        else if (avgInterval >= 12 && avgInterval <= 16) frequency = 'biweekly';

        if (frequency !== 'irregular') {
          recurringPatterns.push({
            concept: pattern.concept,
            normalizedConcept: pattern.normalizedConcept,
            frequency,
            avgInterval: Math.round(avgInterval),
            avgAmount: Math.round(avgAmount * 100) / 100,
            occurrences: pattern.occurrences.length,
            supplierId: pattern.supplierId,
            lastDate: dates[dates.length - 1].toISOString().split('T')[0]
          });
        }
      }
    }

    log(`Found ${recurringPatterns.length} recurring patterns`);

    // Get existing recurring expenses to avoid duplicates
    const existingRecurring = await databases.listDocuments(
      databaseId,
      'recurring_expenses',
      [Query.limit(100)]
    );

    const existingNames = new Set(
      existingRecurring.documents.map(r => r.name?.toLowerCase())
    );

    // Create suggestions for new recurring expenses
    let created = 0;
    for (const pattern of recurringPatterns) {
      const suggestedName = pattern.normalizedConcept.substring(0, 50);

      if (!existingNames.has(suggestedName.toLowerCase())) {
        try {
          await databases.createDocument(
            databaseId,
            'recurring_expenses',
            ID.unique(),
            {
              id: ID.unique(),
              name: `[Sugerido] ${suggestedName}`,
              description: `Detectado automáticamente: ${pattern.occurrences} ocurrencias`,
              estimatedAmount: pattern.avgAmount,
              frequency: pattern.frequency,
              supplierId: pattern.supplierId || null,
              isDeductible: true,
              isActive: false, // Inactive until user confirms
              notes: `Detectado el ${new Date().toISOString().split('T')[0]}. Concepto original: ${pattern.concept}`,
              createdAt: new Date().toISOString()
            }
          );
          created++;
          log(`Created suggestion: ${suggestedName} (${pattern.frequency}, ${pattern.avgAmount}€)`);
        } catch (e) {
          error(`Failed to create suggestion: ${e.message}`);
        }
      }
    }

    return res.json({
      success: true,
      analyzed: transactions.documents.length,
      patternsFound: recurringPatterns.length,
      suggestionsCreated: created,
      patterns: recurringPatterns.slice(0, 10) // Top 10 for response
    });

  } catch (e) {
    error(`Detect recurring failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
