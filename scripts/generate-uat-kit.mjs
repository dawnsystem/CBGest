#!/usr/bin/env node
/**
 * @fileoverview Genera el kit UAT completo de CBGest a partir de los JSON maestros.
 * Produce facturas (JSON+PDF), extractos bancarios XLSX, reservas CSV y manifiestos de edges.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import writeExcelFile from 'write-excel-file/node';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UAT_ROOT = join(ROOT, 'uat-kit');
const MASTER_DIR = join(UAT_ROOT, 'master');

/** @typedef {'EXPENSE'|'INCOME'} InvoiceType */

// ---------------------------------------------------------------------------
// NIF validation (mirrors utils/validators.ts)
// ---------------------------------------------------------------------------

const DNI_REGEX = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
const NIE_REGEX = /^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
const CIF_REGEX = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;

/**
 * @param {string} nif
 * @returns {boolean}
 */
function isValidNIF(nif) {
  if (!nif) return false;
  const str = nif.toUpperCase().replace(/\s/g, '');

  if (DNI_REGEX.test(str)) {
    const number = parseInt(str.substring(0, 8), 10);
    const letter = str.charAt(8);
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    return letters.charAt(number % 23) === letter;
  }

  if (NIE_REGEX.test(str)) {
    const prefixMap = { X: '0', Y: '1', Z: '2' };
    const numberStr = prefixMap[str.charAt(0)] + str.substring(1, 8);
    const number = parseInt(numberStr, 10);
    const expectedLetter = str.charAt(8);
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    return letters.charAt(number % 23) === expectedLetter;
  }

  if (CIF_REGEX.test(str)) {
    const digits = str.substring(1, 8);
    const control = str.charAt(8);
    let evenSum = 0;
    let oddSum = 0;

    for (let i = 0; i < digits.length; i++) {
      const n = parseInt(digits[i], 10);
      if (i % 2 === 0) {
        const doubled = n * 2;
        oddSum += doubled < 10 ? doubled : doubled - 9;
      } else {
        evenSum += n;
      }
    }

    const total = evenSum + oddSum;
    const unit = total % 10;
    const controlDigit = unit === 0 ? 0 : 10 - unit;
    const controlLetter = 'JABCDEFGHI'.charAt(controlDigit);
    return control === controlDigit.toString() || control === controlLetter;
  }

  return false;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * @param {number} amount
 * @returns {number}
 */
function roundCurrency(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * @param {number} min
 * @param {number} max
 * @param {() => number} rng
 * @returns {number}
 */
function randomInRange(min, max, rng) {
  return roundCurrency(min + rng() * (max - min));
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function makeDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @param {number} n
 * @returns {string}
 */
function validDniFromNumber(n) {
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const numStr = String(n).padStart(8, '0');
  return numStr + letters.charAt(parseInt(numStr, 10) % 23);
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatEsCurrency(value) {
  return value.toFixed(2).replace('.', ',');
}

/**
 * @param {string} relPath
 * @returns {void}
 */
function ensureDir(relPath) {
  const full = join(UAT_ROOT, relPath);
  if (!existsSync(full)) {
    mkdirSync(full, { recursive: true });
  }
}

/**
 * @param {string} filePath
 * @param {unknown} data
 * @returns {void}
 */
function writeJson(filePath, data) {
  ensureDir(dirname(filePath).replace(UAT_ROOT + '/', ''));
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Load master data
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @returns {unknown}
 */
function loadMaster(name) {
  return JSON.parse(readFileSync(join(MASTER_DIR, name), 'utf8'));
}

const empresa = loadMaster('empresa.json');
const comuneros = loadMaster('comuneros.json');
const apartamentos = loadMaster('apartamentos.json');
const proveedores = loadMaster('proveedores.json');
const gastosRecurrentes = loadMaster('gastos-recurrentes.json');
const escenario = loadMaster('escenario.json');

/** @type {Map<string, object>} */
const supplierById = new Map(proveedores.suppliers.map((s) => [s.id, s]));

/** @type {object[]} */
const touristApartments = apartamentos.apartments.filter((a) => a.apartmentType === 'TOURIST');

const TENANTS = {
  R1: { name: 'Inquilino CB-R1 UAT', nif: validDniFromNumber(87654321), apartmentId: 'apt-cb-r1', code: 'CB-R1', amount: 850 },
  R2: { name: 'Inquilino CB-R2 UAT', nif: validDniFromNumber(76543210), apartmentId: 'apt-cb-r2', code: 'CB-R2', amount: 1100 },
};

// ---------------------------------------------------------------------------
// NIF validation pass
// ---------------------------------------------------------------------------

/**
 * @returns {string[]}
 */
function collectNifsForValidation() {
  const nifs = [empresa.nif];
  for (const p of comuneros.partners) nifs.push(p.nif);
  for (const s of proveedores.suppliers) nifs.push(s.nif);
  nifs.push(TENANTS.R1.nif, TENANTS.R2.nif);
  return nifs;
}

const invalidNifs = collectNifsForValidation().filter((n) => !isValidNIF(n));
if (invalidNifs.length > 0) {
  console.error('NIF validation failed:', invalidNifs.join(', '));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Invoice builders
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {object}
 */
function buildInvoice(params) {
  const {
    number,
    date,
    type,
    issuerName,
    issuerNif,
    issuerNifType = 'CIF',
    baseAmount,
    vatRate,
    category,
    apartmentId = null,
    supplierId = null,
    status = 'PAID',
    skipBank = false,
    expectedBankDate = null,
    edgeIds = [],
    bankConceptOverride = null,
  } = params;

  const vatAmount = roundCurrency(baseAmount * (vatRate / 100));
  const totalAmount = roundCurrency(baseAmount + vatAmount);
  const prefix = type === 'EXPENSE' ? 'PAGO' : 'COBRO';
  const bankConcept = bankConceptOverride ?? `${prefix} ${issuerName.toUpperCase().slice(0, 40)}`;

  return {
    uatMeta: {
      kitVersion: '1.0.0',
      scenarioId: escenario.scenarioId,
      fictitious: true,
      edgeIds,
      skipBank,
      expectedBankDate,
      bankConcept,
    },
    id: `inv-${number.toLowerCase()}`,
    number,
    date,
    issuerName,
    issuerNif,
    issuerNifType,
    supplierId,
    apartmentId,
    baseAmount,
    vatRate,
    vatAmount,
    totalAmount,
    type,
    status: skipBank ? 'PENDING' : status,
    category,
    history: [{ date, action: 'GENERATED_UAT', user: 'generate-uat-kit' }],
  };
}

/**
 * @param {number} year
 * @param {number|null} cutoffDay
 * @returns {{ expenses: object[], incomes: object[] }}
 */
function generateYearInvoices(year, cutoffDay = null) {
  /** @type {object[]} */
  const expenses = [];
  /** @type {object[]} */
  const incomes = [];
  const rng = createRng(year * 1000 + 7);

  let gSeq = 0;
  let iSeq = 0;

  /**
   * @param {number} month
   * @returns {boolean}
   */
  const monthAllowed = (month) => {
    if (cutoffDay === null) return month <= 12;
    return month <= 7;
  };

  /**
   * @param {number} month
   * @param {number} day
   * @returns {boolean}
   */
  const dateAllowed = (month, day) => {
    if (cutoffDay !== null && month === 7 && day > cutoffDay) return false;
    return true;
  };

  for (let month = 1; month <= 12; month++) {
    if (!monthAllowed(month)) continue;

    const pushExpense = (inv) => {
      if (dateAllowed(month, parseInt(inv.date.split('-')[2], 10))) {
        expenses.push(inv);
      }
    };

    const pushIncome = (inv) => {
      if (dateAllowed(month, parseInt(inv.date.split('-')[2], 10))) {
        incomes.push(inv);
      }
    };

    // 1. Comunidad — día ~1
    if (dateAllowed(month, 1)) {
      gSeq++;
      const sup = supplierById.get('sup-comunidad');
      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date: makeDate(year, month, 1),
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: 180,
          vatRate: 0,
          category: '622',
          supplierId: sup.id,
        }),
      );
    }

    // 2. Neteja — día ~5
    if (dateAllowed(month, 5)) {
      gSeq++;
      const sup = supplierById.get('sup-limpieza');
      let base = randomInRange(250, 350, rng);
      let date = makeDate(year, month, 5);
      let skipBank = false;
      let expectedBankDate = null;
      let edgeIds = [];
      let status = 'PAID';

      if (year === 2027 && month === 11) {
        base = 200;
        date = makeDate(2027, 11, 15);
        skipBank = true;
        edgeIds = ['EDGE-01'];
        status = 'PENDING';
      } else if (year === 2027 && month === 12) {
        edgeIds = ['EDGE-09'];
        expectedBankDate = '2028-01-08';
      }

      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date,
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: base,
          vatRate: 21,
          category: '622',
          supplierId: sup.id,
          skipBank,
          expectedBankDate,
          edgeIds,
          status,
        }),
      );
    }

    // 3. Telefónica — día ~8
    if (dateAllowed(month, 8)) {
      gSeq++;
      const sup = supplierById.get('sup-telefonica');
      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date: makeDate(year, month, 8),
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: 49.9,
          vatRate: 21,
          category: '626',
          supplierId: sup.id,
        }),
      );
    }

    // 4. Gestoría — día ~10
    if (dateAllowed(month, 10)) {
      gSeq++;
      const sup = supplierById.get('sup-gestoria');
      let expectedBankDate = null;
      let edgeIds = [];
      if (year === 2027 && month === 6) {
        expectedBankDate = '2027-07-10';
        edgeIds = ['EDGE-02'];
      }
      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date: makeDate(year, month, 10),
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: 95,
          vatRate: 21,
          category: '623',
          supplierId: sup.id,
          expectedBankDate,
          edgeIds,
        }),
      );
    }

    // 5. Endesa — día ~12, apto rotativo
    if (dateAllowed(month, 12)) {
      gSeq++;
      const sup = supplierById.get('sup-endesa');
      const apt = touristApartments[(month - 1) % touristApartments.length];
      const edgeIds = year === 2027 && month === 4 ? ['EDGE-06'] : [];
      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date: makeDate(year, month, 12),
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: randomInRange(70, 110, rng),
          vatRate: 21,
          category: '628',
          supplierId: sup.id,
          apartmentId: apt.id,
          edgeIds,
        }),
      );
    }

    // 6. Aigües — solo meses pares, día ~20
    if (month % 2 === 0 && dateAllowed(month, 20)) {
      gSeq++;
      const sup = supplierById.get('sup-aigues');
      const edgeIds = year === 2027 && month === 4 ? ['EDGE-06'] : [];
      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date: makeDate(year, month, 20),
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: randomInRange(40, 55, rng),
          vatRate: 10,
          category: '628',
          supplierId: sup.id,
          edgeIds,
        }),
      );
    }

    // 7. Mapfre — solo marzo, día 15
    if (month === 3 && dateAllowed(month, 15)) {
      gSeq++;
      const sup = supplierById.get('sup-seguros');
      pushExpense(
        buildInvoice({
          number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
          date: makeDate(year, month, 15),
          type: 'EXPENSE',
          issuerName: sup.name,
          issuerNif: sup.nif,
          baseAmount: 1280,
          vatRate: 0,
          category: '625',
          supplierId: sup.id,
        }),
      );
    }

    // Ingresos alquiler R1 / R2 — día 1
    if (dateAllowed(month, 1)) {
      for (const key of ['R1', 'R2']) {
        iSeq++;
        const tenant = TENANTS[key];
        pushIncome(
          buildInvoice({
            number: `I-${year}-${String(iSeq).padStart(3, '0')}`,
            date: makeDate(year, month, 1),
            type: 'INCOME',
            issuerName: tenant.name,
            issuerNif: tenant.nif,
            issuerNifType: 'DNI',
            baseAmount: tenant.amount,
            vatRate: 0,
            category: '705',
            apartmentId: tenant.apartmentId,
            bankConceptOverride: `COBRO ALQUILER ${tenant.code}`,
          }),
        );
      }
    }

    // Airbnb — día ~12-18 (sin julio 2028: objetivo ~20 ingresos)
    if (!(year === 2028 && month === 7)) {
      const airbnbDay = 12 + Math.floor(rng() * 7);
      if (dateAllowed(month, airbnbDay)) {
        iSeq++;
        const sup = supplierById.get('sup-airbnb');
        let baseAmount = randomInRange(900, 2200, rng);
        let edgeIds = [];
        let bankConceptOverride = 'COBRO AIRBNB PAYMENTS';
        let airbnbDate = makeDate(year, month, airbnbDay);

        if (year === 2027 && month === 8) {
          baseAmount = 1842.35;
          edgeIds = ['EDGE-04'];
          bankConceptOverride = 'AIRBNB PAYMENTS';
          airbnbDate = makeDate(2027, 8, 12);
        }

        pushIncome(
          buildInvoice({
            number: `I-${year}-${String(iSeq).padStart(3, '0')}`,
            date: airbnbDate,
            type: 'INCOME',
            issuerName: sup.name,
            issuerNif: sup.nif,
            baseAmount,
            vatRate: 0,
            category: '705',
            supplierId: sup.id,
            edgeIds,
            bankConceptOverride,
          }),
        );
      }
    }
  }

  // Gastos suplementarios para alcanzar volúmenes objetivo
  const supplementalTargets = year === 2027 ? 72 : 40;
  const supplementalDefs =
    year === 2027
      ? [
          { month: 2, day: 22, concept: 'Ferretería CB', base: 45.5, vat: 21, cat: '622' },
          { month: 5, day: 18, concept: 'Mantenimiento ascensor', base: 120, vat: 21, cat: '622' },
          { month: 7, day: 25, concept: 'Suministros limpieza', base: 67.8, vat: 21, cat: '622' },
          { month: 9, day: 14, concept: 'Reparación persiana CB-B1', base: 95, vat: 21, cat: '622' },
          { month: 10, day: 28, concept: 'Material oficina', base: 32.4, vat: 21, cat: '626' },
        ]
      : [{ month: 5, day: 12, concept: 'Pintura pasillo CB-A1', base: 210, vat: 21, cat: '622' }];

  for (const def of supplementalDefs) {
    if (expenses.length >= supplementalTargets) break;
    if (cutoffDay !== null && (def.month > 7 || (def.month === 7 && def.day > cutoffDay))) continue;
    gSeq++;
    expenses.push(
      buildInvoice({
        number: `G-${year}-${String(gSeq).padStart(3, '0')}`,
        date: makeDate(year, def.month, def.day),
        type: 'EXPENSE',
        issuerName: def.concept,
        issuerNif: 'B12345674',
        baseAmount: def.base,
        vatRate: def.vat,
        category: def.cat,
      }),
    );
  }

  expenses.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  incomes.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  return { expenses, incomes };
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

/**
 * @param {object} invoice
 * @param {object} empresaData
 * @returns {Uint8Array}
 */
function generateInvoicePdf(invoice, empresaData) {
  const doc = new jsPDF();
  const isExpense = invoice.type === 'EXPENSE';

  doc.setFontSize(10);
  doc.setTextColor(180, 0, 0);
  doc.text('UAT FICTICIO — NO VÁLIDO FISCALMENTE', 105, 12, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(16);
  doc.text(isExpense ? 'FACTURA DE GASTO' : 'FACTURA DE INGRESO', 14, 24);
  doc.setFontSize(11);
  doc.text(`Nº: ${invoice.number}`, 14, 32);
  doc.text(`Fecha: ${invoice.date}`, 14, 38);

  doc.setFontSize(12);
  doc.text('Emisor', 14, 50);
  doc.setFontSize(10);
  doc.text(invoice.issuerName, 14, 57);
  doc.text(`NIF: ${invoice.issuerNif}`, 14, 63);

  doc.setFontSize(12);
  doc.text('Receptor (CB)', 110, 50);
  doc.setFontSize(10);
  doc.text(empresaData.cbName, 110, 57);
  doc.text(`NIF: ${empresaData.nif}`, 110, 63);
  doc.text(empresaData.address, 110, 69);
  doc.text(`${empresaData.postalCode} ${empresaData.city}`, 110, 75);

  doc.setFontSize(12);
  doc.text('Desglose', 14, 90);
  doc.setFontSize(10);
  doc.text(`Base imponible: ${invoice.baseAmount.toFixed(2)} €`, 14, 98);
  doc.text(`IVA ${invoice.vatRate}%: ${invoice.vatAmount.toFixed(2)} €`, 14, 104);
  doc.setFontSize(12);
  doc.text(`Total: ${invoice.totalAmount.toFixed(2)} €`, 14, 114);

  if (invoice.category) {
    doc.setFontSize(10);
    doc.text(`Cuenta PGC: ${invoice.category}`, 14, 122);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

// ---------------------------------------------------------------------------
// Bank statements
// ---------------------------------------------------------------------------

/**
 * @param {object[]} invoices
 * @param {number} year
 * @param {object[]} bankOnlyEdges
 * @param {number|null} julyCutoffDay
 * @returns {Map<number, object[]>}
 */
function buildBankMovementsByMonth(invoices, year, bankOnlyEdges, julyCutoffDay = null) {
  /** @type {Map<number, object[]>} */
  const byMonth = new Map();

  /**
   * @param {number} month
   * @param {object} mov
   */
  const addMov = (month, mov) => {
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(mov);
  };

  for (const inv of invoices) {
    if (inv.uatMeta.skipBank) continue;
    const bankDate = inv.uatMeta.expectedBankDate || inv.date;
    const [bankYearStr, bankMonthStr, bankDayStr] = bankDate.split('-');
    const bankYear = parseInt(bankYearStr, 10);
    const bankMonth = parseInt(bankMonthStr, 10);
    const bankDay = parseInt(bankDayStr, 10);

    if (bankYear !== year) continue;
    if (julyCutoffDay !== null && bankMonth === 7 && bankDay > julyCutoffDay) continue;

    const signedAmount = inv.type === 'EXPENSE' ? -inv.totalAmount : inv.totalAmount;
    const concept =
      inv.uatMeta.edgeIds?.includes('EDGE-04')
        ? 'AIRBNB PAYMENTS'
        : inv.uatMeta.bankConcept;

    addMov(bankMonth, {
      date: bankDate,
      concept,
      amount: roundCurrency(signedAmount),
      invoiceNumber: inv.number,
      edgeIds: inv.uatMeta.edgeIds ?? [],
    });
  }

  for (const edge of bankOnlyEdges) {
    if (edge.year !== year) continue;
    const month = parseInt(edge.date.split('-')[1], 10);
    const day = parseInt(edge.date.split('-')[2], 10);
    if (julyCutoffDay !== null && month === 7 && day > julyCutoffDay) continue;
    addMov(month, {
      date: edge.date,
      concept: edge.concept,
      amount: edge.amount,
      invoiceNumber: null,
      edgeIds: [edge.id],
    });
  }

  for (const [, movs] of byMonth) {
    movs.sort((a, b) => a.date.localeCompare(b.date) || a.concept.localeCompare(b.concept));
  }

  return byMonth;
}

/**
 * @param {string} relPath
 * @param {object[]} movements
 * @returns {Promise<void>}
 */
async function writeBankStatement(relPath, movements) {
  const header = [
    { value: 'Fecha', type: String },
    { value: 'Concepto', type: String },
    { value: 'Importe', type: String },
  ];
  const rows = movements.map((m) => [
    { value: m.date, type: String },
    { value: m.concept, type: String },
    { value: m.amount, type: Number },
  ]);
  const fullPath = join(UAT_ROOT, relPath);
  ensureDir(dirname(relPath));
  await writeExcelFile([header, ...rows]).toFile(fullPath);
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

const GUEST_NAMES = [
  'Anna Müller', 'James Wilson', 'Sophie Dubois', 'Marco Rossi', 'Elena Petrova',
  'Thomas Becker', 'Claire Martin', 'Lucas Silva', 'Emma Johnson', 'Pierre Laurent',
  'Isabel García', 'Oliver Brown', 'Marta Kowalski', 'Henrik Nielsen', 'Laura Schmidt',
];

const CHANNELS = ['Airbnb', 'Booking', 'Direct', 'VRBO'];

/**
 * @param {number} year
 * @param {number} targetCount
 * @param {number|null} cutoffDay
 * @returns {string[]}
 */
function generateReservations(year, targetCount, cutoffDay = null) {
  /** @type {string[]} */
  const rows = [];
  const rng = createRng(year * 77 + 3);
  const codes = touristApartments.map((a) => a.code);

  let seq = 1;

  // EDGE-07: reserva cancelada sept 2027
  if (year === 2027) {
    rows.push(
      [
        'CB-A1', '2027-09-10', '2027-09-17', '', '7', '95,00', '665,00', '0,00',
        'Cancel Test Guest', '2', 'cancel.uat@test.local', '+34600000001', '',
        'Booking', 'BK-2027-CANCEL-01', 'Cancelled',
      ].join(';'),
    );
    seq++;
  }

  // EDGE-08: Airbnb CB-A2 julio 4 huéspedes 5 noches
  if (year === 2027) {
    rows.push(
      [
        'CB-A2', '2027-07-08', '2027-07-13', '', '5', '140,00', '700,00', '700,00',
        'IEET Test Family', '4', 'ieet.uat@test.local', '+34600000008', '',
        'Airbnb', 'BK-2027-IEET-08', 'Confirmed',
      ].join(';'),
    );
    seq++;
  }

  // EDGE-10: 2 adultos en CSV; tras importar, editar numberOfChildren=2 en la UI
  if (year === 2027) {
    rows.push(
      [
        'CB-B1', '2027-08-20', '2027-08-27', '', '7', '110,00', '770,00', '770,00',
        'Familia Con Niños UAT', '2', 'ninos.uat@test.local', '+34600000010', '',
        'Airbnb', 'BK-2027-CHILD-10', 'Confirmed',
      ].join(';'),
    );
    seq++;
  }

  while (rows.length < targetCount) {
    const code = codes[Math.floor(rng() * codes.length)];
    const month = cutoffDay ? 1 + Math.floor(rng() * 7) : 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 20);
    if (cutoffDay && month === 7 && day > cutoffDay - 3) continue;

    const checkIn = makeDate(year, month, day);
    const nights = 2 + Math.floor(rng() * 8);
    const checkOutDate = new Date(year, month - 1, day + nights);
    if (cutoffDay && checkOutDate.getFullYear() === year && checkOutDate.getMonth() === 6 && checkOutDate.getDate() > cutoffDay) {
      continue;
    }
    const checkOut = `${checkOutDate.getFullYear()}-${String(checkOutDate.getMonth() + 1).padStart(2, '0')}-${String(checkOutDate.getDate()).padStart(2, '0')}`;

    const price = roundCurrency(80 + rng() * 120);
    const total = roundCurrency(price * nights);
    const paid = rng() > 0.1 ? total : 0;
    const guest = GUEST_NAMES[Math.floor(rng() * GUEST_NAMES.length)];
    const guests = 1 + Math.floor(rng() * 4);
    const channel = CHANNELS[Math.floor(rng() * CHANNELS.length)];
    const estado = paid === 0 && rng() < 0.05 ? 'Cancelled' : 'Confirmed';
    const bookingNum = `BK-${year}-${String(seq).padStart(4, '0')}`;

    rows.push(
      [
        code,
        checkIn,
        checkOut,
        '',
        String(nights),
        formatEsCurrency(price),
        formatEsCurrency(total),
        formatEsCurrency(estado === 'Cancelled' ? 0 : paid),
        guest,
        String(guests),
        `guest${seq}@uat-ficticio.test`,
        `+346${String(10000000 + seq).slice(-8)}`,
        '',
        channel,
        bookingNum,
        estado,
      ].join(';'),
    );
    seq++;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Edges manifest & balances
// ---------------------------------------------------------------------------

const BANK_ONLY_EDGES = [
  { id: 'EDGE-03', year: 2027, date: '2027-03-28', concept: 'COMISION MANTENIMIENTO CUENTA', amount: -6.5 },
  { id: 'EDGE-05', year: 2027, date: '2027-05-03', concept: 'BIZUM FERRETERIA LOCAL', amount: -38.2 },
];

/**
 * @param {number} year
 * @param {object[]} expenses
 * @param {object[]} incomes
 * @param {object[]} reservations
 * @returns {object}
 */
function buildEdgesManifest(year, expenses, incomes, reservations) {
  const allInvoices = [...expenses, ...incomes];

  /**
   * @param {string} edgeId
   * @returns {object}
   */
  const refsFor = (edgeId) => {
    const invs = allInvoices.filter((i) => i.uatMeta.edgeIds?.includes(edgeId)).map((i) => i.number);
    const bank = BANK_ONLY_EDGES.filter((e) => e.id === edgeId && e.year === year);
    const res = reservations.filter((r) => {
      if (edgeId === 'EDGE-07') return r.includes('BK-2027-CANCEL-01');
      if (edgeId === 'EDGE-08') return r.includes('BK-2027-IEET-08');
      if (edgeId === 'EDGE-10') return r.includes('BK-2027-CHILD-10');
      return false;
    });
    return { invoices: invs, bankOnly: bank, reservations: res };
  };

  const edgeIds =
    year === 2027
      ? ['EDGE-01', 'EDGE-02', 'EDGE-03', 'EDGE-04', 'EDGE-05', 'EDGE-06', 'EDGE-07', 'EDGE-08', 'EDGE-09', 'EDGE-10']
      : ['EDGE-09', 'EDGE-11'];

  return {
    scenarioId: escenario.scenarioId,
    year,
    generatedAt: new Date().toISOString(),
    edges: edgeIds.map((id) => {
      const def = escenario.edges.find((e) => e.id === id);
      return {
        id,
        title: def?.title ?? id,
        description: def?.description ?? '',
        references: refsFor(id),
      };
    }),
  };
}

/**
 * @param {number} year
 * @param {object[]} allMovements
 * @param {number} openingBalance
 * @returns {string}
 */
function buildBalancesMarkdown(year, allMovements, openingBalance) {
  const sorted = [...allMovements].sort((a, b) => a.date.localeCompare(b.date));
  let balance = openingBalance;
  const lines = [
    `# Saldos bancarios esperados — ${year}`,
    '',
    `> Kit UAT ficticio. Saldo inicial: **${openingBalance.toFixed(2)} €**`,
    '',
    '| Fecha | Concepto | Importe | Saldo |',
    '|-------|----------|--------:|------:|',
  ];

  for (const m of sorted) {
    balance = roundCurrency(balance + m.amount);
    lines.push(`| ${m.date} | ${m.concept} | ${m.amount.toFixed(2)} | ${balance.toFixed(2)} |`);
  }

  lines.push('', `**Saldo final ${year}: ${balance.toFixed(2)} €**`, '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// IRPF esperado (ALQUILER_EXENTO = totalAmount; espejo Dashboard.tsx)
// ---------------------------------------------------------------------------

/**
 * @param {'NONE'|'LEVEL_33_65'|'LEVEL_65_PLUS'|'LEVEL_65_MOBILITY'} level
 * @returns {number}
 */
function getDisabilityMinimum(level) {
  switch (level) {
    case 'LEVEL_33_65':
      return 3000;
    case 'LEVEL_65_PLUS':
      return 9000;
    case 'LEVEL_65_MOBILITY':
      return 12000;
    default:
      return 0;
  }
}

/**
 * @param {object} info
 * @returns {number}
 */
function getChildrenMinimum(info) {
  const totalChildren = (info.childrenUnder3 || 0) + (info.childrenFrom3To25 || 0);
  if (totalChildren === 0) return 0;
  const baseAmounts = [2400, 2700, 4000, 4500];
  let minimum = 0;
  for (let i = 0; i < totalChildren; i++) {
    minimum += baseAmounts[Math.min(i, 3)];
  }
  minimum += (info.childrenUnder3 || 0) * 2800;
  minimum += (info.childrenWithDisability || 0) * 3000;
  return minimum;
}

/**
 * @param {object} info
 * @returns {number}
 */
function getAscendantsMinimum(info) {
  let minimum = 0;
  minimum += (info.ascendantsOver65 || 0) * 1150;
  minimum += (info.ascendantsOver75 || 0) * 1400;
  minimum += (info.ascendantsWithDisability || 0) * 3000;
  return minimum;
}

/**
 * Espejo de Dashboard.calculateEstimatedTax (tramos 2024).
 * @param {object} partner
 * @param {number} netResult
 * @param {number} fiscalYear
 * @returns {{ cbYield: number, estimatedTax: number, mandatory: boolean, reason: string }}
 */
function estimatePartnerIrpf(partner, netResult, fiscalYear) {
  const info = partner.taxInfo;
  if (!info) {
    return { cbYield: 0, estimatedTax: 0, mandatory: false, reason: 'Sin datos fiscales' };
  }

  const cbYield = netResult * (partner.participation / 100);
  const totalWorkIncome = (info.otherWorkIncome || 0) + cbYield;
  const otherIncome = info.otherActivitiesIncome || 0;
  const deductibleExpenses = info.deductibleExpenses || 0;
  const pensionContributions = Math.min(info.pensionContributions || 0, 1500);

  let workIncomeReduction = 0;
  if (totalWorkIncome <= 14852) {
    workIncomeReduction = 6498;
  } else if (totalWorkIncome <= 17673.52) {
    workIncomeReduction = 6498 - 1.14 * (totalWorkIncome - 14852);
  } else if (totalWorkIncome <= 21000) {
    workIncomeReduction = 3700;
  }

  const netWorkIncome = Math.max(
    0,
    totalWorkIncome - deductibleExpenses - pensionContributions - workIncomeReduction
  );
  const taxBase = netWorkIncome + otherIncome;

  const applyBrackets = (base) => {
    const brackets = [
      { limit: 12450, rate: 0.19 },
      { limit: 7750, rate: 0.24 },
      { limit: 15000, rate: 0.3 },
      { limit: 24800, rate: 0.37 },
      { limit: Infinity, rate: 0.45 },
    ];
    let tax = 0;
    let remaining = base;
    for (const bracket of brackets) {
      if (remaining <= 0) break;
      const taxableAmount = Math.min(remaining, bracket.limit);
      tax += taxableAmount * bracket.rate;
      remaining -= taxableAmount;
    }
    return tax;
  };

  let estimatedTax = 0;
  if (taxBase > 0) {
    let personalMinimum = 5550;
    const age = fiscalYear - (info.birthYear || 1980);
    if (age >= 75) personalMinimum += 1400;
    if (age >= 65) personalMinimum += 1150;
    personalMinimum += getDisabilityMinimum(info.disabilityLevel || 'NONE');
    if (info.jointDeclaration) personalMinimum += 3400;
    const totalMinimum =
      personalMinimum + getChildrenMinimum(info) + getAscendantsMinimum(info);
    estimatedTax = Math.max(0, applyBrackets(taxBase) - applyBrackets(totalMinimum));
  }

  const hasMultiplePayers = (info.numberOfPayers || 1) >= 2;
  const secondPayerOver1500 = (info.secondPayerAmount || 0) > 1500;
  const limit = hasMultiplePayers && secondPayerOver1500 ? 15000 : 22000;
  let mandatory = false;
  let reason = 'Bajo límites de declaración';
  if (totalWorkIncome > limit) {
    mandatory = true;
    reason =
      hasMultiplePayers && secondPayerOver1500
        ? `Ingresos > ${limit.toLocaleString('es-ES')}€ (2+ pagadores)`
        : `Ingresos > ${limit.toLocaleString('es-ES')}€`;
  } else if (cbYield > 1000) {
    mandatory = true;
    reason = 'Rendimientos CB > 1.000€';
  }

  return {
    cbYield: roundCurrency(cbYield),
    estimatedTax: roundCurrency(estimatedTax),
    mandatory,
    reason,
  };
}

/**
 * @param {number} year
 * @param {object[]} expenses
 * @param {object[]} incomes
 * @returns {string}
 */
function buildIrpfExpectedMarkdown(year, expenses, incomes) {
  const regime = empresa.fiscalRegime === 'ALQUILER_EXENTO' ? 'ALQUILER_EXENTO' : 'GENERAL';
  const useTotal = regime === 'ALQUILER_EXENTO';
  const amountOf = (inv) => (useTotal ? inv.totalAmount || 0 : inv.baseAmount || 0);

  const valid = [...expenses, ...incomes].filter((inv) => inv.status !== 'PENDING');
  const totalIngresos = roundCurrency(
    valid.filter((i) => i.type === 'INCOME').reduce((acc, i) => acc + amountOf(i), 0)
  );
  const totalGastos = roundCurrency(
    valid.filter((i) => i.type === 'EXPENSE').reduce((acc, i) => acc + amountOf(i), 0)
  );
  const rendimientoNeto = roundCurrency(totalIngresos - totalGastos);
  const pendingExcluded = [...expenses, ...incomes].filter((i) => i.status === 'PENDING').length;

  const lines = [
    `# IRPF esperado — ${year} (régimen ${regime})`,
    '',
    `> Criterio FIS-001: **${useTotal ? 'totalAmount' : 'baseAmount'}** en ingresos y gastos.`,
    `> Facturas \`PENDING\` excluidas del cálculo (${pendingExcluded}; p. ej. EDGE-01 \`G-2027-058\`).`,
    `> Tolerancia UI: **±2,00 €** en cuotas (redondeos).`,
    '',
    '## Resultado CB (Dashboard)',
    '',
    '| Magnitud | Esperado |',
    '|----------|--------:|',
    `| Total ingresos | ${formatEsCurrency(totalIngresos)} € |`,
    `| Total gastos | ${formatEsCurrency(totalGastos)} € |`,
    `| **Rendimiento neto** | **${formatEsCurrency(rendimientoNeto)} €** |`,
    '',
    '## Atribución y cuota estimada por comunero',
    '',
    '| Comunero | % | Rendimiento CB | Cuota estimada | Declaración |',
    '|----------|--:|---------------:|---------------:|-------------|',
  ];

  for (const partner of comuneros.partners) {
    const est = estimatePartnerIrpf(partner, rendimientoNeto, year);
    lines.push(
      `| ${partner.name} | ${partner.participation} | ${formatEsCurrency(est.cbYield)} € | ${formatEsCurrency(est.estimatedTax)} € | ${est.mandatory ? `Obligatoria — ${est.reason}` : est.reason} |`
    );
  }

  lines.push(
    '',
    '## Notas de verificación',
    '',
    '1. En `#/settings` el régimen debe ser **Arrendamiento Inmuebles (Exento IVA)**.',
    '2. Completar `taxInfo` de los 4 comuneros desde `master/comuneros.json` antes del Paso 10.',
    '3. Las **cuatro cuotas** deben ser distintas entre sí y coincidir con la tabla (±2 €).',
    '4. En `#/taxes` debe verse «Régimen de Atribución de Rentas (Alquileres)» (y pestaña IEET si hay HUT).',
    ''
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Year orchestration
// ---------------------------------------------------------------------------

/**
 * @param {number} year
 * @param {{ cutoffDay?: number|null, openingBalance: number, prevMovements?: object[] }} opts
 * @returns {Promise<object>}
 */
async function generateYearKit(year, opts) {
  const { cutoffDay = null, openingBalance, prevMovements = [] } = opts;
  const yearDir = String(year);

  for (const sub of [`${yearDir}/facturas/gasto`, `${yearDir}/facturas/ingreso`, `${yearDir}/banco`, `${yearDir}/reservas`, `${yearDir}/edges`]) {
    const full = join(UAT_ROOT, sub);
    if (existsSync(full)) rmSync(full, { recursive: true, force: true });
    ensureDir(sub);
  }

  const { expenses, incomes } = generateYearInvoices(year, cutoffDay);

  for (const inv of expenses) {
    const rel = `${yearDir}/facturas/gasto/${inv.number}`;
    writeJson(join(UAT_ROOT, `${rel}.json`), inv);
    writeFileSync(join(UAT_ROOT, `${rel}.pdf`), generateInvoicePdf(inv, empresa));
  }

  for (const inv of incomes) {
    const rel = `${yearDir}/facturas/ingreso/${inv.number}`;
    writeJson(join(UAT_ROOT, `${rel}.json`), inv);
    writeFileSync(join(UAT_ROOT, `${rel}.pdf`), generateInvoicePdf(inv, empresa));
  }

  const allInvoices = [...expenses, ...incomes];
  const bankEdges = BANK_ONLY_EDGES.filter((e) => e.year === year);
  const byMonth = buildBankMovementsByMonth(allInvoices, year, bankEdges, cutoffDay);

  const crossYearInvoices =
    year === 2028
      ? generateYearInvoices(2027, null).expenses.filter((i) => i.uatMeta.expectedBankDate?.startsWith('2028-'))
      : [];

  if (year === 2028 && crossYearInvoices.length > 0) {
    const jan = byMonth.get(1) ?? [];
    for (const inv of crossYearInvoices) {
      jan.push({
        date: inv.uatMeta.expectedBankDate,
        concept: inv.uatMeta.bankConcept,
        amount: -inv.totalAmount,
        invoiceNumber: inv.number,
        edgeIds: inv.uatMeta.edgeIds ?? [],
      });
    }
    jan.sort((a, b) => a.date.localeCompare(b.date));
    byMonth.set(1, jan);
  }

  const maxMonth = cutoffDay ? 7 : 12;
  /** @type {object[]} */
  const yearMovements = [];

  for (let m = 1; m <= maxMonth; m++) {
    const movs = byMonth.get(m) ?? [];
    yearMovements.push(...movs);
    await writeBankStatement(`${yearDir}/banco/extracto-${year}-${String(m).padStart(2, '0')}.xlsx`, movs);
  }

  const resTarget = escenario.volumes[String(year)].reservations;
  const reservations = generateReservations(year, resTarget, cutoffDay);
  writeFileSync(join(UAT_ROOT, `${yearDir}/reservas/reservas-${year}.csv`), reservations.join('\n') + '\n', 'utf8');

  const edgesManifest = buildEdgesManifest(year, expenses, incomes, reservations);
  writeJson(join(UAT_ROOT, `${yearDir}/edges/edges-manifest.json`), edgesManifest);

  const allForBalance = [...prevMovements, ...yearMovements].sort((a, b) => a.date.localeCompare(b.date));
  const balancesMd = buildBalancesMarkdown(year, yearMovements, openingBalance);
  writeFileSync(join(UAT_ROOT, 'expected', `balances-${year}.md`), balancesMd, 'utf8');

  let closing = openingBalance;
  for (const m of yearMovements) closing = roundCurrency(closing + m.amount);

  return {
    year,
    expenseCount: expenses.length,
    incomeCount: incomes.length,
    bankStatements: maxMonth,
    reservations: reservations.length,
    movements: yearMovements.length,
    openingBalance,
    closingBalance: closing,
    allMovements: allForBalance,
    expenses,
    incomes,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('CBGest UAT Kit Generator');
  ensureDir('expected');

  const result2027 = await generateYearKit(2027, { openingBalance: 12500 });
  const result2028 = await generateYearKit(2028, {
    cutoffDay: 17,
    openingBalance: result2027.closingBalance,
    prevMovements: result2027.allMovements,
  });

  writeFileSync(
    join(UAT_ROOT, 'expected', 'irpf-2027.md'),
    buildIrpfExpectedMarkdown(2027, result2027.expenses, result2027.incomes),
    'utf8'
  );
  writeFileSync(
    join(UAT_ROOT, 'expected', 'irpf-2028.md'),
    buildIrpfExpectedMarkdown(2028, result2028.expenses, result2028.incomes),
    'utf8'
  );

  // EDGE-11 validation: no dates > 2028-07-17 in 2028 kit
  const cutoff = '2028-07-17';
  const violations = [];
  for (const inv of [...result2028.expenses, ...result2028.incomes]) {
    if (inv.date > cutoff) violations.push(`invoice ${inv.number} date ${inv.date}`);
    const bd = inv.uatMeta.expectedBankDate;
    if (bd && bd > cutoff) violations.push(`invoice ${inv.number} bank ${bd}`);
  }
  for (const m of result2028.allMovements) {
    if (m.date > cutoff) violations.push(`movement ${m.date} ${m.concept}`);
  }

  if (violations.length > 0) {
    console.error('EDGE-11 violations:', violations);
    process.exit(1);
  }

  const index = {
    generatedAt: new Date().toISOString(),
    scenarioId: escenario.scenarioId,
    fiscalRegime: empresa.fiscalRegime,
    vatObligation: empresa.vatObligation,
    master: {
      empresa: 1,
      comuneros: comuneros.partners.length,
      apartamentos: apartamentos.apartments.length,
      proveedores: proveedores.suppliers.length,
      gastosRecurrentes: gastosRecurrentes.recurringExpenses.length,
    },
    '2027': {
      expenseInvoices: result2027.expenseCount,
      incomeInvoices: result2027.incomeCount,
      bankStatements: result2027.bankStatements,
      reservations: result2027.reservations,
      bankMovements: result2027.movements,
    },
    '2028': {
      expenseInvoices: result2028.expenseCount,
      incomeInvoices: result2028.incomeCount,
      bankStatements: result2028.bankStatements,
      reservations: result2028.reservations,
      bankMovements: result2028.movements,
      hardCutoff: cutoff,
    },
  };

  writeJson(join(MASTER_DIR, 'INDEX.json'), index);

  const summary = {
    generatedAt: index.generatedAt,
    script: 'scripts/generate-uat-kit.mjs',
    nifValidation: 'PASS',
    edge11Validation: 'PASS',
    results: { '2027': result2027, '2028': { ...result2028, expenses: undefined, incomes: undefined, allMovements: undefined } },
    counts: index,
  };
  writeJson(join(UAT_ROOT, 'expected', 'generation-summary.json'), summary);

  console.log('Generation complete.');
  console.log(JSON.stringify(index, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
