import { Client, Databases, Query, ID } from 'node-appwrite';

/**
 * Prepare Modelo 184 Function
 * Prepares data for annual "Declaración informativa de entidades en régimen de atribución de rentas"
 * For Comunidades de Bienes (CB) with vacation rentals
 * Schedule: 0 9 15 1 * (January 15th at 9 AM)
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.DATABASE_ID || '691f288100019843d43e';

  try {
    // Calculate for the previous year
    const now = new Date();
    const fiscalYear = now.getFullYear() - 1;
    const yearStart = `${fiscalYear}-01-01`;
    const yearEnd = `${fiscalYear}-12-31`;

    log(`Preparing Modelo 184 for fiscal year ${fiscalYear}`);
    log(`Period: ${yearStart} to ${yearEnd}`);

    // Get settings for partners info
    let partners = [];
    try {
      const settings = await databases.listDocuments(
        databaseId,
        'settings',
        [Query.equal('key', 'partners'), Query.limit(1)]
      );
      if (settings.documents.length > 0 && settings.documents[0].value) {
        partners = JSON.parse(settings.documents[0].value);
      }
    } catch (e) {
      log('No partners configuration found');
    }

    // Get all reservations (income)
    const reservations = await databases.listDocuments(
      databaseId,
      'reservations',
      [
        Query.greaterThanEqual('checkIn', yearStart),
        Query.lessThanEqual('checkIn', yearEnd),
        Query.limit(1000)
      ]
    );

    // Get all expense invoices
    const invoices = await databases.listDocuments(
      databaseId,
      'invoices',
      [
        Query.equal('type', 'expense'),
        Query.greaterThanEqual('date', yearStart),
        Query.lessThanEqual('date', yearEnd),
        Query.limit(1000)
      ]
    );

    // Calculate totals
    const totalIncome = reservations.documents.reduce(
      (sum, r) => sum + (parseFloat(r.totalAmount) || 0),
      0
    );

    const totalExpenses = invoices.documents.reduce(
      (sum, i) => sum + (parseFloat(i.totalAmount) || 0),
      0
    );

    const deductibleExpenses = invoices.documents
      .filter(i => i.isDeductible !== false)
      .reduce((sum, i) => sum + (parseFloat(i.totalAmount) || 0), 0);

    // Calculate rendimiento neto
    const rendimientoNeto = totalIncome - deductibleExpenses;

    // Group expenses by category for Modelo 184
    const expensesByCategory = {};
    for (const inv of invoices.documents) {
      const category = inv.category || 'Otros gastos';
      if (!expensesByCategory[category]) {
        expensesByCategory[category] = 0;
      }
      expensesByCategory[category] += parseFloat(inv.totalAmount) || 0;
    }

    // Group income by apartment
    const incomeByApartment = {};
    for (const res of reservations.documents) {
      const apt = res.apartmentName || 'Sin asignar';
      if (!incomeByApartment[apt]) {
        incomeByApartment[apt] = { count: 0, total: 0, nights: 0 };
      }
      incomeByApartment[apt].count++;
      incomeByApartment[apt].total += parseFloat(res.totalAmount) || 0;
      incomeByApartment[apt].nights += parseInt(res.nights) || 0;
    }

    // Calculate per-partner attribution (for Modelo 184)
    const partnerAttribution = partners.map(partner => ({
      name: partner.name,
      nif: partner.nif,
      percentage: partner.percentage || (100 / partners.length),
      rendimientoAtribuido: rendimientoNeto * ((partner.percentage || (100 / partners.length)) / 100)
    }));

    // Build the report
    const modelo184Data = {
      fiscalYear,
      generatedAt: new Date().toISOString(),
      declarante: {
        // This should come from settings
        denominacion: 'Comunidad de Bienes [NOMBRE]',
        nif: '[NIF DE LA CB]',
        tipoEntidad: 'Comunidad de Bienes',
        claveActividad: '861', // Alquiler inmuebles urbanos
      },
      resumen: {
        ingresosTotales: Math.round(totalIncome * 100) / 100,
        gastosTotales: Math.round(totalExpenses * 100) / 100,
        gastosDeducibles: Math.round(deductibleExpenses * 100) / 100,
        rendimientoNeto: Math.round(rendimientoNeto * 100) / 100,
        reservaciones: reservations.documents.length,
        facturas: invoices.documents.length
      },
      desglose: {
        ingresosPorInmueble: incomeByApartment,
        gastosPorCategoria: Object.fromEntries(
          Object.entries(expensesByCategory).map(([k, v]) => [k, Math.round(v * 100) / 100])
        )
      },
      atribucionRendimientos: partnerAttribution.map(p => ({
        ...p,
        rendimientoAtribuido: Math.round(p.rendimientoAtribuido * 100) / 100
      })),
      notas: [
        'Este es un borrador preparatorio. Verificar todos los datos antes de presentar.',
        'Los gastos deducibles deben cumplir los requisitos del Art. 28 LIRPF.',
        'Para alquileres turísticos, no aplica la reducción del 60%.',
        'Fecha límite presentación Modelo 184: 28 de febrero.'
      ]
    };

    log('\n=== RESUMEN MODELO 184 ===');
    log(`Año fiscal: ${fiscalYear}`);
    log(`Ingresos totales: ${modelo184Data.resumen.ingresosTotales}€`);
    log(`Gastos deducibles: ${modelo184Data.resumen.gastosDeducibles}€`);
    log(`Rendimiento neto: ${modelo184Data.resumen.rendimientoNeto}€`);
    log(`Reservaciones: ${modelo184Data.resumen.reservaciones}`);

    if (partnerAttribution.length > 0) {
      log('\nAtribución por socio:');
      for (const p of partnerAttribution) {
        log(`  ${p.name}: ${Math.round(p.rendimientoAtribuido * 100) / 100}€ (${p.percentage}%)`);
      }
    }

    // Store the report as a notification
    try {
      await databases.createDocument(
        databaseId,
        'notifications',
        ID.unique(),
        {
          id: ID.unique(),
          type: 'tax-report',
          title: `Borrador Modelo 184 - ${fiscalYear}`,
          message: `Rendimiento neto: ${modelo184Data.resumen.rendimientoNeto}€. ${partners.length} socios. Revisar antes del 28/02.`,
          userId: 'system',
          userName: 'Sistema Fiscal',
          timestamp: Date.now(),
          read: false,
          relatedId: `modelo184-${fiscalYear}`
        }
      );
    } catch (notifError) {
      log(`Could not create notification: ${notifError.message}`);
    }

    return res.json({
      success: true,
      modelo184: modelo184Data
    });

  } catch (e) {
    error(`Prepare Modelo 184 failed: ${e.message}`);
    return res.json({
      success: false,
      error: e.message
    }, 500);
  }
};
