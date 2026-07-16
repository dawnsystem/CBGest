import { describe, it, expect } from 'vitest';
import { ACCOUNT_PLAN, isDebitNatureAccount, getBankLineAmount } from '../accountingPlan';

describe('accountingPlan', () => {
  describe('isDebitNatureAccount (CTB-002)', () => {
    it('treats groups 1,2,3,5,6 as debit nature', () => {
      expect(isDebitNatureAccount('100')).toBe(true);
      expect(isDebitNatureAccount('200')).toBe(true);
      expect(isDebitNatureAccount('300')).toBe(true);
      expect(isDebitNatureAccount('572')).toBe(true);
      expect(isDebitNatureAccount('628')).toBe(true);
    });

    it('treats 43x/44x clients and debtors as debit nature', () => {
      expect(isDebitNatureAccount('430')).toBe(true);
      expect(isDebitNatureAccount('440')).toBe(true);
    });

    it('treats 460 and 470–474 as debit nature', () => {
      expect(isDebitNatureAccount('460')).toBe(true);
      expect(isDebitNatureAccount('470')).toBe(true);
      expect(isDebitNatureAccount('4700')).toBe(true);
      expect(isDebitNatureAccount('471')).toBe(true);
      expect(isDebitNatureAccount('472')).toBe(true);
      expect(isDebitNatureAccount('4720')).toBe(true);
      expect(isDebitNatureAccount('473')).toBe(true);
      expect(isDebitNatureAccount('474')).toBe(true);
    });

    it('keeps supplier and tax payable accounts as credit nature', () => {
      expect(isDebitNatureAccount('400')).toBe(false);
      expect(isDebitNatureAccount('410')).toBe(false);
      expect(isDebitNatureAccount('465')).toBe(false);
      expect(isDebitNatureAccount('475')).toBe(false);
      expect(isDebitNatureAccount('476')).toBe(false);
      expect(isDebitNatureAccount('477')).toBe(false);
      expect(isDebitNatureAccount('705')).toBe(false);
    });
  });

  describe('ACCOUNT_PLAN structure', () => {
    it('should be an array', () => {
      expect(Array.isArray(ACCOUNT_PLAN)).toBe(true);
    });

    it('should not be empty', () => {
      expect(ACCOUNT_PLAN.length).toBeGreaterThan(0);
    });

    it('should have accounts with code and name', () => {
      ACCOUNT_PLAN.forEach((account) => {
        expect(account).toHaveProperty('code');
        expect(account).toHaveProperty('name');
        expect(typeof account.code).toBe('string');
        expect(typeof account.name).toBe('string');
        expect(account.code.length).toBeGreaterThan(0);
        expect(account.name.length).toBeGreaterThan(0);
      });
    });
  });

  describe('account codes format', () => {
    it('should have valid account codes (3-4 digits)', () => {
      ACCOUNT_PLAN.forEach((account) => {
        // Account codes can be 3 or 4 digits (subcuentas de IVA, retenciones, etc.)
        expect(account.code).toMatch(/^\d{3,4}$/);
      });
    });

    it('should not have duplicate codes', () => {
      const codes = ACCOUNT_PLAN.map((acc) => acc.code);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });
  });

  describe('expense accounts (group 6)', () => {
    const expenseAccounts = ACCOUNT_PLAN.filter((acc) =>
      acc.code.startsWith('6')
    );

    it('should have expense accounts', () => {
      expect(expenseAccounts.length).toBeGreaterThan(0);
    });

    it('should include common expense accounts', () => {
      const codes = expenseAccounts.map((acc) => acc.code);

      expect(codes).toContain('621'); // Arrendamientos
      expect(codes).toContain('622'); // Reparaciones
      expect(codes).toContain('623'); // Servicios profesionales
      expect(codes).toContain('628'); // Suministros
    });

    it('should have subgroup 62 (servicios exteriores)', () => {
      const serviceAccounts = expenseAccounts.filter((acc) =>
        acc.code.startsWith('62')
      );
      expect(serviceAccounts.length).toBeGreaterThan(5);
    });

    it('should have subgroup 64 (gastos de personal)', () => {
      const personnelAccounts = expenseAccounts.filter((acc) =>
        acc.code.startsWith('64')
      );
      expect(personnelAccounts.length).toBeGreaterThan(0);
    });
  });

  describe('income accounts (group 7)', () => {
    const incomeAccounts = ACCOUNT_PLAN.filter((acc) =>
      acc.code.startsWith('7')
    );

    it('should have income accounts', () => {
      expect(incomeAccounts.length).toBeGreaterThan(0);
    });

    it('should include common income accounts', () => {
      const codes = incomeAccounts.map((acc) => acc.code);

      expect(codes).toContain('705'); // Prestaciones de servicios
      expect(codes).toContain('700'); // Ventas de mercaderías
    });

    it('should have subgroup 70 (ventas)', () => {
      const salesAccounts = incomeAccounts.filter((acc) =>
        acc.code.startsWith('70')
      );
      expect(salesAccounts.length).toBeGreaterThan(5);
    });

    it('should have subgroup 76 (ingresos financieros)', () => {
      const financialIncomeAccounts = incomeAccounts.filter((acc) =>
        acc.code.startsWith('76')
      );
      expect(financialIncomeAccounts.length).toBeGreaterThan(0);
    });
  });

  describe('balance sheet accounts (groups 4 and 5)', () => {
    const group4 = ACCOUNT_PLAN.filter((acc) => acc.code.startsWith('4'));
    const group5 = ACCOUNT_PLAN.filter((acc) => acc.code.startsWith('5'));

    it('should have group 4 accounts (acreedores y deudores)', () => {
      expect(group4.length).toBeGreaterThan(0);
    });

    it('should have group 5 accounts (cuentas financieras)', () => {
      expect(group5.length).toBeGreaterThan(0);
    });

    it('should include client and supplier accounts', () => {
      const codes = ACCOUNT_PLAN.map((acc) => acc.code);

      expect(codes).toContain('430'); // Clientes
      expect(codes).toContain('400'); // Proveedores
    });

    it('should include cash and bank accounts', () => {
      const codes = ACCOUNT_PLAN.map((acc) => acc.code);

      expect(codes).toContain('570'); // Caja, euros
      expect(codes).toContain('572'); // Bancos c/c
    });

    it('should include tax accounts', () => {
      const codes = ACCOUNT_PLAN.map((acc) => acc.code);

      expect(codes).toContain('472'); // Hacienda Pública, IVA soportado
      expect(codes).toContain('477'); // Hacienda Pública, IVA repercutido
      expect(codes).toContain('473'); // Retenciones
    });
  });

  describe('search and filter capabilities', () => {
    it('should be searchable by code', () => {
      const account = ACCOUNT_PLAN.find((acc) => acc.code === '621');
      expect(account).toBeDefined();
      expect(account?.name).toContain('Arrendamientos');
    });

    it('should be searchable by name (case insensitive)', () => {
      const results = ACCOUNT_PLAN.filter((acc) =>
        acc.name.toLowerCase().includes('servicios')
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be filterable by group', () => {
      const group6 = ACCOUNT_PLAN.filter((acc) => acc.code.startsWith('6'));
      expect(group6.length).toBeGreaterThan(10);
    });

    it('should support autocomplete-like filtering', () => {
      const searchTerm = 'iva';
      const results = ACCOUNT_PLAN.filter((acc) =>
        acc.name.toLowerCase().includes(searchTerm) ||
        acc.code.includes(searchTerm)
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Spanish accounting plan compliance', () => {
    it('should include accounts for communities of property', () => {
      const account = ACCOUNT_PLAN.find((acc) => acc.code === '554');
      expect(account).toBeDefined();
      expect(account?.name).toContain('comunidades de bienes');
    });

    it('should include holder account', () => {
      const account = ACCOUNT_PLAN.find((acc) => acc.code === '550');
      expect(account).toBeDefined();
      expect(account?.name).toContain('Titular');
    });

    it('should follow PGC structure (Real Decreto 1514/2007)', () => {
      // Verify that accounts follow logical grouping
      const allCodes = ACCOUNT_PLAN.map((acc) => parseInt(acc.code[0]));
      const uniqueGroups = new Set(allCodes);

      // Should have accounts from groups 4, 5, 6, 7
      expect(uniqueGroups.has(4)).toBe(true);
      expect(uniqueGroups.has(5)).toBe(true);
      expect(uniqueGroups.has(6)).toBe(true);
      expect(uniqueGroups.has(7)).toBe(true);
    });
  });

  describe('data integrity', () => {
    it('should not have empty or whitespace-only names', () => {
      ACCOUNT_PLAN.forEach((account) => {
        expect(account.name.trim().length).toBeGreaterThan(0);
      });
    });

    it('should not have special characters in codes', () => {
      ACCOUNT_PLAN.forEach((account) => {
        expect(account.code).toMatch(/^[0-9]+$/);
      });
    });

    it('should have meaningful names (more than 3 chars)', () => {
      ACCOUNT_PLAN.forEach((account) => {
        expect(account.name.length).toBeGreaterThan(3);
      });
    });
  });

  describe('getBankLineAmount (CONC-002)', () => {
    it('sums all treasury lines, not only the first', () => {
      const entry = {
        id: 'e1',
        date: '2026-01-01',
        concept: 'Traspaso',
        reconciled: false,
        lines: [
          { accountCode: '572', accountName: 'Banco A', debit: 100, credit: 0 },
          { accountCode: '573', accountName: 'Banco B', debit: 0, credit: 40 },
          { accountCode: '572', accountName: 'Banco A', debit: 10, credit: 0 },
        ],
      };
      expect(getBankLineAmount(entry as never)).toBe(70);
    });

    it('returns 0 when there is no treasury line', () => {
      const entry = {
        id: 'e2',
        date: '2026-01-01',
        concept: 'Gasto',
        reconciled: false,
        lines: [
          { accountCode: '628', accountName: 'Suministros', debit: 50, credit: 0 },
          { accountCode: '400', accountName: 'Proveedores', debit: 0, credit: 50 },
        ],
      };
      expect(getBankLineAmount(entry as never)).toBe(0);
    });
  });

});
