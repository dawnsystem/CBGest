import { Client, Databases, Query } from 'node-appwrite';

const EXPENSE = 'EXPENSE';
const PROCESSED = 'PROCESSED';
const PAID = 'PAID';
const FINALIZED_STATUSES = new Set([PROCESSED, PAID]);

const parseAmount = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

async function getActiveFiscalYear(databases, databaseId, log) {
  try {
    const response = await databases.listDocuments(
      databaseId,
      'fiscal_years',
      [Query.equal('status', 'OPEN'), Query.orderDesc('year'), Query.limit(1)]
    );

    if (response.documents.length === 0) {
      return null;
    }

    const fiscalYear = response.documents[0];
    return {
      id: fiscalYear.$id || fiscalYear.id,
      year: Number(fiscalYear.year) || null
    };
  } catch (e) {
    log(`Could not resolve active fiscal year: ${e.message}`);
    return null;
  }
}

/**
 * Calculate Profitability Function
 * Calculates monthly net yield per apartment for IRPF
 * Schedule: 0 1 1 * * (1st of each month at 1 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  try {
    const activeFiscalYear = await getActiveFiscalYear(databases, databaseId, log);
    if (!activeFiscalYear?.id) {
      log('No active fiscal year found, skipping profitability calculation');
      return res.json({
        success: true,
        skipped: true,
        reason: 'no-active-fiscal-year'
      });
    }

    // Calculate for the previous month
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const monthStart = lastMonth.toISOString().split('T')[0];
    const monthEnd = lastMonthEnd.toISOString().split('T')[0];
    const monthName = lastMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

    log(`Calculating profitability for ${monthName}`);
    log(`Period: ${monthStart} to ${monthEnd}`);
    log(`Active fiscal year: ${activeFiscalYear.year || 'unknown'} (${activeFiscalYear.id})`);

    // Get all apartments
    const apartments = await databases.listDocuments(
      databaseId,
      'apartments',
      [Query.equal('isActive', true), Query.equal('fiscalYearId', activeFiscalYear.id), Query.limit(100)]
    );

    if (apartments.documents.length === 0) {
      log('No active apartments found');
      return res.json({ success: true, message: 'No apartments to process' });
    }

    const results = [];

    for (const apartment of apartments.documents) {
      log(`Processing: ${apartment.name}`);

      // Get reservations for this apartment in the period
      const reservations = await databases.listDocuments(
        databaseId,
        'reservations',
        [
          Query.equal('apartmentId', apartment.$id),
          Query.equal('fiscalYearId', activeFiscalYear.id),
          Query.greaterThanEqual('checkIn', monthStart),
          Query.lessThanEqual('checkIn', monthEnd),
          Query.limit(100)
        ]
      );

      // Calculate income
      const totalIncome = reservations.documents.reduce(
        (sum, reservation) => sum + (
          parseAmount(reservation.totalAmount)
          || (parseAmount(reservation.pricePerNight) * parseAmount(reservation.nights))
        ),
        0
      );
      const totalNights = reservations.documents.reduce(
        (sum, reservation) => sum + parseAmount(reservation.nights),
        0
      );

      // Get finalized expense invoices for this apartment
      const invoices = await databases.listDocuments(
        databaseId,
        'invoices',
        [
          Query.equal('apartmentId', apartment.$id),
          Query.equal('fiscalYearId', activeFiscalYear.id),
          Query.equal('type', EXPENSE),
          Query.greaterThanEqual('date', monthStart),
          Query.lessThanEqual('date', monthEnd),
          Query.limit(100)
        ]
      );

      const finalizedInvoices = invoices.documents.filter(
        (invoice) => FINALIZED_STATUSES.has(invoice.status)
      );

      // Calculate expenses using totalAmount (IRPF simplified model, no IVA split)
      const totalExpenses = finalizedInvoices.reduce(
        (sum, invoice) => sum + parseAmount(invoice.totalAmount),
        0
      );
      const deductibleExpenses = finalizedInvoices
        .filter(invoice => invoice.isDeductible !== false)
        .reduce((sum, invoice) => sum + parseAmount(invoice.totalAmount), 0);

      // Calculate profitability
      const netProfit = totalIncome - totalExpenses;
      const daysInMonth = lastMonthEnd.getDate();
      const occupancyRate = (totalNights / daysInMonth) * 100;

      // IRPF simplified calculation without VAT/reduction layers
      const rendimientoNeto = totalIncome - deductibleExpenses;

      const apartmentResult = {
        apartmentId: apartment.$id,
        apartmentName: apartment.name,
        fiscalYearId: activeFiscalYear.id,
        period: monthName,
        metrics: {
          reservations: reservations.documents.length,
          nights: totalNights,
          occupancyRate: Math.round(occupancyRate * 10) / 10,
          income: Math.round(totalIncome * 100) / 100,
          expenses: Math.round(totalExpenses * 100) / 100,
          deductibleExpenses: Math.round(deductibleExpenses * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100
        },
        irpf: {
          rendimientoNeto: Math.round(rendimientoNeto * 100) / 100,
          reduccion: 0,
          rendimientoReducido: Math.round(rendimientoNeto * 100) / 100
        }
      };

      results.push(apartmentResult);

      log(`  ${apartment.name}: ${totalIncome}€ income, ${totalExpenses}€ expenses, ${netProfit}€ net`);
    }

    // Calculate totals
    const totals = {
      apartments: results.length,
      totalIncome: results.reduce((sum, result) => sum + result.metrics.income, 0),
      totalExpenses: results.reduce((sum, result) => sum + result.metrics.expenses, 0),
      totalNetProfit: results.reduce((sum, result) => sum + result.metrics.netProfit, 0),
      totalRendimientoNeto: results.reduce((sum, result) => sum + result.irpf.rendimientoNeto, 0),
      avgOccupancy: results.reduce((sum, result) => sum + result.metrics.occupancyRate, 0) / results.length
    };

    log(`\nTotals for ${monthName}:`);
    log(`  Income: ${totals.totalIncome}€`);
    log(`  Expenses: ${totals.totalExpenses}€`);
    log(`  Net Profit: ${totals.totalNetProfit}€`);
    log(`  Avg Occupancy: ${Math.round(totals.avgOccupancy)}%`);

    // Create notification with summary
    try {
      await databases.createDocument(
        databaseId,
        'notifications',
        `profitability-${monthStart}`,
        {
          id: `profitability-${monthStart}`,
          type: 'report',
          title: `Rentabilidad ${monthName}`,
          message: `Ingresos: ${totals.totalIncome}€ | Gastos: ${totals.totalExpenses}€ | Neto: ${totals.totalNetProfit}€ | Ocupación: ${Math.round(totals.avgOccupancy)}%`,
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
      fiscalYearId: activeFiscalYear.id,
      period: monthName,
      apartments: results,
      totals
    });

  } catch (e) {
    error(`Calculate profitability failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
