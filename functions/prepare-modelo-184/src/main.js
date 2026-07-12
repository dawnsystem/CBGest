import { Client, Databases, Query, ID } from 'node-appwrite';
import { getActiveFiscalYear, getReservationAmount, safeParseNumber } from '../../_shared/fiscal.js';

const EXPENSE = 'EXPENSE';
const PROCESSED = 'PROCESSED';
const PAID = 'PAID';
const FINALIZED_STATUSES = new Set([PROCESSED, PAID]);

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
    const activeFiscalYear = await getActiveFiscalYear(databases, databaseId, log);
    if (!activeFiscalYear?.id || !activeFiscalYear.year) {
      log('No active fiscal year found, skipping Modelo 184 preparation');
      return res.json({
        success: true,
        skipped: true,
        reason: 'no-active-fiscal-year'
      });
    }

    const fiscalYear = activeFiscalYear.year;
    const yearStart = `${fiscalYear}-01-01`;
    const yearEnd = `${fiscalYear}-12-31`;

    log(`Preparing Modelo 184 for fiscal year ${fiscalYear}`);
    log(`Period: ${yearStart} to ${yearEnd}`);
    log(`Active fiscal year id: ${activeFiscalYear.id}`);

    // Get settings for declarant/partners info
    let partners = [];
    let settingsDoc = null;
    try {
      const settings = await databases.listDocuments(
        databaseId,
        'settings',
        [Query.limit(1)]
      );
      if (settings.documents.length > 0) {
        settingsDoc = settings.documents[0];
        if (typeof settingsDoc.partners === 'string') {
          partners = JSON.parse(settingsDoc.partners || '[]');
        } else if (Array.isArray(settingsDoc.partners)) {
          partners = settingsDoc.partners;
        }
      }
    } catch (e) {
      log('No partners configuration found');
    }

    // Get all reservations (income)
    const reservations = await databases.listDocuments(
      databaseId,
      'reservations',
      [
        Query.equal('fiscalYearId', activeFiscalYear.id),
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
        Query.equal('fiscalYearId', activeFiscalYear.id),
        Query.equal('type', EXPENSE),
        Query.greaterThanEqual('date', yearStart),
        Query.lessThanEqual('date', yearEnd),
        Query.limit(1000)
      ]
    );

    const finalizedInvoices = invoices.documents.filter(
      (invoice) => FINALIZED_STATUSES.has(invoice.status)
    );

    // Calculate totals
    const totalIncome = reservations.documents.reduce(
      (sum, reservation) => sum + getReservationAmount(reservation),
      0
    );

    const totalExpenses = finalizedInvoices.reduce(
      (sum, invoice) => sum + safeParseNumber(invoice.totalAmount),
      0
    );

    const deductibleExpenses = finalizedInvoices
      .filter(invoice => invoice.isDeductible !== false)
      .reduce((sum, invoice) => sum + safeParseNumber(invoice.totalAmount), 0);

    // Calculate rendimiento neto
    const rendimientoNeto = totalIncome - deductibleExpenses;

    // Group finalized expenses by category for Modelo 184
    const expensesByCategory = {};
    for (const inv of finalizedInvoices) {
      const category = inv.category || 'Otros gastos';
      if (!expensesByCategory[category]) {
        expensesByCategory[category] = 0;
      }
      expensesByCategory[category] += safeParseNumber(inv.totalAmount);
    }

    // Group income by apartment
    const incomeByApartment = {};
    for (const res of reservations.documents) {
      const apt = res.apartmentName || 'Sin asignar';
      if (!incomeByApartment[apt]) {
        incomeByApartment[apt] = { count: 0, total: 0, nights: 0 };
      }
      incomeByApartment[apt].count++;
      incomeByApartment[apt].total += getReservationAmount(res);
      incomeByApartment[apt].nights += safeParseNumber(res.nights);
    }

    // Calculate per-partner attribution (for Modelo 184)
    const defaultParticipation = partners.length > 0 ? 100 / partners.length : 0;
    const partnerAttribution = partners.map(partner => ({
      name: partner.name,
      nif: partner.nif,
      participation: partner.participation || defaultParticipation,
      rendimientoAtribuido: rendimientoNeto * ((partner.participation || defaultParticipation) / 100)
    }));

    // Build the report
    const modelo184Data = {
      fiscalYear,
      generatedAt: new Date().toISOString(),
      declarante: {
        denominacion: settingsDoc?.cbName || 'Comunidad de Bienes [NOMBRE]',
        nif: settingsDoc?.nif || '[NIF DE LA CB]',
        tipoEntidad: 'Comunidad de Bienes',
        claveActividad: '861', // Alquiler inmuebles urbanos
      },
      resumen: {
        ingresosTotales: Math.round(totalIncome * 100) / 100,
        gastosTotales: Math.round(totalExpenses * 100) / 100,
        gastosDeducibles: Math.round(deductibleExpenses * 100) / 100,
        rendimientoNeto: Math.round(rendimientoNeto * 100) / 100,
        reservaciones: reservations.documents.length,
        facturas: finalizedInvoices.length
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
        log(`  ${p.name}: ${Math.round(p.rendimientoAtribuido * 100) / 100}€ (${p.participation}%)`);
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
