import { Client, Databases, Query } from 'node-appwrite';

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
    // Calculate for the previous month
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const monthStart = lastMonth.toISOString().split('T')[0];
    const monthEnd = lastMonthEnd.toISOString().split('T')[0];
    const monthName = lastMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

    log(`Calculating profitability for ${monthName}`);
    log(`Period: ${monthStart} to ${monthEnd}`);

    // Get all apartments
    const apartments = await databases.listDocuments(
      databaseId,
      'apartments',
      [Query.equal('isActive', true), Query.limit(100)]
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
          Query.greaterThanEqual('checkIn', monthStart),
          Query.lessThanEqual('checkIn', monthEnd),
          Query.limit(100)
        ]
      );

      // Calculate income
      const totalIncome = reservations.documents.reduce(
        (sum, r) => sum + (parseFloat(r.totalAmount) || 0),
        0
      );
      const totalNights = reservations.documents.reduce(
        (sum, r) => sum + (parseInt(r.nights) || 0),
        0
      );

      // Get invoices (expenses) for this apartment
      const invoices = await databases.listDocuments(
        databaseId,
        'invoices',
        [
          Query.equal('apartmentId', apartment.$id),
          Query.equal('type', 'expense'),
          Query.greaterThanEqual('date', monthStart),
          Query.lessThanEqual('date', monthEnd),
          Query.limit(100)
        ]
      );

      // Calculate expenses
      const totalExpenses = invoices.documents.reduce(
        (sum, i) => sum + (parseFloat(i.totalAmount) || 0),
        0
      );
      const deductibleExpenses = invoices.documents
        .filter(i => i.isDeductible !== false)
        .reduce((sum, i) => sum + (parseFloat(i.totalAmount) || 0), 0);

      // Calculate profitability
      const netProfit = totalIncome - totalExpenses;
      const daysInMonth = lastMonthEnd.getDate();
      const occupancyRate = (totalNights / daysInMonth) * 100;

      // IRPF calculations (simplified - actual may vary)
      // Rendimiento neto = Ingresos - Gastos deducibles
      const rendimientoNeto = totalIncome - deductibleExpenses;

      // Reducción por arrendamiento (60% if >3 years, simplified)
      const reduccion = rendimientoNeto > 0 ? rendimientoNeto * 0.6 : 0;
      const rendimientoReducido = rendimientoNeto - reduccion;

      const apartmentResult = {
        apartmentId: apartment.$id,
        apartmentName: apartment.name,
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
          reduccion: Math.round(reduccion * 100) / 100,
          rendimientoReducido: Math.round(rendimientoReducido * 100) / 100
        }
      };

      results.push(apartmentResult);

      log(`  ${apartment.name}: ${totalIncome}€ income, ${totalExpenses}€ expenses, ${netProfit}€ net`);
    }

    // Calculate totals
    const totals = {
      apartments: results.length,
      totalIncome: results.reduce((sum, r) => sum + r.metrics.income, 0),
      totalExpenses: results.reduce((sum, r) => sum + r.metrics.expenses, 0),
      totalNetProfit: results.reduce((sum, r) => sum + r.metrics.netProfit, 0),
      totalRendimientoNeto: results.reduce((sum, r) => sum + r.irpf.rendimientoNeto, 0),
      avgOccupancy: results.reduce((sum, r) => sum + r.metrics.occupancyRate, 0) / results.length
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
