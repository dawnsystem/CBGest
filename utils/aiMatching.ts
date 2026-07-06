/**
 * AI Matching Utility for Bank Transactions
 *
 * This module provides intelligent matching between bank transactions and:
 * - Invoices (by amount, date, supplier name)
 * - Suppliers (by concept patterns)
 * - Recurring Expenses (by patterns and expected amounts)
 * - Platforms (Airbnb, Booking, etc.)
 */

import { Invoice, Supplier, RecurringExpense, AIMatchSuggestion, BankTransaction } from '../types';

// Platform detection patterns
const PLATFORM_PATTERNS: { platform: string; patterns: RegExp[] }[] = [
  {
    platform: 'Airbnb',
    patterns: [/airbnb/i, /air\s*bnb/i, /AIRBNB\s*PAYMENTS/i]
  },
  {
    platform: 'Booking.com',
    patterns: [/booking\.com/i, /booking\s*bv/i, /BOOKINGCOM/i]
  },
  {
    platform: 'Vrbo/HomeAway',
    patterns: [/vrbo/i, /homeaway/i, /expedia\s*lodging/i]
  },
  {
    platform: 'Stripe',
    patterns: [/stripe/i, /STRIPE\s*PAYMENTS/i]
  },
  {
    platform: 'PayPal',
    patterns: [/paypal/i, /PP\s*\*/i]
  },
  {
    platform: 'Bizum',
    patterns: [/bizum/i]
  },
  {
    platform: 'Transferencia',
    patterns: [/transferencia/i, /transf\./i, /tr\.\s*de/i]
  },
  {
    platform: 'Domiciliación',
    patterns: [/domiciliaci[oó]n/i, /recibo/i, /adeudo/i, /sepa\s*core/i]
  },
  {
    platform: 'Tarjeta',
    patterns: [/compra\s*tarjeta/i, /pago\s*tarjeta/i, /visa/i, /mastercard/i]
  }
];

// Common utility company patterns
const UTILITY_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  { name: 'Endesa', patterns: [/endesa/i, /enel/i] },
  { name: 'Iberdrola', patterns: [/iberdrola/i] },
  { name: 'Naturgy', patterns: [/naturgy/i, /gas\s*natural/i] },
  { name: 'Vodafone', patterns: [/vodafone/i] },
  { name: 'Movistar', patterns: [/movistar/i, /telef[oó]nica/i] },
  { name: 'Orange', patterns: [/orange/i] },
  { name: 'Aguas de Barcelona', patterns: [/aigues\s*de\s*barcelona/i, /agbar/i] },
  { name: 'Comunidad de Propietarios', patterns: [/comunidad/i, /finca/i, /administraci[oó]n/i] },
  { name: 'Seguro', patterns: [/axa/i, /mapfre/i, /allianz/i, /zurich/i, /seguro/i, /p[oó]liza/i] },
  { name: 'Impuestos', patterns: [/aeat/i, /agencia\s*tributaria/i, /hacienda/i, /modelo\s*\d{3}/i, /ibi/i, /plusval[ií]a/i] }
];

/**
 * Normalize a concept string for better matching
 */
const normalizeConcept = (concept: string): string => {
  return concept
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, ' ')    // Remove special chars
    .replace(/\s+/g, ' ')            // Collapse spaces
    .trim();
};

/**
 * Calculate similarity between two strings (0-100)
 */
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = normalizeConcept(str1);
  const s2 = normalizeConcept(str2);

  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) return 85;

  // Word overlap
  const words1 = new Set(s1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(s2.split(' ').filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let matches = 0;
  words1.forEach(w => {
    if (words2.has(w)) matches++;
  });

  return Math.round((matches / Math.max(words1.size, words2.size)) * 100);
};

/**
 * Detect platform from transaction concept
 */
export const detectPlatform = (concept: string): string | null => {
  for (const { platform, patterns } of PLATFORM_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(concept)) {
        return platform;
      }
    }
  }
  return null;
};

/**
 * Detect utility company from transaction concept
 */
export const detectUtility = (concept: string): string | null => {
  for (const { name, patterns } of UTILITY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(concept)) {
        return name;
      }
    }
  }
  return null;
};

/**
 * Find matching invoices for a bank transaction
 */
export const findMatchingInvoices = (
  transaction: BankTransaction,
  invoices: Invoice[],
  dateToleranceDays: number = 7
): Array<{ invoice: Invoice; confidence: number; reason: string }> => {
  // Validate inputs
  if (!Array.isArray(invoices) || invoices.length === 0) return [];

  const matches: Array<{ invoice: Invoice; confidence: number; reason: string }> = [];
  const txAmount = Math.abs(transaction.amount);
  const txDate = new Date(transaction.date);
  const _txConcept = normalizeConcept(transaction.concept || '');

  // Validate transaction date
  const isTxDateValid = !isNaN(txDate.getTime());

  for (const invoice of invoices) {
    // Skip already reconciled invoices
    if (invoice.status === 'PAID') continue;

    let confidence = 0;
    const reasons: string[] = [];

    // Amount matching (most important)
    const invAmount = invoice.totalAmount;
    const amountDiff = Math.abs(txAmount - invAmount);
    // Prevent division by zero - if both amounts are 0, consider them equal
    const maxAmount = Math.max(txAmount, invAmount);
    const amountPercent = maxAmount > 0 ? amountDiff / maxAmount : (amountDiff === 0 ? 0 : 1);

    if (amountDiff < 0.05) {
      confidence += 50;
      reasons.push('Importe exacto');
    } else if (amountPercent < 0.01) {
      confidence += 40;
      reasons.push('Importe ~igual');
    } else if (amountPercent < 0.05) {
      confidence += 20;
      reasons.push('Importe similar');
    }

    // Date proximity (only if dates are valid)
    if (isTxDateValid && invoice.date) {
      const invDate = new Date(invoice.date);
      if (!isNaN(invDate.getTime())) {
        const daysDiff = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 3) {
          confidence += 25;
          reasons.push('Fecha cercana');
        } else if (daysDiff <= dateToleranceDays) {
          confidence += 15;
          reasons.push('Fecha próxima');
        } else if (daysDiff <= 30) {
          confidence += 5;
          reasons.push('Mismo mes');
        }
      }
    }

    // Supplier name matching
    if (invoice.issuerName) {
      const similarity = calculateSimilarity(transaction.concept, invoice.issuerName);
      if (similarity > 70) {
        confidence += 25;
        reasons.push(`Proveedor: ${invoice.issuerName}`);
      } else if (similarity > 40) {
        confidence += 10;
        reasons.push('Proveedor similar');
      }
    }

    // Only include if confidence > 30%
    if (confidence >= 30) {
      matches.push({
        invoice,
        confidence: Math.min(confidence, 100),
        reason: reasons.join(' • ')
      });
    }
  }

  // Sort by confidence descending
  return matches.sort((a, b) => b.confidence - a.confidence);
};

/**
 * Find matching suppliers for a bank transaction
 */
export const findMatchingSuppliers = (
  transaction: BankTransaction,
  suppliers: Supplier[]
): Array<{ supplier: Supplier; confidence: number; reason: string }> => {
  // Validate inputs
  if (!Array.isArray(suppliers) || suppliers.length === 0) return [];

  const matches: Array<{ supplier: Supplier; confidence: number; reason: string }> = [];
  const txConcept = transaction.concept || '';

  // First check for utility patterns
  const detectedUtility = detectUtility(txConcept);

  for (const supplier of suppliers) {
    let confidence = 0;
    const reasons: string[] = [];

    // Direct name matching
    const nameSimilarity = calculateSimilarity(txConcept, supplier.name);
    if (nameSimilarity > 70) {
      confidence += 60;
      reasons.push('Nombre coincide');
    } else if (nameSimilarity > 40) {
      confidence += 30;
      reasons.push('Nombre similar');
    }

    // NIF/CIF in concept (rare but possible)
    if (supplier.nif && txConcept.toUpperCase().includes(supplier.nif.toUpperCase())) {
      confidence += 40;
      reasons.push('NIF detectado');
    }

    // Utility company match
    if (detectedUtility && supplier.name.toLowerCase().includes(detectedUtility.toLowerCase())) {
      confidence += 30;
      reasons.push(`Suministro: ${detectedUtility}`);
    }

    // Only include if confidence > 25%
    if (confidence >= 25) {
      matches.push({
        supplier,
        confidence: Math.min(confidence, 100),
        reason: reasons.join(' • ')
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
};

/**
 * Find matching recurring expenses for a bank transaction
 */
export const findMatchingRecurringExpenses = (
  transaction: BankTransaction,
  recurringExpenses: RecurringExpense[]
): Array<{ expense: RecurringExpense; confidence: number; reason: string }> => {
  // Validate inputs
  if (!Array.isArray(recurringExpenses) || recurringExpenses.length === 0) return [];

  const matches: Array<{ expense: RecurringExpense; confidence: number; reason: string }> = [];
  const txAmount = Math.abs(transaction.amount);
  const txConcept = transaction.concept || '';
  const txDate = new Date(transaction.date);
  const isTxDateValid = !isNaN(txDate.getTime());
  const txDay = isTxDateValid ? txDate.getDate() : 0;

  for (const expense of recurringExpenses) {
    if (!expense.isActive) continue;

    let confidence = 0;
    const reasons: string[] = [];

    // Amount matching - skip if estimatedAmount is invalid
    if (expense.estimatedAmount > 0) {
      const amountDiff = Math.abs(txAmount - expense.estimatedAmount);
      // Prevent division by zero
      const maxAmount = Math.max(txAmount, expense.estimatedAmount);
      const amountPercent = maxAmount > 0 ? amountDiff / maxAmount : (amountDiff === 0 ? 0 : 1);

      if (amountPercent < 0.01) {
        confidence += 40;
        reasons.push('Importe exacto');
      } else if (amountPercent < 0.10) {
        confidence += 25;
        reasons.push('Importe similar');
      } else if (amountPercent < 0.20) {
        confidence += 10;
        reasons.push('Importe aprox.');
      }
    }

    // Name/concept matching
    const nameSimilarity = calculateSimilarity(txConcept, expense.name || '');
    if (nameSimilarity > 60) {
      confidence += 35;
      reasons.push(`Coincide: ${expense.name}`);
    } else if (nameSimilarity > 30) {
      confidence += 15;
      reasons.push('Concepto similar');
    }

    // Day of month matching (for recurring payments) - only if date is valid
    if (isTxDateValid && expense.dayOfMonth && expense.dayOfMonth >= 1 && expense.dayOfMonth <= 31) {
      let dayDiff = Math.abs(txDay - expense.dayOfMonth);
      // Handle month wrapping (e.g., day 1 vs day 30 should be ~2 days apart, not 29)
      if (dayDiff > 15) {
        dayDiff = Math.min(dayDiff, 31 - dayDiff);
      }
      if (dayDiff <= 2) {
        confidence += 15;
        reasons.push('Día esperado');
      } else if (dayDiff <= 5) {
        confidence += 5;
        reasons.push('Día cercano');
      }
    }

    // Utility pattern matching
    const detectedUtility = detectUtility(txConcept);
    if (detectedUtility && expense.name && expense.name.toLowerCase().includes(detectedUtility.toLowerCase())) {
      confidence += 20;
      reasons.push(`Suministro: ${detectedUtility}`);
    }

    if (confidence >= 25) {
      matches.push({
        expense,
        confidence: Math.min(confidence, 100),
        reason: reasons.join(' • ')
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
};

/**
 * Generate AI match suggestions for a bank transaction
 */
export const generateMatchSuggestions = (
  transaction: BankTransaction,
  invoices: Invoice[],
  suppliers: Supplier[],
  recurringExpenses: RecurringExpense[]
): AIMatchSuggestion[] => {
  const suggestions: AIMatchSuggestion[] = [];

  // Detect platform first
  const platform = detectPlatform(transaction.concept);
  if (platform) {
    suggestions.push({
      platform,
      confidence: 90,
      reason: `Plataforma detectada: ${platform}`
    });
  }

  // Find invoice matches
  const invoiceMatches = findMatchingInvoices(transaction, invoices);
  for (const match of invoiceMatches.slice(0, 2)) { // Top 2
    suggestions.push({
      invoiceId: match.invoice.id,
      invoiceName: `${match.invoice.issuerName} - ${match.invoice.totalAmount}€`,
      confidence: match.confidence,
      reason: match.reason
    });
  }

  // Find supplier matches
  const supplierMatches = findMatchingSuppliers(transaction, suppliers);
  for (const match of supplierMatches.slice(0, 2)) { // Top 2
    suggestions.push({
      supplierId: match.supplier.id,
      supplierName: match.supplier.name,
      confidence: match.confidence,
      reason: match.reason
    });
  }

  // Find recurring expense matches
  const expenseMatches = findMatchingRecurringExpenses(transaction, recurringExpenses);
  for (const match of expenseMatches.slice(0, 2)) { // Top 2
    suggestions.push({
      category: match.expense.category,
      supplierName: match.expense.name,
      confidence: match.confidence,
      reason: `Gasto fijo: ${match.reason}`
    });
  }

  // Sort all suggestions by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence);
};

/**
 * Get the best suggestion for a transaction
 */
export const getBestSuggestion = (
  transaction: BankTransaction,
  invoices: Invoice[],
  suppliers: Supplier[],
  recurringExpenses: RecurringExpense[]
): AIMatchSuggestion | null => {
  const suggestions = generateMatchSuggestions(transaction, invoices, suppliers, recurringExpenses);
  return suggestions.length > 0 ? suggestions[0] : null;
};

/**
 * Categorize a transaction based on patterns
 */
export const categorizeTransaction = (concept: string, amount: number): {
  category: string;
  isIncome: boolean;
  suggestedAccount?: string;
} => {
  const platform = detectPlatform(concept);
  const utility = detectUtility(concept);
  const isIncome = amount > 0;

  // Income categorization
  if (isIncome) {
    if (platform === 'Airbnb' || platform === 'Booking.com' || platform === 'Vrbo/HomeAway') {
      return {
        category: 'Ingresos por Alquiler Turístico',
        isIncome: true,
        suggestedAccount: '705' // Prestación de servicios
      };
    }
    if (platform === 'Transferencia' || platform === 'Bizum') {
      return {
        category: 'Transferencia Recibida',
        isIncome: true,
        suggestedAccount: '572' // Bancos
      };
    }
    return { category: 'Otros Ingresos', isIncome: true };
  }

  // Expense categorization
  if (utility) {
    const utilityAccounts: Record<string, string> = {
      'Endesa': '628', // Suministros
      'Iberdrola': '628',
      'Naturgy': '628',
      'Vodafone': '629', // Otros servicios
      'Movistar': '629',
      'Orange': '629',
      'Aguas de Barcelona': '628',
      'Comunidad de Propietarios': '622', // Reparaciones y conservación
      'Seguro': '625', // Primas de seguros
      'Impuestos': '631' // Otros tributos
    };
    return {
      category: utility,
      isIncome: false,
      suggestedAccount: utilityAccounts[utility] || '629'
    };
  }

  if (platform === 'Tarjeta') {
    return { category: 'Pago con Tarjeta', isIncome: false };
  }

  if (platform === 'Domiciliación') {
    return { category: 'Recibo Domiciliado', isIncome: false };
  }

  return { category: 'Otros Gastos', isIncome: false, suggestedAccount: '629' };
};
