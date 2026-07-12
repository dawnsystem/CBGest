import { Query } from 'node-appwrite';

export const safeParseNumber = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
};

/**
 * Returns the stored reservation total when available, otherwise estimates it
 * from the nightly price multiplied by the number of nights.
 *
 * @param {object} reservation
 * @returns {number}
 */
export const getReservationAmount = (reservation) => (
  safeParseNumber(reservation.totalAmount)
  || (safeParseNumber(reservation.pricePerNight) * safeParseNumber(reservation.nights))
);

/**
 * Resolves the most recent OPEN fiscal year document, which is treated as the
 * active fiscal year for automated calculations.
 *
 * @param {object} databases
 * @param {string} databaseId
 * @param {(message: string) => void} log
 * @returns {Promise<{id: string, year: number | null} | null>}
 */
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
    // Appwrite runtime documents expose $id, while local fixtures/tests may only
    // provide id. Prefer the runtime field but support both shapes defensively.
    const fiscalYearId = fiscalYear.$id ?? fiscalYear.id;
    return {
      id: fiscalYearId,
      year: Number(fiscalYear.year) || null
    };
  } catch (e) {
    log(`Could not resolve active fiscal year: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
