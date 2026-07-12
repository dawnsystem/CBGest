import { Query } from 'node-appwrite';

export const safeParseNumber = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

/**
 * Returns the stored reservation total when available, otherwise estimates it
 * from the nightly price multiplied by the number of nights.
 */
export const getReservationAmount = (reservation) => (
  safeParseNumber(reservation.totalAmount)
  || (safeParseNumber(reservation.pricePerNight) * safeParseNumber(reservation.nights))
);

export async function getActiveFiscalYear(databases, databaseId, log) {
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
