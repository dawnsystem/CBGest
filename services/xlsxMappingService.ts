/**
 * Service to save and retrieve XLSX column mappings
 * Allows reusing previous mappings for files with the same column structure
 */

export interface SavedMapping {
  dateColumn: number | null;
  conceptColumn: number | null;
  amountColumn: number | null;
  debitColumn: number | null;
  creditColumn: number | null;
  amountMode: 'single' | 'separate';
  dataStartRow: number;
  headerSignature: string; // Hash of column names to identify format
  createdAt: number;
  lastUsedAt: number;
}

const STORAGE_KEY = 'gestcb_xlsx_mappings';

/**
 * Generate a signature from column headers to identify the format
 */
export const generateHeaderSignature = (headers: string[]): string => {
  // Normalize headers: lowercase, trim, sort
  const normalized = headers
    .map(h => String(h || '').toLowerCase().trim())
    .filter(h => h.length > 0)
    .sort()
    .join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `sig_${Math.abs(hash).toString(36)}`;
};

/**
 * Get all saved mappings
 */
export const getSavedMappings = (): Record<string, SavedMapping> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    return JSON.parse(saved);
  } catch {
    return {};
  }
};

/**
 * Find a saved mapping that matches the given headers
 */
export const findMatchingMapping = (headers: string[]): SavedMapping | null => {
  const signature = generateHeaderSignature(headers);
  const mappings = getSavedMappings();
  return mappings[signature] || null;
};

/**
 * Save a mapping for future use
 */
export const saveMapping = (
  headers: string[],
  mapping: Omit<SavedMapping, 'headerSignature' | 'createdAt' | 'lastUsedAt'>
): void => {
  const signature = generateHeaderSignature(headers);
  const mappings = getSavedMappings();

  const existingMapping = mappings[signature];

  mappings[signature] = {
    ...mapping,
    headerSignature: signature,
    createdAt: existingMapping?.createdAt || Date.now(),
    lastUsedAt: Date.now()
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch (e) {
    console.warn('Failed to save XLSX mapping:', e);
  }
};

/**
 * Delete a saved mapping
 */
export const deleteMapping = (headers: string[]): void => {
  const signature = generateHeaderSignature(headers);
  const mappings = getSavedMappings();
  delete mappings[signature];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch (e) {
    console.warn('Failed to delete XLSX mapping:', e);
  }
};

/**
 * Clear all saved mappings
 */
export const clearAllMappings = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear XLSX mappings:', e);
  }
};

/**
 * Validate that a saved mapping is still valid for the given headers
 * (columns still exist at the saved indices)
 */
export const validateMapping = (headers: string[], mapping: SavedMapping): boolean => {
  const maxCol = headers.length - 1;

  // Check that all mapped columns are within range
  if (mapping.dateColumn !== null && mapping.dateColumn > maxCol) return false;
  if (mapping.conceptColumn !== null && mapping.conceptColumn > maxCol) return false;
  if (mapping.amountColumn !== null && mapping.amountColumn > maxCol) return false;
  if (mapping.debitColumn !== null && mapping.debitColumn > maxCol) return false;
  if (mapping.creditColumn !== null && mapping.creditColumn > maxCol) return false;

  // Date column is required
  if (mapping.dateColumn === null) return false;

  // Amount validation based on mode
  if (mapping.amountMode === 'single' && mapping.amountColumn === null) return false;
  if (mapping.amountMode === 'separate' && mapping.debitColumn === null && mapping.creditColumn === null) return false;

  return true;
};
