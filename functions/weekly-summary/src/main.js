import { Client, Databases, Query, ID } from 'node-appwrite';

const EXPENSE = 'EXPENSE';
const PENDING = 'PENDING';

/**
 * Weekly Summary Function
 * Generates weekly summary: income, expenses, occupancy, pending items
 * Schedule: 0 10 * * 1 (Mondays at 10 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  try {
    // Calculate date range (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStart = weekAgo.toISOString().split('T')[0];
    const weekEnd = now.toISOString().split('T')[0];

    log(`Generating weekly summary: ${weekStart} to ${weekEnd}`);

    // 1. New reservations this week
    const newReservations = await databases.listDocuments(
      databaseId,
      'reservations',
      [
        Query.greaterThanEqual('importedAt', weekStart),
        Query.limit(100)
      ]
    );

    const reservationIncome = newReservations.documents.reduce(
      (sum, r) => sum + (parseFloat(r.totalAmount) || 0),
      0
    );

    // 2. Upcoming check-ins (next 7 days)
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingCheckIns = await databases.listDocuments(
      databaseId,
      'reservations',
      [
        Query.greaterThanEqual('checkIn', weekEnd),
        Query.lessThanEqual('checkIn', nextWeek.toISOString().split('T')[0]),
        Query.limit(100)
      ]
    );

    // 3. New invoices/expenses this week
    const newInvoices = await databases.listDocuments(
      databaseId,
      'invoices',
      [
        Query.greaterThanEqual('date', weekStart),
        Query.lessThanEqual('date', weekEnd),
        Query.limit(100)
      ]
    );

    const expenseTotal = newInvoices.documents
      .filter(invoice => invoice.type === EXPENSE)
      .reduce((sum, invoice) => sum + (parseFloat(invoice.totalAmount) || 0), 0);

    // 4. Pending invoices
    const pendingInvoices = await databases.listDocuments(
      databaseId,
      'invoices',
      [
        Query.equal('status', PENDING),
        Query.limit(100)
      ]
    );

    const pendingTotal = pendingInvoices.documents.reduce(
      (sum, i) => sum + (parseFloat(i.totalAmount) || 0),
      0
    );

    // 5. Unreconciled bank transactions
    const unreconciledTx = await databases.listDocuments(
      databaseId,
      'transactions',
      [
        Query.equal('status', PENDING),
        Query.limit(100)
      ]
    );

    // 6. Current occupancy (apartments with active reservations)
    const today = now.toISOString().split('T')[0];
    const activeReservations = await databases.listDocuments(
      databaseId,
      'reservations',
      [
        Query.lessThanEqual('checkIn', today),
        Query.greaterThan('checkOut', today),
        Query.limit(100)
      ]
    );

    const apartments = await databases.listDocuments(
      databaseId,
      'apartments',
      [Query.equal('isActive', true), Query.limit(100)]
    );

    const occupancyRate = apartments.documents.length > 0
      ? (activeReservations.documents.length / apartments.documents.length) * 100
      : 0;

    // Build summary
    const summary = {
      period: `${weekStart} - ${weekEnd}`,
      generatedAt: now.toISOString(),
      income: {
        newReservations: newReservations.documents.length,
        totalAmount: Math.round(reservationIncome * 100) / 100
      },
      expenses: {
        newInvoices: newInvoices.documents.filter(invoice => invoice.type === EXPENSE).length,
        totalAmount: Math.round(expenseTotal * 100) / 100
      },
      netResult: Math.round((reservationIncome - expenseTotal) * 100) / 100,
      occupancy: {
        activeNow: activeReservations.documents.length,
        totalApartments: apartments.documents.length,
        rate: Math.round(occupancyRate)
      },
      upcoming: {
        checkIns: upcomingCheckIns.documents.length,
        guests: upcomingCheckIns.documents.map(r => ({
          apartment: r.apartmentName,
          date: r.checkIn,
          nights: r.nights
        }))
      },
      pending: {
        invoices: pendingInvoices.documents.length,
        invoiceAmount: Math.round(pendingTotal * 100) / 100,
        unreconciledTransactions: unreconciledTx.documents.length
      }
    };

    log('\n=== RESUMEN SEMANAL ===');
    log(`Período: ${summary.period}`);
    log(`\nIngresos:`);
    log(`  Nuevas reservas: ${summary.income.newReservations}`);
    log(`  Total: ${summary.income.totalAmount}€`);
    log(`\nGastos:`);
    log(`  Nuevas facturas: ${summary.expenses.newInvoices}`);
    log(`  Total: ${summary.expenses.totalAmount}€`);
    log(`\nResultado neto: ${summary.netResult}€`);
    log(`\nOcupación actual: ${summary.occupancy.rate}% (${summary.occupancy.activeNow}/${summary.occupancy.totalApartments})`);
    log(`\nPróximos check-ins: ${summary.upcoming.checkIns}`);
    log(`\nPendientes:`);
    log(`  Facturas: ${summary.pending.invoices} (${summary.pending.invoiceAmount}€)`);
    log(`  Transacciones sin conciliar: ${summary.pending.unreconciledTransactions}`);

    // Create notification
    const notificationMessage = [
      `📊 Semana ${weekStart.substring(5)}:`,
      `+${summary.income.totalAmount}€ ingresos`,
      `-${summary.expenses.totalAmount}€ gastos`,
      `= ${summary.netResult}€ neto`,
      `📍 Ocupación: ${summary.occupancy.rate}%`,
      summary.upcoming.checkIns > 0 ? `🔜 ${summary.upcoming.checkIns} check-ins próximos` : '',
      summary.pending.unreconciledTransactions > 0 ? `⚠️ ${summary.pending.unreconciledTransactions} tx pendientes` : ''
    ].filter(Boolean).join(' | ');

    try {
      await databases.createDocument(
        databaseId,
        'notifications',
        ID.unique(),
        {
          id: ID.unique(),
          type: 'weekly-summary',
          title: `Resumen semanal`,
          message: notificationMessage,
          userId: 'system',
          userName: 'Sistema',
          timestamp: Date.now(),
          read: false
        }
      );
    } catch (notifError) {
      log(`Could not create notification: ${notifError.message}`);
    }

    return res.json({
      success: true,
      summary
    });

  } catch (e) {
    error(`Weekly summary failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
